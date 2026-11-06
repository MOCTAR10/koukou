import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { AlertKind, AlertLevel } from '../../common/enums/alert-level.enum.js';
import type { FeedPhase } from '../../common/enums/feed-phase.enum.js';
import { InputDeliveryStatus } from '../../common/enums/input-delivery.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type DailyEntryCreatedEvent,
} from '../../common/utils/event-bus.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FeedStockLoss } from '../feed-stock/entities/feed-stock-loss.entity.js';
import { FeedStockSale } from '../feed-stock/entities/feed-stock-sale.entity.js';
import { entryPhaseKeyOf } from '../feed-stock/feed-stock.service.js';
import { InputLot } from '../inputs/entities/input-lot.entity.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { InputDeliveryLine } from './entities/input-delivery-line.entity.js';
import { InputDelivery } from './entities/input-delivery.entity.js';
import {
  DEFAULT_BAG_KG,
  INTRANT_FAMILY,
  computeDeclarativeStock,
  declarativeKey,
  kgPerUnit,
  round3,
  type DeclarativeLine,
  type DeclarativeRow,
  type LotUsage,
  type UnlinkedUse,
} from './supply-rules.js';

export interface DeclarativeStockRow extends DeclarativeRow {
  intrantLabel: string | null;
  unitLabel: string | null;
  /** Shipped on the confirmed deliveries (stock unit). */
  shipped: number;
}

export interface DeclarativeStock {
  farmId: string;
  rows: DeclarativeStockRow[];
  /** At least one intrant below zero (the « stock négatif » alert is raised). */
  negative: boolean;
}

/** What the L6 dashboards read per farm (recoupement inputs). */
export interface FarmSupplySummary {
  farmId: string;
  deliveries: {
    /** Recorded, awaiting the farmer's confirmation. */
    pending: number;
    confirmed: number;
    cancelled: number;
    /** Confirmed with received ≠ shipped on a line. */
    withDiscrepancy: number;
  };
  intrants: Array<{
    intrantCode: string;
    intrantFamily: string;
    unitCode: string;
    /** Awaiting confirmation (shipped, stock unit). */
    pending: number;
    /** Shipped on the confirmed deliveries. */
    shipped: number;
    /** Received (confirmed by the farmer). */
    received: number;
    used: number;
    /** Declarative stock (received − used), may be negative. */
    stock: number;
    /** Physical FEFO stock left on the delivery lots (null for chicks). */
    physicalStock: number | null;
  }>;
}

/**
 * Declarative input stock of a farm (CDC « stock = reçu − utilisé », POUFA
 * L4): computed apart from the physical FEFO stock, from the confirmed
 * deliveries and what Fermia records (see `computeDeclarativeStock`). A
 * negative value raises the advisory STOCK_NEGATIF alert, never a block.
 * Re-evaluated after each confirmation, each daily entry (bus) and each read.
 */
@Injectable()
export class DeclarativeStockService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DeclarativeStockService.name);

  constructor(
    @InjectRepository(InputDelivery)
    private readonly deliveries: Repository<InputDelivery>,
    @InjectRepository(InputDeliveryLine)
    private readonly lines: Repository<InputDeliveryLine>,
    @InjectRepository(InputLot)
    private readonly lots: Repository<InputLot>,
    @InjectRepository(DailyEntry)
    private readonly entries: Repository<DailyEntry>,
    @InjectRepository(FeedStockLoss)
    private readonly losses: Repository<FeedStockLoss>,
    @InjectRepository(FeedStockSale)
    private readonly feedSales: Repository<FeedStockSale>,
    @InjectRepository(ProductionBatch)
    private readonly batches: Repository<ProductionBatch>,
    @InjectRepository(Farm)
    private readonly farms: Repository<Farm>,
    @InjectRepository(RefItem)
    private readonly refItems: Repository<RefItem>,
    private readonly farmsService: FarmsService,
    private readonly alerts: AlertsService,
  ) {}

  onModuleInit() {
    koukouBus.on(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, this.onEntryCreated);
  }

  onModuleDestroy() {
    koukouBus.off(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, this.onEntryCreated);
  }

  private readonly onEntryCreated = (ev: DailyEntryCreatedEvent) => {
    void this.evaluate(ev.farmId).catch((err) =>
      this.logger.error(`Stock déclaratif (ferme ${ev.farmId})`, err),
    );
  };

  /** The farm screen: rows, after re-evaluating the alert. */
  async forFarm(user: AuthUser, farmId: string): Promise<DeclarativeStock> {
    await this.farmsService.assertAccessible(user, farmId);
    return this.evaluate(farmId);
  }

  /** Computes the stock and raises or clears the STOCK_NEGATIF alert. */
  async evaluate(farmId: string): Promise<DeclarativeStock> {
    const stock = await this.compute(farmId);
    const negative = stock.rows.filter((r) => r.negative);
    if (negative.length === 0) {
      await this.alerts.clearKind(farmId, null, AlertKind.STOCK_NEGATIF);
      return stock;
    }
    const list = negative
      .map(
        (r) =>
          `${r.intrantLabel ?? r.intrantCode} (${r.stock} ${r.unitLabel ?? r.unitCode})`,
      )
      .join(', ');
    await this.alerts.raise(
      {
        kind: AlertKind.STOCK_NEGATIF,
        level: AlertLevel.JAUNE,
        message: `Stock déclaratif négatif : ${list}. Les utilisations saisies dépassent les livraisons confirmées.`,
        recommendation:
          "Vérifiez les réceptions confirmées (quantités reçues, livraison en attente de confirmation) et les consommations saisies. Ce signal n'empêche aucune saisie : ne déclarez pas de réception fictive.",
        // Only the set of intrants: an acknowledged alert comes back when
        // another intrant goes negative, not on every new daily entry.
        context: { intrants: negative.map((r) => r.key).sort() },
      },
      { farmId },
      { keepAcknowledgedIfUnchanged: true },
    );
    return stock;
  }

  /** Declarative stock of a farm per intrant (no access check). */
  async compute(farmId: string): Promise<DeclarativeStock> {
    const farm = await this.farms.findOne({ where: { id: farmId } });
    if (!farm) return { farmId, rows: [], negative: false };
    const sacKg = farm.defaultSacKg ?? DEFAULT_BAG_KG;
    const confirmed = await this.deliveries.find({
      where: { farmId, status: InputDeliveryStatus.CONFIRMEE },
    });
    if (confirmed.length === 0) return { farmId, rows: [], negative: false };
    const shippedAt = new Map(confirmed.map((d) => [d.id, d.shippedAt]));
    const [lines, units, intrants] = await Promise.all([
      this.lines.find({
        where: { deliveryId: In(confirmed.map((d) => d.id)) },
      }),
      this.items(farm.programId, ProgramListType.UNITE),
      this.items(farm.programId, ProgramListType.INTRANT),
    ]);

    const factor = (line: InputDeliveryLine): number => {
      if (line.intrantFamily !== INTRANT_FAMILY.ALIMENT) return 1;
      const unit = units.get(line.unitCode);
      return (
        (unit ? kgPerUnit(unit, line.bagSizeKg, sacKg) : null) ??
        line.bagSizeKg ??
        1
      );
    };
    const declLines: DeclarativeLine[] = lines.map((l) => ({
      intrantCode: l.intrantCode,
      intrantFamily: l.intrantFamily,
      unitCode: l.unitCode,
      feedPhase: l.feedPhase,
      received: (l.receivedQuantity ?? 0) * factor(l),
      shippedAt: shippedAt.get(l.deliveryId) ?? '',
      inputLotId: l.inputLotId,
    }));

    const usage = await this.lotUsage(lines, factor, sacKg);
    const unlinked = await this.unlinkedUse(farmId);
    const shippedByKey = new Map<string, number>();
    for (const l of lines) {
      const row = declarativeKey(l);
      shippedByKey.set(
        row,
        (shippedByKey.get(row) ?? 0) + l.quantity * factor(l),
      );
    }
    const rows = computeDeclarativeStock(declLines, usage, unlinked).map(
      (r): DeclarativeStockRow => ({
        ...r,
        intrantLabel: intrants.get(r.intrantCode)?.label ?? null,
        unitLabel: unitLabelOf(units.get(r.unitCode)) ?? r.unitCode,
        shipped: round3(shippedByKey.get(r.key) ?? 0),
      }),
    );
    return { farmId, rows, negative: rows.some((r) => r.negative) };
  }

  /**
   * What L6 dashboards need per farm: deliveries by status and, per intrant,
   * pending / shipped / received / used / declarative and physical stock.
   * The recoupement (écart %) itself is a later phase.
   */
  async farmSummaries(
    farmIds: readonly string[],
  ): Promise<FarmSupplySummary[]> {
    if (farmIds.length === 0) return [];
    const counts: Array<{
      farm_id: string;
      status: InputDeliveryStatus;
      n: string;
      ecarts: string;
    }> = await this.deliveries
      .createQueryBuilder('d')
      .select('d.farm_id', 'farm_id')
      .addSelect('d.status', 'status')
      .addSelect('COUNT(*)', 'n')
      .addSelect('COUNT(*) FILTER (WHERE d.has_discrepancy)', 'ecarts')
      .where('d.farm_id IN (:...farmIds)', { farmIds })
      .groupBy('d.farm_id')
      .addGroupBy('d.status')
      .getRawMany();
    const pendingLines: Array<{
      farm_id: string;
      intrant_code: string;
      intrant_family: string;
      unit_code: string;
      quantity: number;
      bag_size_kg: number | null;
    }> = await this.lines
      .createQueryBuilder('l')
      .innerJoin('l.delivery', 'd')
      .select('d.farm_id', 'farm_id')
      .addSelect('l.intrant_code', 'intrant_code')
      .addSelect('l.intrant_family', 'intrant_family')
      .addSelect('l.unit_code', 'unit_code')
      .addSelect('l.quantity', 'quantity')
      .addSelect('l.bag_size_kg', 'bag_size_kg')
      .where('d.farm_id IN (:...farmIds)', { farmIds })
      .andWhere('d.status = :status', { status: InputDeliveryStatus.EXPEDIEE })
      .getRawMany();

    const farmRows = await this.farms.find({
      where: { id: In([...farmIds]) },
      select: { id: true, programId: true, defaultSacKg: true },
    });
    const unitsByProgram = new Map<string, Map<string, RefItem>>();
    for (const programId of new Set(farmRows.map((f) => f.programId))) {
      unitsByProgram.set(
        programId,
        await this.items(programId, ProgramListType.UNITE),
      );
    }

    const out: FarmSupplySummary[] = [];
    for (const farmId of farmIds) {
      const farm = farmRows.find((f) => f.id === farmId);
      const units = farm ? unitsByProgram.get(farm.programId) : undefined;
      const stock = await this.compute(farmId);
      const of = (s: InputDeliveryStatus) =>
        counts.find((c) => c.farm_id === farmId && c.status === s);
      const intrants = new Map<string, FarmSupplySummary['intrants'][number]>(
        stock.rows.map((r) => [
          r.key,
          {
            intrantCode: r.intrantCode,
            intrantFamily: r.intrantFamily,
            unitCode: r.unitCode,
            pending: 0,
            shipped: r.shipped,
            received: r.received,
            used: r.used,
            stock: r.stock,
            physicalStock: r.physicalStock,
          },
        ]),
      );
      for (const p of pendingLines.filter((x) => x.farm_id === farmId)) {
        const key = declarativeKey({
          intrantCode: p.intrant_code,
          intrantFamily: p.intrant_family,
          unitCode: p.unit_code,
        });
        const unit = units?.get(p.unit_code);
        const kg =
          p.intrant_family === INTRANT_FAMILY.ALIMENT
            ? ((unit
                ? kgPerUnit(unit, p.bag_size_kg, farm?.defaultSacKg)
                : null) ?? 1)
            : 1;
        const row = intrants.get(key) ?? {
          intrantCode: p.intrant_code,
          intrantFamily: p.intrant_family,
          unitCode:
            p.intrant_family === INTRANT_FAMILY.ALIMENT
              ? 'KG'
              : p.intrant_family === INTRANT_FAMILY.POUSSIN
                ? 'TETE'
                : p.unit_code,
          pending: 0,
          shipped: 0,
          received: 0,
          used: 0,
          stock: 0,
          physicalStock: null,
        };
        row.pending = round3(row.pending + Number(p.quantity) * kg);
        intrants.set(key, row);
      }
      out.push({
        farmId,
        deliveries: {
          pending: Number(of(InputDeliveryStatus.EXPEDIEE)?.n ?? 0),
          confirmed: Number(of(InputDeliveryStatus.CONFIRMEE)?.n ?? 0),
          cancelled: Number(of(InputDeliveryStatus.ANNULEE)?.n ?? 0),
          withDiscrepancy: Number(
            of(InputDeliveryStatus.CONFIRMEE)?.ecarts ?? 0,
          ),
        },
        intrants: [...intrants.values()],
      });
    }
    return out;
  }

  /** Use recorded against the lots the confirmed deliveries created. */
  private async lotUsage(
    lines: InputDeliveryLine[],
    factor: (l: InputDeliveryLine) => number,
    sacKg: number,
  ): Promise<Map<string, LotUsage>> {
    const usage = new Map<string, LotUsage>();
    const withLot = lines.filter((l) => l.inputLotId != null);
    if (withLot.length === 0) return usage;
    const lotIds = withLot.map((l) => l.inputLotId as string);
    const [lots, entries, losses, sales] = await Promise.all([
      this.lots.find({ where: { id: In(lotIds) } }),
      this.entries.find({
        where: { inputLotId: In(lotIds) },
        select: { id: true, inputLotId: true, feedQuantity: true },
      }),
      this.losses.find({ where: { inputLotId: In(lotIds) } }),
      this.feedSales.find({ where: { inputLotId: In(lotIds) } }),
    ]);
    const sum = <T extends { inputLotId: string | null }>(
      rows: T[],
      id: string,
      value: (r: T) => number,
    ) =>
      rows.filter((r) => r.inputLotId === id).reduce((s, r) => s + value(r), 0);
    for (const line of withLot) {
      const id = line.inputLotId as string;
      const lot = lots.find((x) => x.id === id);
      if (!lot) continue;
      const received = (line.receivedQuantity ?? 0) * factor(line);
      if (line.intrantFamily === INTRANT_FAMILY.ALIMENT) {
        // The lot's own quantity only drops on a shop transfer.
        const lotKg = lot.unit === 'KG' ? lot.quantity : lot.quantity * sacKg;
        const transferred = Math.max(0, received - lotKg);
        const consumed = sum(entries, id, (e) => e.feedQuantity);
        const lost = sum(losses, id, (l) => l.quantityKg);
        const sold = sum(sales, id, (s) => s.quantityKg);
        usage.set(id, {
          consumed,
          lost,
          sold: sold + transferred,
          physical: Math.max(0, lotKg - consumed - lost - sold),
        });
      } else if (line.intrantFamily === INTRANT_FAMILY.POUSSIN) {
        // Bands do not draw on the chick lot: chicks placed are counted
        // from the bands opened (`unlinkedUse`).
        usage.set(id, { consumed: 0, lost: 0, sold: 0, physical: 0 });
      } else {
        // Care taken out of stock decrements the lot (restored on cancel).
        usage.set(id, {
          consumed: Math.max(0, received - lot.quantity),
          lost: 0,
          sold: 0,
          physical: Math.max(0, lot.quantity),
        });
      }
    }
    return usage;
  }

  /** Feed typed with no lot, and chicks placed in the bands opened. */
  private async unlinkedUse(farmId: string): Promise<UnlinkedUse> {
    const bands = await this.batches.find({
      where: { farmId },
      select: {
        id: true,
        integrationDate: true,
        quantityAtStart: true,
      },
    });
    if (bands.length === 0) return { feed: [], chicks: [] };
    const entries = await this.entries.find({
      where: {
        batchId: In(bands.map((b) => b.id)),
        inputLotId: IsNull(),
        feedQuantity: MoreThan(0),
      },
      select: {
        id: true,
        entryDate: true,
        feedQuantity: true,
        feedPhase: true,
        feedType: true,
      },
    });
    const feed: Array<{ phase: FeedPhase; date: string; kg: number }> = [];
    for (const e of entries) {
      const phase = entryPhaseKeyOf(e);
      if (phase) {
        feed.push({ phase, date: e.entryDate, kg: e.feedQuantity });
      }
    }
    return {
      feed,
      chicks: bands.map((b) => ({
        date: String(b.integrationDate).slice(0, 10),
        heads: b.quantityAtStart,
      })),
    };
  }

  private async items(
    programId: string,
    listType: ProgramListType,
  ): Promise<Map<string, RefItem>> {
    const rows = await this.refItems.find({ where: { programId, listType } });
    return new Map(rows.map((r) => [r.code, r]));
  }
}

function unitLabelOf(unit: RefItem | undefined): string | null {
  const symbol = unit?.meta?.symbol;
  return typeof symbol === 'string' && symbol ? symbol : (unit?.label ?? null);
}

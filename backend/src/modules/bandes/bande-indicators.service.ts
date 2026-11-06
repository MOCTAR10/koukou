import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { SlaughterStatus } from '../../common/enums/slaughter-status.enum.js';
import { day1WeightKg } from '../../common/utils/species-day1-weight.js';
import type { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { FlockReconciliationService } from '../batches/flock-reconciliation.service.js';
import {
  ageOn,
  completenessPct,
  factInstant,
  utcDay,
} from '../batches/poufa/bande-rules.js';
import { BandeStatsService } from '../batches/poufa/bande-stats.service.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import type { Farm } from '../farms/entities/farm.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { RentabiliteService } from '../finance/rentabilite.service.js';
import {
  evaluateOfficialIndicators,
  formulasInForce,
  type OfficialIndicator,
} from '../indicators/official-indicators.js';
import { isPeriodIndicator } from '../indicators/formula/formula-catalog.js';
import { ParametersService } from '../programme/parameters.service.js';
import { SlaughterOrder } from '../slaughter/entities/slaughter-order.entity.js';
import { bandeVariables, type BandeVariables } from './bande-variables.js';
import { SORTIE_FAMILY, Sortie } from './entities/sortie.entity.js';

export interface BandeIndicators {
  batchId: string;
  code: string | null;
  asOf: string;
  ageDays: number;
  /** Instant whose parameters (formulas) were applied. */
  parametersAt: string;
  variables: BandeVariables;
  indicators: OfficialIndicator[];
  completenessPct: number | null;
}

/**
 * Official POUFA indicators of a band at a date: base variables from the
 * band's rows, formulas in force at that date (CDC: formules paramétrables,
 * non codées en dur), null when undefined (division by zero).
 */
@Injectable()
export class BandeIndicatorsService {
  constructor(
    private readonly reconciliation: FlockReconciliationService,
    private readonly parameters: ParametersService,
    private readonly rentabilite: RentabiliteService,
    private readonly stats: BandeStatsService,
    @InjectRepository(DailyEntry)
    private readonly entries: Repository<DailyEntry>,
    @InjectRepository(Sortie)
    private readonly sorties: Repository<Sortie>,
    @InjectRepository(Sale)
    private readonly sales: Repository<Sale>,
    @InjectRepository(SlaughterOrder)
    private readonly slaughterOrders: Repository<SlaughterOrder>,
  ) {}

  /** Default date: today, or the closure day of a closed band. */
  defaultAsOf(batch: ProductionBatch): string {
    return batch.closedAt ? utcDay(batch.closedAt) : utcDay();
  }

  async compute(
    farm: Farm,
    batch: ProductionBatch,
    asOf: string = this.defaultAsOf(batch),
  ): Promise<BandeIndicators> {
    const day = asOf.slice(0, 10);
    const start = batch.integrationDate.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(day))) {
      throw new BadRequestException('Date invalide (attendu AAAA-MM-JJ).');
    }
    if (day < start) {
      throw new BadRequestException(
        `La date précède l'ouverture de la bande (${start}).`,
      );
    }
    const [entries, removals, deathEvents, sorties, pnl, resolver, rows] =
      await Promise.all([
        this.entries.find({ where: { batchId: batch.id } }),
        this.reconciliation.removalsByDate(batch.id),
        this.reconciliation.deathEvents([batch.id]),
        this.sorties.find({ where: { batchId: batch.id } }),
        this.rentabilite.computeBatchPnl(farm.id, batch.id),
        this.parameters.resolver(farm.programId),
        this.stats.rows(batch.id),
      ]);
    const variables = bandeVariables({
      integrationDate: start,
      initialAgeDays: batch.initialAgeDays,
      initialAvgWeightG: batch.initialAvgWeightG,
      day1WeightKg: day1WeightKg(batch.species),
      quantityAtStart: batch.quantityAtStart,
      capacityPlaces: farm.capacityPlaces ?? null,
      asOf: day,
      entries: entries.map((e) => ({
        entryDate: e.entryDate.slice(0, 10),
        deaths: e.deaths,
        feedQuantity: e.feedQuantity,
        waterL: e.waterL,
        avgWeightKg: e.avgWeightKg,
      })),
      removalsByDate: removals,
      deathEventsByDate: new Map(deathEvents.map((d) => [d.date, d.quantity])),
      weighedSorties: await this.weighedSorties(sorties),
      revenueFcfa: pnl.revenueFcfa,
      // Every cost of the band, input costs without an expense included
      // (legacy lots), so the official margin and Fermia's agree.
      chargesFcfa: pnl.revenueFcfa - pnl.netFcfa,
    });
    const at = factInstant(day);
    return {
      batchId: batch.id,
      code: batch.code,
      asOf: day,
      ageDays: ageOn(start, batch.initialAgeDays, day),
      parametersAt: at.toISOString(),
      variables,
      // POUFA lot A pilot: the steering's per-period formulas are not a band's.
      indicators: evaluateOfficialIndicators(
        formulasInForce(resolver, at),
        variables,
      ).filter((i) => !isPeriodIndicator(i.key)),
      completenessPct: completenessPct(rows, start, day, utcDay()),
    };
  }

  /**
   * Sorties with a measured weight whose animals did leave: removals always,
   * a sale not cancelled, a slaughter order not cancelled (its birds leave at
   * the sortie).
   */
  private async weighedSorties(sorties: Sortie[]) {
    const weighed = sorties.filter((s) => s.weightKg != null && s.weightKg > 0);
    const saleIds = weighed.map((s) => s.saleId).filter((id) => id != null);
    const orderIds = weighed
      .map((s) => s.slaughterOrderId)
      .filter((id) => id != null);
    const [sales, orders] = await Promise.all([
      saleIds.length
        ? this.sales.find({ where: { id: In(saleIds) } })
        : Promise.resolve([] as Sale[]),
      orderIds.length
        ? this.slaughterOrders.find({ where: { id: In(orderIds) } })
        : Promise.resolve([] as SlaughterOrder[]),
    ]);
    const liveSales = new Set(
      sales.filter((s) => s.status !== SaleStatus.CANCELLED).map((s) => s.id),
    );
    const processed = new Set(
      orders
        .filter((o) => o.status !== SlaughterStatus.CANCELLED)
        .map((o) => o.id),
    );
    return weighed
      .filter((s) => {
        if (s.reasonFamily === SORTIE_FAMILY.VENTE) {
          return s.saleId != null && liveSales.has(s.saleId);
        }
        if (s.reasonFamily === SORTIE_FAMILY.ABATTOIR) {
          return s.slaughterOrderId != null && processed.has(s.slaughterOrderId);
        }
        return true;
      })
      .map((s) => ({
        date: s.sortieDate.slice(0, 10),
        count: s.count,
        weightKg: s.weightKg!,
      }));
  }
}

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { isUuid } from '../../common/context/request-context.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { InputDeliveryStatus } from '../../common/enums/input-delivery.enum.js';
import { ProgramListType } from '../../common/enums/program-list-type.enum.js';
import { ProphylaxisStatus } from '../../common/enums/prophylaxis-status.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { TraceLotValidation } from '../../common/enums/trace.enum.js';
import type {
  TraceLotKind,
  TraceLotStatus,
} from '../../common/enums/trace.enum.js';
import { grants } from '../access/access-rules.js';
import type { AccessMatrix } from '../access/access-domains.js';
import { mayHandleSanitaryDeclarations } from '../access/sanitary-declaration.policy.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';
import { Sortie } from '../bandes/entities/sortie.entity.js';
import { BandeDailyStat } from '../batches/entities/bande-daily-stat.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { RefItem } from '../programme/entities/ref-item.entity.js';
import { HealthEvent } from '../sanitary/entities/health-event.entity.js';
import { ProphylaxisEvent } from '../sanitary/entities/prophylaxis-event.entity.js';
import { TreatmentRecord } from '../sanitary/entities/treatment-record.entity.js';
import { User } from '../users/entities/user.entity.js';
import { LotEvent } from './entities/lot-event.entity.js';
import { Operator } from './entities/operator.entity.js';
import { TraceLot } from './entities/trace-lot.entity.js';
import {
  QrScansService,
  type ScanIndicators,
} from './qr-scans.service.js';
import { rearingTimeline, type RearingItem } from './rearing-timeline.js';
import { deliveryBand, type BandWindow } from './delivery-attribution.js';
import { TraceConfigService } from './trace-config.service.js';
import { TraceLotsService, effectiveLotStatus } from './trace-lots.service.js';

export interface LotOperatorRef {
  id: string;
  code: string;
  name: string;
  typeCode: string;
  typeLabel: string | null;
}

export interface LotView {
  id: string;
  code: string;
  kind: TraceLotKind;
  status: TraceLotStatus;
  farmId: string;
  batchId: string;
  bandeCode: string | null;
  parentId: string | null;
  quantity: number;
  weightKg: number | null;
  operator: LotOperatorRef | null;
  sortieId: string | null;
  cededOn: string | null;
  closedAt: Date | null;
  createdAt: Date;
  validationStatus: TraceLotValidation;
  validatedAt: Date | null;
  validatedBy: string | null;
  /** Address printed in the QR code. */
  qrUrl: string;
}

export interface LotEventView {
  id: string;
  lotId: string;
  lotCode: string;
  type: string;
  occurredAt: Date;
  actor: { id: string; fullName: string | null } | null;
  operator: { id: string; code: string; name: string } | null;
  sortieId: string | null;
  data: Record<string, unknown>;
}

export interface LotHistory {
  lot: LotView;
  /** The band's root lot when `lot` is a sub-lot, else null. */
  root: LotView | null;
  /** Lots made from `lot` (the sub-lots of a root lot). */
  subLots: LotView[];
  farm: { id: string; code: string | null; name: string };
  band: {
    id: string;
    code: string | null;
    batchName: string | null;
    status: string;
    integrationDate: string;
    initialAgeDays: number | null;
    quantityAtStart: number;
    quantityAlive: number;
    closedAt: Date | null;
  };
  /** Events of the lot and of its sub-lots, oldest first. */
  events: LotEventView[];
  /** Rearing chronology of the band (CDC « Historique d'élevage »). */
  rearing: RearingItem[];
  /** QR scans of the lot (fraud indicators). */
  scans: Omit<ScanIndicators, 'lotId'>;
}

const NO_SCANS: Omit<ScanIndicators, 'lotId'> = {
  scans: 0,
  ok: 0,
  badSignature: 0,
  afterClosure: 0,
  distinctDevices: 0,
  distinctAreas: 0,
  firstAt: null,
  lastAt: null,
};

/**
 * Visits are technical/sanitary follow-up: the farm's team, the platform
 * admin and an institution whose matrix reads TECHNIQUE or SANITAIRE.
 */
function mayReadVisits(
  user: Pick<AuthUser, 'role'>,
  access: { matrix: AccessMatrix } | null,
): boolean {
  if (user.role !== UserRole.INSTITUTION) return true;
  return (
    !!access &&
    (grants(access.matrix, 'TECHNIQUE', 'CONSULTER') ||
      grants(access.matrix, 'SANITAIRE', 'CONSULTER'))
  );
}

/**
 * Read side of the traceability lots for the farm and the institutions:
 * lot list, lot history (lot + sub-lots + events + rearing chronology), by
 * id or by code. Access = `FarmsService.assertAccessible` (scope through
 * `ScopeResolver` for institutional accounts); health events follow the
 * sanitary declaration rule (farm + veterinary services only).
 */
@Injectable()
export class TraceHistoryService {
  constructor(
    private readonly farms: FarmsService,
    private readonly scope: ScopeResolver,
    private readonly lots: TraceLotsService,
    private readonly scans: QrScansService,
    private readonly config: TraceConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Lots of a farm (root lots created for older bands), newest band first. */
  async list(
    user: AuthUser,
    farmId: string,
    batchId?: string,
  ): Promise<LotView[]> {
    await this.farms.assertAccessible(user, farmId);
    if (batchId !== undefined && !isUuid(batchId)) return [];
    await this.lots.ensureRootLots(farmId, batchId);
    const rows = await this.dataSource.getRepository(TraceLot).find({
      where: { farmId, ...(batchId ? { batchId } : {}) },
      relations: { batch: true },
      order: { createdAt: 'DESC', code: 'ASC' },
    });
    return this.views(rows);
  }

  async history(
    user: AuthUser,
    farmId: string,
    lotId: string,
  ): Promise<LotHistory> {
    await this.farms.assertAccessible(user, farmId);
    const lot = isUuid(lotId)
      ? await this.dataSource
          .getRepository(TraceLot)
          .findOne({ where: { id: lotId, farmId }, relations: { batch: true } })
      : null;
    if (!lot) throw new NotFoundException('Lot introuvable dans cette ferme.');
    return this.historyOf(user, lot);
  }

  /**
   * Validates a lot (CDC 7.3b). Farm accounts never validate their own lots:
   * the right belongs to the platform admin and to institutional profiles
   * holding TRACABILITE:VALIDER in the access matrix (checked by the guard,
   * within the profile's scope through `assertAccessible`).
   */
  async validate(
    user: AuthUser,
    farmId: string,
    lotId: string,
  ): Promise<LotView> {
    if (
      user.role === UserRole.PROPRIETAIRE ||
      user.role === UserRole.ELEVEUR
    ) {
      throw new ForbiddenException(
        'La validation d’un lot est réservée aux institutions habilitées.',
      );
    }
    await this.farms.assertAccessible(user, farmId);
    const repo = this.dataSource.getRepository(TraceLot);
    const lot = isUuid(lotId)
      ? await repo.findOne({
          where: { id: lotId, farmId },
          relations: { batch: true },
        })
      : null;
    if (!lot) throw new NotFoundException('Lot introuvable dans cette ferme.');
    if (lot.validationStatus === TraceLotValidation.VALIDE) {
      throw new ConflictException('Ce lot est déjà validé.');
    }
    lot.validationStatus = TraceLotValidation.VALIDE;
    lot.validatedAt = new Date();
    lot.validatedById = user.id;
    await repo.save(lot);
    return (await this.views([lot]))[0];
  }

  /** By code, programme-wide (institutions, platform admin, the farm). */
  async historyByCode(user: AuthUser, code: string): Promise<LotHistory> {
    const lot = await this.dataSource.getRepository(TraceLot).findOne({
      where: { code: code.trim().toUpperCase() },
      relations: { batch: true },
    });
    if (!lot) throw new NotFoundException('Lot introuvable.');
    await this.farms.assertAccessible(user, lot.farmId);
    return this.historyOf(user, lot);
  }

  private async historyOf(user: AuthUser, lot: TraceLot): Promise<LotHistory> {
    const repo = this.dataSource.getRepository(TraceLot);
    const [root, children, farm] = await Promise.all([
      lot.parentId
        ? repo.findOne({ where: { id: lot.parentId }, relations: { batch: true } })
        : Promise.resolve(null),
      repo.find({
        where: { parentId: lot.id },
        relations: { batch: true },
        order: { code: 'ASC' },
      }),
      this.dataSource
        .getRepository(Farm)
        .findOneOrFail({ where: { id: lot.farmId } }),
    ]);
    const band = lot.batch!;
    const [views, events, rearing, scans] = await Promise.all([
      this.views([lot, ...(root ? [root] : []), ...children]),
      this.events([lot, ...children], user),
      this.rearing(user, band),
      this.scans.indicators([lot.id]),
    ]);
    const viewOf = new Map(views.map((v) => [v.id, v]));
    const ownScans = scans.get(lot.id);
    return {
      lot: viewOf.get(lot.id)!,
      root: root ? viewOf.get(root.id)! : null,
      subLots: children.map((c) => viewOf.get(c.id)!),
      farm: { id: farm.id, code: farm.code, name: farm.name },
      band: {
        id: band.id,
        code: band.code,
        batchName: band.batchName,
        status: band.status,
        integrationDate: band.integrationDate,
        initialAgeDays: band.initialAgeDays,
        quantityAtStart: band.quantityAtStart,
        quantityAlive: band.quantityAlive,
        closedAt: band.closedAt,
      },
      events,
      rearing,
      scans: ownScans
        ? (({ lotId: _lotId, ...rest }) => rest)(ownScans)
        : NO_SCANS,
    };
  }

  async views(rows: TraceLot[]): Promise<LotView[]> {
    const operatorIds = [
      ...new Set(rows.map((r) => r.operatorId).filter((v) => v != null)),
    ];
    const operators = operatorIds.length
      ? await this.dataSource
          .getRepository(Operator)
          .find({ where: { id: In(operatorIds) } })
      : [];
    const types = operators.length
      ? await this.dataSource.getRepository(RefItem).find({
          where: {
            programId: In([...new Set(operators.map((o) => o.programId))]),
            listType: ProgramListType.TYPE_OPERATEUR,
          },
        })
      : [];
    const typeLabel = new Map(
      types.map((t) => [`${t.programId}:${t.code}`, t.label]),
    );
    const operatorOf = new Map(operators.map((o) => [o.id, o]));
    const validatorIds = [
      ...new Set(rows.map((r) => r.validatedById).filter((v) => v != null)),
    ];
    const validators = new Map(
      (validatorIds.length
        ? await this.dataSource
            .getRepository(User)
            .find({ where: { id: In(validatorIds) } })
        : []
      ).map((u) => [u.id, u.fullName]),
    );
    return rows.map((r) => {
      const op = r.operatorId ? operatorOf.get(r.operatorId) : undefined;
      return {
        id: r.id,
        code: r.code,
        kind: r.kind,
        status: effectiveLotStatus(r, r.batch?.status),
        farmId: r.farmId,
        batchId: r.batchId,
        bandeCode: r.batch?.code ?? null,
        parentId: r.parentId,
        quantity: r.quantity,
        weightKg: r.weightKg,
        operator: op
          ? {
              id: op.id,
              code: op.code,
              name: op.name,
              typeCode: op.typeCode,
              typeLabel: typeLabel.get(`${op.programId}:${op.typeCode}`) ?? null,
            }
          : null,
        sortieId: r.sortieId,
        cededOn: r.cededOn,
        closedAt: r.closedAt,
        createdAt: r.createdAt,
        validationStatus: r.validationStatus,
        validatedAt: r.validatedAt,
        validatedBy: r.validatedById ? (validators.get(r.validatedById) ?? null) : null,
        qrUrl: this.config.qrUrl(r.code, r.qrToken),
      };
    });
  }

  private async events(
    lots: TraceLot[],
    user: AuthUser,
  ): Promise<LotEventView[]> {
    const codeOf = new Map(lots.map((l) => [l.id, l.code]));
    const rows = await this.dataSource.getRepository(LotEvent).find({
      where: { lotId: In(lots.map((l) => l.id)) },
      order: { occurredAt: 'ASC', createdAt: 'ASC' },
    });
    const actorIds = [
      ...new Set(rows.map((r) => r.actorId).filter((v) => v != null)),
    ];
    const operatorIds = [
      ...new Set(rows.map((r) => r.operatorId).filter((v) => v != null)),
    ];
    // People's names stay with the farm side; institutions see ids only.
    const showNames = user.role !== UserRole.INSTITUTION;
    const [actors, operators] = await Promise.all([
      showNames && actorIds.length
        ? this.dataSource.getRepository(User).find({
            where: { id: In(actorIds) },
            select: { id: true, fullName: true },
          })
        : Promise.resolve([] as User[]),
      operatorIds.length
        ? this.dataSource
            .getRepository(Operator)
            .find({ where: { id: In(operatorIds) } })
        : Promise.resolve([] as Operator[]),
    ]);
    const actorName = new Map(actors.map((a) => [a.id, a.fullName]));
    const operatorOf = new Map(operators.map((o) => [o.id, o]));
    return rows.map((r) => {
      const op = r.operatorId ? operatorOf.get(r.operatorId) : undefined;
      return {
        id: r.id,
        lotId: r.lotId,
        lotCode: codeOf.get(r.lotId) ?? '',
        type: r.type,
        occurredAt: r.occurredAt,
        actor: r.actorId
          ? { id: r.actorId, fullName: actorName.get(r.actorId) ?? null }
          : null,
        operator: op ? { id: op.id, code: op.code, name: op.name } : null,
        sortieId: r.sortieId,
        data: r.data,
      };
    });
  }

  /**
   * T2 « intrants »: programme deliveries confirmed by the farm while the band
   * ran (from its opening to its closure or today), or linked to the band.
   * A delivery linked to another band is that band's.
   */
  private async rearingDeliveries(band: ProductionBatch, programId: string | null) {
    const end = band.closedAt
      ? band.closedAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const candidates: {
      id: string;
      code: string;
      bandId: string | null;
      receivedDate: string;
      source: string;
      supplierName: string | null;
    }[] = await this.dataSource.query(
      `SELECT d.id, d.code, d.source, d.supplier_name AS "supplierName", d.band_id AS "bandId",
              TO_CHAR(COALESCE(d.received_date, d.confirmed_at::date), 'YYYY-MM-DD') AS "receivedDate"
         FROM input_deliveries d
        WHERE d.farm_id = $1 AND d.status = $2
          AND (d.band_id = $3
               OR (d.band_id IS NULL
                   AND COALESCE(d.received_date, d.confirmed_at::date)
                       BETWEEN $4::date AND $5::date))
        ORDER BY 5, d.code`,
      [
        band.farmId,
        InputDeliveryStatus.CONFIRMEE,
        band.id,
        band.integrationDate.slice(0, 10),
        end,
      ],
    );
    const rows = await this.ownDeliveries(band, candidates);
    if (rows.length === 0) return [];
    const lines: {
      deliveryId: string;
      intrantCode: string;
      unitCode: string;
      receivedQuantity: number;
      feedPhase: string | null;
    }[] = await this.dataSource.query(
      `SELECT l.delivery_id AS "deliveryId", l.intrant_code AS "intrantCode",
              l.unit_code AS "unitCode", l.feed_phase AS "feedPhase",
              COALESCE(l.received_quantity, l.quantity)::float AS "receivedQuantity"
         FROM input_delivery_lines l
        WHERE l.delivery_id = ANY($1)
        ORDER BY l.position`,
      [rows.map((r) => r.id)],
    );
    const labels = programId
      ? new Map(
          (
            await this.dataSource.getRepository(RefItem).find({
              where: { programId, listType: ProgramListType.INTRANT },
            })
          ).map((i) => [i.code, i.label]),
        )
      : new Map<string, string>();
    return rows.map(({ bandId: _bandId, ...d }) => ({
      ...d,
      lines: lines
        .filter((l) => l.deliveryId === d.id)
        .map((l) => ({
          intrantCode: l.intrantCode,
          intrantLabel: labels.get(l.intrantCode) ?? null,
          unitCode: l.unitCode,
          receivedQuantity: Number(l.receivedQuantity),
          feedPhase: l.feedPhase,
        })),
    }));
  }

  /**
   * POUFA lot A2 divers: a delivery without band shows in one band only
   * (`delivery-attribution.ts`): the only band open on its reception day,
   * else the one open band that ate from its lots, else none.
   */
  private async ownDeliveries<T extends { id: string; bandId: string | null; receivedDate: string }>(
    band: ProductionBatch,
    candidates: T[],
  ): Promise<T[]> {
    const unlinked = candidates.filter((d) => !d.bandId);
    if (unlinked.length === 0) return candidates;
    const bands: BandWindow[] = await this.dataSource.query(
      `SELECT id, TO_CHAR(integration_date, 'YYYY-MM-DD') AS "integrationDate",
              TO_CHAR(COALESCE(closed_at, CASE WHEN status = 'CLOTURE' THEN "updatedAt" END), 'YYYY-MM-DD') AS "closedDay"
         FROM production_batches WHERE farm_id = $1`,
      [band.farmId],
    );
    const consumers: { deliveryId: string; batchId: string }[] =
      await this.dataSource.query(
        `SELECT DISTINCT l.delivery_id AS "deliveryId", e.batch_id AS "batchId"
           FROM input_delivery_lines l
           JOIN daily_entries e ON e.input_lot_id = l.input_lot_id
          WHERE l.delivery_id = ANY($1) AND e.feed_quantity > 0`,
        [unlinked.map((d) => d.id)],
      );
    return candidates.filter(
      (d) =>
        deliveryBand(
          {
            bandId: d.bandId,
            receivedDate: d.receivedDate,
            consumerBandIds: consumers
              .filter((c) => c.deliveryId === d.id)
              .map((c) => c.batchId),
          },
          bands,
        ) === band.id,
    );
  }

  /** T2 « aliment consommé »: the band's daily-entry feed per stock lot. */
  private async rearingFeedLots(batchId: string) {
    const rows: {
      inputLotId: string | null;
      productName: string | null;
      supplierLotNumber: string | null;
      fromDay: string;
      toDay: string;
      kg: number;
    }[] = await this.dataSource.query(
      `SELECT e.input_lot_id AS "inputLotId", l."productName" AS "productName",
              l.supplier_lot_number AS "supplierLotNumber",
              TO_CHAR(MIN(e.entry_date), 'YYYY-MM-DD') AS "fromDay",
              TO_CHAR(MAX(e.entry_date), 'YYYY-MM-DD') AS "toDay",
              SUM(e.feed_quantity)::float AS kg
         FROM daily_entries e
         LEFT JOIN input_lots l ON l.id = e.input_lot_id
        WHERE e.batch_id = $1 AND e.feed_quantity > 0
        GROUP BY e.input_lot_id, l."productName", l.supplier_lot_number
        ORDER BY MIN(e.entry_date)`,
      [batchId],
    );
    return rows.map((r) => ({ ...r, kg: Number(r.kg) }));
  }

  /**
   * T2 « visites » (CDC n° 27, n° 45): the band's visits and controls, plus
   * the farm's visits without band made while it ran. No agent name.
   */
  private async rearingVisits(band: ProductionBatch) {
    const end = band.closedAt
      ? band.closedAt.toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    const rows: {
      id: string;
      visitDate: string;
      type: string;
      scorePct: string | null;
      classification: string | null;
      visaFrom: string | null;
      visaTo: string | null;
      nextVisitDate: string | null;
      hasRecommendations: boolean;
    }[] = await this.dataSource.query(
      `SELECT v.id, v.type, v.classification,
              TO_CHAR(v.visit_date, 'YYYY-MM-DD') AS "visitDate",
              v.score_pct AS "scorePct",
              TO_CHAR(v.visa_from, 'YYYY-MM-DD') AS "visaFrom",
              TO_CHAR(v.visa_to, 'YYYY-MM-DD') AS "visaTo",
              TO_CHAR(v.next_visit_date, 'YYYY-MM-DD') AS "nextVisitDate",
              (v.recommendations IS NOT NULL AND v.recommendations <> '') AS "hasRecommendations"
         FROM farm_visits v
        WHERE v.farm_id = $1
          AND (v.batch_id = $2
               OR (v.batch_id IS NULL AND v.visit_date BETWEEN $3::date AND $4::date))
        ORDER BY v.visit_date, v.created_at`,
      [band.farmId, band.id, band.integrationDate.slice(0, 10), end],
    );
    return rows.map((r) => ({
      ...r,
      scorePct: r.scorePct == null ? null : Number(r.scorePct),
    }));
  }

  private async rearing(
    user: AuthUser,
    band: ProductionBatch,
  ): Promise<RearingItem[]> {
    const ds = this.dataSource;
    const access =
      user.role === UserRole.INSTITUTION
        ? await this.scope.accessOf(user.id)
        : null;
    const sanitary = mayHandleSanitaryDeclarations(user, access);
    const [cares, treatments, days, healthEvents, sorties] = await Promise.all([
      ds.getRepository(ProphylaxisEvent).find({
        where: { batchId: band.id, status: ProphylaxisStatus.FAIT },
      }),
      ds.getRepository(TreatmentRecord).find({ where: { batchId: band.id } }),
      ds.getRepository(BandeDailyStat).find({
        where: { batchId: band.id },
        order: { day: 'ASC' },
      }),
      sanitary
        ? ds.getRepository(HealthEvent).find({ where: { batchId: band.id } })
        : Promise.resolve(null),
      ds.getRepository(Sortie).find({
        where: { batchId: band.id },
        order: { sortieDate: 'ASC', createdAt: 'ASC' },
      }),
    ]);
    const farm = await ds.getRepository(Farm).findOne({
      where: { id: band.farmId },
      select: { id: true, programId: true },
    });
    const [reasons, operators, subLots] = await Promise.all([
      farm && sorties.length
        ? ds.getRepository(RefItem).find({
            where: {
              programId: farm.programId,
              listType: ProgramListType.MOTIF_SORTIE,
            },
          })
        : Promise.resolve([] as RefItem[]),
      sorties.some((s) => s.operatorId)
        ? ds.getRepository(Operator).find({
            where: {
              id: In(
                sorties.map((s) => s.operatorId).filter((v) => v != null),
              ),
            },
          })
        : Promise.resolve([] as Operator[]),
      sorties.length
        ? ds.getRepository(TraceLot).find({
            where: { sortieId: In(sorties.map((s) => s.id)) },
            select: { id: true, code: true, sortieId: true },
          })
        : Promise.resolve([] as TraceLot[]),
    ]);
    const reasonLabel = new Map(reasons.map((r) => [r.code, r.label]));
    const operatorName = new Map(operators.map((o) => [o.id, o.name]));
    const lotOfSortie = new Map(subLots.map((l) => [l.sortieId, l.code]));
    const [deliveries, feedLots, visits] = await Promise.all([
      this.rearingDeliveries(band, farm?.programId ?? null),
      this.rearingFeedLots(band.id),
      mayReadVisits(user, access) ? this.rearingVisits(band) : null,
    ]);
    return rearingTimeline({
      band,
      deliveries,
      feedLots,
      visits,
      cares: cares
        .filter((c) => c.completedAt != null)
        .map((c) => ({
          careType: c.careType,
          name: c.name,
          completedAt: c.completedAt!,
          withdrawalDays: c.withdrawalDays,
          animalCount: c.animalCount,
        })),
      treatments,
      days,
      healthEvents,
      sorties: sorties.map((s) => ({
        id: s.id,
        sortieDate: s.sortieDate,
        count: s.count,
        weightKg: s.weightKg,
        reasonCode: s.reasonCode,
        reasonLabel: reasonLabel.get(s.reasonCode) ?? null,
        operatorName: s.operatorId
          ? (operatorName.get(s.operatorId) ?? null)
          : null,
        lotCode: lotOfSortie.get(s.id) ?? null,
      })),
    });
  }
}

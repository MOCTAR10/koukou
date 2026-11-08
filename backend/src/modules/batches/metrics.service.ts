import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import {
  BatchStatus,
  BatchType,
} from '../../common/enums/batch-type.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { EGGS_PER_ALVEOL } from '../../common/constants/stock.constants.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import {
  StockTransferProductType,
} from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { day1WeightKg } from '../../common/utils/species-day1-weight.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import {
  sanitaryHolds,
  sanitaryHoldsMany,
  type SanitaryHolds,
} from '../sanitary/sanitary-holds.js';
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { Building } from '../buildings/entities/building.entity.js';
import {
  moduleRatioVsCapacity as capacityRatio,
  referenceCapacity,
} from './capacity-ratio.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { FlockReconciliationService } from './flock-reconciliation.service.js';
import { ageOn } from './poufa/bande-rules.js';
import {
  avgDailyWaterPerBird,
  lastDayWaterPerBird,
  FlockTimeline,
  ipeOf,
  performanceAtLastWeighing,
  populationOn,
} from './flock-performance.js';
import {
  BatchMetrics,
  ReadyReason,
} from './models/batch-metrics.model.js';
import { todayLocal } from '../../common/utils/date.utils.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

function todayIso(): string {
  return todayLocal();
}

/** Reading date of a band: today, or its closure day once closed. */
function defaultRefDate(batch: Pick<ProductionBatch, 'closedAt'>): string {
  const today = todayIso();
  if (!batch.closedAt) return today;
  const closed = new Date(batch.closedAt).toISOString().slice(0, 10);
  return closed < today ? closed : today;
}

function addDaysIso(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function deviationPct(
  actual: number | null,
  target: number | null,
): number | null {
  return actual != null && target != null && target !== 0
    ? round2(((actual - target) / target) * 100)
    : null;
}

export interface ReadinessInput {
  type: BatchType;
  status: AlertLevel;
  isClosed: boolean;
  ageDays: number;
  mortalityPercent: number;
  fcrDeviationPct: number | null;
  layRateDeviationPct: number | null;
  minVenteAgeDays: number;
  fcrDeviationMaxPct: number;
  reformeLayRateFallPct: number;
  /** Suspension sanitaire active (DELAI_ATTENTE / soin PROPHYLAXIE en retard). */
  sanitaryBlocked: boolean;
}

export interface ReadinessResult {
  readyForSale: boolean;
  readyReason: ReadyReason;
}

/**
 * Auto-signal de commercialisation : un lot « prêt à vendre » peut être mis
 * en vente / précommande sans intervention manuelle du statut.
 *   - Chair : âge minimal + santé (pas ROUGE) + IC conforme (± tolérance souche).
 *   - Pondeuse : ponte effondrée sous la cible (~ chute cumulée) → réformable.
 */
export function evaluateReadiness(input: ReadinessInput): ReadinessResult {
  if (input.isClosed) return { readyForSale: false, readyReason: 'N_A' };
  if (input.status === AlertLevel.ROUGE || input.sanitaryBlocked)
    return { readyForSale: false, readyReason: 'SANITARY' };

  if (input.type === BatchType.PONDEUSE) {
    const fallen =
      input.layRateDeviationPct != null &&
      input.layRateDeviationPct < -input.reformeLayRateFallPct;
    if (!fallen) return { readyForSale: false, readyReason: 'N_A' };
    return { readyForSale: true, readyReason: 'READY' };
  }

  if (input.ageDays < input.minVenteAgeDays)
    return { readyForSale: false, readyReason: 'TOO_YOUNG' };
  if (
    input.fcrDeviationPct != null &&
    input.fcrDeviationPct > input.fcrDeviationMaxPct
  ) {
    return { readyForSale: false, readyReason: 'FCR' };
  }
  return { readyForSale: true, readyReason: 'READY' };
}

export interface BreedStatus {
  breedId: string;
  breedName: string;
  breedCode: string | null;
  breedType: BatchType;
  week: number;
  /** Age week of the last weighing (weight / FCR targets are taken there). */
  weighingWeek: number | null;
  targetAvgWeightKg: number | null;
  actualAvgWeightKg: number | null;
  avgWeightDeviationPct: number | null;
  targetFcr: number | null;
  actualFcr: number | null;
  fcrDeviationPct: number | null;
  targetLayRatePercent: number | null;
  actualLayRatePercent: number | null;
  layRateDeviationPct: number | null;
}

/**
 * Reads shared by the bands of one list or dashboard, fetched once instead of
 * once per band (see MetricsService.preload).
 */
export interface MetricsPreload {
  constants: Record<string, number>;
  farms: Map<string, Farm>;
  standards: Map<string, BreedStandard[]>;
  buildings: Map<string, Building>;
  entries: Map<string, DailyEntry[]>;
  activeAlerts: Map<string, number>;
  holds: Map<string, SanitaryHolds>;
  removals: Map<string, Map<string, number>>;
  deathEvents: Map<
    string,
    Array<{ batchId: string; date: string; quantity: number }>
  >;
  /** Egg alveoles sold / transferred-and-unsold per band (see eggStockForBatch). */
  eggSold: Map<string, number>;
  eggTransferred: Map<string, number>;
}

const METRIC_CONSTANT_KEYS = [
  ReferenceKey.STANDARD_MODULE,
  ReferenceKey.DENSITY_WARN,
  ReferenceKey.DENSITY_CRITICAL,
  ReferenceKey.VENTE_AGE_MIN_DAYS,
  ReferenceKey.VENTE_FCR_DEV_MAX_PCT,
  ReferenceKey.REFORME_LAY_RATE_FALL_PCT,
];

@Injectable()
export class MetricsService {
  constructor(
    @InjectRepository(DailyEntry)
    private readonly entriesRepo: Repository<DailyEntry>,
    @InjectRepository(Farm)
    private readonly farmRepo: Repository<Farm>,
    @InjectRepository(BreedStandard)
    private readonly standardRepo: Repository<BreedStandard>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectRepository(StockTransfer)
    private readonly stockTransferRepo: Repository<StockTransfer>,
    private readonly constants: ReferenceConstantsService,
    private readonly flockReconciliation: FlockReconciliationService,
  ) {}

  /**
   * One round of batched reads for a set of bands: constants, farms,
   * buildings, breed curves, daily entries, active alert counts and MORTALITE
   * events, so that compute() does not repeat them per band. Only a cache:
   * compute() without it returns the same figures.
   */
  async preload(batches: ProductionBatch[]): Promise<MetricsPreload> {
    const ids = batches.map((b) => b.id);
    const farmIds = [...new Set(batches.map((b) => b.farmId))];
    const breedIds = [
      ...new Set(
        batches.map((b) => b.breed?.id).filter((x): x is string => !!x),
      ),
    ];
    const buildingIds = [
      ...new Set(
        batches.map((b) => b.buildingId).filter((x): x is string => !!x),
      ),
    ];
    const [
      constants,
      farms,
      standards,
      buildings,
      entries,
      alertRows,
      deaths,
      holds,
      removals,
      eggSoldRows,
      eggTransferRows,
    ] = await Promise.all([
        this.constants.getMany(METRIC_CONSTANT_KEYS),
        farmIds.length
          ? this.farmRepo.find({ where: { id: In(farmIds) } })
          : Promise.resolve([] as Farm[]),
        breedIds.length
          ? this.standardRepo.find({
              where: { breedId: In(breedIds) },
              order: { week: 'ASC' },
            })
          : Promise.resolve([] as BreedStandard[]),
        buildingIds.length
          ? this.farmRepo.manager.find(Building, {
              where: { id: In(buildingIds) },
              select: { id: true, capacity: true },
            })
          : Promise.resolve([] as Building[]),
        ids.length
          ? this.entriesRepo.find({
              where: { batchId: In(ids) },
              order: { entryDate: 'ASC' },
            })
          : Promise.resolve([] as DailyEntry[]),
        ids.length
          ? this.alertRepo
              .createQueryBuilder('a')
              .select('a.batch_id', 'batchId')
              .addSelect('COUNT(*)', 'n')
              .where('a.batch_id IN (:...ids)', { ids })
              .andWhere('a.status = :st', { st: AlertStatus.ACTIVE })
              .groupBy('a.batch_id')
              .getRawMany<{ batchId: string; n: string }>()
          : Promise.resolve([] as { batchId: string; n: string }[]),
        this.flockReconciliation.deathEvents(ids),
        sanitaryHoldsMany(this.alertRepo.manager, ids),
        this.flockReconciliation.removalsByDateMany(ids),
        ids.length
          ? this.saleItemRepo
              .createQueryBuilder('i')
              .innerJoin(Sale, 's', 's.id = i.sale_id')
              .select('i.batch_id', 'batchId')
              .addSelect('COALESCE(SUM(i.quantity), 0)', 'n')
              .where('i.batch_id IN (:...ids)', { ids })
              .andWhere('i.product_type = :pt', {
                pt: SaleItemProductType.OEUFS,
              })
              .andWhere('s.status != :cx', { cx: SaleStatus.CANCELLED })
              .groupBy('i.batch_id')
              .getRawMany<{ batchId: string; n: string }>()
          : Promise.resolve([] as { batchId: string; n: string }[]),
        ids.length
          ? this.stockTransferRepo
              .createQueryBuilder('t')
              .select('t.batchId', 'batchId')
              .addSelect('COALESCE(SUM(t.quantity - t.quantitySold), 0)', 'n')
              .where('t.batchId IN (:...ids)', { ids })
              .andWhere('t.productType = :pt', {
                pt: StockTransferProductType.OEUFS,
              })
              .andWhere('t.status = :st', {
                st: StockTransferStatus.TRANSFERRED,
              })
              .groupBy('t.batchId')
              .getRawMany<{ batchId: string; n: string }>()
          : Promise.resolve([] as { batchId: string; n: string }[]),
      ]);
    const out: MetricsPreload = {
      constants,
      farms: new Map(farms.map((f) => [f.id, f])),
      standards: new Map(),
      buildings: new Map(buildings.map((b) => [b.id, b])),
      entries: new Map(),
      activeAlerts: new Map(alertRows.map((r) => [r.batchId, Number(r.n)])),
      holds,
      removals,
      deathEvents: new Map(),
      eggSold: new Map(eggSoldRows.map((r) => [r.batchId, Number(r.n)])),
      eggTransferred: new Map(
        eggTransferRows.map((r) => [r.batchId, Number(r.n)]),
      ),
    };
    for (const id of breedIds) out.standards.set(id, []);
    for (const st of standards) out.standards.get(st.breedId)?.push(st);
    for (const id of ids) {
      out.entries.set(id, []);
      out.deathEvents.set(id, []);
    }
    for (const e of entries) out.entries.get(e.batchId)?.push(e);
    for (const d of deaths) out.deathEvents.get(d.batchId)?.push(d);
    return out;
  }

  async compute(
    batch: ProductionBatch,
    opts?: { asOf?: string; preload?: MetricsPreload },
  ): Promise<BatchMetrics> {
    const pre = opts?.preload;
    const asOf = opts?.asOf;
    // A closed band is read as of its closure day, like its bilan and its
    // sheet: its age and rates do not keep moving after it ended.
    const refDate = asOf ?? defaultRefDate(batch);
    const historical = asOf != null && asOf < todayIso();
    const [
      entriesRaw,
      constantsByKey,
      standards,
      alertsCount,
      holds,
      deathEventRows,
      removalsByDate,
      farm,
      building,
    ] = await Promise.all([
      pre?.entries.has(batch.id)
        ? Promise.resolve(pre.entries.get(batch.id)!)
        : this.entriesRepo.find({
            where: { batchId: batch.id },
            order: { entryDate: 'ASC' },
          }),
      // One query for the six thresholds (was six: recette A16, N queries per lot).
      pre?.constants ?? this.constants.getMany(METRIC_CONSTANT_KEYS),
      this.loadStandards(batch, pre),
      pre?.activeAlerts
        ? Promise.resolve(pre.activeAlerts.get(batch.id) ?? 0)
        : this.alertRepo.count({
            where: { batchId: batch.id, status: AlertStatus.ACTIVE },
          }),
      pre?.holds.has(batch.id)
        ? Promise.resolve(pre.holds.get(batch.id)!)
        : sanitaryHolds(this.alertRepo.manager, batch.farmId, batch.id),
      // Independent reads fired together with the rest (were sequential
      // round-trips further down: ~7 serial queries per band in a list).
      pre?.deathEvents.has(batch.id)
        ? Promise.resolve(pre.deathEvents.get(batch.id)!)
        : this.flockReconciliation.deathEvents([batch.id]),
      pre?.removals.has(batch.id)
        ? Promise.resolve(pre.removals.get(batch.id)!)
        : this.flockReconciliation.removalsByDate(batch.id),
      pre?.farms.has(batch.farmId)
        ? Promise.resolve(pre.farms.get(batch.farmId)!)
        : this.farmRepo.findOne({ where: { id: batch.farmId } }),
      batch.buildingId
        ? pre?.buildings.has(batch.buildingId)
          ? Promise.resolve(pre.buildings.get(batch.buildingId)!)
          : this.farmRepo.manager.findOne(Building, {
              where: { id: batch.buildingId },
              select: { id: true, capacity: true },
            })
        : Promise.resolve(null),
    ]);

    const standardModule = constantsByKey[ReferenceKey.STANDARD_MODULE] ?? 3000;
    const densityWarn = constantsByKey[ReferenceKey.DENSITY_WARN] ?? 15;
    const densityCritical = constantsByKey[ReferenceKey.DENSITY_CRITICAL] ?? 18;
    const minVenteAgeDays = constantsByKey[ReferenceKey.VENTE_AGE_MIN_DAYS] ?? 35;
    const fcrDeviationMaxPct = constantsByKey[ReferenceKey.VENTE_FCR_DEV_MAX_PCT] ?? 10;
    const reformeLayRateFallPct =
      constantsByKey[ReferenceKey.REFORME_LAY_RATE_FALL_PCT] ?? 15;

    const entries = historical
      ? entriesRaw.filter((e) => e.entryDate <= asOf)
      : entriesRaw;
    const standard = this.pickStandard(standards, batch, refDate);
    // Age of the birds: J+x at opening + days since integration.
    const ageDays = this.ageDaysOn(batch, refDate);
    const entryDeaths = entries.reduce((s, e) => s + e.deaths, 0);
    // Deaths declared as MORTALITE health events are not in the daily
    // entries: the mortality rate needs both.
    const deathEventsByDate = new Map<string, number>();
    for (const d of deathEventRows) {
      if (d.date <= refDate) {
        deathEventsByDate.set(
          d.date,
          (deathEventsByDate.get(d.date) ?? 0) + d.quantity,
        );
      }
    }
    const totalDeaths =
      entryDeaths + [...deathEventsByDate.values()].reduce((s, n) => s + n, 0);
    // quantityAlive est la source de vérité (décréments POS/abattage + reconcilées).
    // En mode « as-of » (date passée) : le cheptel est reconstitué avec la même
    // réconciliation que recomputeLiveCount, bornée à la date demandée — cohérent
    // avec la source actuelle, sans table d'historique (les événements santé
    // supprimés sortent de l'équation, comme en temps réel).
    let liveCount = Math.max(0, batch.quantityAlive);
    if (historical && asOf) {
      const [soldBirds, slaughteredBirds, sanitaryRemovedBirds, retraitBirds] =
        await Promise.all([
          this.flockReconciliation.netSoldBirds(batch.id, undefined, asOf),
          this.flockReconciliation.netSlaughteredBirds(
            batch.id,
            undefined,
            asOf,
          ),
          this.flockReconciliation.netSanitaryRemovedBirds(
            batch.id,
            undefined,
            asOf,
          ),
          this.flockReconciliation.netRetraitBirds(batch.id, undefined, asOf),
        ]);
      liveCount = Math.max(
        0,
        // MORTALITE events are inside sanitaryRemovedBirds.
        batch.quantityAtStart -
          entryDeaths -
          soldBirds -
          slaughteredBirds -
          sanitaryRemovedBirds -
          retraitBirds,
      );
    }
    const mortalityPercent =
      batch.quantityAtStart > 0
        ? (totalDeaths / batch.quantityAtStart) * 100
        : 0;
    const viabilityPercent = Math.max(0, 100 - mortalityPercent);

    // Convention : feedQuantity est TOUJOURS stocké en kg (conversion sac->kg faite à la saisie).
    const totalFeedKg = entries.reduce((s, e) => s + e.feedQuantity, 0);
    const totalWaterL = entries.reduce((s, e) => s + e.waterL, 0);

    // FCR / GMQ / IPE at the last weighing, over every bird the feed went
    // into (present, sold, slaughtered, culled, dead) — see flock-performance.
    const timeline: FlockTimeline = {
      integrationDate: batch.integrationDate,
      quantityAtStart: batch.quantityAtStart,
      day1WeightKg: day1WeightKg(batch.species),
      initialAgeDays: batch.initialAgeDays,
      initialWeightKg:
        batch.initialAvgWeightG != null ? batch.initialAvgWeightG / 1000 : null,
      entries,
      removalsByDate,
      deathEventsByDate,
    };
    const lastWater = lastDayWaterPerBird(timeline);
    const perf = performanceAtLastWeighing(timeline, refDate);
    const totalWeightGainKg = perf ? perf.biomassGainKg : null;
    const fcr = perf?.fcr ?? null;
    const gmqGramsPerDay = perf?.gmqGramsPerDay ?? null;
    const ipe = perf?.ipe ?? null;
    const fcrStandard = perf
      ? this.pickStandard(standards, batch, perf.weighingDate)
      : null;

    const eggsCollectedTotal = entries.reduce((s, e) => s + e.eggsCollected, 0);
    const eggBreakdown = {
      collected: eggsCollectedTotal,
      sellable: 0,
      cracked: entries.reduce((s, e) => s + e.eggsCracked, 0),
      small: entries.reduce((s, e) => s + e.eggsSmall, 0),
      doubleYolk: entries.reduce((s, e) => s + e.eggsDoubleYolk, 0),
      dirty: entries.reduce((s, e) => s + e.eggsDirty, 0),
    };
    eggBreakdown.sellable = Math.max(
      0,
      eggBreakdown.collected -
        eggBreakdown.cracked -
        eggBreakdown.small -
        eggBreakdown.doubleYolk -
        eggBreakdown.dirty,
    );
    const {
      availableEggs: eggStockAvailableEggs,
      availableAlveoles: eggStockAvailableAlveoles,
    } =
      eggBreakdown.sellable > 0
        ? await this.eggStockForBatch(
            batch.farmId,
            batch.id,
            eggBreakdown.sellable,
            pre,
          )
        : { availableEggs: 0, availableAlveoles: 0 };
    // Taux de ponte = fenêtre glissante de 7 jours (aligné sur la cible
    // hebdomadaire du référentiel) : un cumul de toute la vie de la bande ne
    // peut pas être comparé à une cible de semaine d'âge (ex. 300 % vs 86 %).
    // Réservé aux PONDEUSE : un lot CHAIR (viande) n'a pas de « taux de ponte »
    // — l'affichage d'un ratio œufs/effectif y a prêté à confusion (ex. canard
    // 150 œufs = 150 vivants → 100 %). Les œufs des lots CHAIR restent suivis
    // via eggBreakdown / stock d'œufs. Plafonné à 100 % : une poule ne pond
    // jamais plus d'un œuf/jour — un résultat supérieur trahit une saisie
    // d'œufs supérieure à l'effectif.
    const windowStart = addDaysIso(refDate, -7);
    const windowEntries = entries.filter((e) => e.entryDate >= windowStart);
    const recordedDays = new Set(
      windowEntries.filter((e) => e.eggsCollected > 0).map((e) => e.entryDate),
    ).size;
    // Hens present on each recorded day (not today's headcount): a cull or
    // a death spike today must not inflate the rate of the days before it.
    const henDays = [
      ...new Set(
        windowEntries
          .filter((e) => e.eggsCollected > 0)
          .map((e) => e.entryDate),
      ),
    ].reduce((s, d) => s + populationOn(timeline, d), 0);
    const rawLayRate =
      henDays > 0 && recordedDays > 0
        ? (windowEntries.reduce((s, e) => s + e.eggsCollected, 0) / henDays) *
          100
        : null;
    const layRatePercent =
      batch.type === BatchType.PONDEUSE && rawLayRate != null
        ? Math.min(100, rawLayRate)
        : null;

    const densityPerM2 =
      batch.buildingAreaM2 != null && batch.buildingAreaM2 > 0
        ? liveCount / batch.buildingAreaM2
        : null;

    const moduleFraction = batch.quantityAtStart / standardModule;

    const moduleRatioVsCapacity = capacityRatio(
      batch.quantityAtStart,
      referenceCapacity({
        buildingCapacity: building?.capacity,
        capacityPerBuilding: farm?.capacityPerBuilding,
        capacityPlaces: farm?.capacityPlaces,
      }),
    );

    const status = this.computeStatus({
      mortalityPercent,
      densityPerM2,
      densityWarn,
      densityCritical,
    });

    const readiness = evaluateReadiness({
      type: batch.type,
      status,
      isClosed: batch.status === BatchStatus.CLOTURE,
      ageDays,
      mortalityPercent,
      fcrDeviationPct: deviationPct(fcr, fcrStandard?.targetFcr ?? null),
      layRateDeviationPct: deviationPct(
        layRatePercent,
        standard?.targetLayRatePercent ?? null,
      ),
      minVenteAgeDays,
      fcrDeviationMaxPct,
      reformeLayRateFallPct,
      sanitaryBlocked:
        holds.withdrawalEndDate != null || holds.prophylaxisOverdue,
    });

    return {
      ageDays,
      alerts: alertsCount,
      totalDeaths,
      mortalityPercent,
      viabilityPercent,
      liveCount,
      totalFeedKg,
      totalWaterL,
      waterLPerBird: avgDailyWaterPerBird(
        timeline,
        addDaysIso(refDate, -7),
        refDate,
      ),
      waterLPerBirdLastDay: lastWater?.perBird ?? null,
      waterLastDayDate: lastWater?.date ?? null,
      totalWeightGainKg,
      fcr,
      gmqGramsPerDay,
      ipe,
      lastWeighingDate: perf?.weighingDate ?? null,
      lastWeighingAgeDays: perf?.ageDays ?? null,
      lastWeighingAvgWeightKg: perf?.avgWeightKg ?? null,
      // Breed curve at the weighing age, at the lot's own viability: the gap
      // with `ipe` isolates growth and feed efficiency (mortality has its own
      // alerts).
      ipeTarget:
        perf && fcrStandard?.targetAvgWeightKg != null
          ? ipeOf(
              fcrStandard.targetAvgWeightKg,
              perf.viabilityPercent,
              perf.ageDays,
              fcrStandard.targetFcr,
            )
          : null,
      eggsCollectedTotal,
      eggBreakdown,
      eggStockAvailableEggs,
      eggStockAvailableAlveoles,
      layRatePercent,
      status,
      densityPerM2,
      moduleFraction,
      moduleRatioVsCapacity,
      readyForSale: readiness.readyForSale,
      readyReason: readiness.readyReason,
    };
  }

  private async loadStandards(
    batch: ProductionBatch,
    pre?: MetricsPreload,
  ): Promise<BreedStandard[]> {
    if (!batch.breed) return [];
    const cached = pre?.standards.get(batch.breed.id);
    if (cached) return cached;
    return this.standardRepo.find({
      where: { breedId: batch.breed.id },
      order: { week: 'ASC' },
    });
  }

  /** Standard row for the age week on `date` (last row once past the curve). */
  private pickStandard(
    standards: BreedStandard[],
    batch: Pick<ProductionBatch, 'integrationDate' | 'initialAgeDays'>,
    date: string,
  ): BreedStandard | null {
    if (standards.length === 0) return null;
    const ageWeek = Math.floor(this.ageDaysOn(batch, date) / 7) + 1;
    const applicable = standards.filter((s) => s.week <= ageWeek);
    return applicable.length > 0
      ? applicable[applicable.length - 1]!
      : standards[0];
  }

  /**
   * « Breed Intelligence » : compare le lot à la courbe de référence de sa
   * souche (semaine d'âge = floor(ageDays/7)+1, plafonnée à la dernière
   * semaine du référentiel). Retourne null si le lot n'a pas de souche ou que
   * la souche n'a pas de référentiel (souche personnalisée).
   */
  async breedStatus(
    batch: ProductionBatch,
    opts?: { metrics?: BatchMetrics; preload?: MetricsPreload },
  ): Promise<BreedStatus | null> {
    const standards = await this.loadStandards(batch, opts?.preload);
    const standard = this.pickStandard(standards, batch, defaultRefDate(batch));
    if (!standard) return null;

    const metrics =
      opts?.metrics ??
      (await this.compute(batch, { preload: opts?.preload }));
    // Weight and FCR are measured at the last weighing: compare them with the
    // curve at THAT age, not at today's week.
    const atWeighing = metrics.lastWeighingDate
      ? this.pickStandard(standards, batch, metrics.lastWeighingDate)
      : null;
    const actualAvgWeightKg =
      metrics.lastWeighingAvgWeightKg != null
        ? round2(metrics.lastWeighingAvgWeightKg)
        : null;
    const targetAvgWeightKg = atWeighing?.targetAvgWeightKg ?? null;
    const targetFcr = atWeighing?.targetFcr ?? null;

    return {
      breedId: batch.breed!.id,
      breedName: batch.breed!.name,
      breedCode: batch.breed!.refCode ?? null,
      breedType: batch.breed!.type,
      week: standard.week,
      weighingWeek: atWeighing?.week ?? null,
      targetAvgWeightKg,
      actualAvgWeightKg,
      avgWeightDeviationPct: deviationPct(actualAvgWeightKg, targetAvgWeightKg),
      targetFcr,
      actualFcr: metrics.fcr,
      fcrDeviationPct: deviationPct(metrics.fcr, targetFcr),
      targetLayRatePercent: standard.targetLayRatePercent,
      actualLayRatePercent: metrics.layRatePercent,
      layRateDeviationPct: deviationPct(
        metrics.layRatePercent,
        standard.targetLayRatePercent,
      ),
    };
  }

  /**
   * Age of the birds on `onDate`: the age at opening (`initialAgeDays`, POUFA
   * J+x; 0 for a lot placed as chicks) + the days since integration — the
   * same rule as the band sheet (`ageOn`) and `expectedEndDate`.
   */
  private ageDaysOn(
    batch: Pick<ProductionBatch, 'integrationDate' | 'initialAgeDays'>,
    onDate: string,
  ): number {
    return ageOn(batch.integrationDate, batch.initialAgeDays, onDate);
  }

  /**
   * Alvéoles d'œufs vendables propres à CE lot : production commercialisable du
   * lot − alvéoles vendues attribuées au lot (sale_items OEUFS avec ce
   * batchId, ventes non annulées) − alvéoles encore en boutique issues de ce
   * lot (transférées, non vendues). Aligné sur `SalesService.assertEggsAvailable`
   * et `DashboardService.evaluateEggStockAlerts`, mais scopé au lot : chaque lot
   * ne présente que ses propres œufs, sans mise en commun ferme.
   */
  private async eggStockForBatch(
    farmId: string,
    batchId: string,
    sellableEggs: number,
    pre?: MetricsPreload,
  ): Promise<{ availableEggs: number; availableAlveoles: number }> {
    if (pre) {
      const availableEggs = Math.max(
        0,
        sellableEggs -
          ((pre.eggSold.get(batchId) ?? 0) +
            (pre.eggTransferred.get(batchId) ?? 0)) *
            EGGS_PER_ALVEOL,
      );
      return {
        availableEggs,
        availableAlveoles: Math.floor(availableEggs / EGGS_PER_ALVEOL),
      };
    }
    const nonCancelled = await this.saleRepo.find({
      where: { farmId, status: Not(SaleStatus.CANCELLED) },
    });
    let soldAlveoles = 0;
    if (nonCancelled.length > 0) {
      const eggItems = await this.saleItemRepo.find({
        where: {
          saleId: In(nonCancelled.map((s) => s.id)),
          productType: SaleItemProductType.OEUFS,
          batchId,
        },
      });
      soldAlveoles = eggItems.reduce((s, i) => s + i.quantity, 0);
    }

    const transfers = await this.stockTransferRepo.find({
      where: {
        farmId,
        batchId,
        productType: StockTransferProductType.OEUFS,
        status: StockTransferStatus.TRANSFERRED,
      },
    });
    const transferredEggs = transfers.reduce(
      (s, t) => s + (t.quantity - t.quantitySold) * EGGS_PER_ALVEOL,
      0,
    );

    const availableEggs = Math.max(
      0,
      sellableEggs - soldAlveoles * EGGS_PER_ALVEOL - transferredEggs,
    );
    return {
      availableEggs,
      availableAlveoles: Math.floor(availableEggs / EGGS_PER_ALVEOL),
    };
  }

  private computeStatus(input: {
    mortalityPercent: number;
    densityPerM2: number | null;
    densityWarn: number;
    densityCritical: number;
  }): AlertLevel {
    if (
      input.densityPerM2 != null &&
      input.densityPerM2 > input.densityCritical
    ) {
      return AlertLevel.ROUGE;
    }
    if (input.densityPerM2 != null && input.densityPerM2 > input.densityWarn) {
      return AlertLevel.JAUNE;
    }
    if (input.mortalityPercent > 5) {
      return AlertLevel.ROUGE;
    }
    if (input.mortalityPercent > 1) {
      return AlertLevel.JAUNE;
    }
    return AlertLevel.VERT;
  }
}

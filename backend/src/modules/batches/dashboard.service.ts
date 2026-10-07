import {
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, LessThanOrEqual, Not, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import {
  AlertKind,
  AlertLevel,
  AlertStatus,
} from '../../common/enums/alert-level.enum.js';
import { BatchStatus, BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { PaymentStatus } from '../../common/enums/payment-method.enum.js';
import { SaleStatus } from '../../common/enums/sale-status.enum.js';
import { SaleItemProductType } from '../../common/enums/sale-item-type.enum.js';
import { ReferenceKey } from '../../common/enums/reference-key.enum.js';
import { EGGS_PER_ALVEOL } from '../../common/constants/stock.constants.js';
import { isoWeekStart } from '../../common/utils/date.utils.js';
import {
  DailyEntryCreatedEvent,
  KOUKOU_EVENTS,
  koukouBus,
  SaleChangedEvent,
} from '../../common/utils/event-bus.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { FarmEmployee } from '../farms/entities/farm-employee.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { FeedStockService } from '../feed-stock/feed-stock.service.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { AlertsService } from '../alerts/alerts.service.js';
import { Building } from '../buildings/entities/building.entity.js';
import { Payment } from '../finance/entities/payment.entity.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { StockTransferProductType } from '../../common/enums/stock-transfer-product-type.enum.js';
import { StockTransferStatus } from '../../common/enums/stock-transfer-status.enum.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { BatchesService } from './batches.service.js';
import { BreedStatus, MetricsService } from './metrics.service.js';
import { FarmWeather, WeatherService } from '../weather/weather.service.js';

const DAY1_WEIGHT_KG = 0.045;

const round2 = (n: number): number => Math.round(n * 100) / 100;

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

export type HealthGrade = 'EXCELLENT' | 'BON' | 'MOYEN' | 'CRITIQUE';

export interface DashboardHealth {
  score: number;
  grade: HealthGrade;
  breakdown: { rouge: number; jaune: number; saisiesManquantes: number };
}

export interface HealthOverviewRow {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  type: BatchType;
  species: Species;
  customSpecies?: string | null;
  ageDays: number;
  liveCount: number;
  weekDeaths: number;
  mortalityPercent: number;
  alertesRouges: number;
  alertesJaunes: number;
  lastEntryDate: string | null;
  lastEntryLagDays: number | null;
  breedStatus: BreedStatus | null;
}

export interface LeaderboardRow {
  batchId: string;
  batchName: string | null;
  status: BatchStatus;
  type: BatchType;
  species: Species;
  customSpecies?: string | null;
  ageDays: number;
  perfIndex: number | null;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  layRatePercent: number | null;
  mortalityPercent: number;
  liveCount: number;
}

export interface WeeklyDeltas {
  mortalityThisWeek: number;
  mortalityPrevWeek: number;
  mortalityDelta: number;
  feedThisWeekKg: number;
  feedPrevWeekKg: number;
  feedDeltaKg: number;
  layRateThisWeekPct: number | null;
  layRatePrevWeekPct: number | null;
  layRateDeltaPct: number | null;
}

export interface EggStockInfo {
  availableAlveoles: number;
  availableEggs: number;
  warnAlveoles: number;
  collected: number;
  soldAlveoles: number;
}

export interface DashboardData {
  farmId: string;
  generatedAt: string;
  liveStock: number;
  batches: { total: number; actif: number; enVente: number; cloture: number };
  mortalityPercent: number | null;
  viabilityPercent: number | null;
  feedAutonomyDays: number | null;
  collectedTodayFcfa: number;
  teamCount: number;
  alerts: { total: number; rouge: number; jaune: number; vert: number };
  health: DashboardHealth;
  healthOverview: HealthOverviewRow[];
  leaderboard: LeaderboardRow[];
  deltas: WeeklyDeltas;
  eggStock: EggStockInfo;
  weather: FarmWeather | null;
  /** Consommation d'eau totale aujourd'hui (litres) — tous lots actifs. */
  waterConsumptionTodayL: number | null;
  /** Variation (%) de consommation d'eau vs veille (negatif = baisse). */
  waterDropPercent: number | null;
  /** Nombre de bâtiments de la ferme. */
  buildingsCount: number;
  /** Surface totale des bâtiments (m²) — somme des buildingAreaM2. */
  totalAreaM2: number | null;
  /** Densité globale ferme = liveStock / totalAreaM2 (oiseaux/m²). */
  farmDensityPerM2: number | null;
}

export interface CurveWeek {
  weekStart: string;
  avgWeightKg: number | null;
  feedKg: number;
  waterL: number;
  waterLPerBird: number | null;
  deaths: number;
  cumFeedKg: number;
  fcrCumulative: number | null;
}

export interface BatchCurve {
  batchId: string;
  liveCount: number;
  startWeightKg: number;
  weekly: CurveWeek[];
}

const GRADE_TABLE: Array<{ min: number; grade: HealthGrade }> = [
  { min: 85, grade: 'EXCELLENT' },
  { min: 70, grade: 'BON' },
  { min: 50, grade: 'MOYEN' },
  { min: 0, grade: 'CRITIQUE' },
];

/** Risques de gestion — jamais comptés dans le score de santé sanitaire de la carte « Santé » (Accueil). */
const NON_SANITAIRE_KINDS = new Set<AlertKind>([
  AlertKind.ALIMENT,
  AlertKind.PEREMPTION,
  AlertKind.STOCK_OEUF,
  AlertKind.VENTE,
]);

@Injectable()
export class DashboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DashboardService.name);

  constructor(
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(DailyEntry)
    private readonly entryRepo: Repository<DailyEntry>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(FarmEmployee)
    private readonly employeeRepo: Repository<FarmEmployee>,
    @InjectRepository(Building)
    private readonly buildingRepo: Repository<Building>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(SaleItem)
    private readonly saleItemRepo: Repository<SaleItem>,
    @InjectRepository(StockTransfer)
    private readonly stockTransferRepo: Repository<StockTransfer>,
    private readonly farmsService: FarmsService,
    private readonly feedStockService: FeedStockService,
    private readonly batchesService: BatchesService,
    private readonly alertsService: AlertsService,
    private readonly metricsService: MetricsService,
    private readonly constants: ReferenceConstantsService,
    private readonly weatherService: WeatherService,
  ) {}

  onModuleInit() {
    koukouBus.on(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, this.onEntryCreated);
    koukouBus.on(KOUKOU_EVENTS.SALE_CHANGED, this.onSaleChanged);
  }

  onModuleDestroy() {
    koukouBus.off(KOUKOU_EVENTS.DAILY_ENTRY_CREATED, this.onEntryCreated);
    koukouBus.off(KOUKOU_EVENTS.SALE_CHANGED, this.onSaleChanged);
  }

  private readonly onEntryCreated = (ev: DailyEntryCreatedEvent) => {
    void Promise.all([
      this.evaluateDailyEntryAlerts(ev.farmId, todayStr()),
      this.evaluateEggStockAlerts(ev.farmId),
    ]).catch((err) =>
      this.logger.error(`Réévaluation post-saisie (ferme ${ev.farmId})`, err),
    );
  };

  private readonly onSaleChanged = (ev: SaleChangedEvent) => {
    void this.evaluateEggStockAlerts(ev.farmId).catch((err) =>
      this.logger.error(`Évaluation stock œufs (ferme ${ev.farmId})`, err),
    );
  };

  async getDashboard(
    user: AuthUser,
    farmId: string,
    date?: string,
    time?: string,
  ): Promise<DashboardData> {
    await this.farmsService.assertAccessible(user, farmId);

    // Date de référence du tableau de bord. Sans `date`, on travaille sur le
    // jour courant. Tout agrégat daté (encaissé, eau, écarts hebdo, saisies
    // manquantes) est calculé relativement à cette date.
    if (date != null && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new BadRequestException(
        'Le paramètre date doit être au format YYYY-MM-DD.',
      );
    }
    if (time != null && !/^\d{2}:\d{2}$/.test(time)) {
      throw new BadRequestException(
        'Le paramètre time doit être au format HH:MM.',
      );
    }
    const refDate = date ?? todayStr();
    const refDatetime = time ? new Date(`${refDate}T${time}:00`) : undefined;

    const [batches, alerts, employees, feedSummary, collectedToday] =
      await Promise.all([
        this.batchRepo.find({ where: { farmId } }),
        this.alertRepo.find({
          where: { farmId, status: AlertStatus.ACTIVE },
        }),
        this.employeeRepo.count({ where: { farmId } }),
        this.feedStockService.getStockSummary(user, farmId),
        refDatetime
          ? this.paymentRepo
              .find({
                where: {
                  farmId,
                  paymentDate: refDate,
                  status: PaymentStatus.CONFIRMED,
                  createdAt: LessThanOrEqual(refDatetime),
                },
              })
              .then((ps) => ps.reduce((s, p) => s + p.amountFcfa, 0))
          : this.paymentRepo.sum('amountFcfa', {
              farmId,
              paymentDate: refDate,
              status: PaymentStatus.CONFIRMED,
            }),
      ]);

    const missingEntries = await this.evaluateDailyEntryAlerts(farmId, refDate);

    let totalDeaths = 0;
    let totalStart = 0;
    // Cheptel vivant = lots en cours uniquement (les lots clôturés sont
    // historiques et ne font plus partie de l'effectif exploitable).
    const activeBatches = batches.filter(
      (b) => b.status !== BatchStatus.CLOTURE,
    );
    const liveStock = activeBatches.reduce((s, b) => s + b.quantityAlive, 0);
    let entries: DailyEntry[] = [];
    if (batches.length > 0) {
      entries = await this.entryRepo.find({
        where: { batchId: In(batches.map((b) => b.id)) },
      });
      totalDeaths = entries.reduce((s, e) => s + e.deaths, 0);
      totalStart = batches.reduce((s, b) => s + b.quantityAtStart, 0);
    }

    const mortalityPercent =
      totalStart > 0 ? round2((totalDeaths / totalStart) * 100) : null;
    const viabilityPercent =
      mortalityPercent != null ? round2(100 - mortalityPercent) : null;

    const autonomyDays = feedSummary.byType
      .map((t) => t.autonomyDays)
      .filter((d): d is number => d != null)
      .reduce((min, d) => Math.min(min, d), Infinity);
    const feedAutonomyDays =
      autonomyDays === Infinity ? null : round2(autonomyDays);

    const alertLevels = alerts.reduce(
      (acc, a) => {
        if (a.level === AlertLevel.ROUGE) acc.rouge += 1;
        else if (a.level === AlertLevel.JAUNE) acc.jaune += 1;
        else acc.vert += 1;
        return acc;
      },
      { rouge: 0, jaune: 0, vert: 0 },
    );

    const health = this.computeHealth(alerts, missingEntries);
    const deltas = this.computeDeltas(batches, entries, refDate);
    const leaderboard = await this.computeLeaderboard(user, farmId);
    const healthOverview = await this.computeHealthOverview(
      batches,
      entries,
      alerts,
      refDate,
    );
    const eggStock = await this.evaluateEggStockAlerts(farmId);
    // La météo ne doit jamais dégrader le dashboard (échec réseau → null).
    const weather = await this.weatherService
      .forecastForFarm(farmId)
      .catch(() => null);

    // ── Eau : consommation totale aujourd'hui + variation vs veille ──
    const activeBatchIds = activeBatches.map((b) => b.id);
    let waterConsumptionTodayL: number | null = null;
    let waterDropPercent: number | null = null;
    if (activeBatchIds.length > 0) {
      const today = refDate;
      const yesterday = addDays(today, -1);
      const [todayEntries, yesterdayEntries] = await Promise.all([
        this.entryRepo.find({
          where: { batchId: In(activeBatchIds), entryDate: today },
        }),
        this.entryRepo.find({
          where: { batchId: In(activeBatchIds), entryDate: yesterday },
        }),
      ]);
      const todayWater = todayEntries.reduce((s, e) => s + e.waterL, 0);
      const yesterdayWater = yesterdayEntries.reduce(
        (s, e) => s + e.waterL,
        0,
      );
      waterConsumptionTodayL = todayWater > 0 ? round2(todayWater) : null;
      if (yesterdayWater > 0 && todayWater > 0) {
        waterDropPercent = round2(
          ((yesterdayWater - todayWater) / yesterdayWater) * 100,
        );
      }
    }

    // ── Bâtiments : nombre + surface totale + densité globale ──
    const buildings = await this.buildingRepo.find({ where: { farmId } });
    const buildingsCount = buildings.length;
    const totalAreaM2 =
      buildings.length > 0
        ? round2(
            buildings.reduce((s, b) => s + (b.buildingAreaM2 ?? 0), 0),
          )
        : null;
    const farmDensityPerM2 =
      totalAreaM2 != null && totalAreaM2 > 0 && liveStock > 0
        ? round2(liveStock / totalAreaM2)
        : null;

    return {
      farmId,
      generatedAt: new Date().toISOString(),
      liveStock,
      batches: {
        total: batches.length,
        actif: batches.filter((b) => b.status === BatchStatus.ACTIF).length,
        enVente: batches.filter((b) => b.status === BatchStatus.EN_VENTE)
          .length,
        cloture: batches.filter((b) => b.status === BatchStatus.CLOTURE).length,
      },
      mortalityPercent,
      viabilityPercent,
      feedAutonomyDays,
      collectedTodayFcfa: collectedToday ?? 0,
      teamCount: employees,
      alerts: { total: alerts.length, ...alertLevels },
      health,
      healthOverview,
      leaderboard,
      deltas,
      eggStock,
      weather,
      waterConsumptionTodayL,
      waterDropPercent,
      buildingsCount,
      totalAreaM2,
      farmDensityPerM2,
    };
  }

  // ---------- Stock d'œufs & alerte seuil ----------

/**
 * Stock d'œufs disponible = œufs collectés (toutes bandes, quel que soit le
 * type — un lot CHAIR peut aussi déclarer des œufs) − œufs non
 * commercialisables − alvéoles vendues (vente OEUFS, unité ALVEOLES) − œufs
 * encore en boutique (transférées, non vendues : un transfert ferme → boutique
 * retire ces œufs du stock vendable à la ferme). Aligné sur
 * `SalesService.assertEggsAvailable`. Évaluée de façon paresseuse (lecture
 * dashboard) et re-évaluée après chaque saisie de ponte / vente.
 */
  async evaluateEggStockAlerts(farmId: string): Promise<EggStockInfo> {
    const farmBatches = await this.batchRepo.find({ where: { farmId } });
    let collected = 0;
    if (farmBatches.length > 0) {
      const entries = await this.entryRepo.find({
        where: { batchId: In(farmBatches.map((b) => b.id)) },
      });
      // Stock disponible = œufs collectés − œufs non commercialisables
      // (fêlés, petits, doubles, sales) : seuls ces œufs peuvent être vendus.
      collected = entries.reduce(
        (s, e) =>
          s +
          (e.eggsCollected -
            e.eggsCracked -
            e.eggsSmall -
            e.eggsDoubleYolk -
            e.eggsDirty),
        0,
      );
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
        },
      });
      soldAlveoles = eggItems.reduce((s, i) => s + i.quantity, 0);
    }

    const transfers = await this.stockTransferRepo.find({
      where: {
        farmId,
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
      collected - soldAlveoles * EGGS_PER_ALVEOL - transferredEggs,
    );
    const availableAlveoles = Math.floor(availableEggs / EGGS_PER_ALVEOL);
    const warnAlveoles = await this.constants.get(
      ReferenceKey.EGG_STOCK_WARN_ALVEOLES,
      10,
    );

    if (availableAlveoles >= warnAlveoles) {
      await this.alertsService.raise(
        {
          kind: AlertKind.STOCK_OEUF,
          level: AlertLevel.JAUNE,
          message: `Stock d'œufs à écouler : ${availableAlveoles} alvéoles (~${availableEggs} œufs) collectées et non vendues.`,
          recommendation:
            'Vendre ou valoriser le stock (clients, marchés, cuisine, dons) avant péremption.',
          context: { availableAlveoles, availableEggs, warnAlveoles },
        },
        { farmId },
      );
    } else {
      await this.alertsService.clearKind(farmId, null, AlertKind.STOCK_OEUF);
    }
    return {
      availableAlveoles,
      availableEggs,
      warnAlveoles,
      collected,
      soldAlveoles,
    };
  }

  // ---------- Vigilance quotidienne : lot sans saisie du jour ----------

  /**
   * Soulève (ou résout) l'alerte `SAISIE_MANQUEE` de niveau ferme : tout lot en
   * cours (ACTIF / EN_VENTE) doit avoir une saisie journalière datée du jour.
   * Évaluée de façon paresseuse (lecture dashboard) et réévaluée après chaque
   * saisie via le bus d'événements.
   */
  private async evaluateDailyEntryAlerts(
    farmId: string,
    refDate: string,
  ): Promise<string[]> {
    const today = refDate;
    const active = await this.batchRepo.find({
      where: { farmId, status: In([BatchStatus.ACTIF, BatchStatus.EN_VENTE]) },
    });
    if (active.length === 0) {
      if (refDate === todayStr()) {
        await this.alertsService.clearKind(
          farmId,
          null,
          AlertKind.SAISIE_MANQUEE,
        );
      }
      return [];
    }
    const todays = await this.entryRepo.find({
      where: { batchId: In(active.map((b) => b.id)), entryDate: today },
    });
    const have = new Set(todays.map((e) => e.batchId));
    const missingIds = active.filter((b) => !have.has(b.id)).map((b) => b.id);

    // L'alerte persistée SAISIE_MANQUEE ne reflète que le jour courant : on ne
    // la crée/résout que pour aujourd'hui pour ne pas muter l'état live en
    // consultant une date passée.
    if (refDate !== todayStr()) return missingIds;

    if (missingIds.length === 0) {
      await this.alertsService.clearKind(
        farmId,
        null,
        AlertKind.SAISIE_MANQUEE,
      );
      return [];
    }

    const byId = new Map(active.map((b) => [b.id, b]));
    const names = missingIds
      .slice(0, 3)
      .map((id) => byId.get(id)?.batchName ?? `Lot #${id.slice(0, 8)}`)
      .join(', ');
    const more = missingIds.length - 3;
    await this.alertsService.raise(
      {
        kind: AlertKind.SAISIE_MANQUEE,
        level: AlertLevel.JAUNE,
        message: `Saisie du jour manquante : ${names}${
          more > 0 ? ` et ${more} autre(s) lot(s)` : ''
        }.`,
        recommendation:
          'Enregistrer les données du jour (morts, aliments, ponte, poids) pour garder le suivi à jour.',
        context: { missingBatchIds: missingIds },
      },
      { farmId },
    );
    return missingIds;
  }

  // ---------- Score de santé de ferme (0–100) ----------

  private computeHealth(
    alerts: Alert[],
    missingEntries: string[],
  ): DashboardHealth {
    // Seules les alertes sanitaires dégradent le score « Santé » ; les risques
    // de gestion (provende, péremption, stock d'œufs, ventes) n'en font pas partie.
    const sanitaires = alerts.filter(
      (a) => !NON_SANITAIRE_KINDS.has(a.kind) && a.status === AlertStatus.ACTIVE,
    );
    const rouge = sanitaires.filter((a) => a.level === AlertLevel.ROUGE).length;
    // SAISIE_MANQUEE est comptée via `missingEntries` pour ne pas compter deux fois.
    const jaune = sanitaires.filter(
      (a) =>
        a.level === AlertLevel.JAUNE && a.kind !== AlertKind.SAISIE_MANQUEE,
    ).length;
    const saisiesManquantes = missingEntries.length;
    const score = Math.max(
      0,
      Math.min(100, 100 - rouge * 20 - jaune * 5 - saisiesManquantes * 10),
    );
    const grade = GRADE_TABLE.find((g) => score >= g.min)?.grade ?? 'CRITIQUE';
    return {
      score,
      grade,
      breakdown: { rouge, jaune, saisiesManquantes },
    };
  }

  // ---------- Aperçu de santé par lot ----------

  private async computeHealthOverview(
    batches: ProductionBatch[],
    entries: DailyEntry[],
    alerts: Alert[],
    refDate: string,
  ): Promise<HealthOverviewRow[]> {
    const weekStart = isoWeekStart(refDate);
    const refTime = new Date(`${refDate}T00:00:00`).getTime();
    const rows: HealthOverviewRow[] = [];

    for (const b of batches) {
      const bEntries = entries.filter((e) => e.batchId === b.id);
      const totalDeaths = bEntries.reduce((s, e) => s + e.deaths, 0);
      const sorted = [...bEntries].sort((x, y) =>
        x.entryDate.localeCompare(y.entryDate),
      );
      const last = sorted[sorted.length - 1];
      const lastEntryDate = last ? last.entryDate : null;
      const ageDays = Math.max(
        0,
        Math.floor(
          (refTime - new Date(`${b.integrationDate}T00:00:00`).getTime()) /
            86400000,
        ),
      );

      let alertesRouges = 0;
      let alertesJaunes = 0;
      for (const a of alerts) {
        if (a.batchId !== b.id) continue;
        if (a.level === AlertLevel.ROUGE) alertesRouges += 1;
        else if (a.level === AlertLevel.JAUNE) alertesJaunes += 1;
      }

      rows.push({
        batchId: b.id,
        batchName: b.batchName,
        status: b.status,
        type: b.type,
        species: b.species,
        customSpecies: b.species === Species.AUTRE ? b.customSpecies : undefined,
        ageDays,
        liveCount: Math.max(0, b.quantityAlive),
        weekDeaths: bEntries
          .filter((e) => e.entryDate >= weekStart)
          .reduce((s, e) => s + e.deaths, 0),
        mortalityPercent:
          b.quantityAtStart > 0
            ? round2((totalDeaths / b.quantityAtStart) * 100)
            : 0,
        alertesRouges,
        alertesJaunes,
        lastEntryDate,
        lastEntryLagDays: lastEntryDate
          ? daysBetween(lastEntryDate, refDate)
          : null,
        breedStatus: await this.metricsService.breedStatus(b),
      });
    }

    return rows.sort(
      (x, y) =>
        y.alertesRouges - x.alertesRouges ||
        (y.lastEntryLagDays ?? 0) - (x.lastEntryLagDays ?? 0) ||
        y.weekDeaths - x.weekDeaths,
    );
  }

  // ---------- Palmarès des bandes (leaderboard) ----------

  private async computeLeaderboard(
    user: AuthUser,
    farmId: string,
  ): Promise<LeaderboardRow[]> {
    const batches = await this.batchesService.findAll(user, farmId);
    return batches
      .map((b) => {
        const m = b.metrics;
        const perfIndex = b.type === BatchType.CHAIR ? m.ipe : m.layRatePercent;
        return {
          batchId: b.id,
          batchName: b.batchName,
          status: b.status,
          type: b.type,
          species: b.species,
          customSpecies: b.species === Species.AUTRE ? b.customSpecies : undefined,
          ageDays: m.ageDays,
          perfIndex,
          fcr: m.fcr,
          gmqGramsPerDay: m.gmqGramsPerDay,
          ipe: m.ipe,
          layRatePercent: m.layRatePercent,
          mortalityPercent: m.mortalityPercent,
          liveCount: m.liveCount,
        };
      })
      .sort((a, b) => (b.perfIndex ?? -1) - (a.perfIndex ?? -1))
      .slice(0, 10);
  }

  // ---------- Écarts vs semaine précédente ----------

  private computeDeltas(
    batches: ProductionBatch[],
    entries: DailyEntry[],
    refDate: string,
  ): WeeklyDeltas {
    const thisWeekStart = isoWeekStart(refDate);
    const prevWeekStart = isoWeekStart(addDays(thisWeekStart, -7));

    const thisWeek = entries.filter((e) => e.entryDate >= thisWeekStart);
    const prevWeek = entries.filter(
      (e) => e.entryDate >= prevWeekStart && e.entryDate < thisWeekStart,
    );
    const sum = (rows: DailyEntry[], f: (e: DailyEntry) => number) =>
      rows.reduce((s, e) => s + f(e), 0);

    const mortalityThisWeek = sum(thisWeek, (e) => e.deaths);
    const mortalityPrevWeek = sum(prevWeek, (e) => e.deaths);
    const feedThisWeekKg = sum(thisWeek, (e) => e.feedQuantity);
    const feedPrevWeekKg = sum(prevWeek, (e) => e.feedQuantity);

    const pondIds = new Set(
      batches.filter((b) => b.type === BatchType.PONDEUSE).map((b) => b.id),
    );
    const hens = batches
      .filter((b) => pondIds.has(b.id))
      .reduce((s, b) => s + b.quantityAlive, 0);
    const layRates = (rows: DailyEntry[]): number | null => {
      const eggRows = rows.filter(
        (e) => pondIds.has(e.batchId) && e.eggsCollected > 0,
      );
      const days = new Set(eggRows.map((e) => e.entryDate)).size;
      const eggs = sum(eggRows, (e) => e.eggsCollected);
      if (hens <= 0 || days <= 0) return null;
      return round2(Math.min(100, (eggs / (hens * days)) * 100));
    };
    const layRateThisWeekPct = layRates(thisWeek);
    const layRatePrevWeekPct = layRates(prevWeek);

    return {
      mortalityThisWeek,
      mortalityPrevWeek,
      mortalityDelta: mortalityThisWeek - mortalityPrevWeek,
      feedThisWeekKg: round2(feedThisWeekKg),
      feedPrevWeekKg: round2(feedPrevWeekKg),
      feedDeltaKg: round2(feedThisWeekKg - feedPrevWeekKg),
      layRateThisWeekPct,
      layRatePrevWeekPct,
      layRateDeltaPct:
        layRateThisWeekPct != null && layRatePrevWeekPct != null
          ? round2(layRateThisWeekPct - layRatePrevWeekPct)
          : null,
    };
  }

  // ---------- Courbe de croissance du lot ----------

  async getCurve(
    user: AuthUser,
    farmId: string,
    batchId: string,
  ): Promise<BatchCurve> {
    await this.farmsService.assertAccessible(user, farmId);
    const batch = await this.batchRepo.findOne({
      where: { id: batchId, farmId },
    });
    if (!batch)
      throw new NotFoundException('Lot introuvable dans cette ferme.');

    const entries = await this.entryRepo.find({
      where: { batchId },
      order: { entryDate: 'ASC' },
    });

    type WeekGroup = {
      weekStart: string;
      weightSum: number;
      weightCount: number;
      feedKg: number;
      waterL: number;
      deaths: number;
      lastAvgWeightKg: number | null;
    };
    const byWeek = new Map<string, WeekGroup>();
    for (const e of entries) {
      if (
        e.feedQuantity <= 0 &&
        e.deaths <= 0 &&
        e.avgWeightKg == null &&
        e.waterL <= 0
      )
        continue;
      const weekStart = isoWeekStart(e.entryDate);
      let group = byWeek.get(weekStart);
      if (!group) {
        group = {
          weekStart,
          weightSum: 0,
          weightCount: 0,
          feedKg: 0,
          waterL: 0,
          deaths: 0,
          lastAvgWeightKg: null,
        };
        byWeek.set(weekStart, group);
      }
      group.feedKg += e.feedQuantity;
      group.waterL += e.waterL;
      group.deaths += e.deaths;
      if (e.avgWeightKg != null && e.avgWeightKg > 0) {
        group.weightSum += e.avgWeightKg;
        group.weightCount += 1;
        group.lastAvgWeightKg = e.avgWeightKg;
      }
    }

    const liveCount = Math.max(0, batch.quantityAlive);
    const weeks = [...byWeek.values()].sort((a, b) =>
      a.weekStart.localeCompare(b.weekStart),
    );

    let accumulatedFeed = 0;
    const weekly: CurveWeek[] = weeks.map((w) => {
      accumulatedFeed += w.feedKg;
      const weightGainKg =
        w.lastAvgWeightKg != null
          ? (w.lastAvgWeightKg - DAY1_WEIGHT_KG) * liveCount
          : 0;
      const fcrCumulative =
        weightGainKg > 0 && accumulatedFeed > 0
          ? round2(accumulatedFeed / weightGainKg)
          : null;
      return {
        weekStart: w.weekStart,
        avgWeightKg:
          w.weightCount > 0 ? round2(w.weightSum / w.weightCount) : null,
        feedKg: round2(w.feedKg),
        waterL: round2(w.waterL),
        waterLPerBird: liveCount > 0 ? round2(w.waterL / liveCount) : null,
        deaths: w.deaths,
        cumFeedKg: round2(accumulatedFeed),
        fcrCumulative,
      };
    });

    return {
      batchId,
      liveCount,
      startWeightKg: DAY1_WEIGHT_KG,
      weekly,
    };
  }
}

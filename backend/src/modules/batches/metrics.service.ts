import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not, Repository } from 'typeorm';
import {
  AlertKind,
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
import { BreedStandard } from '../breeds/entities/breed-standard.entity.js';
import { DailyEntry } from '../daily-entries/entities/daily-entry.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { SaleItem } from '../finance/entities/sale-item.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { StockTransfer } from '../points-of-sale/entities/stock-transfer.entity.js';
import { ReferenceConstantsService } from '../reference-constants/reference-constants.service.js';
import { ProductionBatch } from './entities/production-batch.entity.js';
import { FlockReconciliationService } from './flock-reconciliation.service.js';
import {
  BatchMetrics,
  ReadyReason,
} from './models/batch-metrics.model.js';

const round2 = (n: number): number => Math.round(n * 100) / 100;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
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

  async compute(
    batch: ProductionBatch,
    opts?: { asOf?: string },
  ): Promise<BatchMetrics> {
    const asOf = opts?.asOf;
    const refDate = asOf ?? todayIso();
    const historical = asOf != null && asOf < todayIso();
    const [
      entriesRaw,
      standardModule,
      densityWarn,
      densityCritical,
      minVenteAgeDays,
      fcrDeviationMaxPct,
      reformeLayRateFallPct,
      standard,
      alertsCount,
      activeSanitaryAlerts,
    ] = await Promise.all([
      this.entriesRepo.find({
        where: { batchId: batch.id },
        order: { entryDate: 'ASC' },
      }),
      this.constants.get(ReferenceKey.STANDARD_MODULE, 3000),
      this.constants.get(ReferenceKey.DENSITY_WARN, 15),
      this.constants.get(ReferenceKey.DENSITY_CRITICAL, 18),
      this.constants.get(ReferenceKey.VENTE_AGE_MIN_DAYS, 35),
      this.constants.get(ReferenceKey.VENTE_FCR_DEV_MAX_PCT, 10),
      this.constants.get(ReferenceKey.REFORME_LAY_RATE_FALL_PCT, 15),
      this.findStandard(batch, refDate),
      this.alertRepo.count({
        where: { batchId: batch.id, status: AlertStatus.ACTIVE },
      }),
      this.alertRepo.find({
        where: {
          batchId: batch.id,
          status: AlertStatus.ACTIVE,
          kind: In([
            AlertKind.DELAI_ATTENTE,
            AlertKind.PROPHYLAXIE,
          ]),
        },
      }),
    ]);

    const entries = historical
      ? entriesRaw.filter((e) => e.entryDate <= asOf)
      : entriesRaw;
    const ageDays = this.ageDaysOn(batch.integrationDate, refDate);
    const totalDeaths = entries.reduce((s, e) => s + e.deaths, 0);
    // quantityAlive est la source de vérité (décréments POS/abattage + reconcilées).
    // En mode « as-of » (date passée) : le cheptel est reconstitué avec la même
    // réconciliation que recomputeLiveCount, bornée à la date demandée — cohérent
    // avec la source actuelle, sans table d'historique (les événements santé
    // supprimés sortent de l'équation, comme en temps réel).
    let liveCount = Math.max(0, batch.quantityAlive);
    if (historical && asOf) {
      const [soldBirds, slaughteredBirds, sanitaryRemovedBirds] =
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
        ]);
      liveCount = Math.max(
        0,
        batch.quantityAtStart -
          totalDeaths -
          soldBirds -
          slaughteredBirds -
          sanitaryRemovedBirds,
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

    const latestWeight =
      [...entries]
        .reverse()
        .find((e) => e.avgWeightKg != null && e.avgWeightKg > 0)?.avgWeightKg ??
      null;

    const d1WeightKg = day1WeightKg(batch.species);
    const totalWeightGainKg =
      latestWeight != null ? (latestWeight - d1WeightKg) * liveCount : null;

    const fcr =
      totalWeightGainKg != null && totalWeightGainKg > 0
        ? totalFeedKg / totalWeightGainKg
        : null;

    const gmqGramsPerDay =
      latestWeight != null && ageDays > 0
        ? ((latestWeight - d1WeightKg) * 1000) / ageDays
        : null;

    const ipe =
      latestWeight != null && fcr != null && fcr > 0 && ageDays > 0
        ? (latestWeight * viabilityPercent * 100) / (ageDays * fcr)
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
    const rawLayRate =
      liveCount > 0 && recordedDays > 0
        ? (windowEntries.reduce((s, e) => s + e.eggsCollected, 0) /
            (liveCount * recordedDays)) *
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

    const farm = await this.farmRepo.findOne({ where: { id: batch.farmId } });
    const moduleRatioVsCapacity =
      farm?.capacityPerBuilding != null && farm.capacityPerBuilding > 0
        ? batch.quantityAtStart / farm.capacityPerBuilding
        : null;

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
      fcrDeviationPct: deviationPct(fcr, standard?.targetFcr ?? null),
      layRateDeviationPct: deviationPct(
        layRatePercent,
        standard?.targetLayRatePercent ?? null,
      ),
      minVenteAgeDays,
      fcrDeviationMaxPct,
      reformeLayRateFallPct,
      sanitaryBlocked: activeSanitaryAlerts.length > 0,
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
      waterLPerBird: liveCount > 0 ? totalWaterL / liveCount : null,
      totalWeightGainKg,
      fcr,
      gmqGramsPerDay,
      ipe,
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

  /** Semaine d'âge courante du lot → dernière entrée du référentiel de la souche. */
  private async findStandard(
    batch: ProductionBatch,
    refDate: string,
  ): Promise<BreedStandard | null> {
    if (!batch.breed) return null;
    const standards = await this.standardRepo.find({
      where: { breedId: batch.breed.id },
      order: { week: 'ASC' },
    });
    if (standards.length === 0) return null;

    const ageDays = this.ageDaysOn(batch.integrationDate, refDate);
    const ageWeek = Math.floor(ageDays / 7) + 1;
    const applicable = standards.filter((s) => s.week <= ageWeek);
    return applicable.length > 0 ? applicable[applicable.length - 1]! : standards[0];
  }

  /**
   * « Breed Intelligence » : compare le lot à la courbe de référence de sa
   * souche (semaine d'âge = floor(ageDays/7)+1, plafonnée à la dernière
   * semaine du référentiel). Retourne null si le lot n'a pas de souche ou que
   * la souche n'a pas de référentiel (souche personnalisée).
   */
  async breedStatus(batch: ProductionBatch): Promise<BreedStatus | null> {
    const standard = await this.findStandard(batch, todayIso());
    if (!standard) return null;

    const metrics = await this.compute(batch);
    const ageDays = this.ageDaysOn(batch.integrationDate, todayIso());
    const actualAvgWeightKg =
      metrics.gmqGramsPerDay != null
        ? round2(day1WeightKg(batch.species) + (metrics.gmqGramsPerDay * ageDays) / 1000)
        : null;

    return {
      breedId: batch.breed!.id,
      breedName: batch.breed!.name,
      breedCode: batch.breed!.refCode ?? null,
      breedType: batch.breed!.type,
      week: standard.week,
      targetAvgWeightKg: standard.targetAvgWeightKg,
      actualAvgWeightKg,
      avgWeightDeviationPct: deviationPct(
        actualAvgWeightKg,
        standard.targetAvgWeightKg,
      ),
      targetFcr: standard.targetFcr,
      actualFcr: metrics.fcr,
      fcrDeviationPct: deviationPct(metrics.fcr, standard.targetFcr),
      targetLayRatePercent: standard.targetLayRatePercent,
      actualLayRatePercent: metrics.layRatePercent,
      layRateDeviationPct: deviationPct(
        metrics.layRatePercent,
        standard.targetLayRatePercent,
      ),
    };
  }

  private ageDaysOn(integrationDate: string, onDate: string): number {
    const start = new Date(integrationDate + 'T00:00:00');
    const ref = new Date(onDate + 'T00:00:00');
    const diff = ref.getTime() - start.getTime();
    return Math.max(0, Math.floor(diff / 86400000));
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
  ): Promise<{ availableEggs: number; availableAlveoles: number }> {
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

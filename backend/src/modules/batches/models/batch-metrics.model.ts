import { AlertLevel } from '../../../common/enums/alert-level.enum.js';

export type ReadyReason =
  | 'READY'
  | 'TOO_YOUNG'
  | 'FCR'
  | 'SANITARY'
  | 'N_A';

export interface EggBreakdown {
  /** Œufs collectés au total (toutes classes confondues). */
  collected: number;
  /** Œufs commercialisables = collectés − (fêlés + petits + double jaune + sales). */
  sellable: number;
  cracked: number;
  small: number;
  doubleYolk: number;
  dirty: number;
}

export interface BatchMetrics {
  ageDays: number;
  totalDeaths: number;
  mortalityPercent: number;
  viabilityPercent: number;
  liveCount: number;
  totalFeedKg: number;
  totalWaterL: number;
  waterLPerBird: number | null;
  totalWeightGainKg: number | null;
  fcr: number | null;
  gmqGramsPerDay: number | null;
  ipe: number | null;
  eggsCollectedTotal: number;
  /** Répartition des œufs par classe (vie de la bande). */
  eggBreakdown: EggBreakdown;
  /**
   * Œufs vendables restants propres à CE lot : production commercialisable du
   * lot (eggBreakdown.sellable) − œufs vendus attribués au lot (sale_items
   * OEUFS avec ce batchId, ventes non annulées) − œufs encore en boutique
   * issus de ce lot (transférées, non vendues). Chaque lot ne porte que ses
   * propres œufs, sans mise en commun ferme.
   */
  eggStockAvailableEggs: number;
  /**
   * Alvéoles complètes (30 œufs) disponibles sur CE lot = floor(
   * eggStockAvailableEggs / 30). Le reliquat d'œufs (< 30) reste visible côté
   * œufs : il ne constitue pas une alvéole complète.
   */
  eggStockAvailableAlveoles: number;
  layRatePercent: number | null;
  status: AlertLevel;
  densityPerM2: number | null;
  moduleFraction: number;
  moduleRatioVsCapacity: number | null;
  /** Lot commercialisable : auto-signal (âge + performance). Déclenche précommande/vente. */
  readyForSale: boolean;
  readyReason: ReadyReason;
  /** Nombre d'alertes ACTIVES concernant ce lot (badge sur la carte lot). */
  alerts: number;
}

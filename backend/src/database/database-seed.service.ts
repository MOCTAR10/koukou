import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { BatchType } from '../common/enums/batch-type.enum.js';
import { Species } from '../common/enums/species.enum.js';
import { CropCategory } from '../common/enums/crop-category.enum.js';
import { CareType } from '../common/enums/care-type.enum.js';
import { ReferenceKey } from '../common/enums/reference-key.enum.js';
import { UserRole } from '../common/enums/role.enum.js';
import { Breed } from '../modules/breeds/entities/breed.entity.js';
import { BreedStandard } from '../modules/breeds/entities/breed-standard.entity.js';
import { ReferenceConstant } from '../modules/reference-constants/entities/reference-constant.entity.js';
import { AlertKind } from '../common/enums/alert-level.enum.js';
import { RuleRegistry } from '../modules/alerts/entities/rule-registry.entity.js';
import { SanitaryProtocol } from '../modules/sanitary/entities/sanitary-protocol.entity.js';
import { ProtocolStep } from '../modules/sanitary/entities/protocol-step.entity.js';
import { PaymentMethodConfig } from '../modules/finance/entities/payment-method.entity.js';
import { PaymentMethod } from '../common/enums/payment-method.enum.js';
import { User } from '../modules/users/entities/user.entity.js';
import { Culture } from '../modules/agriculture/entities/culture.entity.js';

interface SeedConstant {
  key: ReferenceKey;
  value: number;
  description: string;
}

const DEFAULT_CONSTANTS: SeedConstant[] = [
  {
    key: ReferenceKey.STANDARD_MODULE,
    value: 3000,
    description:
      'Unité modulaire standard (standard officiel POUFA : 3000 sujets)',
  },
  {
    key: ReferenceKey.DENSITY_WARN,
    value: 15,
    description: 'Densité d’alerte (oiseaux/m²) — lot Gabon-tropical 12-15',
  },
  {
    key: ReferenceKey.DENSITY_CRITICAL,
    value: 18,
    description: 'Densité critique (oiseaux/m²)',
  },
  {
    key: ReferenceKey.MORTALITY_WARN_PCT,
    value: 1,
    description: 'Seuil d’alerte mortalité (%)',
  },
  {
    key: ReferenceKey.MORTALITY_CRITICAL_PCT,
    value: 5,
    description: 'Seuil critique mortalité (%)',
  },
  {
    key: ReferenceKey.WATER_DROP_WARN_PCT,
    value: 10,
    description: 'Baisse d’eau d’alerte (%) — indicateur n°1',
  },
  {
    key: ReferenceKey.WATER_DROP_CRITICAL_PCT,
    value: 25,
    description: 'Baisse d’eau critique (%)',
  },
  {
    key: ReferenceKey.WATER_WINDOW_DAYS,
    value: 3,
    description: 'Fenêtre (jours) de la moyenne mobile de la consommation d’eau',
  },
  {
    key: ReferenceKey.WATER_PER_BIRD_L_DAY,
    value: 0.2,
    description: 'Norme de consommation d’eau (L / oiseau / jour)',
  },
  {
    key: ReferenceKey.WATER_NORM_DEVIATION_WARN_PCT,
    value: 20,
    description: 'Écart d’alerte (%) à la norme d’eau par oiseau',
  },
  {
    key: ReferenceKey.DEFAULT_SAC_KG,
    value: 50,
    description: 'Poids par défaut d’un sac d’aliment (kg)',
  },
  {
    key: ReferenceKey.FEED_DROP_WARN_PCT,
    value: 10,
    description: 'Baisse d’aliment d’alerte (%)',
  },
  {
    key: ReferenceKey.IPE_DEVIATION_WARN_PCT,
    value: 10,
    description: 'Déviation IPE d’alerte (%)',
  },
  {
    key: ReferenceKey.GMQ_DEVIATION_WARN_PCT,
    value: 10,
    description: 'Déviation GMQ d’alerte (%)',
  },
  {
    key: ReferenceKey.VIDE_SANITAIRE_MIN_DAYS,
    value: 14,
    description: 'Vide sanitaire — durée minimum (jours) avant réintroduction',
  },
  {
    key: ReferenceKey.VIDE_SANITAIRE_MAX_DAYS,
    value: 21,
    description: 'Vide sanitaire — durée recommandée (jours)',
  },
  {
    key: ReferenceKey.AGE_GAP_MAX_WEEKS,
    value: 4,
    description:
      'Écart d’âge maximal (semaines) entre lots cohabitant dans un même bâtiment',
  },
  {
    key: ReferenceKey.BUILDING_DENSITY_WARN,
    value: 15,
    description: 'Densité d’alerte au niveau bâtiment (oiseaux/m²)',
  },
  {
    key: ReferenceKey.BUILDING_DENSITY_CRITICAL,
    value: 18,
    description: 'Densité critique au niveau bâtiment (oiseaux/m²)',
  },
  {
    key: ReferenceKey.PROPHYLAXIE_RETARD_WARN_DAYS,
    value: 1,
    description:
      'Alerter si un soin planifié est en retard de ce nombre de jours',
  },
  {
    key: ReferenceKey.CALENDAR_LEAD_DAYS,
    value: 3,
    description: 'Rappeler un soin N jours avant sa date prévue',
  },
  {
    key: ReferenceKey.FEED_STOCK_WARN_DAYS,
    value: 5,
    description:
      'Stock provende : alerte JAUNE si l’autonomie passe sous N jours',
  },
  {
    key: ReferenceKey.FEED_STOCK_CRITICAL_DAYS,
    value: 3,
    description:
      'Stock provende : alerte ROUGE si l’autonomie passe sous N jours (CDCF — 72 h)',
  },
  {
    key: ReferenceKey.FEED_ORDER_TARGET_DAYS,
    value: 7,
    description:
      'Stock provende : recommander de commander pour couvrir N jours de consommation (quantité suggérée)',
  },
  {
    key: ReferenceKey.RENTABILITE_MARGE_MIN_PCT,
    value: 5,
    description:
      'Rentabilité : marge nette minimale avant alerte JAUNE (compte de résultat par lot)',
  },
  {
    key: ReferenceKey.VENTE_INVENDUS_DAYS,
    value: 5,
    description:
      'Ventes : alerte si un lot en vente n’a pas d’écoulement confirmé depuis N jours',
  },
  {
    key: ReferenceKey.EGG_STOCK_WARN_ALVEOLES,
    value: 10,
    description:
      'Stock œufs : alerte JAUNE dès que le stock non vendu atteint N alvéoles (avant péremption)',
  },
  {
    key: ReferenceKey.CUSTOMER_SEGMENT_TOP_MIN_VISITS,
    value: 6,
    description:
      'Clients : segment TOP dès ce nombre de visites (achats non annulés)',
  },
  {
    key: ReferenceKey.CUSTOMER_SEGMENT_TOP_MIN_FCFA,
    value: 100000,
    description:
      'Clients : segment TOP dès ce total dépensé en FCFA (achats non annulés)',
  },
  {
    key: ReferenceKey.CUSTOMER_SEGMENT_REGULAR_MIN_VISITS,
    value: 2,
    description:
      'Clients : segment RÉGULIER dès ce nombre de visites (achats non annulés)',
  },
  {
    key: ReferenceKey.VENTE_AGE_MIN_DAYS,
    value: 35,
    description:
      'Vente : âge minimal (jours) à partir duquel un lot chair peut être signalé « prêt à vendre »',
  },
  {
    key: ReferenceKey.VENTE_FCR_DEV_MAX_PCT,
    value: 10,
    description:
      'Vente : tolérance maximale de déviation IC (%) vs courbe de la souche avant signal « prêt à vendre »',
  },
  {
    key: ReferenceKey.REFORME_LAY_RATE_FALL_PCT,
    value: 15,
    description:
      'Réforme : signal « prête à vendre » d’une pondeuse quand la ponte chute de X % sous la cible de la souche',
  },
];

const DEFAULT_BREEDS: {
  name: string;
  type: BatchType;
  species: Species;
  refCode: string;
}[] = [
  // ── Poulet Chair ──
  { name: 'Cobb 500', type: BatchType.CHAIR, species: Species.POULET, refCode: 'CB-500' },
  { name: 'Ross 308', type: BatchType.CHAIR, species: Species.POULET, refCode: 'RS-308' },
  { name: 'Ross 708', type: BatchType.CHAIR, species: Species.POULET, refCode: 'RS-708' },
  { name: 'Hubbard', type: BatchType.CHAIR, species: Species.POULET, refCode: 'HB-JA' },
  { name: 'Arbor Acres', type: BatchType.CHAIR, species: Species.POULET, refCode: 'AA-500' },
  { name: 'Sasso T451', type: BatchType.CHAIR, species: Species.POULET, refCode: 'BV-300' },
  { name: 'Sasso X44', type: BatchType.CHAIR, species: Species.POULET, refCode: 'BV-400' },
  { name: 'Cobb 700', type: BatchType.CHAIR, species: Species.POULET, refCode: 'CB-700' },
  { name: 'Kuroiler', type: BatchType.CHAIR, species: Species.POULET, refCode: 'KR-600' },
  { name: 'Kienyeji', type: BatchType.CHAIR, species: Species.POULET, refCode: 'KJ-200' },
  // Croisement rustique vendu sur les marchés d'Afrique centrale (Gabon,
  // Cameroun) : croissance plus lente que les souches industrielles.
  { name: 'Poulet Goliath', type: BatchType.CHAIR, species: Species.POULET, refCode: 'GOL-CA' },
  // Écotype local gabonais (Gallus gallus domesticus — études INSAB/USTM :
  // Franceville, Libreville, Makokou, Mouila, Oyem). Élevé en dual-purpose :
  // chair (mâles) et ponte modérée (femelles), rusticité maximale.
  { name: 'Poulet Local Gabonais', type: BatchType.CHAIR, species: Species.POULET, refCode: 'PLG-CH' },
  { name: 'Poulet Local Gabonais (pondeuse)', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'PLG-PD' },
  // ── Poulet Pondeuse ──
  { name: 'ISA Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'ISA-43' },
  { name: 'Lohmann Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'LB-300' },
  { name: 'Lohmann White', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'LW-300' },
  { name: 'Hy-Line Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'HL-BR' },
  { name: 'Hy-Line White', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'HL-15' },
  { name: 'Novogen Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'NG-BR' },
  { name: 'Bovans Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'BV-BR' },
  { name: 'Shaver Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'SV-BR' },
  { name: 'White Leghorn', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'WL-100' },
  { name: 'Black Australorp', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'BA-AU' },
  // Souches pondeuses couramment importées au Gabon / Afrique centrale
  // (filières belge et néerlandaise, aux côtés de l'ISA Brown de la SMAG).
  { name: 'Hisex Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'HX-BR' },
  { name: 'Hisex White', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'HX-WH' },
  { name: 'Dekalb White', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'DK-WH' },
  { name: 'Dekalb Brown', type: BatchType.PONDEUSE, species: Species.POULET, refCode: 'DK-BR' },
  // ── Pintade ──
  { name: 'Pintade Galor', type: BatchType.CHAIR, species: Species.PINTADE, refCode: 'PT-GL' },
  { name: 'Pintade Danube', type: BatchType.CHAIR, species: Species.PINTADE, refCode: 'PT-DN' },
  { name: 'Pintade Numidia', type: BatchType.CHAIR, species: Species.PINTADE, refCode: 'PT-NM' },
  { name: 'Pintade Pondeuse', type: BatchType.PONDEUSE, species: Species.PINTADE, refCode: 'PT-PD' },
  // ── Dinde ──
  { name: 'Dinde Bronze', type: BatchType.CHAIR, species: Species.DINDE, refCode: 'DN-BRZ' },
  { name: 'Dinde Blanche', type: BatchType.CHAIR, species: Species.DINDE, refCode: 'DN-BL' },
  { name: 'Dinde Broad-Breasted White', type: BatchType.CHAIR, species: Species.DINDE, refCode: 'DN-BBW' },
  { name: 'Dinde Bourbon Red', type: BatchType.CHAIR, species: Species.DINDE, refCode: 'DN-BBR' },
  { name: 'Dinde Pondeuse', type: BatchType.PONDEUSE, species: Species.DINDE, refCode: 'DN-PD' },
  // ── Caille ──
  { name: 'Caille Japonaise', type: BatchType.CHAIR, species: Species.CAILLE, refCode: 'CQ-JP' },
  { name: 'Caille Coturnix', type: BatchType.CHAIR, species: Species.CAILLE, refCode: 'CQ-CX' },
  { name: 'Caille Pondeuse', type: BatchType.PONDEUSE, species: Species.CAILLE, refCode: 'CQ-PD' },
  // ── Canard ──
  { name: 'Canard de Barbarie', type: BatchType.CHAIR, species: Species.CANARD, refCode: 'CD-BB' },
  { name: 'Canard de Pékin', type: BatchType.CHAIR, species: Species.CANARD, refCode: 'CD-PK' },
  { name: 'Canard Coureur Indien', type: BatchType.PONDEUSE, species: Species.CANARD, refCode: 'CD-CI' },
  { name: 'Canard de Barbarie (pondeuse)', type: BatchType.PONDEUSE, species: Species.CANARD, refCode: 'CD-BBP' },
  // ── Oie ──
  { name: 'Oie de Toulouse', type: BatchType.CHAIR, species: Species.OIE, refCode: 'OIE-TL' },
  { name: 'Oie de Chine', type: BatchType.CHAIR, species: Species.OIE, refCode: 'OIE-CN' },
  { name: 'Oie de Chine (pondeuse)', type: BatchType.PONDEUSE, species: Species.OIE, refCode: 'OIE-CNP' },
  // ── Faisan ──
  { name: 'Faisan de Colchide', type: BatchType.CHAIR, species: Species.FAISAN, refCode: 'FS-CC' },
  { name: 'Faisan Doré', type: BatchType.CHAIR, species: Species.FAISAN, refCode: 'FS-DR' },
  { name: 'Faisan de Colchide (pondeuse)', type: BatchType.PONDEUSE, species: Species.FAISAN, refCode: 'FS-CCP' },
  // ── Autre (volailles locales / non catégorisées) ──
  { name: 'Volaille Locale (chair)', type: BatchType.CHAIR, species: Species.AUTRE, refCode: 'VL-CH' },
  { name: 'Volaille Locale (pondeuse)', type: BatchType.PONDEUSE, species: Species.AUTRE, refCode: 'VL-PD' },
];

/** Référentiel des cultures par catégorie (Agriculture), idempotent par nom. */
const DEFAULT_CULTURES: {
  name: string;
  category: CropCategory;
  defaultCycleDays: number | null;
  waterNeedsLPlantDay: number | null;
}[] = [
  // ── Tubercules ──
  { name: 'Plantain', category: CropCategory.TUBERCULE, defaultCycleDays: 330, waterNeedsLPlantDay: 4 },
  { name: 'Manioc', category: CropCategory.TUBERCULE, defaultCycleDays: 365, waterNeedsLPlantDay: 3 },
  { name: 'Macabo', category: CropCategory.TUBERCULE, defaultCycleDays: 270, waterNeedsLPlantDay: 3 },
  { name: 'Igname', category: CropCategory.TUBERCULE, defaultCycleDays: 300, waterNeedsLPlantDay: 4 },
  { name: 'Taro', category: CropCategory.TUBERCULE, defaultCycleDays: 270, waterNeedsLPlantDay: 3.5 },
  { name: 'Patate douce', category: CropCategory.TUBERCULE, defaultCycleDays: 120, waterNeedsLPlantDay: 2 },
  { name: 'Pomme de terre', category: CropCategory.TUBERCULE, defaultCycleDays: 110, waterNeedsLPlantDay: 2.5 },
  // ── Maraîchage ──
  { name: 'Tomate', category: CropCategory.MARAICHAGE, defaultCycleDays: 90, waterNeedsLPlantDay: 1.5 },
  { name: 'Oignon', category: CropCategory.MARAICHAGE, defaultCycleDays: 120, waterNeedsLPlantDay: 1 },
  { name: 'Aubergine', category: CropCategory.MARAICHAGE, defaultCycleDays: 100, waterNeedsLPlantDay: 1.5 },
  { name: 'Piment', category: CropCategory.MARAICHAGE, defaultCycleDays: 90, waterNeedsLPlantDay: 1 },
  { name: 'Gombo', category: CropCategory.MARAICHAGE, defaultCycleDays: 75, waterNeedsLPlantDay: 1 },
  { name: 'Carotte', category: CropCategory.MARAICHAGE, defaultCycleDays: 120, waterNeedsLPlantDay: 1 },
  { name: 'Betterave', category: CropCategory.MARAICHAGE, defaultCycleDays: 100, waterNeedsLPlantDay: 1.5 },
  { name: 'Courgette', category: CropCategory.MARAICHAGE, defaultCycleDays: 60, waterNeedsLPlantDay: 1.5 },
  { name: 'Concombre', category: CropCategory.MARAICHAGE, defaultCycleDays: 70, waterNeedsLPlantDay: 1.5 },
  { name: 'Laitue', category: CropCategory.MARAICHAGE, defaultCycleDays: 65, waterNeedsLPlantDay: 1 },
  { name: 'Chou', category: CropCategory.MARAICHAGE, defaultCycleDays: 110, waterNeedsLPlantDay: 1.5 },
  { name: 'Haricot vert', category: CropCategory.MARAICHAGE, defaultCycleDays: 65, waterNeedsLPlantDay: 1.2 },
  { name: 'Épinard', category: CropCategory.MARAICHAGE, defaultCycleDays: 55, waterNeedsLPlantDay: 0.9 },
  { name: 'Amarante (folon)', category: CropCategory.MARAICHAGE, defaultCycleDays: 45, waterNeedsLPlantDay: 0.8 },
  { name: 'Oseille de Guinée', category: CropCategory.MARAICHAGE, defaultCycleDays: 55, waterNeedsLPlantDay: 0.8 },
  { name: 'Poivron', category: CropCategory.MARAICHAGE, defaultCycleDays: 120, waterNeedsLPlantDay: 1.5 },
  { name: 'Échalote', category: CropCategory.MARAICHAGE, defaultCycleDays: 100, waterNeedsLPlantDay: 0.9 },
  { name: 'Poireau', category: CropCategory.MARAICHAGE, defaultCycleDays: 130, waterNeedsLPlantDay: 1 },
  // ── Fruits ──
  { name: 'Mangue', category: CropCategory.FRUIT, defaultCycleDays: 1500, waterNeedsLPlantDay: 20 },
  { name: 'Papaye', category: CropCategory.FRUIT, defaultCycleDays: 365, waterNeedsLPlantDay: 15 },
  { name: 'Avocat', category: CropCategory.FRUIT, defaultCycleDays: 1500, waterNeedsLPlantDay: 25 },
  { name: 'Agrumes', category: CropCategory.FRUIT, defaultCycleDays: 1000, waterNeedsLPlantDay: 18 },
  { name: 'Banane douce', category: CropCategory.FRUIT, defaultCycleDays: 400, waterNeedsLPlantDay: 12 },
  { name: 'Ananas', category: CropCategory.FRUIT, defaultCycleDays: 600, waterNeedsLPlantDay: 6 },
  { name: 'Safou (prune d’Afrique)', category: CropCategory.FRUIT, defaultCycleDays: 1400, waterNeedsLPlantDay: 15 },
  { name: 'Goyave', category: CropCategory.FRUIT, defaultCycleDays: 300, waterNeedsLPlantDay: 10 },
  { name: 'Corossol', category: CropCategory.FRUIT, defaultCycleDays: 365, waterNeedsLPlantDay: 12 },
  { name: 'Noix de coco', category: CropCategory.FRUIT, defaultCycleDays: 2100, waterNeedsLPlantDay: 20 },
  { name: 'Fruit de la passion', category: CropCategory.FRUIT, defaultCycleDays: 300, waterNeedsLPlantDay: 8 },
  // ── Céréales ──
  { name: 'Maïs', category: CropCategory.CEREALE, defaultCycleDays: 100, waterNeedsLPlantDay: 1.5 },
  { name: 'Riz (paddy)', category: CropCategory.CEREALE, defaultCycleDays: 140, waterNeedsLPlantDay: 8 },
  { name: 'Sorgho', category: CropCategory.CEREALE, defaultCycleDays: 105, waterNeedsLPlantDay: 1 },
  { name: 'Mil', category: CropCategory.CEREALE, defaultCycleDays: 120, waterNeedsLPlantDay: 1.2 },
  { name: 'Fonio', category: CropCategory.CEREALE, defaultCycleDays: 90, waterNeedsLPlantDay: 1 },
];

/**
 * Référentiel zootechnique des souches par défaut (valeurs indicatives —
 * documentées fournisseur), utilisé par « Breed Intelligence » pour comparer
 * chaque lot à la courbe de référence de sa souche à la semaine d'âge donnée.
 */
const CHAIR_STANDARD_ROWS = (rows: Array<[number, number, number]>) =>
  rows.map(([week, w, f]) => ({
    week,
    targetAvgWeightKg: w,
    targetFcr: f,
    targetLayRatePercent: null,
  }));

const POND_STANDARD_ROWS = (rows: Array<[number, number]>) =>
  rows.map(([week, rate]) => ({
    week,
    targetAvgWeightKg: null,
    targetFcr: null,
    targetLayRatePercent: rate,
  }));

const DEFAULT_BREED_STANDARDS: Record<
  string,
  Array<{
    week: number;
    targetAvgWeightKg: number | null;
    targetFcr: number | null;
    targetLayRatePercent: number | null;
  }>
> = {
  'Cobb 500': CHAIR_STANDARD_ROWS([
    [1, 0.18, 0.85],
    [2, 0.45, 1.19],
    [3, 0.8, 1.42],
    [4, 1.18, 1.58],
    [5, 1.59, 1.71],
    [6, 2.01, 1.82],
    [7, 2.44, 1.92],
    [8, 2.87, 2.01],
    [9, 3.3, 2.1],
    [10, 3.72, 2.2],
    [11, 4.14, 2.29],
    [12, 4.55, 2.38],
  ]),
  'Ross 308': CHAIR_STANDARD_ROWS([
    [1, 0.165, 0.85],
    [2, 0.43, 1.08],
    [3, 0.81, 1.29],
    [4, 1.24, 1.48],
    [5, 1.69, 1.64],
    [6, 2.14, 1.78],
    [7, 2.58, 1.92],
    [8, 3.0, 2.04],
    [9, 3.41, 2.16],
    [10, 3.8, 2.27],
    [11, 4.18, 2.38],
    [12, 4.56, 2.49],
  ]),
  Hubbard: CHAIR_STANDARD_ROWS([
    [1, 0.18, 0.85],
    [2, 0.46, 1.15],
    [3, 0.84, 1.38],
    [4, 1.27, 1.58],
    [5, 1.72, 1.74],
    [6, 2.18, 1.88],
    [7, 2.63, 2.01],
    [8, 3.07, 2.13],
    [9, 3.5, 2.24],
    [10, 3.92, 2.34],
    [11, 4.33, 2.44],
    [12, 4.74, 2.54],
  ]),
  'ISA Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 18],
    [20, 40],
    [21, 62],
    [22, 78],
    [23, 86],
    [24, 90],
    [25, 92],
    [27, 93],
    [30, 92],
    [34, 90],
    [38, 88],
    [42, 86],
    [46, 83],
    [50, 79],
    [54, 75],
    [58, 71],
    [62, 67],
    [66, 63],
    [70, 58],
    [72, 55],
  ]),
  'Lohmann Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 15],
    [20, 38],
    [21, 60],
    [22, 75],
    [23, 85],
    [24, 89],
    [26, 90],
    [28, 91],
    [32, 92],
    [36, 90],
    [40, 88],
    [44, 85],
    [48, 82],
    [52, 78],
    [56, 73],
    [60, 68],
    [64, 62],
    [68, 56],
    [72, 50],
  ]),
  'Arbor Acres': CHAIR_STANDARD_ROWS([
    [1, 0.18, 0.85],
    [2, 0.46, 1.16],
    [3, 0.82, 1.4],
    [4, 1.22, 1.56],
    [5, 1.64, 1.7],
    [6, 2.06, 1.8],
    [7, 2.48, 1.9],
    [8, 2.9, 2.0],
    [9, 3.32, 2.09],
    [10, 3.74, 2.19],
    [11, 4.16, 2.29],
    [12, 4.56, 2.4],
  ]),
  'Ross 708': CHAIR_STANDARD_ROWS([
    [1, 0.16, 0.85],
    [2, 0.44, 1.05],
    [3, 0.85, 1.24],
    [4, 1.3, 1.42],
    [5, 1.78, 1.58],
    [6, 2.26, 1.72],
    [7, 2.75, 1.86],
    [8, 3.23, 2.0],
    [9, 3.7, 2.13],
    [10, 4.16, 2.25],
    [11, 4.59, 2.37],
    [12, 5.0, 2.48],
  ]),
  'Sasso T451': CHAIR_STANDARD_ROWS([
    [1, 0.15, 0.9],
    [2, 0.35, 1.2],
    [3, 0.6, 1.5],
    [4, 0.85, 1.7],
    [5, 1.1, 1.9],
    [6, 1.35, 2.05],
    [7, 1.6, 2.2],
    [8, 1.85, 2.3],
    [9, 2.1, 2.4],
    [10, 2.35, 2.5],
    [11, 2.6, 2.6],
    [12, 2.85, 2.7],
  ]),
  'Hy-Line Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 16],
    [20, 39],
    [21, 60],
    [22, 76],
    [23, 85],
    [24, 89],
    [26, 91],
    [28, 92],
    [32, 93],
    [36, 92],
    [40, 90],
    [44, 87],
    [48, 84],
    [52, 80],
    [56, 75],
    [60, 70],
    [64, 64],
    [68, 58],
    [72, 52],
  ]),
  'Novogen Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 17],
    [20, 41],
    [21, 63],
    [22, 79],
    [23, 87],
    [24, 90],
    [26, 91],
    [28, 92],
    [32, 93],
    [36, 91],
    [40, 89],
    [44, 86],
    [48, 82],
    [52, 77],
    [56, 71],
    [60, 65],
    [64, 58],
    [68, 52],
    [72, 46],
  ]),
  'Bovans Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 15],
    [20, 35],
    [21, 55],
    [22, 72],
    [23, 83],
    [24, 88],
    [26, 92],
    [28, 94],
    [32, 95],
    [36, 94],
    [40, 92],
    [44, 90],
    [48, 87],
    [52, 83],
    [56, 78],
    [60, 73],
    [64, 67],
    [68, 61],
    [72, 55],
  ]),
  'Shaver Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 16],
    [20, 38],
    [21, 58],
    [22, 74],
    [23, 84],
    [24, 89],
    [26, 91],
    [28, 93],
    [32, 94],
    [36, 93],
    [40, 91],
    [44, 89],
    [48, 86],
    [52, 82],
    [56, 77],
    [60, 72],
    [64, 66],
    [68, 59],
    [72, 52],
  ]),
  // ── Pintade ŒChair ──
  'Pintade Galor': CHAIR_STANDARD_ROWS([
    [1, 0.09, 1.1],
    [2, 0.17, 1.5],
    [3, 0.28, 1.8],
    [4, 0.4, 2.0],
    [5, 0.52, 2.15],
    [6, 0.65, 2.3],
    [7, 0.78, 2.4],
    [8, 0.92, 2.5],
    [9, 1.06, 2.6],
    [10, 1.2, 2.7],
    [11, 1.34, 2.8],
    [12, 1.47, 2.9],
  ]),
  'Pintade Danube': CHAIR_STANDARD_ROWS([
    [1, 0.1, 1.1],
    [2, 0.19, 1.45],
    [3, 0.31, 1.75],
    [4, 0.45, 1.95],
    [5, 0.6, 2.1],
    [6, 0.74, 2.25],
    [7, 0.9, 2.4],
    [8, 1.06, 2.55],
    [9, 1.22, 2.65],
    [10, 1.38, 2.75],
    [11, 1.53, 2.85],
    [12, 1.68, 2.95],
  ]),
  'Pintade Pondeuse': POND_STANDARD_ROWS([
    [20, 5],
    [21, 15],
    [22, 28],
    [23, 42],
    [24, 55],
    [25, 62],
    [26, 66],
    [28, 68],
    [30, 67],
    [34, 64],
    [38, 60],
    [42, 56],
    [46, 52],
    [50, 48],
    [54, 44],
    [58, 40],
    [60, 38],
  ]),
  // ── Dinde ──
  'Dinde Bronze': CHAIR_STANDARD_ROWS([
    [1, 0.12, 1.4],
    [2, 0.25, 1.7],
    [3, 0.45, 1.9],
    [4, 0.7, 2.1],
    [5, 1.0, 2.3],
    [6, 1.35, 2.5],
    [7, 1.75, 2.65],
    [8, 2.2, 2.8],
    [9, 2.7, 2.95],
    [10, 3.2, 3.1],
    [11, 3.7, 3.2],
    [12, 4.15, 3.3],
    [14, 5.0, 3.5],
    [16, 5.75, 3.6],
    [18, 6.5, 3.7],
    [20, 7.15, 3.8],
    [22, 7.7, 3.9],
    [24, 8.2, 4.0],
  ]),
  'Dinde Blanche': CHAIR_STANDARD_ROWS([
    [1, 0.13, 1.3],
    [2, 0.3, 1.5],
    [3, 0.55, 1.7],
    [4, 0.9, 1.85],
    [5, 1.3, 2.0],
    [6, 1.75, 2.15],
    [7, 2.25, 2.3],
    [8, 2.8, 2.45],
    [9, 3.4, 2.6],
    [10, 4.0, 2.7],
    [11, 4.6, 2.8],
    [12, 5.2, 2.9],
    [14, 6.4, 3.05],
    [16, 7.5, 3.15],
    [18, 8.5, 3.25],
    [20, 9.3, 3.35],
    [22, 10.0, 3.45],
    [24, 10.6, 3.55],
  ]),
  // ── Caille ──
  'Caille Japonaise': CHAIR_STANDARD_ROWS([
    [1, 0.015, 1.2],
    [2, 0.045, 1.6],
    [3, 0.09, 2.0],
    [4, 0.14, 2.4],
    [5, 0.18, 2.7],
    [6, 0.2, 2.9],
    [7, 0.21, 3.1],
    [8, 0.22, 3.2],
  ]),
  'Caille Coturnix': CHAIR_STANDARD_ROWS([
    [1, 0.016, 1.2],
    [2, 0.05, 1.5],
    [3, 0.1, 1.9],
    [4, 0.16, 2.3],
    [5, 0.21, 2.6],
    [6, 0.24, 2.8],
    [7, 0.25, 3.0],
    [8, 0.26, 3.1],
  ]),
  'Caille Pondeuse': POND_STANDARD_ROWS([
    [5, 10],
    [6, 40],
    [7, 65],
    [8, 75],
    [9, 80],
    [10, 82],
    [12, 83],
    [16, 80],
    [20, 75],
    [24, 70],
    [28, 62],
    [32, 55],
    [36, 48],
    [40, 42],
  ]),
  // ── Canard ──
  'Canard de Barbarie': CHAIR_STANDARD_ROWS([
    [1, 0.14, 1.1],
    [2, 0.3, 1.4],
    [3, 0.5, 1.7],
    [4, 0.75, 1.9],
    [5, 1.0, 2.1],
    [6, 1.3, 2.3],
    [7, 1.55, 2.5],
    [8, 1.8, 2.6],
    [9, 2.1, 2.7],
    [10, 2.4, 2.75],
    [11, 2.7, 2.8],
    [12, 3.0, 2.85],
  ]),
  'Canard de Pékin': CHAIR_STANDARD_ROWS([
    [1, 0.18, 1.0],
    [2, 0.45, 1.3],
    [3, 0.8, 1.5],
    [4, 1.2, 1.7],
    [5, 1.65, 1.85],
    [6, 2.1, 2.0],
    [7, 2.6, 2.1],
    [8, 3.0, 2.2],
    [9, 3.3, 2.25],
    [10, 3.45, 2.3],
  ]),
  'Canard Coureur Indien': POND_STANDARD_ROWS([
    [16, 10],
    [18, 30],
    [20, 55],
    [22, 70],
    [24, 80],
    [26, 85],
    [28, 86],
    [32, 85],
    [36, 82],
    [40, 78],
    [44, 74],
    [48, 70],
    [52, 65],
    [56, 60],
    [60, 55],
  ]),
  'Canard de Barbarie (pondeuse)': POND_STANDARD_ROWS([
    [24, 5],
    [26, 10],
    [28, 15],
    [30, 20],
    [32, 22],
    [34, 23],
    [36, 23],
    [40, 22],
    [44, 20],
    [48, 18],
    [52, 15],
  ]),
  // ── Oie ──
  'Oie de Toulouse': CHAIR_STANDARD_ROWS([
    [1, 0.2, 1.3],
    [2, 0.5, 1.6],
    [3, 1.0, 1.9],
    [4, 1.6, 2.2],
    [5, 2.2, 2.5],
    [6, 2.8, 2.8],
    [8, 3.6, 3.1],
    [10, 4.3, 3.4],
    [12, 4.9, 3.6],
    [14, 5.4, 3.7],
    [16, 5.7, 3.8],
    [18, 5.9, 3.9],
    [20, 6.1, 4.0],
  ]),
  'Oie de Chine': CHAIR_STANDARD_ROWS([
    [1, 0.15, 1.3],
    [2, 0.4, 1.6],
    [3, 0.8, 1.9],
    [4, 1.2, 2.2],
    [5, 1.6, 2.5],
    [6, 2.0, 2.8],
    [8, 2.7, 3.1],
    [10, 3.2, 3.3],
    [12, 3.5, 3.5],
    [14, 3.7, 3.6],
    [16, 3.85, 3.7],
    [18, 4.0, 3.75],
  ]),
  'Oie de Chine (pondeuse)': POND_STANDARD_ROWS([
    [20, 5],
    [22, 15],
    [24, 30],
    [26, 40],
    [28, 45],
    [30, 48],
    [32, 48],
    [36, 45],
    [40, 40],
    [44, 35],
    [48, 28],
    [52, 20],
  ]),
  // ── Faisan ──
  'Faisan de Colchide': CHAIR_STANDARD_ROWS([
    [1, 0.03, 1.1],
    [2, 0.06, 1.5],
    [3, 0.1, 1.8],
    [4, 0.16, 2.1],
    [6, 0.3, 2.5],
    [8, 0.5, 2.8],
    [10, 0.7, 3.0],
    [12, 0.9, 3.1],
    [14, 1.05, 3.15],
    [16, 1.2, 3.2],
    [18, 1.3, 3.25],
    [20, 1.4, 3.3],
  ]),
  'Faisan Doré': CHAIR_STANDARD_ROWS([
    [1, 0.03, 1.1],
    [2, 0.06, 1.5],
    [3, 0.1, 1.8],
    [4, 0.15, 2.1],
    [6, 0.28, 2.5],
    [8, 0.46, 2.8],
    [10, 0.65, 3.0],
    [12, 0.85, 3.1],
    [14, 1.0, 3.15],
    [16, 1.1, 3.2],
    [18, 1.2, 3.25],
    [20, 1.3, 3.3],
  ]),
  'Faisan de Colchide (pondeuse)': POND_STANDARD_ROWS([
    [20, 5],
    [22, 10],
    [24, 15],
    [26, 20],
    [28, 23],
    [30, 25],
    [32, 25],
    [36, 22],
    [40, 18],
    [44, 10],
  ]),
  // ── Dinde Pondeuse (reproductrices) ──
  'Dinde Pondeuse': POND_STANDARD_ROWS([
    [28, 10],
    [30, 25],
    [32, 45],
    [34, 55],
    [36, 60],
    [38, 62],
    [40, 62],
    [44, 60],
    [48, 58],
    [52, 54],
    [56, 50],
    [60, 45],
  ]),
  // ── Autre (volailles locales) ──
  'Volaille Locale (chair)': CHAIR_STANDARD_ROWS([
    [1, 0.03, 1.5],
    [2, 0.07, 1.8],
    [4, 0.15, 2.2],
    [6, 0.28, 2.5],
    [8, 0.42, 2.8],
    [10, 0.58, 3.0],
    [12, 0.75, 3.2],
    [14, 0.9, 3.4],
    [16, 1.05, 3.5],
    [18, 1.2, 3.6],
    [20, 1.35, 3.7],
    [22, 1.5, 3.8],
    [24, 1.6, 3.9],
  ]),
  'Volaille Locale (pondeuse)': POND_STANDARD_ROWS([
    [20, 10],
    [22, 20],
    [24, 35],
    [26, 45],
    [28, 50],
    [30, 52],
    [34, 50],
    [38, 47],
    [42, 43],
    [46, 40],
    [50, 36],
    [54, 32],
    [58, 28],
    [60, 25],
  ]),
  // ── Poulet Chair — nouvelles souches Afrique ──
  'Sasso X44': CHAIR_STANDARD_ROWS([
    [1, 0.15, 0.9],
    [2, 0.33, 1.2],
    [3, 0.57, 1.5],
    [4, 0.82, 1.7],
    [5, 1.08, 1.9],
    [6, 1.34, 2.05],
    [7, 1.6, 2.2],
    [8, 1.86, 2.3],
    [9, 2.12, 2.4],
    [10, 2.38, 2.5],
  ]),
  'Cobb 700': CHAIR_STANDARD_ROWS([
    [1, 0.19, 0.85],
    [2, 0.47, 1.15],
    [3, 0.85, 1.39],
    [4, 1.25, 1.55],
    [5, 1.68, 1.69],
    [6, 2.12, 1.8],
    [7, 2.56, 1.9],
    [8, 3.0, 1.99],
    [9, 3.42, 2.08],
    [10, 3.84, 2.18],
  ]),
  Kuroiler: CHAIR_STANDARD_ROWS([
    [4, 0.25, 1.6],
    [6, 0.42, 2.0],
    [8, 0.62, 2.3],
    [10, 0.85, 2.55],
    [12, 1.08, 2.8],
    [14, 1.3, 3.0],
    [16, 1.5, 3.2],
    [18, 1.65, 3.4],
    [20, 1.8, 3.5],
  ]),
  Kienyeji: CHAIR_STANDARD_ROWS([
    [4, 0.18, 1.8],
    [6, 0.32, 2.2],
    [8, 0.5, 2.5],
    [10, 0.7, 2.8],
    [12, 0.9, 3.0],
    [14, 1.05, 3.2],
    [16, 1.2, 3.3],
    [18, 1.35, 3.5],
    [20, 1.5, 3.6],
  ]),
  // ── Poulet Pondeuse — nouvelles souches Afrique ──
  'White Leghorn': POND_STANDARD_ROWS([
    [18, 5],
    [19, 18],
    [20, 40],
    [21, 62],
    [22, 78],
    [23, 88],
    [24, 92],
    [26, 94],
    [28, 93],
    [32, 92],
    [36, 90],
    [40, 87],
    [44, 83],
    [48, 79],
    [52, 74],
    [56, 68],
    [60, 62],
    [64, 56],
    [68, 50],
    [72, 44],
  ]),
  'Lohmann White': POND_STANDARD_ROWS([
    [18, 5],
    [19, 16],
    [20, 38],
    [21, 60],
    [22, 76],
    [23, 86],
    [24, 90],
    [26, 92],
    [28, 93],
    [32, 92],
    [36, 90],
    [40, 87],
    [44, 83],
    [48, 79],
    [52, 74],
    [56, 68],
    [60, 62],
    [64, 56],
    [68, 50],
    [72, 44],
  ]),
  'Hy-Line White': POND_STANDARD_ROWS([
    [18, 5],
    [19, 17],
    [20, 39],
    [21, 61],
    [22, 77],
    [23, 87],
    [24, 91],
    [26, 93],
    [28, 94],
    [32, 93],
    [36, 91],
    [40, 88],
    [44, 84],
    [48, 80],
    [52, 75],
    [56, 70],
    [60, 64],
    [64, 58],
    [68, 52],
    [72, 46],
  ]),
  'Black Australorp': POND_STANDARD_ROWS([
    [18, 5],
    [19, 15],
    [20, 35],
    [21, 55],
    [22, 70],
    [23, 80],
    [24, 85],
    [26, 87],
    [28, 88],
    [32, 87],
    [36, 85],
    [40, 82],
    [44, 78],
    [48, 74],
    [52, 69],
    [56, 64],
    [60, 58],
    [64, 52],
    [68, 46],
    [72, 40],
  ]),
  // ── Pintade ──
  'Pintade Numidia': CHAIR_STANDARD_ROWS([
    [1, 0.08, 1.1],
    [2, 0.16, 1.5],
    [3, 0.27, 1.8],
    [4, 0.38, 2.0],
    [5, 0.5, 2.2],
    [6, 0.62, 2.35],
    [7, 0.75, 2.5],
    [8, 0.88, 2.6],
    [9, 1.02, 2.7],
    [10, 1.16, 2.8],
    [12, 1.4, 2.95],
  ]),
  // ── Dinde ──
  'Dinde Broad-Breasted White': CHAIR_STANDARD_ROWS([
    [1, 0.13, 1.3],
    [2, 0.3, 1.5],
    [3, 0.55, 1.7],
    [4, 0.9, 1.85],
    [5, 1.3, 2.0],
    [6, 1.75, 2.15],
    [7, 2.25, 2.3],
    [8, 2.8, 2.45],
    [9, 3.4, 2.6],
    [10, 4.0, 2.7],
    [12, 5.2, 2.9],
    [14, 6.4, 3.05],
    [16, 7.5, 3.15],
    [18, 8.5, 3.25],
    [20, 9.3, 3.35],
  ]),
  'Dinde Bourbon Red': CHAIR_STANDARD_ROWS([
    [4, 0.8, 2.0],
    [6, 1.5, 2.4],
    [8, 2.3, 2.7],
    [10, 3.1, 2.9],
    [12, 3.9, 3.1],
    [14, 4.7, 3.25],
    [16, 5.5, 3.4],
    [18, 6.2, 3.5],
    [20, 6.9, 3.6],
    [22, 7.5, 3.7],
    [24, 8.0, 3.8],
  ]),
  // ── Souches courantes au Gabon / Afrique centrale (ajout) ──
  'Hisex Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 17],
    [20, 40],
    [21, 62],
    [22, 77],
    [23, 86],
    [24, 90],
    [26, 92],
    [28, 93],
    [32, 92],
    [36, 90],
    [40, 88],
    [44, 85],
    [48, 81],
    [52, 77],
    [56, 72],
    [60, 67],
    [64, 61],
    [68, 55],
    [72, 49],
  ]),
  'Hisex White': POND_STANDARD_ROWS([
    [18, 5],
    [19, 16],
    [20, 38],
    [21, 60],
    [22, 76],
    [23, 85],
    [24, 89],
    [26, 91],
    [28, 92],
    [32, 92],
    [36, 91],
    [40, 89],
    [44, 86],
    [48, 83],
    [52, 79],
    [56, 74],
    [60, 69],
    [64, 63],
    [68, 57],
    [72, 51],
  ]),
  'Dekalb White': POND_STANDARD_ROWS([
    [18, 4],
    [19, 15],
    [20, 38],
    [21, 61],
    [22, 77],
    [23, 86],
    [24, 90],
    [26, 92],
    [28, 93],
    [32, 93],
    [36, 92],
    [40, 90],
    [44, 88],
    [48, 85],
    [52, 82],
    [56, 78],
    [60, 74],
    [64, 69],
    [68, 64],
    [72, 58],
  ]),
  'Dekalb Brown': POND_STANDARD_ROWS([
    [18, 5],
    [19, 17],
    [20, 40],
    [21, 62],
    [22, 78],
    [23, 87],
    [24, 90],
    [26, 92],
    [28, 93],
    [32, 93],
    [36, 91],
    [40, 89],
    [44, 86],
    [48, 83],
    [52, 79],
    [56, 74],
    [60, 69],
    [64, 63],
    [68, 57],
    [72, 51],
  ]),
  // Croisement rustique : croissance lente, ~10-12 semaines en villageois.
  'Poulet Goliath': CHAIR_STANDARD_ROWS([
    [1, 0.13, 0.95],
    [2, 0.3, 1.25],
    [3, 0.5, 1.5],
    [4, 0.75, 1.7],
    [5, 1.0, 1.9],
    [6, 1.3, 2.1],
    [7, 1.6, 2.25],
    [8, 1.9, 2.4],
    [9, 2.2, 2.55],
    [10, 2.5, 2.7],
    [11, 2.8, 2.85],
    [12, 3.1, 3.0],
  ]),
  // Écotype local gabonais : croissance très lente (adulte ~1,5-1,8 kg),
  // ponte modérée (40-60 œufs/an, saisonnière) mais rusticité maximale.
  'Poulet Local Gabonais': CHAIR_STANDARD_ROWS([
    [4, 0.15, 1.9],
    [8, 0.45, 2.6],
    [12, 0.8, 3.1],
    [16, 1.1, 3.5],
    [20, 1.4, 3.8],
    [24, 1.6, 4.0],
  ]),
  'Poulet Local Gabonais (pondeuse)': POND_STANDARD_ROWS([
    [20, 8],
    [24, 20],
    [28, 30],
    [36, 35],
    [44, 30],
    [52, 22],
    [60, 15],
  ]),
};

interface DefaultProtocolStep {
  stepOrder: number;
  dayFrom: number;
  dayTo: number;
  careType: CareType;
  name: string;
  dosage: string | null;
  route: string | null;
  withdrawalDays: number;
}

interface DefaultProtocol {
  code: string;
  name: string;
  species: Species;
  type: BatchType;
  steps: DefaultProtocolStep[];
}

const DEFAULT_PROTOCOLS: DefaultProtocol[] = [
  {
    code: 'proto-poulet-chair-standard',
    name: 'Programme sanitaire standard — Poulet de chair',
    species: Species.POULET,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 0,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Vaccin Marek (couvoir)',
        dosage: '1 dose/sujet',
        route: 'SC (couvoir)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 7,
        dayTo: 9,
        careType: CareType.VACCIN,
        name: 'Vaccin Gumboro (IBD) — intermédiaire+',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 14,
        dayTo: 16,
        careType: CareType.VACCIN,
        name: 'Vaccin Newcastle (LaSota)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson / oculo-nasal',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 21,
        dayTo: 24,
        careType: CareType.VACCIN,
        name: 'Vaccin Newcastle rappel (LaSota)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 28,
        dayTo: 30,
        careType: CareType.VITAMINE,
        name: 'Vitaminage + électrolytes de fin de cycle',
        dosage: 'Selon indication',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  {
    code: 'proto-poule-pondeuse-standard',
    name: 'Programme sanitaire standard — Poule pondeuse',
    species: Species.POULET,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 0,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Vaccin Marek (couvoir)',
        dosage: '1 dose/sujet',
        route: 'SC (couvoir)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 7,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Vaccin Newcastle (LaSota) + Bronchite (H120)',
        dosage: '1 dose/sujet',
        route: 'Eau / oculo-nasal',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 14,
        dayTo: 16,
        careType: CareType.VACCIN,
        name: 'Vaccin Gumboro (IBD)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 21,
        dayTo: 24,
        careType: CareType.VACCIN,
        name: 'Vaccin Newcastle rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 28,
        dayTo: 31,
        careType: CareType.VACCIN,
        name: 'Vaccin Gumboro rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 35,
        dayTo: 38,
        careType: CareType.VITAMINE,
        name: 'Vitaminage + électrolytes',
        dosage: 'Selon indication',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
];

/**
 * Programmes de vaccination pré-chargés (recommandation pays — Gabon).
 * Référentiel : calendrier vaccinal national avicole (poussins de chair et
 * poules pondeuses). Non bloquants : au chargement, les étapes dont la date
 * d'application est déjà passée ou déjà réalisées sont sautées (advisory).
 */
const GABON_VACC_PROTOCOLS: DefaultProtocol[] = [
  {
    code: 'vacc-poulet-chair-gabon',
    name: 'Programme de vaccination — Poulet de chair (Gabon)',
    species: Species.POULET,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Maladie de Marek — Vaccin obligatoire',
        dosage: '1 dose/sujet',
        route: 'Injection sous-cutanée (couvoir)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 1,
        dayTo: 3,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) + Bronchite infectieuse (BI) — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 7,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 1re dose — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 14,
        dayTo: 16,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 2e dose (booster) — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) + Bronchite (BI) rappel — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 35,
        dayTo: 35,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) dernier rappel si cycle long (optionnel)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  {
    code: 'vacc-poule-pondeuse-gabon',
    name: 'Programme de vaccination — Poule pondeuse (Gabon)',
    species: Species.POULET,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Maladie de Marek — Vaccin obligatoire',
        dosage: '1 dose/sujet',
        route: 'Injection sous-cutanée (couvoir)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 1,
        dayTo: 3,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) + Bronchite infectieuse (BI) — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 7,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 1re dose — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 14,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) + Bronchite (BI) rappel — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 18,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 2e dose (booster) — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 28,
        dayTo: 28,
        careType: CareType.VACCIN,
        name: 'Variole aviaire — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 7,
        dayFrom: 42,
        dayTo: 42,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) + Bronchite (BI) rappel — obligatoire',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 8,
        dayFrom: 56,
        dayTo: 70,
        careType: CareType.VACCIN,
        name: 'Typhose aviaire (réglementé)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 9,
        dayFrom: 84,
        dayTo: 84,
        careType: CareType.VACCIN,
        name: 'Coryza infectieux (recommandé en zones humides)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 10,
        dayFrom: 98,
        dayTo: 112,
        careType: CareType.VACCIN,
        name: 'EDS + Newcastle (ND) + Bronchite (BI) — pré-ponte, obligatoire',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire (combiné)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 11,
        dayFrom: 168,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Pintade (Chair) — programme adapté à l'espèce (référentiel Gabon) ----
  {
    code: 'vacc-pintade-chair-gabon',
    name: 'Programme de vaccination — Pintade de chair (Gabon)',
    species: Species.PINTADE,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 3,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche lentogène',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 14,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 1re dose',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 28,
        dayTo: 28,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 2e dose (booster)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 42,
        dayTo: 45,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 70,
        dayTo: 70,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) dernier rappel si cycle long (optionnel)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Pintade (Pondeuse) ----
  {
    code: 'vacc-pintade-pondeuse-gabon',
    name: 'Programme de vaccination — Pintade pondeuse (Gabon)',
    species: Species.PINTADE,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 3,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche lentogène',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 14,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 1re dose',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 28,
        dayTo: 28,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD) 2e dose (booster)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 45,
        dayTo: 45,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 70,
        dayTo: 70,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 7,
        dayFrom: 126,
        dayTo: 140,
        careType: CareType.VACCIN,
        name: 'EDS + Newcastle (ND) — pré-ponte, obligatoire',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire (combiné)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 8,
        dayFrom: 160,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Dinde (Chair) — le NDV est la maladie critique ; vaccin dès J1 ----
  {
    code: 'vacc-dinde-chair-gabon',
    name: 'Programme de vaccination — Dinde de chair (Gabon)',
    species: Species.DINDE,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche dinde',
        dosage: '1 dose/sujet',
        route: 'Nébulisation / oculo-nasale',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 14,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 35,
        dayTo: 42,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 56,
        dayTo: 56,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) dernier rappel si cycle long (optionnel)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Dinde (Pondeuse) ----
  {
    code: 'vacc-dinde-pondeuse-gabon',
    name: 'Programme de vaccination — Dinde pondeuse (Gabon)',
    species: Species.DINDE,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 1,
        dayTo: 1,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche dinde',
        dosage: '1 dose/sujet',
        route: 'Nébulisation / oculo-nasale',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 14,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson / nébulisation',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 42,
        dayTo: 45,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 70,
        dayTo: 70,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 140,
        dayTo: 154,
        careType: CareType.VACCIN,
        name: 'EDS + Newcastle (ND) — pré-ponte, obligatoire',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire (combiné)',
        withdrawalDays: 0,
      },
      {
        stepOrder: 7,
        dayFrom: 168,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Caille (Chair) — cycle court, vaccination allégée (ND si endémique) ----
  {
    code: 'vacc-caille-chair-gabon',
    name: 'Programme de vaccination — Caille de chair (Gabon)',
    species: Species.CAILLE,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 7,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — si zone endémique, souche douce (B1/VG/GA)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel (si cycle long)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Caille (Pondeuse) ----
  {
    code: 'vacc-caille-pondeuse-gabon',
    name: 'Programme de vaccination — Caille pondeuse (Gabon)',
    species: Species.CAILLE,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 10,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — souche douce (B1/VG/GA)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 28,
        dayTo: 28,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 70,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Canard (Chair) — ND avec souche adaptée aux anatidés ----
  {
    code: 'vacc-canard-chair-gabon',
    name: 'Programme de vaccination — Canard de chair (Gabon)',
    species: Species.CANARD,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 7,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — souche adaptée aux anatidés',
        dosage: '1 dose/sujet',
        route: 'Injection / oculo-nasale',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 21,
        dayTo: 28,
        careType: CareType.VACCIN,
        name: 'Choléra aviaire (si foyers signalés)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 49,
        dayTo: 56,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel si cycle long (optionnel)',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Canard (Pondeuse) ----
  {
    code: 'vacc-canard-pondeuse-gabon',
    name: 'Programme de vaccination — Canard pondeur (Gabon)',
    species: Species.CANARD,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 7,
        dayTo: 14,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — souche adaptée aux anatidés',
        dosage: '1 dose/sujet',
        route: 'Injection / oculo-nasale',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 49,
        dayTo: 56,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 70,
        dayTo: 84,
        careType: CareType.VACCIN,
        name: 'Choléra aviaire (si foyers signalés)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 120,
        dayTo: 140,
        careType: CareType.VACCIN,
        name: 'EDS + Newcastle (ND) — pré-ponte (inactivé)',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Oie (Chair) — ND (paramyxovirus) + choléra ----
  {
    code: 'vacc-oie-chair-gabon',
    name: 'Programme de vaccination — Oie de chair (Gabon)',
    species: Species.OIE,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — souche paramyxovirus adaptée',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 56,
        dayTo: 63,
        careType: CareType.VACCIN,
        name: 'Choléra aviaire (si foyers signalés)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 84,
        dayTo: 90,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel si cycle long (optionnel)',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Oie (Pondeuse) ----
  {
    code: 'vacc-oie-pondeuse-gabon',
    name: 'Programme de vaccination — Oie pondeuse (Gabon)',
    species: Species.OIE,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) — souche paramyxovirus adaptée',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 56,
        dayTo: 63,
        careType: CareType.VACCIN,
        name: 'Choléra aviaire (si foyers signalés)',
        dosage: 'Selon recommandation vétérinaire',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 140,
        dayTo: 154,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel — pré-ponte (inactivé)',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 168,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Injection',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Faisan (Chair) ----
  {
    code: 'vacc-faisan-chair-gabon',
    name: 'Programme de vaccination — Faisan de chair (Gabon)',
    species: Species.FAISAN,
    type: BatchType.CHAIR,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 10,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche douce',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 35,
        dayTo: 35,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 49,
        dayTo: 56,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
    ],
  },
  // ---- Faisan (Pondeuse) ----
  {
    code: 'vacc-faisan-pondeuse-gabon',
    name: 'Programme de vaccination — Faisan pondeur (Gabon)',
    species: Species.FAISAN,
    type: BatchType.PONDEUSE,
    steps: [
      {
        stepOrder: 1,
        dayFrom: 10,
        dayTo: 10,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) primovaccination — souche douce',
        dosage: '1 dose/sujet',
        route: 'Goutte oculaire / eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 2,
        dayFrom: 21,
        dayTo: 21,
        careType: CareType.VACCIN,
        name: 'Gumboro (IBD)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 3,
        dayFrom: 35,
        dayTo: 35,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
      {
        stepOrder: 4,
        dayFrom: 49,
        dayTo: 56,
        careType: CareType.VACCIN,
        name: 'Variole aviaire',
        dosage: '1 dose/sujet',
        route: 'Transfixion voile alaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 5,
        dayFrom: 120,
        dayTo: 140,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel — pré-ponte (inactivé)',
        dosage: '1 dose/sujet',
        route: 'Injection intramusculaire',
        withdrawalDays: 0,
      },
      {
        stepOrder: 6,
        dayFrom: 150,
        dayTo: 365,
        careType: CareType.VACCIN,
        name: 'Newcastle (ND) rappel cyclique en ponte (tous les 2 mois)',
        dosage: '1 dose/sujet',
        route: 'Eau de boisson',
        withdrawalDays: 0,
      },
    ],
  },
];

@Injectable()
export class DatabaseSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseSeedService.name);

  constructor(
    @InjectRepository(ReferenceConstant)
    private readonly constantsRepo: Repository<ReferenceConstant>,
    @InjectRepository(Breed)
    private readonly breedRepo: Repository<Breed>,
    @InjectRepository(BreedStandard)
    private readonly standardRepo: Repository<BreedStandard>,
    @InjectRepository(RuleRegistry)
    private readonly ruleRepo: Repository<RuleRegistry>,
    @InjectRepository(SanitaryProtocol)
    private readonly protocolRepo: Repository<SanitaryProtocol>,
    @InjectRepository(ProtocolStep)
    private readonly stepRepo: Repository<ProtocolStep>,
    @InjectRepository(PaymentMethodConfig)
    private readonly paymentMethodRepo: Repository<PaymentMethodConfig>,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Culture)
    private readonly cultureRepo: Repository<Culture>,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedPlatformAdmin();
    await this.seedConstants();
    await this.seedBreeds();
    await this.seedBreedStandards();
    await this.seedRules();
    await this.seedProtocols();
    await this.seedGabonPrograms();
    await this.seedPaymentMethods();
    await this.seedCultures();
    this.logger.log('Semence des données de référence terminée.');
  }

  /** Compte administrateur plateforme (env uniquement, aucun défaut en clair). */
  private async seedPlatformAdmin(): Promise<void> {
    const email = this.config.get('PLATFORM_ADMIN_EMAIL');
    const phone = this.config.get('PLATFORM_ADMIN_PHONE');
    const password = this.config.get('PLATFORM_ADMIN_PASSWORD');
    if (!email || !phone || !password) {
      this.logger.warn(
        'Variables PLATFORM_ADMIN_EMAIL/PLATFORM_ADMIN_PHONE/PLATFORM_ADMIN_PASSWORD absentes : aucun administrateur plateforme créé.',
      );
      return;
    }
    const existing = await this.usersRepo.findOne({ where: { email } });
    if (existing) return;
    await this.usersRepo.save(
      this.usersRepo.create({
        phone,
        email: email ?? null,
        passwordHash: await bcrypt.hash(password, 10),
        fullName:
          this.config.get('PLATFORM_ADMIN_NAME') ?? 'Administrateur Plateforme',
        role: UserRole.PLATFORM_ADMIN,
      }),
    );
    this.logger.log(`Compte administrateur plateforme prêt (${email}).`);
  }

  private async seedConstants() {
    for (const c of DEFAULT_CONSTANTS) {
      const existing = await this.constantsRepo.findOne({
        where: { key: c.key },
      });
      if (!existing) {
        await this.constantsRepo.save(
          this.constantsRepo.create({ ...c, isEditable: true }),
        );
      }
    }
  }

  private async seedBreeds() {
    for (const b of DEFAULT_BREEDS) {
      const existing = await this.breedRepo.findOne({
        where: { name: b.name },
      });
      if (!existing) {
        await this.breedRepo.save(
          this.breedRepo.create({
            name: b.name,
            type: b.type,
            species: b.species,
            refCode: b.refCode,
            isCustom: false,
          }),
        );
      } else if (existing.refCode !== b.refCode) {
        existing.refCode = b.refCode;
        await this.breedRepo.save(existing);
      }
    }
  }

  /** Courbes zootechniques de référence des souches par défaut (idempotent). */
  private async seedBreedStandards() {
    for (const [name, standards] of Object.entries(DEFAULT_BREED_STANDARDS)) {
      const breed = await this.breedRepo.findOne({ where: { name } });
      if (!breed) continue;
      const alreadySeeded = await this.standardRepo.count({
        where: { breedId: breed.id },
      });
      if (alreadySeeded > 0) continue;
      await this.standardRepo.save(
        standards.map((s) =>
          this.standardRepo.create({ ...s, breedId: breed.id }),
        ),
      );
    }
  }

  /** Référentiel des cultures agricoles par défaut (idempotent par nom). */
  private async seedCultures() {
    for (const c of DEFAULT_CULTURES) {
      const existing = await this.cultureRepo.findOne({
        where: { name: c.name },
      });
      if (!existing) {
        await this.cultureRepo.save(
          this.cultureRepo.create({
            name: c.name,
            category: c.category,
            defaultCycleDays: c.defaultCycleDays,
            waterNeedsLPlantDay: c.waterNeedsLPlantDay,
            notes: null,
            isCustom: false,
          }),
        );
      } else if (
        existing.category !== c.category ||
        existing.defaultCycleDays !== c.defaultCycleDays
      ) {
        existing.category = c.category;
        existing.defaultCycleDays = c.defaultCycleDays;
        existing.waterNeedsLPlantDay = c.waterNeedsLPlantDay;
        await this.cultureRepo.save(existing);
      }
    }
  }

  private async seedRules() {
    const rules: Partial<RuleRegistry>[] = [
      {
        code: 'mortality-1',
        kind: AlertKind.MORTALITE,
        category: 'ELEVAGE',
        shortLabel: 'Mortalité',
        description: 'Déclenche une alerte selon le taux de mortalité du lot.',
      },
      {
        code: 'density-1',
        kind: AlertKind.SURDENSITE,
        category: 'ELEVAGE',
        shortLabel: 'Surdensité',
        description: 'Déclenche une alerte selon la densité (oiseaux/m²).',
      },
      {
        code: 'water-1',
        kind: AlertKind.EAU,
        category: 'ELEVAGE',
        shortLabel: 'Consommation d’eau',
        description:
          'Baisse d’eau = indicateur n°1 des maladies. Alerte dès chute significative.',
      },
      {
        code: 'maladie-1',
        kind: AlertKind.MALADIE,
        category: 'ELEVAGE',
        shortLabel: 'Signe de maladie',
        description:
          'Baisse d’eau combinée à une mortalité en hausse : signe probable de maladie.',
      },
      {
        code: 'ipe-1',
        kind: AlertKind.IPE,
        category: 'ELEVAGE',
        shortLabel: 'IPE',
        description:
          'Alerte si l’Indice de Performance Européen est en retrait.',
      },
      {
        code: 'gmq-1',
        kind: AlertKind.GMQ,
        category: 'ELEVAGE',
        shortLabel: 'GMQ',
        description:
          'Alerte si le Gain Moyen Quotidien fléchit par rapport à la trajectoire du lot.',
      },
      {
        code: 'haccp-expiration-1',
        kind: AlertKind.PEREMPTION,
        category: 'HACCP',
        shortLabel: 'Péremption intrant',
        description:
          'Alerte si un intrant approche ou dépasse sa date de péremption (HACCP).',
      },
      {
        code: 'haccp-traceabilite-1',
        kind: AlertKind.TRACABILITE,
        category: 'VENTE',
        shortLabel: 'Traçabilité avant vente',
        description:
          'Alerte si la vente est envisagée alors que la traçabilité HACCP est incomplète.',
      },
      {
        code: 'cohabitation-1',
        kind: AlertKind.COHABITATION,
        category: 'ELEVAGE',
        shortLabel: 'Cohabitation d’âges',
        description:
          'Alerte si des lots d’âges trop écartés cohabitent dans un bâtiment (risque sanitaire).',
      },
      {
        code: 'vide-sanitaire-1',
        kind: AlertKind.VIDE_SANITAIRE,
        category: 'ELEVAGE',
        shortLabel: 'Vide sanitaire',
        description:
          'Alerte si un bâtiment est réoccupé avant la fin du vide sanitaire légal.',
      },
      {
        code: 'building-density-1',
        kind: AlertKind.DENSITE_BATIMENT,
        category: 'ELEVAGE',
        shortLabel: 'Densité du bâtiment',
        description:
          'Densité calculée sur la somme des oiseaux de tous les lots actifs du bâtiment.',
      },
      {
        code: 'prophylaxie-1',
        kind: AlertKind.PROPHYLAXIE,
        category: 'ELEVAGE',
        shortLabel: 'Prophylaxie',
        description:
          'Soin planifié en retard ou à venir sur un lot (calendrier sanitaire).',
      },
      {
        code: 'delai-attente-1',
        kind: AlertKind.DELAI_ATTENTE,
        category: 'HACCP',
        shortLabel: 'Délai d’attente',
        description:
          "Délai d'attente antibiotique en cours : commercialisation suspendue jusqu'à son expiration (sécurité alimentaire).",
      },
      {
        code: 'stock-aliment-1',
        kind: AlertKind.ALIMENT,
        category: 'ELEVAGE',
        shortLabel: 'Stock provende',
        description:
          'Alerte si le stock de provende passe sous le seuil d’autonomie (JAUNE < 5 j, ROUGE < 3 j de consommation théorique).',
      },
      {
        code: 'rentabilite-1',
        kind: AlertKind.RENTABILITE,
        category: 'FINANCE',
        shortLabel: 'Rentabilité du lot',
        description:
          'Compte de résultat par lot : alerte ROUGE si perte nette, JAUNE si la marge passe sous le seuil minimal (évaluée à la clôture et après chaque vente/dépense).',
      },
      {
        code: 'vente-1',
        kind: AlertKind.VENTE,
        category: 'FINANCE',
        shortLabel: 'Écoulement / invendus',
        description:
          'Alerte si un lot en vente n’a pas eu d’écoulement confirmé depuis vente_invendu_days (5 j) — invendus générant du surcoût (surcharge du bâtiment).',
      },
      {
        code: 'task-1',
        kind: AlertKind.TACHE,
        category: 'EQUIPE',
        shortLabel: 'Tâche en retard',
        description:
          'Alerte ROUGE de niveau ferme si une tâche de l’équipe a dépassé son échéance (statut non FAIT / non ANNULEE).',
      },
      {
        code: 'saisie-manquee-1',
        kind: AlertKind.SAISIE_MANQUEE,
        category: 'ELEVAGE',
        shortLabel: 'Saisie quotidienne manquante',
        description:
          'Alerte JAUNE de niveau ferme si un lot actif/lot en vente n’a pas de saisie journalière pour aujourd’hui (vigilance quotidienne).',
      },
      {
        code: 'stock-oeuf-1',
        kind: AlertKind.STOCK_OEUF,
        category: 'VENTE',
        shortLabel: 'Stock d’œufs à écouler',
        description:
          'Alerte JAUNE si le stock d’œufs non vendus (collectés − vendus) dépasse le seuil de l’alvéoles à écouler avant péremption.',
      },
      {
        code: 'heat-stress-1',
        kind: AlertKind.HEAT,
        category: 'ELEVAGE',
        shortLabel: 'Stress thermique',
        description:
          'Alerte selon l’indice température-humidité (THI) prévu pour la ville de la ferme : Danger/Sévère = ROUGE, Modéré = JAUNE (conseils hydratation/ventilation).',
      },
    ];
    for (const rule of rules) {
      const existing = await this.ruleRepo.findOne({
        where: { code: rule.code, kind: rule.kind },
      });
      if (!existing) {
        await this.ruleRepo.save(
          this.ruleRepo.create({
            ...rule,
            isActive: true,
            category: rule.category as never,
            params: null,
          }),
        );
      }
    }
  }

  private async seedProtocols() {
    for (const protocol of DEFAULT_PROTOCOLS) {
      const existing = await this.protocolRepo.findOne({
        where: { code: protocol.code },
      });
      if (existing) continue;
      const saved = await this.protocolRepo.save(
        this.protocolRepo.create({
          code: protocol.code,
          name: protocol.name,
          species: protocol.species,
          type: protocol.type,
          isDefault: true,
          isEditable: true,
        }),
      );
      for (const s of protocol.steps) {
        await this.stepRepo.save(
          this.stepRepo.create({
            protocolId: saved.id,
            stepOrder: s.stepOrder,
            dayFrom: s.dayFrom,
            dayTo: s.dayTo,
            careType: s.careType,
            name: s.name,
            dosage: s.dosage,
            route: s.route,
            withdrawalDays: s.withdrawalDays,
            active: true,
          }),
        );
      }
    }
  }

  /**
   * Programme de vaccination pré-chargé (Gabon) : référentiel protégé
   * (isEditable = false, isDefault = false) — proposé dans l'onglet
   * Traitements, sans jamais écraser le protocole par défaut de l'espèce.
   */
  private async seedGabonPrograms() {
    for (const program of GABON_VACC_PROTOCOLS) {
      const existing = await this.protocolRepo.findOne({
        where: { code: program.code },
      });
      if (existing) continue;
      const saved = await this.protocolRepo.save(
        this.protocolRepo.create({
          code: program.code,
          name: program.name,
          species: program.species,
          type: program.type,
          isDefault: false,
          isEditable: false,
        }),
      );
      for (const s of program.steps) {
        await this.stepRepo.save(
          this.stepRepo.create({
            protocolId: saved.id,
            stepOrder: s.stepOrder,
            dayFrom: s.dayFrom,
            dayTo: s.dayTo,
            careType: s.careType,
            name: s.name,
            dosage: s.dosage,
            route: s.route,
            withdrawalDays: s.withdrawalDays,
            active: true,
          }),
        );
      }
    }
  }

  /**
   * POS : CASH activé par défaut ; MOBILE_MONEY / QR_CODE affichés au guichet
   * mais désactivés (« Bientôt disponible ») jusqu'à l'intégration des API.
   */
  private async seedPaymentMethods() {
    const defaults: Partial<PaymentMethodConfig>[] = [
      {
        code: PaymentMethod.CASH,
        label: 'Espèces',
        enabled: true,
        displayHint: 'Encaissement comptoir',
        sortOrder: 1,
      },
      {
        code: PaymentMethod.MOBILE_MONEY,
        label: 'Mobile Money (Airtel Money / Moov Money)',
        enabled: false,
        displayHint: 'Bientôt disponible',
        sortOrder: 2,
      },
      {
        code: PaymentMethod.QR_CODE,
        label: 'Paiement par QR code',
        enabled: false,
        displayHint: 'Bientôt disponible',
        sortOrder: 3,
      },
    ];
    for (const def of defaults) {
      const existing = await this.paymentMethodRepo.findOne({
        where: { code: def.code },
      });
      if (!existing) {
        await this.paymentMethodRepo.save(
          this.paymentMethodRepo.create(def as PaymentMethodConfig),
        );
      }
    }
  }
}

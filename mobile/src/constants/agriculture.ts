import type { CropCategory, Culture, ParcelleStatus } from '@/api/types';

/** Libellés français des catégories de cultures. */
export const CROP_CATEGORY_LABELS: Record<CropCategory, string> = {
  TUBERCULE: 'Tubercule',
  MARAICHAGE: 'Maraîchage',
  FRUIT: 'Fruit',
  CEREALE: 'Céréale',
  AUTRE: 'Autre',
};

/** Ordre d'affichage des catégories (liste parcelle → mentions). */
export const CROP_CATEGORY_ORDER: CropCategory[] = [
  'TUBERCULE',
  'MARAICHAGE',
  'FRUIT',
  'CEREALE',
  'AUTRE',
];

/** Libellés français des statuts de parcelle. */
export const PARCELLE_STATUS_LABELS: Record<ParcelleStatus, string> = {
  PREPARATION: 'En préparation',
  ACTIVE: 'Active',
  JACHERE: 'Jachère',
  CLOTURE: 'Clôturée',
};

/**
 * Regroupe des cultures par catégorie, dans l'ordre d'affichage.
 * Les catégories sans culture sont omises.
 */
export function groupCulturesByCategory(
  cultures: Culture[],
): { category: CropCategory; label: string; cultures: Culture[] }[] {
  return CROP_CATEGORY_ORDER.map((category) => ({
    category,
    label: CROP_CATEGORY_LABELS[category],
    cultures: cultures
      .filter((c) => c.category === category)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  })).filter((g) => g.cultures.length > 0);
}

/** Collationnel français pour trier les parcelles par nom. */
export function compareFrench(a: string, b: string): number {
  return a.localeCompare(b, 'fr');
}

export const CULTURE_EMOJI: Record<CropCategory, string> = {
  TUBERCULE: '🥔',
  MARAICHAGE: '🥬',
  FRUIT: '🍉',
  CEREALE: '🌾',
  AUTRE: '🌱',
};

/* ────────────────────────────────────────────────────────────────────────────
 * Suivi cultural : stade, échéance et conseils par culture.
 * ────────────────────────────────────────────────────────────────────────────
 * Une parcelle porte UNE culture (modèle parcellaire classique) ; pour
 * plusieurs cultures on crée plusieurs parcelles. L'échéance de récolte est
 * estimée à partir de la date de plantation et du cycle de la culture
 * (`defaultCycleDays` du référentiel — valeur indicative, phase 2 : moteur
 * d'alerte dédié comme l'`AdvisoryEngine` avicole).
 */

/** Stades de croissance (seuils de % du cycle écoulé). */
export const CULTURE_STAGES = [
  { key: 'PLANTATION', min: 0, max: 0.25, label: 'Plantation' },
  { key: 'CROISSANCE', min: 0.25, max: 0.5, label: 'Croissance' },
  { key: 'DEVELOPPEMENT', min: 0.5, max: 0.75, label: 'Développement' },
  { key: 'MATURATION', min: 0.75, max: 1, label: 'Maturation' },
  { key: 'A_RECOLTER', min: 1, max: Infinity, label: 'À récolter' },
] as const;

export type CultureStageKey = (typeof CULTURE_STAGES)[number]['key'];

export interface CultureStageInfo {
  key: CultureStageKey;
  label: string;
  /** 0 → début de cycle, 1 → échéance théorique, >1 → cycle dépassé. */
  progress: number;
  daysElapsed: number;
  daysRemaining: number;
  /** Échéance théorique de récolte (null si pas de cycle). */
  harvestDate: Date | null;
}

/** Progression du cycle d'une parcelle plantée (vs aujourd'hui UTC). */
export function cultureStage(
  plantedAt: string | null,
  cycleDays: number | null | undefined,
  today = new Date(),
): CultureStageInfo | null {
  if (!plantedAt) return null;
  const start = new Date(`${plantedAt.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return null;
  const now = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const daysElapsed = Math.floor((now - start.getTime()) / 86_400_000);
  if (!cycleDays || cycleDays <= 0) {
    return {
      key: 'A_RECOLTER',
      label: 'Cycle libre',
      progress: 0,
      daysElapsed,
      daysRemaining: 0,
      harvestDate: null,
    };
  }
  const progress = Math.max(0, daysElapsed / cycleDays);
  const stage = CULTURE_STAGES.find((s) => progress >= s.min && progress < s.max) ?? CULTURE_STAGES[CULTURE_STAGES.length - 1];
  return {
    key: stage.key,
    label: stage.label,
    progress,
    daysElapsed,
    daysRemaining: Math.max(0, cycleDays - daysElapsed),
    harvestDate: new Date(start.getTime() + cycleDays * 86_400_000),
  };
}

/** Format court d'une date UTC (ex. « 12 oct. 2026 »). */
export function formatHarvestDate(date: Date | null, now = new Date()): string {
  if (!date) return '—';
  return date.toLocaleDateString('fr-FR', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Conseils personnalisés par type de culture (base de connaissances). ── */

const CULTURE_TIPS: Record<CropCategory, string[]> = {
  TUBERCULE: [
    'Buttage pour favoriser le développement des tubercules.',
    'Surveillez l’humidité : excès d’eau = pourriture des racines.',
    'Rotation des parcelles pour limiter les maladies du sol.',
  ],
  MARAICHAGE: [
    'Arrosage régulier léger : le stress hydrique abîme la production.',
    'Récoltez souvent les légumes-fruits pour relancer la montée.',
    'Surveillez les feuilles (insectes) en début de cycle.',
  ],
  FRUIT: [
    'Apport d’eau plus important en début de fructification.',
    'Élagage/éclaircissage pour aérer et augmenter le calibre.',
    'Récolte à maturité — un fruit trop mûr se conserve mal.',
  ],
  CEREALE: [
    'Semis clair et sol ressuyé pour un bon tallage.',
    'Surveillez les oiseaux à l’approche de la récolte.',
    'Séchez bien les grains avant stockage.',
  ],
  AUTRE: [
    'Tenez un carnet de parcelles : dates, intrants, rendements.',
    'Notez les anomalies (feuilles, croissance) pour ajuster le suivi.',
  ],
};

/** Conseil d'expert pour une culture : mixe cycle + eau + fiche catégorie. */
export function adviceForCulture(culture: Culture | null): string[] {
  if (!culture) return [];
  const tips = CULTURE_TIPS[culture.category] ?? CULTURE_TIPS.AUTRE;
  return tips;
}

/** Besoin en eau lisible (L/plant/jour) — null si non renseigné. */
export function waterNeedLabel(culture: Culture | null): string | null {
  if (!culture?.waterNeedsLPlantDay) return null;
  const v = culture.waterNeedsLPlantDay;
  return `${v.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} L/plant/jour`;
}
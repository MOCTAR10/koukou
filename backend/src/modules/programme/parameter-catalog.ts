import {
  POUFA_BASE_VARIABLE_NAMES,
  POUFA_DEFAULT_FORMULAS,
} from '../indicators/formula/formula-catalog.js';
import {
  compileIndicatorSet,
  FormulaError,
} from '../indicators/formula/formula.js';

/**
 * Typed catalog of programme parameters (`ProgramParameter.key`). A key not
 * listed here is refused. The owner profile says which service is in charge of
 * the value (enforced once the access module lands); the default is the
 * spec's « Proposé » value, seeded once and then edited by that service.
 */

export type ParameterType =
  'number' | 'integer' | 'string' | 'formula' | 'json';

/** Owner profiles known today; the access module will turn these into data. */
export const OWNER_PROFILE = {
  DGE: 'DGE',
  VETERINAIRE: 'VETERINAIRE',
  ADMIN: 'ADMIN',
} as const;

export interface ParameterDefinition {
  readonly key: string;
  readonly label: string;
  readonly type: ParameterType;
  readonly unit: string | null;
  readonly ownerProfile: string;
  readonly min?: number;
  readonly max?: number;
  readonly defaultValue: unknown;
  /** Appended to the seed reason (e.g. who must still decide the value). */
  readonly defaultNote?: string;
}

/** Prefix of the parameters holding an indicator formula. */
export const FORMULA_PREFIX = 'FORMULE_';

export const SEED_REASON =
  'Valeur proposée par le cahier des charges, à valider';

/** `FORMULE_TAUX_MORTALITE` ↔ indicator key `taux_mortalite`. */
export function formulaParameterKey(indicatorKey: string): string {
  return `${FORMULA_PREFIX}${indicatorKey.toUpperCase()}`;
}

export function indicatorKeyOf(parameterKey: string): string | null {
  return parameterKey.startsWith(FORMULA_PREFIX)
    ? parameterKey.slice(FORMULA_PREFIX.length).toLowerCase()
    : null;
}

const pct = { unit: '%', min: 0, max: 100 } as const;

/** The CDC does not set these values: Fermia proposes them. */
const FERMIA_PROPOSAL =
  'le cahier des charges ne la fixe pas : proposition de Fermia, à valider par la DGE';

/**
 * Programme steering (L6, POUFA plan §13): anonymity of the aggregates, map
 * colours and the projection to the 100 000 t objective.
 */
const PILOTAGE_PARAMETERS: readonly ParameterDefinition[] = [
  {
    // Aggregates fed by fewer farms are hidden (MAEDR, farmer comparison).
    key: 'PILOTAGE_GROUPE_MIN_FERMES',
    label: 'Nombre minimal de fermes pour publier une moyenne ou un agrégat',
    type: 'integer',
    unit: 'fermes',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 2,
    max: 1000,
    defaultValue: 5,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'CARTE_MORTALITE_JAUNE_PCT',
    label:
      'Carte : mortalité de la période à partir de laquelle la ferme est en jaune',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 3,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'CARTE_MORTALITE_ROUGE_PCT',
    label:
      'Carte : mortalité de la période à partir de laquelle la ferme est en rouge',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 6,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'CARTE_COMPLETUDE_JAUNE_PCT',
    label:
      'Carte : complétude des saisies en dessous de laquelle la ferme est en jaune',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 90,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'CARTE_COMPLETUDE_ROUGE_PCT',
    label:
      'Carte : complétude des saisies en dessous de laquelle la ferme est en rouge',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 70,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    // CDC §1: « contribuer à une production de 100 000 tonnes ».
    key: 'OBJECTIF_NATIONAL_T',
    label: 'Objectif national de production (poids vif)',
    type: 'number',
    unit: 't',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 1,
    max: 10_000_000,
    defaultValue: 100_000,
  },
  {
    key: 'PROJECTION_BANDES_PAR_AN',
    label: 'Projection : bandes par ferme et par an',
    type: 'number',
    unit: 'bandes',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 0.5,
    max: 12,
    defaultValue: 6,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'PROJECTION_TAUX_OCCUPATION_PCT',
    label: 'Projection : taux d’occupation des places',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 80,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    // Used until enough closed bands give an observed mortality.
    key: 'PROJECTION_MORTALITE_PCT',
    label: 'Projection : mortalité par bande (à défaut de bandes clôturées)',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 5,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    // Used until enough weighed exits give an observed weight.
    key: 'PROJECTION_POIDS_SORTIE_KG',
    label:
      'Projection : poids vif moyen à la sortie (à défaut de sorties observées)',
    type: 'number',
    unit: 'kg',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 0.3,
    max: 6,
    defaultValue: 2.2,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'PROJECTION_CROISSANCE_ANNUELLE_PCT',
    label: 'Projection : croissance annuelle de la production du programme',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.DGE,
    min: -100,
    max: 500,
    defaultValue: 0,
    defaultNote: FERMIA_PROPOSAL,
  },
];

export const PARAMETER_CATALOG: readonly ParameterDefinition[] = [
  {
    key: 'BANDE_DUREE_REFERENCE_J',
    label: "Durée de référence d'une bande",
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 1,
    max: 365,
    defaultValue: 45,
  },
  {
    key: 'PESEE_FREQUENCE_J',
    label: 'Fréquence des pesées',
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 1,
    max: 60,
    defaultValue: 7,
  },
  {
    key: 'PESEE_ECHANTILLON_TETES',
    label: "Taille de l'échantillon pesé",
    type: 'integer',
    unit: 'têtes',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 1,
    max: 10_000,
    defaultValue: 30,
  },
  {
    key: 'SEUIL_ALERTE_MORTALITE_JOUR_PCT',
    label: "Seuil d'alerte de mortalité journalière",
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.VETERINAIRE,
    defaultValue: 1,
    defaultNote: 'à fixer par les services vétérinaires',
  },
  {
    key: 'SEUIL_ECART_INTRANTS_PCT',
    label: "Seuil d'écart sur les intrants (livré / confirmé)",
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 10,
  },
  {
    key: 'SEUIL_ECART_RECEPTION_ABATTOIR_PCT',
    label: "Seuil d'écart à la réception par l'abattoir",
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 2,
  },
  {
    key: 'SEUIL_TRACABILITE_QR_PCT',
    label: 'Taux minimal de traçabilité par QR',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: 95,
  },
  {
    // Offline conflicts (architecture §14): a phone whose clock is off by more
    // than this has its capture times corrected by the measured skew.
    key: 'SYNC_ECART_HORLOGE_MAX_S',
    label: "Écart d'horloge toléré pour un téléphone",
    type: 'integer',
    unit: 'secondes',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 0,
    max: 86_400,
    defaultValue: 300,
  },
  ...PILOTAGE_PARAMETERS,
  ...POUFA_DEFAULT_FORMULAS.map((f): ParameterDefinition => ({
    key: formulaParameterKey(f.key),
    label: `Formule : ${f.label}`,
    type: 'formula',
    unit: f.unit,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: f.expression,
  })),
];

const BY_KEY = new Map(PARAMETER_CATALOG.map((d) => [d.key, d]));

export function parameterDefinition(key: string): ParameterDefinition | null {
  return BY_KEY.get(key) ?? null;
}

export function seedReason(def: ParameterDefinition): string {
  return def.defaultNote ? `${SEED_REASON} — ${def.defaultNote}` : SEED_REASON;
}

export type ParameterCheck =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: string };

/**
 * Type and range check of one value (formulas are only checked to be text
 * here; `checkFormulaSet` compiles them). Returns the value to store.
 */
export function checkParameterValue(
  def: ParameterDefinition,
  value: unknown,
): ParameterCheck {
  const fail = (error: string): ParameterCheck => ({ ok: false, error });
  switch (def.type) {
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        return fail(`« ${def.label} » doit être un nombre.`);
      }
      if (def.type === 'integer' && !Number.isInteger(value)) {
        return fail(`« ${def.label} » doit être un nombre entier.`);
      }
      const unit = def.unit ? ` ${def.unit}` : '';
      if (def.min !== undefined && value < def.min) {
        return fail(`« ${def.label} » doit être au moins ${def.min}${unit}.`);
      }
      if (def.max !== undefined && value > def.max) {
        return fail(`« ${def.label} » doit être au plus ${def.max}${unit}.`);
      }
      return { ok: true, value };
    }
    case 'string':
    case 'formula': {
      if (typeof value !== 'string' || value.trim() === '') {
        return fail(`« ${def.label} » doit être un texte non vide.`);
      }
      return { ok: true, value: value.trim() };
    }
    case 'json':
      return value === undefined
        ? fail(`« ${def.label} » : valeur manquante.`)
        : { ok: true, value };
  }
}

/**
 * Compiles a whole formula set given as `parameter key → expression` (every
 * FORMULE_* key in force). Returns the French error of the first problem, or
 * null when the set compiles.
 */
export function checkFormulaSet(
  expressions: ReadonlyMap<string, string>,
): string | null {
  const defs = [...expressions].map(([key, expression]) => ({
    key: indicatorKeyOf(key) ?? key,
    expression,
  }));
  try {
    compileIndicatorSet(defs, POUFA_BASE_VARIABLE_NAMES);
    return null;
  } catch (e) {
    if (e instanceof FormulaError) return e.message;
    throw e;
  }
}

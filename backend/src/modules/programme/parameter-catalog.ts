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

/**
 * Owner keys of the parameters. Who changes a value is the matrix right of
 * the key (`access-rules.ts` `PARAMETER_OWNER_RIGHTS`), never the profile code.
 */
export const OWNER_PROFILE = {
  DGE: 'DGE',
  VETERINAIRE: 'VETERINAIRE',
  ADMIN: 'ADMIN',
} as const;

/**
 * POUFA lot A2 vet: indicator formulas owned by the veterinary services (the
 * day mortality decides the sanitary alert against
 * `SEUIL_ALERTE_MORTALITE_JOUR_PCT`); the others stay the DGE's.
 */
export const VETERINARY_FORMULAS: ReadonlySet<string> = new Set([
  'mortalite_jour_pct',
]);

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
  /** Extra check of a `json` value: French error, or null when valid. */
  readonly check?: (value: unknown) => string | null;
  /**
   * A `string` parameter that is a closed choice: the screen shows these
   * options instead of a text field, and any other value is refused.
   */
  readonly options?: readonly ParameterOption[];
}

export interface ParameterOption {
  readonly value: string;
  readonly label: string;
  /** One sentence: what this choice means. */
  readonly description: string;
  /** One sentence shown before saving: what changes once it applies. */
  readonly consequence: string;
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

/** Values of `FINANCEMENT_PERIMETRE`: what the FINANCED scope (BCEG) reaches. */
export const FINANCED_PERIMETERS = [
  'PROGRAMME',
  'DOSSIERS',
  'CONSENTEMENT',
] as const;

function checkFinancedPerimeter(value: unknown): string | null {
  return typeof value === 'string' &&
    (FINANCED_PERIMETERS as readonly string[]).includes(value)
    ? null
    : `Le périmètre doit être l'une de ces valeurs : ${FINANCED_PERIMETERS.join(', ')}.`;
}

const PROVISION_RANGE = { min: 0, max: 100 } as const;

const FINANCED_PERIMETER_OPTIONS: readonly ParameterOption[] = [
  {
    value: 'PROGRAMME',
    label: 'Toutes les fermes du programme',
    description:
      'La BCEG lit les données de toutes les fermes du programme, dans la limite de ses droits.',
    consequence:
      'La BCEG pourra lire les données de toutes les fermes du programme, y compris celles qui n’ont ni dossier de financement ni consentement.',
  },
  {
    value: 'DOSSIERS',
    label: 'Les fermes ayant un dossier de financement',
    description:
      'La BCEG lit les données des seules fermes pour lesquelles elle a ouvert un dossier de financement.',
    consequence:
      'La BCEG ne pourra plus lire les données des fermes sans dossier de financement ; celles qui en ont un restent lisibles.',
  },
  {
    value: 'CONSENTEMENT',
    label: 'Les fermes dont l’exploitant a donné son consentement',
    description:
      'La BCEG lit les données des seules fermes dont l’exploitant a donné un consentement actif.',
    consequence:
      'La BCEG ne pourra lire que les fermes dont l’exploitant a donné un consentement actif ; un consentement retiré ferme l’accès aussitôt.',
  },
];

const FINANCING_PARAMETERS: readonly ParameterDefinition[] = [
  {
    // PROGRAMME = every farm of the programme; DOSSIERS = farms with a
    // financing file not refused; CONSENTEMENT = farms with an active consent.
    key: 'FINANCEMENT_PERIMETRE',
    label:
      'Fermes accessibles au financeur (PROGRAMME, DOSSIERS ou CONSENTEMENT)',
    type: 'string',
    unit: null,
    ownerProfile: OWNER_PROFILE.ADMIN,
    defaultValue: 'PROGRAMME',
    defaultNote:
      "proposition de Fermia : à arrêter avec la BCEG et l'autorité de protection des données",
    check: checkFinancedPerimeter,
    options: FINANCED_PERIMETER_OPTIONS,
  },
  {
    // COBAC R-2018/01 art. 8-9: unpaid up to 90 days = impayée, beyond = douteuse.
    key: 'FINANCEMENT_IMPAYE_JOURS',
    label:
      "Financement : jours d'impayé au-delà desquels la créance est douteuse",
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 1,
    max: 365,
    defaultValue: 90,
    defaultNote: 'Règlement COBAC R-2018/01, art. 8-9',
  },
  {
    key: 'FINANCEMENT_ALERTE_ECHEANCE_JOURS',
    label: 'Financement : fenêtre des échéances à venir',
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 1,
    max: 365,
    defaultValue: 30,
    defaultNote: 'proposition de Fermia, à valider',
  },
  {
    key: 'FINANCEMENT_COUVERTURE_DETTE_MIN',
    label:
      'Financement : couverture minimale des échéances par la capacité d’autofinancement (fois)',
    type: 'number',
    unit: 'x',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 0,
    max: 20,
    defaultValue: 1.2,
    defaultNote: 'proposition de Fermia : à arrêter avec la BCEG',
  },
  {
    key: 'FINANCEMENT_ENDETTEMENT_MAX',
    label:
      'Financement : endettement maximal (dettes financières / capitaux propres, fois)',
    type: 'number',
    unit: 'x',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 0,
    max: 50,
    defaultValue: 2,
    defaultNote: 'proposition de Fermia : à arrêter avec la BCEG',
  },
  {
    // Share of the days of a statements period with something entered, under
    // which the web asks for a confirmation and the PDF carries a warning.
    key: 'FINANCEMENT_COUVERTURE_SAISIE_MIN',
    label:
      'Financement : part minimale de jours saisis d’une période pour des états complets',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 0,
    max: 100,
    defaultValue: 60,
    defaultNote: 'proposition de Fermia : à arrêter avec la BCEG',
  },
  // Indicative provisioning rates by claim class (COBAC R-2018/01, art. 17-18:
  // douteux sans garantie éligible 50 % puis 100 %). The bank's own accounting
  // prevails and guarantees are not taken into account.
  {
    key: 'FINANCEMENT_PROVISION_GENERALE_PCT',
    label:
      'Financement : provision indicative des créances saines, sensibles et restructurées',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.ADMIN,
    ...PROVISION_RANGE,
    defaultValue: 2,
    defaultNote: 'proposition de Fermia : à arrêter avec la BCEG',
  },
  {
    key: 'FINANCEMENT_PROVISION_IMPAYE_PCT',
    label: 'Financement : provision indicative des créances impayées',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.ADMIN,
    ...PROVISION_RANGE,
    defaultValue: 0,
    defaultNote: 'proposition de Fermia : à arrêter avec la BCEG',
  },
  {
    key: 'FINANCEMENT_PROVISION_DOUTEUX_PCT',
    label: 'Financement : provision indicative des créances douteuses',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.ADMIN,
    ...PROVISION_RANGE,
    defaultValue: 50,
    defaultNote: 'Règlement COBAC R-2018/01, art. 17-18',
  },
  {
    key: 'FINANCEMENT_PROVISION_IRRECOUVRABLE_PCT',
    label: 'Financement : provision indicative des créances irrécouvrables',
    type: 'number',
    unit: '%',
    ownerProfile: OWNER_PROFILE.ADMIN,
    ...PROVISION_RANGE,
    defaultValue: 100,
    defaultNote: 'Règlement COBAC R-2018/01, art. 17-18',
  },
];

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

// POUFA lot A pilot: steering perimeter (F2) and conduct alerts (F1).
/**
 * Bands counted in the programme's aggregates (pilotage, map, objective,
 * reports): POUFA = broiler chicken. Other species and laying flocks stay
 * on the farm, marked « hors programme ».
 */
export const DEFAULT_ELIGIBLE_BAND_TYPES = [
  { species: 'POULET', type: 'CHAIR' },
] as const;

/**
 * Advisory alert kinds that would read as a sanitary or economic verdict:
 * never shown in the steering, whatever the list says (CDC §5.2, §8: only
 * the veterinary authority publishes a sanitary alert).
 */
export const NON_CONDUCT_ALERT_KINDS: readonly string[] = [
  'MALADIE',
  'MORTALITE',
  'PROPHYLAXIE',
  'DELAI_ATTENTE',
  'RENTABILITE',
];

/** Fermia advisory kinds shown apart as « alertes de conduite ». */
export const DEFAULT_CONDUCT_ALERT_KINDS: readonly string[] = [
  'EAU',
  'ALIMENT',
  'CONSOMMATION_ALIMENT',
  'SURDENSITE',
  'DENSITE',
  'DENSITE_BATIMENT',
  'COHABITATION',
  'VIDE_SANITAIRE',
  'IPE',
  'GMQ',
  'PEREMPTION',
  'TRACABILITE',
  'SAISIE_MANQUEE',
  'HEAT',
  'STOCK_NEGATIF',
];

const SPECIES_CODES = [
  'POULET',
  'DINDE',
  'PINTADE',
  'CAILLE',
  'CANARD',
  'OIE',
  'FAISAN',
  'AUTRE',
];
const BATCH_TYPE_CODES = ['CHAIR', 'PONDEUSE'];
const ALERT_KIND_CODES = [
  ...DEFAULT_CONDUCT_ALERT_KINDS,
  ...NON_CONDUCT_ALERT_KINDS,
  'VENTE',
  'TACHE',
  'STOCK_OEUF',
];

/** `[{ species, type }]`, at least one, known codes, no duplicate. */
export function checkEligibleBandTypes(value: unknown): string | null {
  const shape =
    'attendu une liste de { "species": …, "type": … }, par exemple [{ "species": "POULET", "type": "CHAIR" }]';
  if (!Array.isArray(value) || value.length === 0) {
    return `Types de bandes éligibles : ${shape}.`;
  }
  const seen = new Set<string>();
  for (const item of value as unknown[]) {
    const o = item as { species?: unknown; type?: unknown } | null;
    if (!o || typeof o !== 'object' || Array.isArray(o)) {
      return `Types de bandes éligibles : ${shape}.`;
    }
    if (typeof o.species !== 'string' || !SPECIES_CODES.includes(o.species)) {
      return `Espèce inconnue : ${String(o.species)} (${SPECIES_CODES.join(', ')}).`;
    }
    if (typeof o.type !== 'string' || !BATCH_TYPE_CODES.includes(o.type)) {
      return `Type de bande inconnu : ${String(o.type)} (${BATCH_TYPE_CODES.join(', ')}).`;
    }
    const key = `${o.species}:${o.type}`;
    if (seen.has(key)) return `Type de bande en double : ${key}.`;
    seen.add(key);
  }
  return null;
}

/** A list of advisory alert kinds, none of the sanitary or economic ones. */
export function checkConductAlertKinds(value: unknown): string | null {
  if (!Array.isArray(value) || value.some((k) => typeof k !== 'string')) {
    return 'Alertes de conduite : attendu une liste de types d’alerte, par exemple ["EAU", "ALIMENT"].';
  }
  const unknown = (value as string[]).filter(
    (k) => !ALERT_KIND_CODES.includes(k),
  );
  if (unknown.length > 0) {
    return `Type(s) d’alerte inconnu(s) : ${unknown.join(', ')}.`;
  }
  const refused = (value as string[]).filter((k) =>
    NON_CONDUCT_ALERT_KINDS.includes(k),
  );
  if (refused.length > 0) {
    return `Ces alertes ne sont pas des alertes de conduite (sanitaires ou économiques) et ne vont jamais au pilotage : ${refused.join(', ')}.`;
  }
  if (new Set(value).size !== value.length) {
    return 'Type d’alerte en double dans la liste.';
  }
  return null;
}

const PILOT_LOT_A_PARAMETERS: readonly ParameterDefinition[] = [
  {
    key: 'BANDE_TYPES_ELIGIBLES',
    label:
      'Bandes comptées dans le programme (pilotage, carte, objectif, rapports) : espèce et type',
    type: 'json',
    unit: null,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: DEFAULT_ELIGIBLE_BAND_TYPES,
    defaultNote:
      'POUFA = poulet de chair ; les autres bandes restent sur la ferme, marquées « hors programme »',
    check: checkEligibleBandTypes,
  },
  {
    key: 'PILOTAGE_ALERTES_CONDUITE_TYPES',
    label:
      'Alertes de conduite (conseil Fermia, non sanitaires) montrées à part dans le pilotage',
    type: 'json',
    unit: null,
    ownerProfile: OWNER_PROFILE.DGE,
    defaultValue: DEFAULT_CONDUCT_ALERT_KINDS,
    defaultNote: FERMIA_PROPOSAL,
    check: checkConductAlertKinds,
  },
];
// End POUFA lot A pilot.

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
    // Biosecurity grid (CDC n° 27, §7.3f « classement »): score ≥ A is class A,
    // ≥ B is class B, below is class C. Proposed values, to validate.
    key: 'BIOSECURITE_SEUIL_A_PCT',
    label: 'Score de biosécurité minimal pour la classe A',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.VETERINAIRE,
    defaultValue: 80,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'BIOSECURITE_SEUIL_B_PCT',
    label: 'Score de biosécurité minimal pour la classe B',
    type: 'number',
    ...pct,
    ownerProfile: OWNER_PROFILE.VETERINAIRE,
    defaultValue: 60,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    // Pilotage: past this age the latest biosecurity control is shown as « ancien ».
    // 0 switches the flag off.
    key: 'BIOSECURITE_CONTROLE_ANCIEN_JOURS',
    label: 'Ancienneté à partir de laquelle un contrôle de biosécurité est dit ancien',
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.VETERINAIRE,
    min: 0,
    max: 3650,
    defaultValue: 365,
    defaultNote: FERMIA_PROPOSAL,
  },
  {
    key: 'VISITE_RAPPEL_J',
    label: "Délai de rappel avant la prochaine visite",
    type: 'integer',
    unit: 'jours',
    ownerProfile: OWNER_PROFILE.DGE,
    min: 0,
    max: 30,
    defaultValue: 2,
    defaultNote: FERMIA_PROPOSAL,
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
  {
    // Notify (architecture §12): SMS guard-rail, an SMS costs money and
    // travels in clear. Beyond it, the SMS is not sent (ECHEC).
    key: 'NOTIF_SMS_PLAFOND_JOUR',
    label: 'Plafond de SMS de notification par jour et par utilisateur',
    type: 'integer',
    unit: 'SMS',
    ownerProfile: OWNER_PROFILE.ADMIN,
    min: 0,
    max: 100,
    defaultValue: 5,
  },
  // Financer workspace (BCEG): who the FINANCED scope reaches and the claim
  // class thresholds (COBAC R-2018/01 art. 8-9).
  ...FINANCING_PARAMETERS,
  ...PILOTAGE_PARAMETERS,
  // POUFA lot A pilot: programme perimeter and conduct alerts of the steering.
  ...PILOT_LOT_A_PARAMETERS,
  ...POUFA_DEFAULT_FORMULAS.map((f): ParameterDefinition => ({
    key: formulaParameterKey(f.key),
    label: `Formule : ${f.label}`,
    type: 'formula',
    unit: f.unit,
    // POUFA lot A2 vet: the day mortality ratio triggers the sanitary alert
    // (CDC n° 25 « seuils réglés par les seuls services vétérinaires »).
    ownerProfile: VETERINARY_FORMULAS.has(f.key)
      ? OWNER_PROFILE.VETERINAIRE
      : OWNER_PROFILE.DGE,
    defaultValue: f.expression,
    defaultNote: f.defaultNote,
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
      if (
        def.type === 'string' &&
        def.options &&
        !def.options.some((o) => o.value === value.trim())
      ) {
        return fail(
          `« ${def.label} » doit être l'un des choix proposés : ${def.options.map((o) => o.value).join(', ')}.`,
        );
      }
      const problem =
        def.type === 'string' ? (def.check?.(value.trim()) ?? null) : null;
      if (problem) return fail(problem);
      return { ok: true, value: value.trim() };
    }
    case 'json': {
      if (value === undefined) {
        return fail(`« ${def.label} » : valeur manquante.`);
      }
      const problem = def.check?.(value) ?? null;
      return problem ? fail(problem) : { ok: true, value };
    }
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

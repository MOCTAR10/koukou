/**
 * Programme POUFA variable catalog and default ("Proposé") indicator rules.
 * The defaults are only a starting point: authorized staff edit the stored
 * expressions, which are validated with `parseFormula` / `compileIndicatorSet`.
 */

export interface FormulaVariable {
  readonly name: string;
  readonly label: string;
  readonly unit: string;
}

export interface IndicatorFormulaDefinition {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly expression: string;
  /** Appended to the seed reason of its `FORMULE_*` parameter. */
  readonly defaultNote?: string;
}

/** Raw values of a band (lot) that formulas may reference. */
export const POUFA_BASE_VARIABLES: readonly FormulaVariable[] = [
  { name: 'mis_en_place', label: 'Sujets mis en place', unit: 'têtes' },
  { name: 'morts_cumules', label: 'Mortalité cumulée', unit: 'têtes' },
  { name: 'morts_jour', label: 'Morts du jour', unit: 'têtes' },
  { name: 'presents', label: 'Effectif présent', unit: 'têtes' },
  {
    name: 'presents_veille',
    label: 'Effectif présent la veille',
    unit: 'têtes',
  },
  {
    name: 'sortis_tetes',
    label: 'Sujets sortis (vendus ou abattus)',
    unit: 'têtes',
  },
  {
    name: 'poids_sortis_kg',
    label: 'Poids vif des sujets sortis',
    unit: 'kg',
  },
  {
    name: 'poids_presents_kg',
    label: 'Poids vif des sujets présents',
    unit: 'kg',
  },
  {
    name: 'poids_poussins_kg',
    label: 'Poids des poussins à la mise en place',
    unit: 'kg',
  },
  { name: 'poids_moyen_g', label: 'Poids moyen actuel', unit: 'g' },
  {
    name: 'poids_initial_g',
    label: 'Poids moyen à la mise en place',
    unit: 'g',
  },
  { name: 'jours_elevage', label: "Durée d'élevage", unit: 'jours' },
  { name: 'aliment_kg', label: 'Aliment consommé', unit: 'kg' },
  { name: 'charges_fcfa', label: 'Charges totales', unit: 'FCFA' },
  { name: 'ca_fcfa', label: "Chiffre d'affaires", unit: 'FCFA' },
  {
    name: 'capacite_places',
    label: 'Capacité du bâtiment',
    unit: 'places',
  },
  // POUFA lot A pilot: inputs of the steering's per-period aggregates (pilotage,
  // map, reports). Not known for a band alone: null in its own indicators.
  {
    name: 'morts_periode',
    label: 'Morts de la période (agrégats du pilotage)',
    unit: 'têtes',
  },
  {
    name: 'effectif_expose',
    label:
      'Effectif exposé : présents au premier jour de la période, ou mis en place pendant la période',
    unit: 'têtes',
  },
];

export const POUFA_BASE_VARIABLE_NAMES: readonly string[] =
  POUFA_BASE_VARIABLES.map((v) => v.name);

/** The spec's proposed rules. Indicators may reference earlier ones by key. */
export const POUFA_DEFAULT_FORMULAS: readonly IndicatorFormulaDefinition[] = [
  {
    key: 'taux_mortalite',
    label: 'Taux de mortalité',
    unit: '%',
    expression: 'morts_cumules / mis_en_place * 100',
  },
  {
    key: 'viabilite',
    label: 'Viabilité',
    unit: '%',
    expression: '100 - taux_mortalite',
  },
  {
    key: 'poids_vif_produit_kg',
    label: 'Poids vif produit',
    unit: 'kg',
    expression: 'poids_sortis_kg + poids_presents_kg - poids_poussins_kg',
  },
  {
    key: 'gmq_g_j',
    label: 'Gain moyen quotidien (GMQ)',
    unit: 'g/j',
    expression: '(poids_moyen_g - poids_initial_g) / jours_elevage',
  },
  {
    key: 'ic',
    label: 'Indice de consommation (IC)',
    unit: 'kg aliment/kg vif',
    expression: 'aliment_kg / poids_vif_produit_kg',
  },
  {
    key: 'cout_production_kg',
    label: 'Coût de production par kg vif',
    unit: 'FCFA/kg',
    expression: 'charges_fcfa / poids_vif_produit_kg',
  },
  {
    key: 'cout_production_tete',
    label: 'Coût de production par tête',
    unit: 'FCFA/tête',
    expression: 'charges_fcfa / (sortis_tetes + presents)',
  },
  {
    key: 'marge_fcfa',
    label: 'Marge brute',
    unit: 'FCFA',
    expression: 'ca_fcfa - charges_fcfa',
  },
  {
    key: 'marge_kg',
    label: 'Marge par kg vif',
    unit: 'FCFA/kg',
    expression: 'marge_fcfa / poids_vif_produit_kg',
  },
  {
    key: 'taux_marge',
    label: 'Taux de marge',
    unit: '%',
    expression: 'marge_fcfa / ca_fcfa * 100',
  },
  {
    key: 'taux_occupation',
    label: "Taux d'occupation du bâtiment",
    unit: '%',
    expression: 'mis_en_place / capacite_places * 100',
  },
  {
    key: 'mortalite_jour_pct',
    label: 'Mortalité du jour',
    unit: '%',
    expression: 'morts_jour / presents_veille * 100',
  },
  // POUFA lot A pilot: the steering's mortality of a period (dashboards, map,
  // reports), summed over the bands before dividing.
  {
    key: 'mortalite_periode_pct',
    label: 'Mortalité de la période (pilotage)',
    unit: '%',
    expression: 'morts_periode / effectif_expose * 100',
    defaultNote:
      'formule par période du pilotage, le cahier des charges ne la fixe pas : proposition de Fermia, à valider par la DGE',
  },
];

/**
 * Indicators of the steering's aggregates over a period (POUFA lot A pilot):
 * computed from summed facts, never shown in a band's own indicators.
 */
export const PERIOD_INDICATOR_KEYS: readonly string[] = [
  'mortalite_periode_pct',
];

export function isPeriodIndicator(key: string): boolean {
  return PERIOD_INDICATOR_KEYS.includes(key);
}

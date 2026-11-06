/**
 * POUFA lot A (pilot): the programme perimeter (`BANDE_TYPES_ELIGIBLES`) and
 * the refresh cadence of the steering screens. Pure, unit-tested.
 */

/** Steering screens refetch every 10 minutes (CDC: 5 to 15 min). */
export const PILOTAGE_REFRESH_MS = 10 * 60 * 1000;

const SPECIES_LABELS: Readonly<Record<string, string>> = {
  POULET: 'poulet',
  DINDE: 'dinde',
  PINTADE: 'pintade',
  CAILLE: 'caille',
  CANARD: 'canard',
  OIE: 'oie',
  FAISAN: 'faisan',
  AUTRE: 'autre espèce',
};

const TYPE_LABELS: Readonly<Record<string, string>> = {
  CHAIR: 'de chair',
  PONDEUSE: 'pondeuse',
};

export interface BandTypeRef {
  species: string;
  type: string;
}

/** « poulet de chair », « pintade pondeuse »… */
export function bandTypeLabel(t: BandTypeRef): string {
  return `${SPECIES_LABELS[t.species] ?? t.species.toLowerCase()} ${TYPE_LABELS[t.type] ?? t.type.toLowerCase()}`;
}

/** « bandes de poulet de chair » or a list; « aucune bande » when empty. */
export function bandTypesLabel(types: readonly BandTypeRef[]): string {
  if (types.length === 0) return 'aucune bande';
  return `bandes de ${types.map(bandTypeLabel).join(', ')}`;
}

/** Does a band of this species and type count in the programme? */
export function isProgrammeBand(types: readonly BandTypeRef[], band: { species?: string | null; type?: string | null }): boolean {
  return types.some((t) => t.species === band.species && t.type === band.type);
}

import type { Farm, FeedEntryType, FeedPhase, Species } from './types';

export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export const SPECIES_LABELS: Record<Species, string> = {
  POULET: 'Poulet',
  PINTADE: 'Pintade',
  DINDE: 'Dinde',
  CAILLE: 'Caille',
  CANARD: 'Canard',
  OIE: 'Oie',
  FAISAN: 'Faisan',
  AUTRE: 'Autre (volailles)',
};

export const SPECIES_ICONS: Record<Species, string> = {
  POULET: '🐔',
  PINTADE: '🐦',
  DINDE: '🦃',
  CAILLE: '🐤',
  CANARD: '🦆',
  OIE: '🦢',
  FAISAN: '🦚',
  AUTRE: '🐓',
};

export function speciesLabel(species: Species | null | undefined): string {
  return (species && SPECIES_LABELS[species]) || 'Poulet';
}

export function givenName(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const first = tokens.find((t) => !/^m(me|lle|r)?\.?$/i.test(t));
  return first ?? name.trim();
}

export const FEED_PHASE_LABELS: Record<FeedPhase, string> = {
  POUSSIN: 'Poussin',
  DEMARRAGE: 'Démarrage',
  CROISSANCE: 'Croissance',
  PRE_PONTE: 'Pré-ponte',
  PONTE_PHASE_1: 'Ponte 1',
  PONTE_PHASE_2: 'Ponte 2',
  PONTE_PHASE_3: 'Ponte 3',
  FINITION: 'Finition',
  PERSONNALISE: 'Personnalisé',
};

export const FEED_ENTRY_TYPE_LABELS: Record<FeedEntryType, string> = {
  BULKER: 'Bulker',
  BAG: 'Sac',
  MEDICAMENT: 'Médicament',
  MATIERE_PREMIERE: 'Matière première',
};

/** Province of a farm as `GET /farms` serves it: its name, else its code; null without one. */
export function farmProvinceLabel(
  farm: Pick<Farm, 'provinceName' | 'provinceCode'> | undefined,
): string | null {
  return farm?.provinceName?.trim() || farm?.provinceCode?.trim() || null;
}

import type { CustomerType } from '@/api/types';

export const CUSTOMER_TYPE_LABEL: Record<CustomerType, string> = {
  PARTICULIER: 'Particulier',
  RESTAURANT: 'Restaurant',
  HOTEL: 'Hôtel',
  EVENEMENT: 'Événement',
  TRAITEUR: 'Traiteur',
  COMMERCE: 'Commerce',
  REVENDEUR: 'Revendeur',
  GROSSISTE: 'Grossiste',
  BOULANGERIE: 'Boulangerie',
  COLLECTIVITE: 'Collectivité',
  ENTREPRISE: 'Entreprise',
  ELEVEUR: 'Éleveur',
  ONG: 'ONG',
  TRANSFORMATEUR: 'Transformateur',
};

/** Ordre d'affichage stable (les types pro sont au-dessus du particulier). */
export const CUSTOMER_TYPES: CustomerType[] = [
  'RESTAURANT',
  'HOTEL',
  'TRAITEUR',
  'EVENEMENT',
  'COMMERCE',
  'REVENDEUR',
  'BOULANGERIE',
  'COLLECTIVITE',
  'ENTREPRISE',
  'ONG',
  'GROSSISTE',
  'TRANSFORMATEUR',
  'ELEVEUR',
  'PARTICULIER',
];

export function customerTypeLabel(type: CustomerType | null | undefined): string {
  return type ? (CUSTOMER_TYPE_LABEL[type] ?? type) : CUSTOMER_TYPE_LABEL.PARTICULIER;
}
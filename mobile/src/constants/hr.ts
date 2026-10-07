import type { ContractType } from '@/api/types';

/** Nature du contrat de travail (dossier RH) — libellés FR. */
export const CONTRACT_TYPE_LABEL: Record<ContractType, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  JOURNALIER: 'Journalier',
  STAGE: 'Stage',
  APPRENTISSAGE: 'Apprentissage',
  AUTRE: 'Autre',
};

export const CONTRACT_TYPES: ContractType[] = [
  'CDI',
  'CDD',
  'JOURNALIER',
  'STAGE',
  'APPRENTISSAGE',
  'AUTRE',
];

export function contractTypeLabel(type: ContractType | null | undefined): string {
  return type ? CONTRACT_TYPE_LABEL[type] : '—';
}

import { ProgramListType } from '../../common/enums/program-list-type.enum.js';

/**
 * Internal behaviours a configurable list item can map onto. Lists listed here
 * REQUIRE a family on each item (the code reacts to the family only, e.g. a
 * MOTIF_SORTIE of family VENTE books a sale); the other lists take none.
 * Families are code, not data: adding one means adding the behaviour.
 */
export const PROGRAM_LIST_FAMILIES: Readonly<
  Partial<Record<ProgramListType, readonly string[]>>
> = {
  [ProgramListType.STATUT_FERME]: [
    'PREPARATION',
    'OPERATIONNELLE',
    'SUSPENDUE',
  ],
  [ProgramListType.INTRANT]: [
    'POUSSIN',
    'ALIMENT',
    'VACCIN',
    'MEDICAMENT',
    'AUTRE',
  ],
  [ProgramListType.MOTIF_SORTIE]: ['VENTE', 'ABATTOIR', 'REFORME', 'AUTRE'],
  [ProgramListType.TYPE_OPERATEUR]: [
    'ABATTOIR',
    'ACHETEUR',
    'DISTRIBUTEUR',
    'TRANSPORTEUR',
    'AUTRE',
  ],
  [ProgramListType.STATUT_ALERTE]: [
    'NOUVELLE',
    'EN_ANALYSE',
    'CONFIRMEE',
    'INFIRMEE',
    'CLOSE',
  ],
};

export function familiesOf(
  listType: ProgramListType,
): readonly string[] | null {
  return PROGRAM_LIST_FAMILIES[listType] ?? null;
}

/** French error for a family that does not fit `listType`, or null when valid. */
export function familyError(
  listType: ProgramListType,
  family: string | null | undefined,
): string | null {
  const allowed = familiesOf(listType);
  if (!allowed) {
    return family ? `La liste ${listType} n'utilise pas de famille.` : null;
  }
  if (!family) {
    return `Famille obligatoire pour la liste ${listType} (${allowed.join(', ')}).`;
  }
  if (!allowed.includes(family)) {
    return `Famille « ${family} » inconnue pour la liste ${listType} (${allowed.join(', ')}).`;
  }
  return null;
}

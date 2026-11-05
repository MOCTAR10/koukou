/**
 * Configurable lists of a programme (`RefItem.listType`). The items are data
 * edited by the authorized services; the code only reacts to an item's
 * `family` (see `programme/ref-list-families.ts`), never to its code or label.
 */
export enum ProgramListType {
  STATUT_FERME = 'STATUT_FERME',
  COHORTE = 'COHORTE',
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  INTRANT = 'INTRANT',
  UNITE = 'UNITE',
  MOTIF_SORTIE = 'MOTIF_SORTIE',
  POSTE_CHARGE = 'POSTE_CHARGE',
  PRODUIT_TRAITEMENT = 'PRODUIT_TRAITEMENT',
  SIGNE_CLINIQUE = 'SIGNE_CLINIQUE',
  TYPE_OPERATEUR = 'TYPE_OPERATEUR',
  STATUT_ALERTE = 'STATUT_ALERTE',
}

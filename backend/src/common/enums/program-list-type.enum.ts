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
  /** Biosecurity grid (CDC n° 27): `meta.weight` (integer ≥ 1) and `meta.category`. */
  CRITERE_BIOSECURITE = 'CRITERE_BIOSECURITE',
  /**
   * Disease catalogue of the veterinary services. Family
   * DECLARATION_OBLIGATOIRE = disease « réputée contagieuse » (loi n° 2/65):
   * declaring it opens an official sanitary alert. `meta.legalRef` = code of
   * a TEXTE_REFERENCE item, `meta.conduct` = what the farmer must do.
   */
  MALADIE = 'MALADIE',
  /**
   * Gabonese legal and regulatory texts the reference data cites:
   * `meta.date`, `meta.articles`, `meta.summary`, `meta.url`.
   */
  TEXTE_REFERENCE = 'TEXTE_REFERENCE',
  /**
   * Vaccine catalogue of the veterinary services (generic products, no brand):
   * `meta.diseaseCodes` (MALADIE codes), `meta.kind` (VIVANT | INACTIVE),
   * `meta.route`, `meta.storage`. A calendar step points at an item through
   * `protocol_steps.vaccine_code`.
   */
  VACCIN = 'VACCIN',
}

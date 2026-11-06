/**
 * Data recovery (« reprise des données », CDC §9 deliverable 3, feature 31).
 * Kind of source a job takes in.
 */
export enum ImportJobType {
  /** AMI registration forms: creates or completes registry farms. */
  AMI = 'AMI',
  /** Paper or Excel band sheets (saved as CSV): bands + daily entries. */
  BANDES_HISTORIQUES = 'BANDES_HISTORIQUES',
  /** Export of the transitional tool: same pipeline as the band sheets. */
  OUTIL_TRANSITOIRE = 'OUTIL_TRANSITOIRE',
}

/**
 * DEPOSE → ANALYSE → CONTROLE → ESSAI → VALIDE → INTEGRE, or REJETE from any
 * step before integration. INTEGRE and REJETE are final.
 */
export enum ImportJobStatus {
  /** File received, lines stored raw. */
  DEPOSE = 'DEPOSE',
  /** Columns mapped; stays here when a mandatory column is missing. */
  ANALYSE = 'ANALYSE',
  /** Every line controlled (errors and warnings per line). */
  CONTROLE = 'CONTROLE',
  /** Dry run done: the report says what integration would do. */
  ESSAI = 'ESSAI',
  /** Dry run accepted by an authorised profile. */
  VALIDE = 'VALIDE',
  INTEGRE = 'INTEGRE',
  REJETE = 'REJETE',
}

/** Result of the controls on one staging line. */
export enum ImportRowStatus {
  VALIDE = 'VALIDE',
  AVERTISSEMENT = 'AVERTISSEMENT',
  ERREUR = 'ERREUR',
  /** Set aside by a manual correction (with its reason). */
  EXCLUE = 'EXCLUE',
}

/** What a line leads to (planned by the controls, then dry run / integration). */
export enum ImportRowOutcome {
  /** Created (farm, band or daily entry). */
  INTEGREE = 'INTEGREE',
  /** Existing farm whose empty fields were completed. */
  ENRICHIE = 'ENRICHIE',
  /** Already in the system (same source key): nothing written. */
  DEJA_PRESENTE = 'DEJA_PRESENTE',
  REJETEE = 'REJETEE',
  EXCLUE = 'EXCLUE',
}

/** What opened an official sanitary alert (CDC « Alerte précoce »). */
export enum SanitaryAlertOrigin {
  /** The day's mortality of a band passed the veterinary threshold. */
  MORTALITE = 'MORTALITE',
  /** A sanitary declaration flagged as a suspicion. */
  DECLARATION = 'DECLARATION',
}

/** Kind of a row of an alert's history (`SanitaryAlertTransition`). */
export enum SanitaryAlertTransitionKind {
  /** The alert was opened (first status). */
  CREATION = 'CREATION',
  /** Status change in the qualification circuit. */
  STATUT = 'STATUT',
  /** Publication by the veterinary authority. */
  PUBLICATION = 'PUBLICATION',
}

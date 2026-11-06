/**
 * POUFA lot A2 vet (CDC §5.2 n° 26 « les services vétérinaires […] valident
 * les événements »): the veterinary decision on a sanitary declaration that
 * opened no alert. Stored on `HealthEvent.vetReviewStatus`; null = still to
 * be examined. « Proposé », à valider vétérinaires.
 */
export enum DeclarationReviewStatus {
  /** Examined and taken into account as declared. */
  VALIDEE = 'VALIDEE',
  /** Examined and ruled out (comment required). */
  INFIRMEE = 'INFIRMEE',
  /** Converted into an official sanitary alert (origin DECLARATION). */
  ALERTE = 'ALERTE',
}

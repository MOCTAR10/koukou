/** Kind of a technical visit (POUFA CDC n° 45 « visites techniques », n° 27 « biosécurité »). */
export enum VisitType {
  TECHNIQUE = 'TECHNIQUE',
  BIOSECURITE = 'BIOSECURITE',
  SANITAIRE = 'SANITAIRE',
}

/** Answer to one criterion of the biosecurity grid. NA = not applicable (left out of the score). */
export enum BiosecurityAnswer {
  CONFORME = 'CONFORME',
  NON_CONFORME = 'NON_CONFORME',
  NA = 'NA',
}

/** Classification of a biosecurity score, thresholds in the parameter catalog. */
export enum BiosecurityClass {
  A = 'A',
  B = 'B',
  C = 'C',
}

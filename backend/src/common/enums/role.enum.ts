export enum UserRole {
  PLATFORM_ADMIN = 'PLATFORM_ADMIN',
  PROPRIETAIRE = 'PROPRIETAIRE',
  ELEVEUR = 'ELEVEUR',
  /** Buys on the Market. Has no access to any farm's data. */
  ACHETEUR = 'ACHETEUR',
  /**
   * Institutional account of a programme (DGE, veterinary services, BCEG,
   * MAEDR, ANINF, technical agents…). What it may do lives in its
   * `ProgramMembership` (access profile + scope), enforced by
   * `ProgramAccessGuard`; it signs in with a one-time SMS code.
   */
  INSTITUTION = 'INSTITUTION',
  /** Reserved (slaughterhouses, distributors): no route is open to it yet. */
  OPERATEUR = 'OPERATEUR',
}

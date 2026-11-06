/**
 * Market verification of a programme farm (POUFA audit F8): the publication
 * condition of the Market no longer depends on the platform admin alone.
 * Entering an OPERATIONNELLE status verifies the farm, going back to
 * PREPARATION withdraws it, a suspension leaves the flag (the suspended farm
 * is hidden anyway). Between two status changes, a REGISTRE:VALIDER holder
 * (or the platform admin) sets it with `PUT /programme/farms/:id/verification`.
 * Pure, unit-tested.
 */
export function verifiedAfterStatus(
  family: string | null | undefined,
  current: boolean,
): boolean {
  if (family === 'OPERATIONNELLE') return true;
  if (family === 'PREPARATION') return false;
  return current;
}

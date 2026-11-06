import type { ReadDomain } from './menu-access';

/**
 * POUFA lot A droits (F6): economic figures shown to an institution only when
 * its profile reads the economic or cash domain. The server already sends
 * null to the others (gating by the matrix, not masking); the tile hides on
 * either signal. Farm accounts read everything (`canRead` is always true).
 */
export function showsCollectedToday(value: number | null | undefined, canRead: (domain: ReadDomain) => boolean): boolean {
  return value != null && (canRead('ECONOMIQUE') || canRead('VENTES'));
}

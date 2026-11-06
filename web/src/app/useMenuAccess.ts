import { useFarmProfile } from './useFarmProfile';

/**
 * Rights the farm menu is filtered with. Today every account, INSTITUTION
 * included, uses its profile on the active farm (`GET /farms/:id/me`: for an
 * institution the server maps its access matrix onto farm permission codes).
 *
 * Seam for W3: an INSTITUTION menu will come from `GET /programme/access/me`
 * (programme domains, aggregate and audit scopes that have no farm). Branch
 * here on the account's role; the Shell only reads this hook.
 */
export function useMenuAccess(): { hasPermission: (...codes: string[]) => boolean; isGroundEleveur: boolean } {
  const { hasPermission, isGroundEleveur } = useFarmProfile();
  return { hasPermission, isGroundEleveur };
}

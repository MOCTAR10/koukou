import { useAuth } from '../auth/AuthContext';
import { registryRights } from '../components/registry/registryAccess';
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
export function useMenuAccess(): { hasPermission: (...codes: string[]) => boolean; isGroundEleveur: boolean; canOpenRegistry: boolean } {
  const { user } = useAuth();
  const { hasPermission, isGroundEleveur } = useFarmProfile();
  // TODO(W3): an INSTITUTION whose profile grants REGISTRE (CONSULTER) opens the
  // registry too, within its scope: decide it from `/programme/access/me` in
  // `registryRights` (components/registry/registryAccess.ts).
  const canOpenRegistry = registryRights(user?.role).view;
  return { hasPermission, isGroundEleveur, canOpenRegistry };
}

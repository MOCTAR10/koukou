import { useAuth } from '../auth/AuthContext';
import { registryRights, type RegistryRights } from '../components/registry/registryAccess';
import {
  alwaysOpen,
  canAdministerAccess,
  institutionOpensPath,
  institutionReads,
  institutionShowsEntry,
  menuRuleFor,
  type ReadDomain,
} from './menu-access';
import { useFarmProfile } from './useFarmProfile';
import { useInstitutionAccess } from './useInstitutionAccess';

export interface MenuAccess {
  /** Whether the nav entry `to` shows; `perms`: farm permission codes, one of which is needed (absent: none). */
  showEntry: (to: string, perms?: string[]) => boolean;
  /** Whether a page opens (route guards, the Shell's « not open » screen). */
  canOpen: (pathname: string, perms?: string[]) => boolean;
  /**
   * Whether the account may read routes of a backend domain: always for a
   * farm account (its farm permissions gate the rest); for an INSTITUTION,
   * « Consulter » on that domain, never a Fermia-only one (`institutionReads`).
   * Gate with it every query a page makes outside its own domain.
   */
  canRead: (domain: ReadDomain) => boolean;
  /** The decision isn't known yet: guards wait instead of redirecting. */
  isLoading: boolean;
  isGroundEleveur: boolean;
  /** « Cockpit plateforme » (platform admin). */
  showPlatform: boolean;
  /** The institutional access administration (profiles, accounts). */
  showAccessAdmin: boolean;
  /** The account's own access page (institution). */
  showMyAccess: boolean;
  /** What the farm registry offers (`components/registry/registryAccess.ts`). */
  registry: RegistryRights;
}

/**
 * Rights the menu and the page guards are filtered with; the Shell reads only
 * this hook.
 *
 * - Farm accounts (owner, staff, platform admin): their profile on the active
 *   farm (`GET /farms/:id/me`).
 * - INSTITUTION: its access profile (`GET /programme/access/me`) through the
 *   table of `menu-access.ts`; Fermia-only areas never show. Unreadable access
 *   (offline before any load): the farm profile the server mapped from the
 *   matrix, Fermia-only areas still hidden. Refused access (no active
 *   membership): only the pages that need nothing.
 */
export function useMenuAccess(): MenuAccess {
  const { user } = useAuth();
  const { hasPermission, isGroundEleveur, isLoading: profileLoading } = useFarmProfile();
  const inst = useInstitutionAccess();
  const isAdmin = user?.role === 'PLATFORM_ADMIN';

  if (!inst.isInstitution) {
    return {
      showEntry: (_to, perms) => !perms || hasPermission(...perms),
      canOpen: (_path, perms) => !perms || hasPermission(...perms),
      canRead: () => true,
      isLoading: profileLoading,
      isGroundEleveur,
      showPlatform: isAdmin,
      showAccessAdmin: isAdmin,
      showMyAccess: false,
      registry: registryRights(user?.role),
    };
  }

  const { access } = inst;
  const decide = (path: string, perms: string[] | undefined, entry: boolean): boolean => {
    if (alwaysOpen(path)) return true;
    if (inst.pending || inst.revoked) return false;
    if (access) return entry ? institutionShowsEntry(path, access.profile) : institutionOpensPath(path, access.profile);
    // Access unreadable (offline, never loaded): the farm profile, never a Fermia-only area.
    const rule = menuRuleFor(path);
    if (rule?.kind === 'never') return false;
    if (entry && !rule) return false;
    return !perms || hasPermission(...perms);
  };
  return {
    showEntry: (to, perms) => decide(to, perms, true),
    canOpen: (path, perms) => decide(path, perms, false),
    canRead: (domain) => !inst.pending && !inst.revoked && institutionReads(access?.profile ?? null, domain),
    isLoading: inst.pending || (!access && profileLoading),
    // The ground home is the farm éleveur's.
    isGroundEleveur: false,
    showPlatform: false,
    showAccessAdmin: canAdministerAccess(user?.role, access?.profile),
    showMyAccess: true,
    registry: registryRights(user?.role, inst.revoked ? null : access?.profile),
  };
}

/** `useMenuAccess().canRead`, for the components that only gate their reads. */
export function useCanRead(): (domain: ReadDomain) => boolean {
  return useMenuAccess().canRead;
}

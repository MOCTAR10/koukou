import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess } from '../../app/menu-access';

/** What the registry screens offer. The server stays the authority (scope, matrix). */
export interface RegistryRights {
  /** List and sheets (`GET /programme/farms`). */
  view: boolean;
  /** New farm (`POST /programme/farms`). */
  create: boolean;
  /** Edit, status, GPS, infrastructures (PATCH / PUT; the status POST is MODIFIER too). */
  edit: boolean;
  /** `activate-owner` (domain ADMINISTRATION on the server). */
  activateOwner: boolean;
  /** Bulk import: national scope only. */
  import: boolean;
  /** `POST /admin/users/:id/login-code`: platform admin only. */
  regenerateCode: boolean;
}

const NONE: RegistryRights = { view: false, create: false, edit: false, activateOwner: false, import: false, regenerateCode: false };
const ALL: RegistryRights = { view: true, create: true, edit: true, activateOwner: true, import: true, regenerateCode: true };

/**
 * Registry rights per account, mirroring the server (`ProgramAccessGuard`,
 * `actionForMethod`: GET = CONSULTER, POST = CREER, PATCH / PUT = MODIFIER):
 * PLATFORM_ADMIN has them all; an INSTITUTION gets them from its access
 * profile (`GET /programme/access/me`): REGISTRE CONSULTER / CREER / MODIFIER,
 * ADMINISTRATION:ADMINISTRER for the owner activation, import with CREER on a
 * national (ALL) scope; never a new login code. Any other account: none.
 */
export function registryRights(
  role: Role | null | undefined,
  access?: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null,
): RegistryRights {
  if (role === 'PLATFORM_ADMIN') return ALL;
  if (role !== 'INSTITUTION' || !access) return NONE;
  const create = grantsAccess(access, 'REGISTRE', 'CREER');
  return {
    view: grantsAccess(access, 'REGISTRE', 'CONSULTER'),
    create,
    edit: grantsAccess(access, 'REGISTRE', 'MODIFIER'),
    activateOwner: grantsAccess(access, 'ADMINISTRATION', 'ADMINISTRER'),
    import: create && access.scopeKind === 'ALL',
    regenerateCode: false,
  };
}

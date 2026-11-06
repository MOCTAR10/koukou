import type { Role } from '../../api/client';

/** What the registry screens offer. The server stays the authority (scope, matrix). */
export interface RegistryRights {
  /** List and sheets (`GET /programme/farms`). */
  view: boolean;
  /** Create, edit, status, GPS, infrastructures. */
  edit: boolean;
  /** `activate-owner` (domain ADMINISTRATION on the server). */
  activateOwner: boolean;
  /** Bulk import: national scope only. */
  import: boolean;
  /** `POST /admin/users/:id/login-code`: platform admin only. */
  regenerateCode: boolean;
}

const NONE: RegistryRights = { view: false, edit: false, activateOwner: false, import: false, regenerateCode: false };
const ALL: RegistryRights = { view: true, edit: true, activateOwner: true, import: true, regenerateCode: true };

/**
 * Registry rights per account. PLATFORM_ADMIN has them all.
 *
 * TODO(W3): an INSTITUTION gets them from `GET /programme/access/me`
 * (REGISTRE: CONSULTER → view, CREER/MODIFIER → edit; ADMINISTRATION:
 * ADMINISTRER → activateOwner; scope ALL → import; never regenerateCode).
 * Until then the registry stays a platform admin screen.
 */
export function registryRights(role: Role | null | undefined): RegistryRights {
  return role === 'PLATFORM_ADMIN' ? ALL : NONE;
}

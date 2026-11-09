import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess, scopeReachesFarms } from '../../app/menu-access';

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
  /** `POST /programme/farms/:farmId/owner-login-code` (domain ADMINISTRATION:ADMINISTRER, like the activation). */
  regenerateCode: boolean;
  /**
   * POUFA lot A droits: the GPS point (`PUT …/gps`): REGISTRE:MODIFIER, or
   * TECHNIQUE:VALIDER (the agent technique checks the farm on site, « à
   * valider DGE »).
   */
  gps: boolean;
  /** POUFA lot A droits: the Market verification (`PUT …/verification`, REGISTRE:VALIDER). */
  verify: boolean;
  /** F13: team accounts of a farm (`GET …/team`, ADMINISTRATION:CONSULTER). */
  team: boolean;
  /** F13: suspend or restore a team member's farm access (`PUT …/team/:id/active`, ADMINISTRATION:ADMINISTRER). */
  suspendTeam: boolean;
}

const NONE: RegistryRights = { view: false, create: false, edit: false, activateOwner: false, import: false, regenerateCode: false, gps: false, verify: false, team: false, suspendTeam: false };
const ALL: RegistryRights = { view: true, create: true, edit: true, activateOwner: true, import: true, regenerateCode: true, gps: true, verify: true, team: true, suspendTeam: true };

/**
 * Registry rights per account, mirroring the server (`ProgramAccessGuard`,
 * `actionForMethod`: GET = CONSULTER, POST = CREER, PATCH / PUT = MODIFIER):
 * PLATFORM_ADMIN has them all; an INSTITUTION gets them from its access
 * profile (`GET /programme/access/me`): REGISTRE CONSULTER / CREER / MODIFIER,
 * ADMINISTRATION:ADMINISTRER for the owner activation and a new owner login
 * code (the server also needs every farm of that owner in scope), import with
 * CREER on a national (ALL) scope. Any other account: none.
 */
export function registryRights(
  role: Role | null | undefined,
  access?: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null,
): RegistryRights {
  if (role === 'PLATFORM_ADMIN') return ALL;
  if (role !== 'INSTITUTION' || !access) return NONE;
  const create = grantsAccess(access, 'REGISTRE', 'CREER');
  const administer = grantsAccess(access, 'ADMINISTRATION', 'ADMINISTRER');
  const edit = grantsAccess(access, 'REGISTRE', 'MODIFIER');
  return {
    // The server refuses the list to scopes that reach no farm (AGGREGATE, AUDIT,
    // FINANCED until the farmer consent exists): no dead menu entry.
    view: grantsAccess(access, 'REGISTRE', 'CONSULTER') && scopeReachesFarms(access.scopeKind),
    create,
    edit,
    activateOwner: administer,
    import: create && access.scopeKind === 'ALL',
    regenerateCode: administer,
    gps: edit || grantsAccess(access, 'TECHNIQUE', 'VALIDER'),
    verify: grantsAccess(access, 'REGISTRE', 'VALIDER'),
    team: grantsAccess(access, 'ADMINISTRATION', 'CONSULTER'),
    suspendTeam: administer,
  };
}

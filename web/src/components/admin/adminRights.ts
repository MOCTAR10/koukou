import type { Role } from '../../api/client';
import type { AccessAction, AccessDomain, AccessMatrix, MyAccess } from '../../api/types-access';
import { grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> & { code?: string };

/**
 * What the programme administration screens (parameters, lists, audit
 * journal, data recovery) offer, mirroring the server's guards. Pure; served
 * by `useMenuAccess().admin`. The server stays the authority: every refusal
 * still shows its French message.
 *
 * - Parameters (`programme.controller.ts`, domain PARAMETRES): read with
 *   CONSULTER; a new version needs MODIFIER **and** the owner right of the
 *   parameter's owner key, from the matrix (`ParametersService.set` →
 *   `mayChangeParameter`, `PARAMETER_OWNER_RIGHTS`; POUFA lot A2 vet).
 * - Lists, localités, boundaries: reads are reference data, writes need
 *   ADMINISTRATION:ADMINISTRER; inactive items and the list history
 *   (`?all=true`, `…/history`) go to the profiles that manage the lists
 *   (server `mayReadInactiveItems`): any ADMINISTRATION right or
 *   PARAMETRES:MODIFIER, and SANITAIRE:MODIFIER for the sanitary lists.
 * - Journal (`audit.controller.ts`, domain AUDIT): CONSULTER.
 * - Recovery (`data-import.controller.ts`, domain REGISTRE, national scope):
 *   GET CONSULTER, deposit / dry run / integrate CREER, settings / corrections
 *   / reject MODIFIER, validate VALIDER.
 */
export interface AdminRights {
  parameters: {
    view: boolean;
    /** MODIFIER on PARAMETRES; the owner right is checked per key (`mayPropose`). */
    write: boolean;
    /** The caller's matrix (institution), checked against the owner right. */
    matrix: AccessMatrix | null;
    /** Platform admin: any owner profile. */
    anyOwner: boolean;
  };
  lists: {
    /** The page opens (reads are reference data for every member). */
    view: boolean;
    write: boolean;
    /** `?all=true`: inactive items and localités, and the list history. */
    readInactive: boolean;
    /** Same for the sanitary lists the vets maintain (adds SANITAIRE:MODIFIER). */
    readInactiveSanitary: boolean;
  };
  audit: { view: boolean };
  recovery: {
    view: boolean;
    deposit: boolean;
    edit: boolean;
    validate: boolean;
    integrate: boolean;
    reject: boolean;
  };
}

const NONE: AdminRights = {
  parameters: { view: false, write: false, matrix: null, anyOwner: false },
  lists: { view: false, write: false, readInactive: false, readInactiveSanitary: false },
  audit: { view: false },
  recovery: { view: false, deposit: false, edit: false, validate: false, integrate: false, reject: false },
};

const ALL: AdminRights = {
  parameters: { view: true, write: true, matrix: null, anyOwner: true },
  lists: { view: true, write: true, readInactive: true, readInactiveSanitary: true },
  audit: { view: true },
  recovery: { view: true, deposit: true, edit: true, validate: true, integrate: true, reject: true },
};

export function adminRights(role: Role | null | undefined, access?: Profile | null): AdminRights {
  if (role === 'PLATFORM_ADMIN') return ALL;
  if (role !== 'INSTITUTION' || !access) return NONE;
  const g = (domain: Parameters<typeof grantsAccess>[1], action: Parameters<typeof grantsAccess>[2]) => grantsAccess(access, domain, action);
  const national = access.scopeKind === 'ALL';
  const registre = (action: Parameters<typeof grantsAccess>[2]) => national && g('REGISTRE', action);
  const parametersView = g('PARAMETRES', 'CONSULTER');
  const anyAdministration = (['CONSULTER', 'CREER', 'MODIFIER', 'VALIDER', 'ADMINISTRER'] as const).some((a) => g('ADMINISTRATION', a));
  const readInactive = anyAdministration || g('PARAMETRES', 'MODIFIER');
  return {
    parameters: {
      view: parametersView,
      write: g('PARAMETRES', 'MODIFIER'),
      matrix: access.matrix,
      anyOwner: false,
    },
    lists: {
      view: parametersView || g('ADMINISTRATION', 'CONSULTER'),
      write: g('ADMINISTRATION', 'ADMINISTRER'),
      readInactive,
      readInactiveSanitary: readInactive || g('SANITAIRE', 'MODIFIER'),
    },
    audit: { view: g('AUDIT', 'CONSULTER') },
    recovery: {
      view: registre('CONSULTER'),
      deposit: registre('CREER'),
      edit: registre('MODIFIER'),
      validate: registre('VALIDER'),
      integrate: registre('CREER'),
      reject: registre('MODIFIER'),
    },
  };
}

// POUFA lot A2 vet: mirror of the server's PARAMETER_OWNER_RIGHTS (access-rules.ts):
// the owner key of a parameter names a matrix right, never a profile code.
export interface OwnerRight {
  domain: AccessDomain;
  action: AccessAction;
  /** The platform admin reads but never changes these values. */
  closedToPlatform: boolean;
}

export const OWNER_RIGHTS: Readonly<Record<string, OwnerRight>> = {
  VETERINAIRE: { domain: 'SANITAIRE', action: 'MODIFIER', closedToPlatform: true },
  DGE: { domain: 'PARAMETRES', action: 'VALIDER', closedToPlatform: false },
  ADMIN: { domain: 'ADMINISTRATION', action: 'ADMINISTRER', closedToPlatform: false },
};

/** Owner keys the platform admin reads but never changes: the veterinary thresholds. */
export const OWNER_PROFILES_CLOSED_TO_PLATFORM: readonly string[] = Object.keys(OWNER_RIGHTS).filter((k) => OWNER_RIGHTS[k]!.closedToPlatform);

const DOMAIN_NAMES: Partial<Record<AccessDomain, string>> = { SANITAIRE: 'Sanitaire', PARAMETRES: 'Paramètres', ADMINISTRATION: 'Administration' };
const ACTION_NAMES: Record<AccessAction, string> = { CONSULTER: 'Consulter', CREER: 'Créer', MODIFIER: 'Modifier', VALIDER: 'Valider', ADMINISTRER: 'Administrer' };

/** « Sanitaire : Modifier », the right that owns a key; null for an unknown key. */
export function ownerRightLabel(ownerProfile: string): string | null {
  const right = OWNER_RIGHTS[ownerProfile];
  return right ? `${DOMAIN_NAMES[right.domain] ?? right.domain} : ${ACTION_NAMES[right.action]}` : null;
}

/** Whether the caller may record a new version of a parameter owned by `ownerProfile` (server `mayChangeParameter`). */
export function mayPropose(rights: AdminRights['parameters'], ownerProfile: string): boolean {
  if (!rights.write) return false;
  const right = OWNER_RIGHTS[ownerProfile];
  if (rights.anyOwner) return !right?.closedToPlatform;
  if (!right || !rights.matrix) return false;
  return grantsAccess({ matrix: rights.matrix, scopeKind: 'ALL' }, right.domain, right.action);
}

/** Whether a programme administration entry shows at all. */
export function showsAdminArea(rights: AdminRights): boolean {
  return rights.parameters.view || rights.lists.view || rights.audit.view || rights.recovery.view;
}

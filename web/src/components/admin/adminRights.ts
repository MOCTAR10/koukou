import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> & { code?: string };

/**
 * What the programme administration screens (parameters, lists, audit
 * journal, data recovery) offer, mirroring the server's guards. Pure; served
 * by `useMenuAccess().admin`. The server stays the authority: every refusal
 * still shows its French message.
 *
 * - Parameters (`programme.controller.ts`, domain PARAMETRES): read with
 *   CONSULTER; a new version needs MODIFIER **and** the parameter's owner
 *   profile (`ParametersService.set` → `mayChangeParameter`).
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
    /** MODIFIER on PARAMETRES; the owner profile is checked per key (`mayPropose`). */
    write: boolean;
    /** The caller's profile code (institution), matched to `ownerProfile`. */
    profileCode: string | null;
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
  parameters: { view: false, write: false, profileCode: null, anyOwner: false },
  lists: { view: false, write: false, readInactive: false, readInactiveSanitary: false },
  audit: { view: false },
  recovery: { view: false, deposit: false, edit: false, validate: false, integrate: false, reject: false },
};

const ALL: AdminRights = {
  parameters: { view: true, write: true, profileCode: null, anyOwner: true },
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
      profileCode: access.code ?? null,
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

/** Whether the caller may record a new version of a parameter owned by `ownerProfile` (server `mayChangeParameter`). */
export function mayPropose(rights: AdminRights['parameters'], ownerProfile: string): boolean {
  if (!rights.write) return false;
  return rights.anyOwner || (rights.profileCode !== null && rights.profileCode === ownerProfile);
}

/** Whether a programme administration entry shows at all. */
export function showsAdminArea(rights: AdminRights): boolean {
  return rights.parameters.view || rights.lists.view || rights.audit.view || rights.recovery.view;
}

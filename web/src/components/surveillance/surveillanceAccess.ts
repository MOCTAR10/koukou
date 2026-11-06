import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { canAdministerAccess, grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'code' | 'matrix' | 'scopeKind'>;

/**
 * Profile code of the veterinary services. The server's legal rule
 * (`sanitary-declaration.policy.ts` `mayHandleSanitaryDeclarations`, CDC §8)
 * is not a matrix setting: unpublished alerts, declarations, their photos and
 * the qualification circuit are the farm's and this profile's only, whatever
 * the matrix says. Mirrored here only to hide what the server would refuse.
 */
export const VET_PROFILE_CODE = 'VETERINAIRE';

export interface SurveillanceRights {
  /** The programme alerts page (`GET /surveillance/alerts`). */
  view: boolean;
  /** Sees unpublished alerts (the server filters the others out). */
  seesUnpublished: boolean;
  /** Moves an alert along the circuit (SANITAIRE:MODIFIER + veterinary services). */
  qualify: boolean;
  /** Publishes a confirmed alert (SANITAIRE:VALIDER + veterinary services). */
  publish: boolean;
  /** Sanitary lists SIGNE_CLINIQUE / PRODUIT_TRAITEMENT / STATUT_ALERTE (SANITAIRE:MODIFIER). */
  editLists: boolean;
  /** Reference vaccination calendars: create (CREER), edit (MODIFIER). */
  createCalendars: boolean;
  editCalendars: boolean;
  /** Any of the settings above: the settings page shows. */
  settings: boolean;
}

const NONE: SurveillanceRights = {
  view: false,
  seesUnpublished: false,
  qualify: false,
  publish: false,
  editLists: false,
  createCalendars: false,
  editCalendars: false,
  settings: false,
};

/** Rights from the matrix (`GET /programme/access/me`); the platform admin has them all. */
export function surveillanceRights(role: Role | null | undefined, profile: Profile | null | undefined): SurveillanceRights {
  if (role === 'PLATFORM_ADMIN') {
    return { view: true, seesUnpublished: true, qualify: true, publish: true, editLists: true, createCalendars: true, editCalendars: true, settings: true };
  }
  if (role !== 'INSTITUTION' || !profile) return NONE;
  const has = (action: Parameters<typeof grantsAccess>[2]) => grantsAccess(profile, 'SANITAIRE', action);
  const view = has('CONSULTER');
  if (!view) return NONE;
  const vet = profile.code === VET_PROFILE_CODE;
  const editLists = has('MODIFIER');
  const createCalendars = has('CREER');
  const editCalendars = has('MODIFIER');
  return {
    view,
    seesUnpublished: vet,
    qualify: vet && has('MODIFIER'),
    publish: vet && has('VALIDER'),
    editLists,
    createCalendars,
    editCalendars,
    settings: editLists || createCalendars || editCalendars,
  };
}

export interface NotificationRights {
  /** The bell and the inbox (domain SESSION). */
  inbox: boolean;
  /** Notification rules: read (ADMINISTRATION:CONSULTER), write (ADMINISTRER). */
  readRules: boolean;
  writeRules: boolean;
}

export function notificationRights(
  role: Role | null | undefined,
  profile: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null | undefined,
  revoked = false,
): NotificationRights {
  if (!role || role === 'ACHETEUR') return { inbox: false, readRules: false, writeRules: false };
  if (role === 'INSTITUTION' && revoked) return { inbox: false, readRules: false, writeRules: false };
  return {
    inbox: true,
    readRules: canAdministerAccess(role, profile, 'CONSULTER'),
    writeRules: canAdministerAccess(role, profile, 'ADMINISTRER'),
  };
}

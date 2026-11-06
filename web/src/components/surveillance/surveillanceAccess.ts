import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { canAdministerAccess, grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'code' | 'matrix' | 'scopeKind'>;

/**
 * POUFA lot A2 vet: the veterinary authority is a matrix right, never a
 * profile code (server `sanitary-declaration.policy.ts`
 * `isVeterinaryAuthority`): SANITAIRE:VALIDER receives the declarations, sees
 * the unpublished alerts and validates the declarations; any profile the
 * administration grants it acts as the veterinary services. Mirrored here
 * only to hide what the server would refuse.
 */
export function isVeterinaryAuthority(profile: Pick<Profile, 'matrix' | 'scopeKind'> | null | undefined): boolean {
  return !!profile && grantsAccess(profile, 'SANITAIRE', 'VALIDER');
}

export interface SurveillanceRights {
  /** The programme alerts page (`GET /surveillance/alerts`). */
  view: boolean;
  /** Sees unpublished alerts (the server filters the others out). */
  seesUnpublished: boolean;
  /** Moves an alert along the circuit (SANITAIRE:MODIFIER + veterinary authority SANITAIRE:VALIDER). */
  qualify: boolean;
  /** Publishes a confirmed alert (SANITAIRE:VALIDER, the veterinary authority). */
  publish: boolean;
  /** Sanitary lists SIGNE_CLINIQUE / PRODUIT_TRAITEMENT / STATUT_ALERTE (SANITAIRE:MODIFIER). */
  editLists: boolean;
  /** Reference vaccination calendars: create (CREER), edit (MODIFIER). */
  createCalendars: boolean;
  editCalendars: boolean;
  /** Any of the settings above, or reading them (platform admin): the settings page shows. */
  settings: boolean;
  /** POUFA lot A2 vet: the register of declarations (`GET /surveillance/declarations`). */
  declarations: boolean;
  /** Validates / rules out / converts a declaration without alert (SANITAIRE:VALIDER). */
  reviewDeclarations: boolean;
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
  declarations: false,
  reviewDeclarations: false,
};

/**
 * Rights from the matrix (`GET /programme/access/me`). The platform admin reads
 * every alert, declaration, list and calendar, but changes none and never
 * qualifies, publishes or validates: CDC n° 25-26 reserve these to the
 * veterinary authority (server `surveillance/veterinary-authority.ts`, POUFA
 * lot A sante, lot A2 vet).
 */
export function surveillanceRights(role: Role | null | undefined, profile: Profile | null | undefined): SurveillanceRights {
  if (role === 'PLATFORM_ADMIN') {
    return {
      view: true,
      seesUnpublished: true,
      qualify: false,
      publish: false,
      editLists: false,
      createCalendars: false,
      editCalendars: false,
      settings: true,
      declarations: true,
      reviewDeclarations: false,
    };
  }
  if (role !== 'INSTITUTION' || !profile) return NONE;
  const has = (action: Parameters<typeof grantsAccess>[2]) => grantsAccess(profile, 'SANITAIRE', action);
  const view = has('CONSULTER');
  if (!view) return NONE;
  const vet = isVeterinaryAuthority(profile);
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
    declarations: vet,
    reviewDeclarations: vet,
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

// POUFA lot A droits: institutional reads of the Fermia bonus screens.
//
// An institution reads a Fermia area of an in-scope farm when its access
// matrix grants the area's domain in CONSULTER. The server turns that grant
// into one farm permission code on `GET /farms/:farmId/me`
// (backend `access/permission-domains.ts`), so the screens test the code of
// the active farm: it already carries both the matrix and the farm scope.
// Those screens stay read-only for an institution (the bonus domains are
// granted in consultation only); the server stays the authority.
import type { AccessMatrix } from '@/api/poufa';
import type { UserRole } from '@/api/types';

import { matrixGrants, readsProgrammeDomain } from './access';

/** Fermia areas an institution may be granted (ECONOMIQUE = sales list, expenses, rentabilité). */
export type FermiaArea = 'VENTES' | 'MARCHE' | 'COMPTABILITE' | 'EQUIPE' | 'ECONOMIQUE';

/** Farm code the server derives from `<area>:CONSULTER` (mirror of PERMISSION_DOMAINS). */
export const FERMIA_READ_CODE: Readonly<Record<FermiaArea, string>> = {
  VENTES: 'caisse:lire',
  MARCHE: 'market:lire',
  COMPTABILITE: 'compta:lire',
  EQUIPE: 'rh:lire',
  ECONOMIQUE: 'compta:rapports',
};

/** Accounts that work on their own farm: their screens follow their permission codes. */
const FARM_ROLES: readonly UserRole[] = ['PROPRIETAIRE', 'ELEVEUR', 'PLATFORM_ADMIN'];

type HasCode = (code: string) => boolean;

/**
 * May the account load a Fermia area of the active farm? Farm accounts always
 * may (each screen keeps its own permission gates); an institution only with
 * the area's read code; anyone else never.
 */
export function readsFermiaArea(role: UserRole | undefined, area: FermiaArea, has: HasCode): boolean {
  if (role && FARM_ROLES.includes(role)) return true;
  if (role === 'INSTITUTION') return has(FERMIA_READ_CODE[area]);
  return false;
}

/** An institution reads the Fermia screens in consultation only (« Consultation seule »). */
export function fermiaReadOnly(role: UserRole | undefined): boolean {
  return role === 'INSTITUTION';
}

/** A write on a Fermia screen: the permission, never for an institution. */
export function fermiaWrites(role: UserRole | undefined, allowed: boolean): boolean {
  return allowed && !fermiaReadOnly(role);
}

/**
 * `GET /programme/economie/synthese`: the platform admin, or an institution
 * whose matrix grants ECONOMIQUE:CONSULTER (the DGE by default).
 */
export function readsEconomieSynthesis(role: UserRole | undefined, matrix: AccessMatrix | null | undefined): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  if (role === 'INSTITUTION') return matrixGrants(matrix, 'ECONOMIQUE', 'CONSULTER');
  return false;
}

/**
 * POUFA lot A2 dge: bonus screens filed under a programme domain (stock FEFO
 * in INTRANTS, slaughter in TRACABILITE, care calendars in SANITAIRE). An
 * institution opens them, read-only, when its matrix grants the domain in
 * CONSULTER; the write buttons need farm codes it never holds there.
 */
export type ProgrammeBonusArea = 'INTRANTS' | 'TRACABILITE' | 'SANITAIRE';

/** A menu tile: permission codes for farm accounts, a Fermia area for institutions. */
export interface MenuGate {
  perms?: readonly string[];
  /** Set on Fermia tiles: an institution sees it with the area's read code (and its perms are ignored). */
  fermiaArea?: FermiaArea;
  /** Set on programme bonus tiles: an institution sees it with `<area>:CONSULTER` (its perms are ignored). */
  programmeArea?: ProgrammeBonusArea;
}

export function menuItemVisible(
  role: UserRole | undefined,
  item: MenuGate,
  has: HasCode,
  matrix?: AccessMatrix | null,
): boolean {
  if (item.programmeArea && role === 'INSTITUTION') return readsProgrammeDomain(role, matrix, item.programmeArea);
  if (item.fermiaArea && !readsFermiaArea(role, item.fermiaArea, has)) return false;
  if (item.fermiaArea && role === 'INSTITUTION') return true;
  return !item.perms || item.perms.some((code) => has(code));
}

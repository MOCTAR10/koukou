import type { Role } from '../../api/client';
import type { MyAccess } from '../../api/types-access';
import { grantsAccess } from '../../app/menu-access';

type Profile = Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>;

export const INTRANTS_PATH = '/app/intrants';
export const FARM_DELIVERIES_PATH = '/app/livraisons';
export const TRACE_PATH = '/app/tracabilite';
export const OPERATORS_PATH = '/app/tracabilite/operateurs';

/** What the traceability screens offer. The server stays the authority. */
export interface TraceRights {
  /** `GET /trace/lots/by-code/:code` (TRACABILITE:CONSULTER; farm accounts reach their own farms). */
  searchByCode: boolean;
  /** `GET /farms/:farmId/trace/lots` of the active farm (TRACABILITE). */
  farmLots: boolean;
  /** `GET /trace/operators?all=true`: inactive operators (platform admin, ADMINISTRATION or TRACABILITE). */
  readInactiveOperators: boolean;
  /** `POST /trace/operators`: ADMINISTRATION:CREER on a national (ALL) scope. */
  createOperator: boolean;
  /** `PATCH /trace/operators/:id` (deactivation included): ADMINISTRATION:MODIFIER on an ALL scope. */
  editOperator: boolean;
}

const NONE: TraceRights = { searchByCode: false, farmLots: false, readInactiveOperators: false, createOperator: false, editOperator: false };

/**
 * Mirrors `trace.controller.ts` / `operators.service.ts`: the platform admin
 * has everything; a farm account reads its lots and the active operators; an
 * institution follows its matrix (operators are a national registry: writes
 * need an ALL scope, `assertNational`).
 */
export function traceRights(role: Role | null | undefined, access: Profile | null | undefined): TraceRights {
  if (role === 'PLATFORM_ADMIN') return { searchByCode: true, farmLots: true, readInactiveOperators: true, createOperator: true, editOperator: true };
  if (role === 'PROPRIETAIRE' || role === 'ELEVEUR') return { ...NONE, searchByCode: true, farmLots: true };
  if (role !== 'INSTITUTION' || !access) return NONE;
  const trace = grantsAccess(access, 'TRACABILITE', 'CONSULTER');
  const national = access.scopeKind === 'ALL';
  const anyOf = (domain: 'ADMINISTRATION' | 'TRACABILITE') => ((access.matrix[domain] ?? []).length > 0 && access.scopeKind !== 'AUDIT');
  return {
    searchByCode: trace,
    farmLots: trace,
    readInactiveOperators: anyOf('ADMINISTRATION') || anyOf('TRACABILITE'),
    createOperator: national && grantsAccess(access, 'ADMINISTRATION', 'CREER'),
    editOperator: national && grantsAccess(access, 'ADMINISTRATION', 'MODIFIER'),
  };
}

export interface ProgrammeEntry {
  to: string;
  label: string;
  kind: 'intrants' | 'tracabilite';
}

/**
 * Programme-menu entries of this area (Shell, « Programme » / « Plateforme »
 * group): the platform admin sees both; an institution sees the ones its
 * menu table opens (`INSTITUTION_MENU`, through `showEntry`); a farm account
 * none (its entries sit in the farm groups).
 */
export function programmeEntries(role: Role | null | undefined, showEntry: (to: string) => boolean): ProgrammeEntry[] {
  if (role !== 'PLATFORM_ADMIN' && role !== 'INSTITUTION') return [];
  const all: ProgrammeEntry[] = [
    { to: INTRANTS_PATH, label: 'Intrants', kind: 'intrants' },
    { to: TRACE_PATH, label: 'Traçabilité', kind: 'tracabilite' },
  ];
  return role === 'PLATFORM_ADMIN' ? all : all.filter((e) => showEntry(e.to));
}

/** Programme-wide pages of this area (no farm picker, no quick actions). */
export function isProgrammeWidePath(pathname: string): boolean {
  return pathname.startsWith(INTRANTS_PATH) || pathname.startsWith(OPERATORS_PATH) || pathname.startsWith('/app/tracabilite/recherche');
}

export const TRACE_SEARCH_PATH = '/app/tracabilite/recherche';

export type TraceTab = 'lots' | 'recherche' | 'operateurs';

/** Tabs of the « Traçabilité » page the caller may open, in display order. */
export function traceTabs(rights: TraceRights, hasFarm: boolean): TraceTab[] {
  const out: TraceTab[] = [];
  if (rights.farmLots && hasFarm) out.push('lots');
  if (rights.searchByCode) out.push('recherche');
  // The registry is read by every account that reaches the page (active operators).
  out.push('operateurs');
  return out;
}

/** The tab a path asks for, or the first allowed one when it is not open to the caller. */
export function traceTabOf(pathname: string, allowed: readonly TraceTab[]): TraceTab {
  const asked: TraceTab = pathname.startsWith(OPERATORS_PATH) ? 'operateurs' : pathname.startsWith(TRACE_SEARCH_PATH) ? 'recherche' : 'lots';
  return allowed.includes(asked) ? asked : (allowed[0] ?? 'operateurs');
}

export const TRACE_TAB_PATH: Record<TraceTab, string> = {
  lots: TRACE_PATH,
  recherche: TRACE_SEARCH_PATH,
  operateurs: OPERATORS_PATH,
};

/** Header line of a programme-wide page of this area (Shell), or null. */
export function programmeWideLabel(pathname: string): string | null {
  if (pathname.startsWith(INTRANTS_PATH)) return 'Intrants livrés aux fermes du programme';
  if (pathname.startsWith(OPERATORS_PATH)) return 'Registre des opérateurs du programme';
  if (pathname.startsWith(TRACE_SEARCH_PATH)) return 'Traçabilité des lots du programme';
  return null;
}

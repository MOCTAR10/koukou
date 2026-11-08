import { FERMIA_GRANTABLE_DOMAINS, type AccessAction, type AccessDomain, type AccessMatrix, type MyAccess, type ScopeKind } from '../api/types-access';

/**
 * Menu of an INSTITUTION account (POUFA): which pages its access profile
 * opens. Pure; `useMenuAccess.ts` applies it, the tests pin it.
 *
 * One explicit table, derived from the backend `@Domain` of the routes each
 * page reads (`ProgramAccessGuard`: GET = CONSULTER). A page shows when the
 * profile grants one of its rules; the server stays the authority for every
 * call (and for the writes, through the farm permissions it maps from the
 * matrix, `access/permission-domains.ts`).
 *
 * | Page                    | Rule                     | Routes the page reads (backend domain)                    |
 * |-------------------------|--------------------------|-----------------------------------------------------------|
 * | /app/dashboard          | TECHNIQUE:CONSULTER      | farms/:id/dashboard, batches, advisory (TECHNIQUE)        |
 * | /app/alerts             | TECHNIQUE:CONSULTER      | farms/:id/alerts, advisory (TECHNIQUE)                    |
 * | /app/tasks              | TECHNIQUE:CONSULTER      | farms/:id/tasks, batches (TECHNIQUE)                      |
 * | /app/batches            | TECHNIQUE:CONSULTER      | farms/:id/batches, bandes, daily-entries (TECHNIQUE)      |
 * | /app/activities         | TECHNIQUE:CONSULTER      | farms/:id/dashboard, tasks, advisory (TECHNIQUE)          |
 * | /app/sanitary           | SANITAIRE:CONSULTER      | farms/:id/batches/:b/health…, vaccine schedules (SANITAIRE)|
 * | /app/stock              | INTRANTS:CONSULTER       | farms/:id/feed-stock, feed-products (INTRANTS)            |
 * | /app/slaughter          | TRACABILITE:CONSULTER    | farms/:id/slaughter-orders (TRACABILITE)                  |
 * | /app/reports            | ECONOMIQUE:CONSULTER     | farms/:id/rentabilite, sales (ECONOMIQUE)                 |
 * | /app/expenses           | ECONOMIQUE:CONSULTER     | farms/:id/expenses (ECONOMIQUE)                           |
 * | /app/registre           | REGISTRE:CONSULTER       | programme/farms (REGISTRE)                                |
 * | /app/acces              | ADMINISTRATION:CONSULTER | programme/access/{catalog,profiles,memberships}           |
 * | /app/pilotage           | PILOTAGE:CONSULTER       | pilotage/dashboard, map, objective, exports, reports      |
 * | /app/parametres         | PARAMETRES or ADMINISTRATION:CONSULTER | programme/parameters (PARAMETRES), lists (REFERENCE) |
 * | /app/audit              | AUDIT:CONSULTER          | audit/events, row-changes, seals (AUDIT)                  |
 * | /app/reprise            | REGISTRE:CONSULTER       | programme/imports (REGISTRE, national scope)              |
 * | /app/intrants           | INTRANTS:CONSULTER       | programme/input-deliveries (INTRANTS)                     |
 * | /app/livraisons         | INTRANTS:CONSULTER       | farms/:id/input-deliveries, declarative-stock (INTRANTS)  |
 * | /app/tracabilite…       | TRACABILITE or ADMINISTRATION:CONSULTER | trace/lots (TRACABILITE), trace/operators (REFERENCE) |
 * | /app/visites           | TECHNIQUE or SANITAIRE:CONSULTER | farms/:id/visits, visits/grid, programme/visits (TECHNIQUE; SANITAIRE alternative) |
 * | /app/mon-acces, /app/help | always                 | programme/access/me (SESSION), none                       |
 * | /app/surveillance(/…)   | SANITAIRE:CONSULTER      | surveillance/alerts, lists, calendars (SANITAIRE)         |
 * | /app/notifications      | always                   | notifications (SESSION: the account's own inbox)          |
 * | /app/notifications/regles | ADMINISTRATION:CONSULTER | programme/notification-rules (ADMINISTRATION)           |
 * | /app/finance…, orders, points-of-sale | VENTES:CONSULTER | sales list, caisse, customers, orders, POS (VENTES; sales ECONOMIQUE) |
 * | /app/market             | MARCHE:CONSULTER         | farms/:id/market listings and orders (MARCHE)             |
 * | /app/accounting         | COMPTABILITE:CONSULTER   | farms/:id/accounting (COMPTABILITE)                       |
 * | /app/team, /app/hr      | EQUIPE:CONSULTER         | farms/:id/eleveurs, team (EQUIPE)                         |
 * | /app/economie           | ECONOMIQUE:CONSULTER     | programme/economie/synthese (ECONOMIQUE, programme-wide)  |
 * | /app/settings           | never                    | farm account settings, COMPTE (Fermia-only)               |
 * | /app/platform           | never                    | admin/* PLATEFORME (Fermia-only)                          |
 * | /app/home, parcels, harvests | never               | ground éleveur home; CULTURES (hidden)                    |
 *
 * A page missing from the table stays out of the menu (default deny, like the
 * server); a typed URL missing from it still opens (the server answers).
 *
 * POUFA lot A droits: the Fermia modules (VENTES, MARCHE, COMPTABILITE,
 * EQUIPE) open to an institution in consultation only, when the admin grants
 * them (the DGE by default). The pages stay read-only: an institution never
 * holds their write codes (`access/permission-domains.ts`).
 */

export type MenuRule =
  | { kind: 'always' }
  | { kind: 'never'; why: string }
  | {
      kind: 'grant';
      any: ReadonlyArray<readonly [AccessDomain, AccessAction]>;
      /** The page also needs a scope that reaches farms (ALL, PROVINCES, FARMS), like the server. */
      farms?: boolean;
      /** The page needs the national scope (ALL), like the server's data recovery routes. */
      national?: boolean;
    };

const consult = (domain: AccessDomain): MenuRule => ({ kind: 'grant', any: [[domain, 'CONSULTER']] });
const fermia = (why: string): MenuRule => ({ kind: 'never', why });

export const INSTITUTION_MENU: Readonly<Record<string, MenuRule>> = {
  '/app/dashboard': consult('TECHNIQUE'),
  '/app/alerts': consult('TECHNIQUE'),
  '/app/tasks': consult('TECHNIQUE'),
  '/app/batches': consult('TECHNIQUE'),
  '/app/activities': consult('TECHNIQUE'),
  '/app/sanitary': consult('SANITAIRE'),
  '/app/stock': consult('INTRANTS'),
  '/app/slaughter': consult('TRACABILITE'),
  '/app/reports': consult('ECONOMIQUE'),
  '/app/expenses': consult('ECONOMIQUE'),
  // The server refuses the list to scopes that reach no farm (AGGREGATE,
  // and FINANCED until the farmer consent exists): no dead entry.
  '/app/registre': { kind: 'grant', any: [['REGISTRE', 'CONSULTER']], farms: true },
  '/app/acces': consult('ADMINISTRATION'),
  '/app/pilotage': consult('PILOTAGE'),
  // POUFA L5 (begin): sanitary surveillance and notifications.
  '/app/surveillance': consult('SANITAIRE'),
  '/app/notifications': { kind: 'always' },
  '/app/notifications/regles': consult('ADMINISTRATION'),
  // POUFA L5 (end)
  // --- Programme administration (parameters, audit journal, data recovery) ---
  '/app/parametres': {
    kind: 'grant',
    any: [
      ['PARAMETRES', 'CONSULTER'],
      ['ADMINISTRATION', 'CONSULTER'],
    ],
  },
  '/app/audit': consult('AUDIT'),
  '/app/reprise': { kind: 'grant', any: [['REGISTRE', 'CONSULTER']], national: true },
  // --- end programme administration ---
  // POUFA W6: programme inputs, the farm deliveries, traceability (lots, code lookup, operators registry).
  '/app/intrants': consult('INTRANTS'),
  '/app/livraisons': consult('INTRANTS'),
  // POUFA visites: TECHNIQUE:CONSULTER (DGE, agent technique) or SANITAIRE:CONSULTER (veterinary services).
  '/app/visites': { kind: 'grant', any: [['TECHNIQUE', 'CONSULTER'], ['SANITAIRE', 'CONSULTER']] },
  '/app/tracabilite': { kind: 'grant', any: [['TRACABILITE', 'CONSULTER'], ['ADMINISTRATION', 'CONSULTER']] },
  '/app/mon-acces': { kind: 'always' },
  '/app/help': { kind: 'always' },
  // POUFA lot A droits: Fermia modules, consultation only, granted through the matrix.
  '/app/finance': consult('VENTES'),
  '/app/orders': consult('VENTES'),
  '/app/market': consult('MARCHE'),
  '/app/points-of-sale': consult('VENTES'),
  '/app/accounting': consult('COMPTABILITE'),
  '/app/team': consult('EQUIPE'),
  '/app/hr': consult('EQUIPE'),
  // The server returns nothing outside a farm scope (BCEG FINANCED, MAEDR AGGREGATE…): no entry there.
  '/app/economie': { kind: 'grant', any: [['ECONOMIQUE', 'CONSULTER']], farms: true },
  // POUFA lot A droits (end)
  '/app/settings': fermia('COMPTE'),
  '/app/platform': fermia('PLATEFORME'),
  '/app/home': fermia('ground éleveur'),
  '/app/parcels': fermia('CULTURES'),
  '/app/harvests': fermia('CULTURES'),
};

/**
 * Where an institution lands, in this order, when its scope reaches farms;
 * otherwise (aggregate, audit, financed scopes, or no farm yet) its access
 * page. Only pages that exist as routes: a missing one would loop on `/app`.
 */
export const INSTITUTION_LANDING_ORDER = [
  '/app/dashboard',
  '/app/sanitary',
  '/app/batches',
  '/app/stock',
  '/app/slaughter',
  '/app/reports',
] as const;

export const MY_ACCESS_PATH = '/app/mon-acces';
export const ACCESS_ADMIN_PATH = '/app/acces';
export const PILOTAGE_PATH = '/app/pilotage';
/** The audit journal: the landing of a profile granted AUDIT whose scope reaches no farm (ANINF). */
export const AUDIT_PATH = '/app/audit';

/** The table key of a path: the entry itself or the closest parent entry. */
export function menuRuleFor(pathname: string): MenuRule | null {
  let path = pathname.split(/[?#]/)[0]?.replace(/\/+$/, '') ?? '';
  while (path.startsWith('/app/')) {
    const rule = INSTITUTION_MENU[path];
    if (rule) return rule;
    path = path.slice(0, path.lastIndexOf('/'));
  }
  return null;
}

/** Same as the server's `grants`, with its AUDIT-scope rule (the journal only). */
export function grantsAccess(access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>, domain: AccessDomain, action: AccessAction): boolean {
  if (access.scopeKind === 'AUDIT' && domain !== 'AUDIT') return false;
  const actions = (access.matrix as AccessMatrix)[domain];
  return Array.isArray(actions) && actions.includes(action);
}

function ruleAllows(rule: MenuRule, access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>): boolean {
  if (rule.kind === 'always') return true;
  if (rule.kind === 'never') return false;
  if (rule.farms && !scopeReachesFarms(access.scopeKind)) return false;
  if (rule.national && access.scopeKind !== 'ALL') return false;
  return rule.any.some(([d, a]) => grantsAccess(access, d, a));
}

/**
 * Fermia-only domains never granted to an institution (refused by the
 * server's `validateMatrix`). POUFA lot A droits: VENTES, MARCHE, COMPTABILITE
 * and EQUIPE left this list: they are grantable in consultation
 * (`FERMIA_GRANTABLE_DOMAINS`, part of `AccessDomain`).
 */
export const FERMIA_DOMAINS = ['CULTURES', 'COMPTE', 'PLATEFORME'] as const;
export type FermiaDomain = (typeof FERMIA_DOMAINS)[number];
/** Fermia modules an institution may read when granted (`api/types-access.ts`). */
export const FERMIA_READ_DOMAINS = FERMIA_GRANTABLE_DOMAINS;
/** The backend `@Domain` of a route a page reads. */
export type ReadDomain = AccessDomain | FermiaDomain;

/**
 * Whether an institution's GET on a route of `domain` passes the server's
 * `ProgramAccessGuard` (« Consulter » on that domain). A page an institution
 * opens gates with this every read outside its own domain (the dashboard's
 * slaughter orders, the tasks' team…), so it renders without them instead of
 * collecting 403s. Never-grantable Fermia domains: never. Unreadable access
 * (offline, never loaded): programme domains are left to the server (cached
 * answers); the Fermia modules stay closed until the access is known.
 */
export function institutionReads(access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null, domain: ReadDomain): boolean {
  if ((FERMIA_DOMAINS as readonly string[]).includes(domain)) return false;
  if (!access) return !(FERMIA_READ_DOMAINS as readonly string[]).includes(domain);
  return grantsAccess(access, domain as AccessDomain, 'CONSULTER');
}

/** Whether the institution's menu shows the entry (unknown entry: hidden). */
export function institutionShowsEntry(to: string, access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>): boolean {
  const rule = menuRuleFor(to);
  return rule ? ruleAllows(rule, access) : false;
}

/** Whether a typed URL opens (unknown path: yes, the server decides). */
export function institutionOpensPath(pathname: string, access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'>): boolean {
  const rule = menuRuleFor(pathname);
  return rule ? ruleAllows(rule, access) : true;
}

/** Entries that never depend on the matrix and stay when the access can't be read. */
export function alwaysOpen(pathname: string): boolean {
  return menuRuleFor(pathname)?.kind === 'always';
}

/** Scope kinds that reach individual farms (server `scopeReachesFarms`). */
export function scopeReachesFarms(kind: ScopeKind): boolean {
  return kind === 'ALL' || kind === 'PROVINCES' || kind === 'FARMS';
}

/** The institution's landing page. */
export function institutionLanding(access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null, farmCount: number): string {
  if (!access) return MY_ACCESS_PATH;
  // The programme steering (KPIs and map) is the console's home when the profile opens it.
  if (institutionShowsEntry(PILOTAGE_PATH, access)) return PILOTAGE_PATH;
  if (scopeReachesFarms(access.scopeKind) && farmCount > 0) {
    const page = INSTITUTION_LANDING_ORDER.find((p) => institutionShowsEntry(p, access));
    if (page) return page;
  }
  if (institutionShowsEntry(AUDIT_PATH, access)) return AUDIT_PATH;
  if (institutionShowsEntry(ACCESS_ADMIN_PATH, access)) return ACCESS_ADMIN_PATH;
  return MY_ACCESS_PATH;
}

/** Who administers the institutional access: the platform admin, or a profile granted ADMINISTRATION. */
export function canAdministerAccess(
  role: string | null | undefined,
  access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null | undefined,
  action: AccessAction = 'CONSULTER',
): boolean {
  if (role === 'PLATFORM_ADMIN') return true;
  return role === 'INSTITUTION' && !!access && grantsAccess(access, 'ADMINISTRATION', action);
}

/**
 * Pages of the app a granted domain opens (the reverse of the table), for the
 * account's own access screen.
 */
export function pagesOfDomain(domain: AccessDomain): string[] {
  return Object.entries(INSTITUTION_MENU)
    .filter(([, rule]) => rule.kind === 'grant' && rule.any.some(([d]) => d === domain))
    .map(([path]) => path);
}

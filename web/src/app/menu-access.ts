import type { AccessAction, AccessDomain, AccessMatrix, MyAccess, ScopeKind } from '../api/types-access';

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
 * | /app/intrants           | INTRANTS:CONSULTER       | programme/input-deliveries (INTRANTS)                     |
 * | /app/livraisons         | INTRANTS:CONSULTER       | farms/:id/input-deliveries, declarative-stock (INTRANTS)  |
 * | /app/tracabilite…       | TRACABILITE or ADMINISTRATION:CONSULTER | trace/lots (TRACABILITE), trace/operators (REFERENCE) |
 * | /app/mon-acces, /app/help | always                 | programme/access/me (SESSION), none                       |
 * | /app/finance…, orders, market, points-of-sale | never | VENTES, MARCHE (Fermia-only)                         |
 * | /app/accounting         | never                    | COMPTABILITE (Fermia-only)                                |
 * | /app/team, /app/hr      | never                    | EQUIPE (Fermia-only)                                      |
 * | /app/settings           | never                    | farm account settings, COMPTE (Fermia-only)               |
 * | /app/platform           | never                    | admin/* PLATEFORME (Fermia-only)                          |
 * | /app/home, parcels, harvests | never               | ground éleveur home; CULTURES (hidden)                    |
 *
 * A page missing from the table stays out of the menu (default deny, like the
 * server); a typed URL missing from it still opens (the server answers).
 */

export type MenuRule =
  | { kind: 'always' }
  | { kind: 'never'; why: string }
  | { kind: 'grant'; any: ReadonlyArray<readonly [AccessDomain, AccessAction]> };

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
  '/app/registre': consult('REGISTRE'),
  '/app/acces': consult('ADMINISTRATION'),
  // POUFA W6: programme inputs, the farm deliveries, traceability (lots, code lookup, operators registry).
  '/app/intrants': consult('INTRANTS'),
  '/app/livraisons': consult('INTRANTS'),
  '/app/tracabilite': { kind: 'grant', any: [['TRACABILITE', 'CONSULTER'], ['ADMINISTRATION', 'CONSULTER']] },
  '/app/mon-acces': { kind: 'always' },
  '/app/help': { kind: 'always' },
  '/app/finance': fermia('VENTES'),
  '/app/orders': fermia('VENTES'),
  '/app/market': fermia('MARCHE'),
  '/app/points-of-sale': fermia('VENTES'),
  '/app/accounting': fermia('COMPTABILITE'),
  '/app/team': fermia('EQUIPE'),
  '/app/hr': fermia('EQUIPE'),
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
  return rule.any.some(([d, a]) => grantsAccess(access, d, a));
}

/**
 * Fermia-only domains (backend `access-domains.ts` `FERMIA_DOMAINS`): refused
 * by `validateMatrix`, so never granted to an institution.
 */
export const FERMIA_DOMAINS = ['VENTES', 'MARCHE', 'COMPTABILITE', 'EQUIPE', 'CULTURES', 'COMPTE', 'PLATEFORME'] as const;
export type FermiaDomain = (typeof FERMIA_DOMAINS)[number];
/** The backend `@Domain` of a route a page reads. */
export type ReadDomain = AccessDomain | FermiaDomain;

/**
 * Whether an institution's GET on a route of `domain` passes the server's
 * `ProgramAccessGuard` (« Consulter » on that domain). A page an institution
 * opens gates with this every read outside its own domain (the dashboard's
 * slaughter orders, the tasks' team…), so it renders without them instead of
 * collecting 403s. Fermia-only domains: never. Unreadable access (offline,
 * never loaded): programme domains are left to the server (cached answers).
 */
export function institutionReads(access: Pick<MyAccess['profile'], 'matrix' | 'scopeKind'> | null, domain: ReadDomain): boolean {
  if ((FERMIA_DOMAINS as readonly string[]).includes(domain)) return false;
  if (!access) return true;
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
  if (scopeReachesFarms(access.scopeKind) && farmCount > 0) {
    const page = INSTITUTION_LANDING_ORDER.find((p) => institutionShowsEntry(p, access));
    if (page) return page;
  }
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

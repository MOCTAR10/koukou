// Loads the main pages' data in the background while online, so a page never
// opened on this device still works offline. Paths must match the pages' exactly:
// the read cache is keyed by path.
import { api, getStoredUser } from '../api/client';
import type { ReadDomain } from '../app/menu-access';
import { isOnline } from './connectivity';

/** Slow on purpose: the server allows 120 requests a minute per IP, offices share one. */
const PACE_MS = 800;
// About 100 requests a pass: hourly keeps it cheap on a metered connection.
const EVERY_MS = 60 * 60 * 1000;
const MAX_LOTS = 15;
const MAX_OPEN_ORDERS = 15;

interface WarmLot {
  id: string;
  status: string;
  breedId?: string | null;
  species: string;
  type: string;
}

interface WarmProtocol {
  id: string;
  species: string;
  type: string;
  isDefault?: boolean;
}

function localDay(daysBack = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysBack);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The sales pages count their days in UTC (todayIso), unlike the dashboard. */
function utcDay(daysBack = 0): string {
  return new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Whether the account reads a backend domain (`useMenuAccess().canRead`): an institution skips what would answer 403. */
export type CanRead = (domain: ReadDomain) => boolean;

/** Each path with the backend `@Domain` of its route. */
function farmPaths(farmId: string): Array<[ReadDomain, string]> {
  const f = `/farms/${farmId}`;
  const farmQuery = `farmId=${encodeURIComponent(farmId)}`;
  return [
    ['REGISTRE', `${f}/me`],
    ['TECHNIQUE', `${f}/dashboard?date=${localDay()}`],
    ['TECHNIQUE', `${f}/dashboard`],
    ['ECONOMIQUE', `${f}/rentabilite/overview?from=${localDay(29)}&to=${localDay()}`],
    ['TECHNIQUE', `${f}/advisory/next-actions`],
    ['TECHNIQUE', `${f}/alerts?status=ACTIVE`],
    ['TECHNIQUE', `${f}/alerts/history`],
    ['ECONOMIQUE', `${f}/sales?from=${utcDay()}&to=${utcDay()}`],
    ['ECONOMIQUE', `${f}/sales?from=${utcDay(30)}`],
    ['ECONOMIQUE', `${f}/sales?from=${utcDay(29)}&to=${utcDay()}`],
    ['ECONOMIQUE', `${f}/expenses`],
    ['EQUIPE', `${f}/team`],
    ['EQUIPE', `${f}/eleveurs`],
    ['TECHNIQUE', `/breeds?${farmQuery}`],
    ['CULTURES', `/cultures?${farmQuery}`],
    ['REGISTRE', `${f}/buildings`],
    ['INTRANTS', `${f}/feed-stock`],
    ['INTRANTS', `${f}/feed-stock/movements`],
    ['INTRANTS', `${f}/feed-products`],
    ['INTRANTS', `${f}/inputs`],
    ['VENTES', `${f}/customers`],
    ['VENTES', `${f}/customers/summary`],
    ['VENTES', `${f}/caisse/current`],
    ['VENTES', `${f}/caisse/sessions`],
    ['VENTES', `${f}/points-of-sale`],
    ['VENTES', `${f}/stock-transfers`],
    ['VENTES', `${f}/promotions`],
    ['TRACABILITE', `${f}/slaughter-orders`],
    ['TECHNIQUE', `${f}/tasks`],
    ['TECHNIQUE', `/reference-constants`],
    // POUFA lot A sante: the products the treatment form picks from offline.
    ['SANITAIRE', `/programme/lists/PRODUIT_TRAITEMENT`],
  ];
}

function lotPaths(farmId: string, lotId: string): Array<[ReadDomain, string]> {
  const b = `/farms/${farmId}/batches/${lotId}`;
  return [
    ['TECHNIQUE', `${b}/daily-entries`],
    ['SANITAIRE', `${b}/prophylaxis`],
    ['SANITAIRE', `${b}/health-events`],
    ['SANITAIRE', `${b}/treatments`],
  ];
}

/** The paths of the domains the account reads. */
function readablePaths(paths: Array<[ReadDomain, string]>, canRead: CanRead): string[] {
  return paths.filter(([domain]) => canRead(domain)).map(([, path]) => path);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;

async function fetchAll(paths: string[]): Promise<void> {
  for (const path of paths) {
    if (!isOnline()) return;
    // A 403 only means this role doesn't read it.
    await api.get(path).catch(() => undefined);
    await pause(PACE_MS);
  }
}

/** The default care program of each kind of lot, the one the lot forms show. */
async function fetchProtocols(farmId: string, lots: WarmLot[], canRead: CanRead): Promise<void> {
  if (!canRead('SANITAIRE')) return;
  const farmQuery = `farmId=${encodeURIComponent(farmId)}`;
  // POULET/CHAIR: what the lot creation form starts on.
  const kinds = new Map([['POULET|CHAIR', { species: 'POULET', type: 'CHAIR' }]]);
  for (const l of lots) kinds.set(`${l.species}|${l.type}`, { species: l.species, type: l.type });
  for (const { species, type } of kinds.values()) {
    if (!isOnline()) return;
    const list = await api
      .get<WarmProtocol[]>(`/sanitary/protocols?${farmQuery}&species=${species}&type=${type}`)
      .catch(() => [] as WarmProtocol[]);
    await pause(PACE_MS);
    const same = list.filter((p) => p.species === species && p.type === type);
    const chosen = same.find((p) => p.isDefault) ?? same[0];
    if (chosen) await fetchAll([`/sanitary/protocols/${chosen.id}?${farmQuery}`]);
  }
}

export async function warmOfflineCache(farmId: string, canRead: CanRead = () => true): Promise<void> {
  const stampKey = `koukou.offline.warmed.${getStoredUser()?.id}.${farmId}`;
  const last = Number(localStorage.getItem(stampKey) ?? 0);
  if (running || !isOnline() || Date.now() - last < EVERY_MS) return;
  running = true;
  try {
    const lots = canRead('TECHNIQUE') ? await api.get<WarmLot[]>(`/farms/${farmId}/batches`).catch(() => [] as WarmLot[]) : [];
    const orders = canRead('VENTES')
      ? await api.get<Array<{ id: string; status: string }>>(`/farms/${farmId}/orders`).catch(() => [] as Array<{ id: string; status: string }>)
      : [];
    await fetchAll(readablePaths(farmPaths(farmId), canRead));
    const active = lots.filter((l) => l.status !== 'CLOTURE').slice(0, MAX_LOTS);
    await fetchAll(readablePaths(active.flatMap((l) => lotPaths(farmId, l.id)), canRead));
    // The daily entry form reads its lot's breed curve (TECHNIQUE, like the lots).
    const breedIds = [...new Set(active.flatMap((l) => (l.breedId ? [l.breedId] : [])))];
    await fetchAll(breedIds.map((id) => `/breeds/${id}/standards?farmId=${encodeURIComponent(farmId)}`));
    // An order can only be paid, delivered or cancelled from its own window.
    const open = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').slice(0, MAX_OPEN_ORDERS);
    await fetchAll(open.map((o) => `/farms/${farmId}/orders/${o.id}`));
    await fetchProtocols(farmId, active, canRead);
    if (isOnline()) localStorage.setItem(stampKey, String(Date.now()));
  } finally {
    running = false;
  }
}

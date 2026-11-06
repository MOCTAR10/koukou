// Loads the main pages' data in the background while online, so a page never
// opened on this device still works offline. Paths must match the pages' exactly:
// the read cache is keyed by path.
import { api, getStoredUser } from '../api/client';
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

function farmPaths(farmId: string): string[] {
  const f = `/farms/${farmId}`;
  const farmQuery = `farmId=${encodeURIComponent(farmId)}`;
  return [
    `${f}/me`,
    `${f}/dashboard?date=${localDay()}`,
    `${f}/dashboard`,
    `${f}/rentabilite/overview?from=${localDay(29)}&to=${localDay()}`,
    `${f}/advisory/next-actions`,
    `${f}/alerts?status=ACTIVE`,
    `${f}/alerts/history`,
    `${f}/sales?from=${utcDay()}&to=${utcDay()}`,
    `${f}/sales?from=${utcDay(30)}`,
    `${f}/sales?from=${utcDay(29)}&to=${utcDay()}`,
    `${f}/expenses`,
    `${f}/team`,
    `${f}/eleveurs`,
    `/breeds?${farmQuery}`,
    `/cultures?${farmQuery}`,
    `${f}/buildings`,
    `${f}/feed-stock`,
    `${f}/feed-stock/movements`,
    `${f}/feed-products`,
    `${f}/inputs`,
    `${f}/customers`,
    `${f}/customers/summary`,
    `${f}/caisse/current`,
    `${f}/caisse/sessions`,
    `${f}/points-of-sale`,
    `${f}/stock-transfers`,
    `${f}/promotions`,
    `${f}/slaughter-orders`,
    `${f}/tasks`,
    `/reference-constants`,
  ];
}

function lotPaths(farmId: string, lotId: string): string[] {
  const b = `/farms/${farmId}/batches/${lotId}`;
  return [`${b}/daily-entries`, `${b}/prophylaxis`, `${b}/health-events`, `${b}/treatments`];
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
async function fetchProtocols(farmId: string, lots: WarmLot[]): Promise<void> {
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

export async function warmOfflineCache(farmId: string): Promise<void> {
  const stampKey = `koukou.offline.warmed.${getStoredUser()?.id}.${farmId}`;
  const last = Number(localStorage.getItem(stampKey) ?? 0);
  if (running || !isOnline() || Date.now() - last < EVERY_MS) return;
  running = true;
  try {
    const lots = await api.get<WarmLot[]>(`/farms/${farmId}/batches`).catch(() => [] as WarmLot[]);
    const orders = await api
      .get<Array<{ id: string; status: string }>>(`/farms/${farmId}/orders`)
      .catch(() => [] as Array<{ id: string; status: string }>);
    await fetchAll(farmPaths(farmId));
    const active = lots.filter((l) => l.status !== 'CLOTURE').slice(0, MAX_LOTS);
    await fetchAll(active.flatMap((l) => lotPaths(farmId, l.id)));
    // The daily entry form reads its lot's breed curve.
    const breedIds = [...new Set(active.flatMap((l) => (l.breedId ? [l.breedId] : [])))];
    await fetchAll(breedIds.map((id) => `/breeds/${id}/standards?farmId=${encodeURIComponent(farmId)}`));
    // An order can only be paid, delivered or cancelled from its own window.
    const open = orders.filter((o) => o.status === 'PENDING' || o.status === 'CONFIRMED').slice(0, MAX_OPEN_ORDERS);
    await fetchAll(open.map((o) => `/farms/${farmId}/orders/${o.id}`));
    await fetchProtocols(farmId, active);
    if (isOnline()) localStorage.setItem(stampKey, String(Date.now()));
  } finally {
    running = false;
  }
}

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Minimal browser globals: the engine only needs localStorage and fetch.
const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
});

vi.mock('./readCache', () => ({ readCached: async () => null, writeCached: async () => undefined }));

const { flushQueue, heldCashSummary, sendOrQueue } = await import('./engine');
const { loadOps, loadRejected } = await import('./store');
const { isOnline, markOnline } = await import('./connectivity');

type Answer = { status: number; body?: unknown } | 'network';
let routes: Array<{ method: string; match: RegExp; answer: Answer }>;
let calls: Array<{ method: string; path: string; body: unknown }>;

function route(method: string, match: RegExp, answer: Answer): void {
  routes.unshift({ method, match, answer });
}

const FARM = 'farm-1';
const sale = { kind: 'sale' as const, farmId: FARM, path: `/farms/${FARM}/sales`, body: { items: [] }, label: 'Vente' };

beforeEach(() => {
  memory.clear();
  memory.set('koukou.user', JSON.stringify({ id: 'u1', fullName: 'A', role: 'PROPRIETAIRE' }));
  memory.set('koukou.token', 't');
  markOnline();
  routes = [{ method: 'GET', match: /caisse\/current/, answer: { status: 200, body: { session: {} } } }];
  calls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method ?? 'GET';
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      calls.push({ method, path, body: init.body ? JSON.parse(init.body as string) : undefined });
      const hit = routes.find((r) => r.method === method && r.match.test(path));
      const answer = hit?.answer ?? { status: 200, body: {} };
      if (answer === 'network') throw new TypeError('Failed to fetch');
      return new Response(answer.body === undefined ? '' : JSON.stringify(answer.body), { status: answer.status });
    }),
  );
});

describe('sendOrQueue', () => {
  it('sends live, opening nothing when the caisse is open', async () => {
    const res = await sendOrQueue({ ...sale, cashFcfa: 500 });
    expect(res.status).toBe('sent');
    expect(loadOps()).toHaveLength(0);
    expect(calls.some((c) => c.path.endsWith('/caisse/open'))).toBe(false);
  });

  it('queues on a network failure and marks the app offline', async () => {
    route('POST', /sales/, 'network');
    const res = await sendOrQueue(sale);
    expect(res.status).toBe('queued');
    expect(loadOps()).toHaveLength(1);
    expect(isOnline()).toBe(false);
  });

  it('queues a 500 and surfaces a 400 to the form', async () => {
    route('POST', /sales/, { status: 500 });
    expect((await sendOrQueue(sale)).status).toBe('queued');
    memory.delete('koukou.offline.queue');
    route('POST', /sales/, { status: 400, body: { message: 'Stock insuffisant' } });
    await expect(sendOrQueue(sale)).rejects.toThrow('Stock insuffisant');
    expect(loadOps()).toHaveLength(0);
  });

  it('keeps the same idempotency key live and on replay', async () => {
    route('POST', /sales/, 'network');
    await sendOrQueue(sale);
    const op = loadOps()[0]!;
    expect((op.body as { idempotencyKey: string }).idempotencyKey).toBe(op.id);
    route('POST', /sales/, { status: 201, body: {} });
    await flushQueue();
    expect(calls.at(-1)?.body).toMatchObject({ idempotencyKey: op.id });
    expect(loadOps()).toHaveLength(0);
  });

  it('does not overtake older ops of the farm', async () => {
    route('POST', /sales/, 'network');
    await sendOrQueue(sale);
    const res = await sendOrQueue({ kind: 'daily-entry', farmId: FARM, path: `/farms/${FARM}/batches/b/daily-entries`, body: {}, label: 'Saisie' });
    expect(res.status).toBe('queued');
    expect(loadOps().map((o) => o.kind)).toEqual(['sale', 'daily-entry']);
    expect(calls.some((c) => c.path.includes('daily-entries'))).toBe(false);
  });
});

describe('flushQueue', () => {
  async function queueOne(req: Parameters<typeof sendOrQueue>[0] = sale): Promise<void> {
    route('POST', /sales|daily-entries|livrer/, 'network');
    await sendOrQueue(req);
    routes.shift();
  }

  it('keeps a refused creation in the rejected list', async () => {
    await queueOne();
    route('POST', /sales/, { status: 400, body: { message: 'Stock insuffisant' } });
    const summary = await flushQueue();
    expect(summary.rejected).toBe(1);
    expect(loadOps()).toHaveLength(0);
    expect(loadRejected()[0]?.reason).toBe('Stock insuffisant');
  });

  it('drops a refused state change', async () => {
    await queueOne({ kind: 'order-deliver', farmId: FARM, path: `/farms/${FARM}/orders/o/livrer`, label: 'Livraison' });
    route('POST', /livrer/, { status: 400, body: { message: 'Déjà livrée' } });
    expect((await flushQueue()).dropped).toBe(1);
    expect(loadRejected()).toHaveLength(0);
  });

  it('retries after an expired token instead of losing the op', async () => {
    await queueOne();
    route('POST', /sales/, { status: 401 });
    await flushQueue();
    expect(loadOps()).toHaveLength(1);
    expect(loadRejected()).toHaveLength(0);
  });

  it('never replays another account’s op', async () => {
    await queueOne();
    memory.set('koukou.user', JSON.stringify({ id: 'u2', fullName: 'B', role: 'ELEVEUR' }));
    calls = [];
    await flushQueue();
    expect(calls).toHaveLength(0);
    expect(loadOps()).toHaveLength(1);
  });

  it('holds cash when the caisse was closed since, and sends what is behind it', async () => {
    await queueOne({ ...sale, cashFcfa: 500 });
    await queueOne({ kind: 'daily-entry', farmId: FARM, path: `/farms/${FARM}/batches/b/daily-entries`, body: {}, label: 'Saisie' });
    route('GET', /caisse\/current/, { status: 200 });
    route('GET', /caisse\/sessions/, {
      status: 200,
      body: [{ closingBalanceFcfa: 1000, closedAt: new Date(Date.now() + 60_000).toISOString() }],
    });
    const summary = await flushQueue();
    expect(summary.synced).toBe(1);
    expect(calls.some((c) => c.path.endsWith('/caisse/open'))).toBe(false);
    expect(loadOps()).toHaveLength(1);
    expect(heldCashSummary(FARM)).toEqual({ count: 1, amountFcfa: 500 });
  });

  it('reopens the caisse from the last closing for older cash', async () => {
    await queueOne({ ...sale, cashFcfa: 500 });
    route('GET', /caisse\/current/, { status: 200 });
    route('GET', /caisse\/sessions/, {
      status: 200,
      body: [{ closingBalanceFcfa: 1000, closedAt: new Date(Date.now() - 60_000).toISOString() }],
    });
    await flushQueue();
    expect(calls.find((c) => c.path.endsWith('/caisse/open'))?.body).toEqual({ openingBalanceFcfa: 1000 });
    expect(loadOps()).toHaveLength(0);
  });
});

describe('POUFA writes (delivery confirmation, band sortie)', () => {
  const confirm = {
    kind: 'delivery-confirm' as const,
    farmId: FARM,
    path: `/farms/${FARM}/input-deliveries/d1/confirm`,
    body: { receivedDate: '2026-11-06', lines: [] },
    label: 'Réception · G1-0001-L01',
  };
  const sortie = {
    kind: 'band-sortie' as const,
    farmId: FARM,
    path: `/farms/${FARM}/bandes/b1/sorties`,
    body: { sortieDate: '2026-11-06', count: 10, reasonCode: 'REFORME' },
    label: 'Sortie · 10 sujets',
  };

  it('keys a confirmation with the op id live and on replay, no cash involved', async () => {
    route('POST', /confirm/, 'network');
    expect((await sendOrQueue(confirm)).status).toBe('queued');
    const op = loadOps()[0]!;
    expect(op.body).toMatchObject({ idempotencyKey: op.id, receivedDate: '2026-11-06' });
    route('POST', /confirm/, { status: 201, body: { replay: true } });
    const summary = await flushQueue();
    expect(summary.synced).toBe(1);
    expect(calls.at(-1)?.body).toMatchObject({ idempotencyKey: op.id });
    expect(calls.some((c) => c.path.includes('caisse'))).toBe(false);
  });

  it('keeps a refused confirmation for the farmer to re-enter', async () => {
    route('POST', /confirm/, 'network');
    await sendOrQueue(confirm);
    route('POST', /confirm/, { status: 409, body: { message: 'Cette livraison a été annulée : elle ne peut plus être confirmée.' } });
    expect((await flushQueue()).rejected).toBe(1);
    expect(loadRejected()[0]?.reason).toContain('annulée');
  });

  it('keys a sortie and keeps a refused one (more birds than present)', async () => {
    route('POST', /sorties/, 'network');
    await sendOrQueue(sortie);
    const op = loadOps()[0]!;
    expect(op.body).toMatchObject({ idempotencyKey: op.id, count: 10 });
    route('POST', /sorties/, { status: 400, body: { message: 'Sortie impossible : 10 sujet(s) pour 4 présent(s).' } });
    expect((await flushQueue()).rejected).toBe(1);
    expect(loadOps()).toHaveLength(0);
  });
});

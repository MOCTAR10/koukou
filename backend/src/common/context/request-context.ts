import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

/**
 * Per-request context, carried through every await of the request by
 * `AsyncLocalStorage`: the request id (echoed in `X-Request-Id`) and, once the
 * JWT is validated, the acting user. Read by the audit journal (level 1) and
 * passed to PostgreSQL at each transaction start (level 2, see
 * `AuditContextSubscriber`).
 */
export interface RequestContextStore {
  requestId: string;
  actorUserId: string | null;
  actorRole: string | null;
}

export const REQUEST_ID_HEADER = 'X-Request-Id';

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/** An incoming request id is kept only when it is a valid UUID. */
export function resolveRequestId(incoming: unknown): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return isUuid(value) ? value.toLowerCase() : randomUUID();
}

const storage = new AsyncLocalStorage<RequestContextStore>();

export const RequestContext = {
  run<T>(store: RequestContextStore, fn: () => T): T {
    return storage.run(store, fn);
  },

  current(): RequestContextStore | undefined {
    return storage.getStore();
  },

  requestId(): string | null {
    return storage.getStore()?.requestId ?? null;
  },

  /** Attaches the authenticated user to the current request, if any. */
  setActor(userId: string, role: string | null): void {
    const store = storage.getStore();
    if (!store) return;
    store.actorUserId = userId;
    store.actorRole = role;
  },
};

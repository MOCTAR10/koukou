import { isUuid, UUID_RE } from '../../common/context/request-context.js';

/** The parts of an Express request the audit journal reads. */
export interface AuditRequestLike {
  method?: string;
  baseUrl?: string;
  originalUrl?: string;
  url?: string;
  route?: { path?: unknown };
  params?: Record<string, unknown>;
  query?: Record<string, unknown>;
  body?: unknown;
}

const MAX_ROUTE_LENGTH = 300;

/**
 * Route template of a request (`/farms/:farmId/batches/:batchId`), never the
 * concrete URL, so the journal can be filtered by route. Falls back, for a
 * request no route matched (404), to the path with its ids replaced.
 */
export function routeTemplate(req: AuditRequestLike): string {
  const matched = req.route?.path;
  if (typeof matched === 'string') {
    const full = `${req.baseUrl ?? ''}${matched}`;
    return (full.startsWith('/') ? full : `/${full}`).slice(
      0,
      MAX_ROUTE_LENGTH,
    );
  }
  const raw = (req.originalUrl ?? req.url ?? '/').split('?')[0] || '/';
  return raw
    .split('/')
    .map((segment) => {
      if (UUID_RE.test(segment)) return ':id';
      if (/^\d+$/.test(segment)) return ':n';
      return segment.length > 60 ? ':value' : segment;
    })
    .join('/')
    .slice(0, MAX_ROUTE_LENGTH);
}

function stringParams(params: Record<string, unknown> | undefined) {
  if (!params) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    out[key] = String(Array.isArray(value) ? value.join('/') : value).slice(
      0,
      200,
    );
  }
  return Object.keys(out).length ? out : null;
}

export function routeParams(
  req: AuditRequestLike,
): Record<string, string> | null {
  return stringParams(req.params);
}

/** The farm a request concerns: route `farmId`, else body or query `farmId`. */
export function requestFarmId(req: AuditRequestLike): string | null {
  const candidates = [
    req.params?.farmId,
    (req.body as Record<string, unknown> | undefined)?.farmId,
    req.query?.farmId,
  ];
  for (const candidate of candidates) {
    if (isUuid(candidate)) return candidate.toLowerCase();
  }
  return null;
}

/** Offline op id: the `idempotencyKey` the mobile queue sends with a creation. */
export function offlineOpId(req: AuditRequestLike): string | null {
  const body = req.body as Record<string, unknown> | undefined;
  const key = body && typeof body === 'object' ? body.idempotencyKey : null;
  return typeof key === 'string' && key ? key.slice(0, 120) : null;
}

export const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const LOGIN_ROUTE = '/auth/login';
/** Second login step of an institutional account (SMS code). */
export const LOGIN_OTP_ROUTE = '/auth/login/otp';

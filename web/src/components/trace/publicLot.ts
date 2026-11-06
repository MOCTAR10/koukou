import type { PublicLotView } from '../../api/types-trace';

/**
 * The public lot page (`/l/:code?s=<sig>`, the address printed in the QR
 * code). No account: a plain `fetch` with no token, never `api.get`, so the
 * answer never lands in the per-account offline store and a signed-in
 * visitor's session plays no part. Every scan must reach the server (it is
 * journaled for the fraud indicators): the browser may keep it 5 minutes
 * (`private`), nothing else does.
 */

export const PUBLIC_LOT_NOTICE =
  "Ce QR code indique l'origine du produit. Il ne constitue pas un certificat sanitaire.";
export const UNKNOWN_LOT_TITLE = 'Code inconnu ou non valide';
export const CLOSED_LOT_TITLE = 'Lot clos';

export type PublicLotState =
  | { kind: 'ok'; view: PublicLotView }
  | { kind: 'unknown'; title: string; message: string }
  | { kind: 'closed'; title: string; message: string }
  | { kind: 'busy'; title: string; message: string }
  | { kind: 'offline'; title: string; message: string }
  | { kind: 'error'; title: string; message: string };

function serverMessage(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const m = (body as { message?: unknown }).message;
  if (typeof m === 'string') return m;
  if (Array.isArray(m) && typeof m[0] === 'string') return m[0];
  return null;
}

/** What the page shows for an answer of `GET /public/lots/:code`. */
export function publicLotStateFrom(status: number, body: unknown): PublicLotState {
  if (status >= 200 && status < 300 && body && typeof body === 'object' && 'code' in body) {
    return { kind: 'ok', view: body as PublicLotView };
  }
  if (status === 404 || status === 400) {
    return {
      kind: 'unknown',
      title: UNKNOWN_LOT_TITLE,
      message: serverMessage(body) ?? 'Ce produit ne peut pas être rattaché à un lot du programme.',
    };
  }
  if (status === 410) {
    return { kind: 'closed', title: CLOSED_LOT_TITLE, message: serverMessage(body) ?? "Ce lot est clos : ce QR code n'est plus valide." };
  }
  if (status === 429) {
    return { kind: 'busy', title: 'Trop de vérifications', message: 'Patientez une minute avant de scanner à nouveau ce code.' };
  }
  return { kind: 'error', title: 'Vérification impossible', message: 'Le service ne répond pas pour le moment. Réessayez plus tard.' };
}

/** Address of the server route (`base` = the API base of the app, e.g. `/api`). */
export function publicLotUrl(base: string, code: string, signature: string | null): string {
  const root = base.replace(/\/+$/, '');
  const qs = new URLSearchParams({ s: signature ?? '' });
  return `${root}/public/lots/${encodeURIComponent(code.trim())}?${qs.toString()}`;
}

/** One scan: plain fetch, no token, no offline store. */
export async function fetchPublicLot(
  base: string,
  code: string,
  signature: string | null,
  fetchImpl: typeof fetch = fetch,
): Promise<PublicLotState> {
  let res: Response;
  try {
    res = await fetchImpl(publicLotUrl(base, code, signature), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'omit',
    });
  } catch {
    return {
      kind: 'offline',
      title: 'Pas de connexion',
      message: "L'origine du produit se vérifie en ligne : reconnectez-vous puis scannez à nouveau le code.",
    };
  }
  let body: unknown = null;
  try {
    const text = await res.text();
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return publicLotStateFrom(res.status, body);
}

/** Producer line: farm, localité, province (whatever the whitelist gave). */
export function producerLine(view: Pick<PublicLotView, 'producer'>): string {
  return [view.producer.localite, view.producer.province].filter(Boolean).join(', ');
}

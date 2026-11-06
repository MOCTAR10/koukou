import type { AuditAction, AuditEvent, AuditRowChange, SealVerification } from '../../api/types-admin';

/**
 * Audit journal screen (ANINF), pure rules: query strings of the server's
 * filters, labels, the before / after diff of a row change and the seal
 * verification verdict. Every read of `/audit/*` is itself journaled.
 */

export const AUDIT_PAGE_SIZE = 50;

export const ACTION_LABELS: Readonly<Record<AuditAction, string>> = {
  WRITE: 'Écriture',
  READ_SENSITIVE: 'Consultation sensible',
  EXPORT: 'Export',
  LOGIN: 'Connexion',
  LOGIN_FAILED: 'Connexion refusée',
  SYSTEM: 'Système',
};

export const AUDIT_ACTIONS = Object.keys(ACTION_LABELS) as AuditAction[];

export const OP_LABELS: Readonly<Record<string, string>> = { I: 'Création', U: 'Modification', D: 'Suppression' };

/** Role of the actor as journaled (`actorRole`). */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  PLATFORM_ADMIN: 'Administrateur plateforme',
  PROPRIETAIRE: 'Propriétaire',
  ELEVEUR: 'Éleveur',
  ACHETEUR: 'Acheteur',
  INSTITUTION: 'Institution',
};

/** Filters the server applies (`AuditEventsQueryDto`). */
export interface EventFilters {
  from: string;
  to: string;
  actorUserId: string;
  farmId: string;
  action: AuditAction | '';
  route: string;
}

/**
 * Filters the server has no parameter for (status, request id): applied to
 * the page shown only, and said so on screen.
 */
export interface PageFilters {
  status: StatusClass | '';
  requestId: string;
}

export const EMPTY_EVENT_FILTERS: EventFilters = { from: '', to: '', actorUserId: '', farmId: '', action: '', route: '' };
export const EMPTY_PAGE_FILTERS: PageFilters = { status: '', requestId: '' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID.test(s.trim());
}

/** French error of the filters before sending (the server answers the same ones in 400). */
export function eventFilterError(f: EventFilters): string | null {
  if (f.from && f.to && f.from > f.to) return 'Période invalide : la date de début suit la date de fin.';
  if (f.actorUserId.trim() && !isUuid(f.actorUserId)) return 'Identifiant d’utilisateur invalide (UUID attendu).';
  if (f.farmId.trim() && !isUuid(f.farmId)) return 'Identifiant de ferme invalide (UUID attendu).';
  if (f.route.length > 200) return 'La route est limitée à 200 caractères.';
  return null;
}

/** `?from=…&to=…&page=…&limit=…` of `GET /audit/events` (and its CSV export, without the page). */
export function eventsQueryString(f: EventFilters, page?: number, limit = AUDIT_PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (f.actorUserId.trim()) q.set('actorUserId', f.actorUserId.trim());
  if (f.farmId.trim()) q.set('farmId', f.farmId.trim());
  if (f.action) q.set('action', f.action);
  if (f.route.trim()) q.set('route', f.route.trim());
  if (page !== undefined) {
    q.set('page', String(page));
    q.set('limit', String(limit));
  }
  const s = q.toString();
  return s ? `?${s}` : '';
}

export interface RowChangeFilters {
  from: string;
  to: string;
  table: string;
  rowId: string;
  requestId: string;
}

export const EMPTY_ROW_FILTERS: RowChangeFilters = { from: '', to: '', table: '', rowId: '', requestId: '' };

export function rowChangeFilterError(f: RowChangeFilters): string | null {
  if (f.from && f.to && f.from > f.to) return 'Période invalide : la date de début suit la date de fin.';
  if (f.requestId.trim() && !isUuid(f.requestId)) return 'Identifiant de requête invalide (UUID attendu).';
  return null;
}

export function rowChangesQueryString(f: RowChangeFilters, page: number, limit = AUDIT_PAGE_SIZE): string {
  const q = new URLSearchParams();
  if (f.from) q.set('from', f.from);
  if (f.to) q.set('to', f.to);
  if (f.table.trim()) q.set('table', f.table.trim());
  if (f.rowId.trim()) q.set('rowId', f.rowId.trim());
  if (f.requestId.trim()) q.set('requestId', f.requestId.trim());
  q.set('page', String(page));
  q.set('limit', String(limit));
  return `?${q.toString()}`;
}

export function exportFileName(f: Pick<EventFilters, 'from' | 'to'>): string {
  return `journal-audit-${f.from || 'debut'}-${f.to || 'maintenant'}.csv`;
}

// ----- Status -----------------------------------------------------------------

export type StatusClass = 'OK' | 'REFUS' | 'ERREUR';

export const STATUS_CLASS_LABELS: Readonly<Record<StatusClass, string>> = {
  OK: 'Réussite (2xx, 3xx)',
  REFUS: 'Refus (4xx)',
  ERREUR: 'Erreur serveur (5xx)',
};

export function statusClassOf(code: number | null): StatusClass | null {
  if (code === null) return null;
  if (code >= 500) return 'ERREUR';
  if (code >= 400) return 'REFUS';
  return 'OK';
}

export function statusTone(code: number | null): 'emerald' | 'amber' | 'red' | 'slate' {
  const c = statusClassOf(code);
  return c === 'OK' ? 'emerald' : c === 'REFUS' ? 'amber' : c === 'ERREUR' ? 'red' : 'slate';
}

/** The page's events kept by the filters the server lacks. */
export function filterPage(items: readonly AuditEvent[], f: PageFilters): AuditEvent[] {
  const rid = f.requestId.trim().toLowerCase();
  return items.filter((e) => (!f.status || statusClassOf(e.statusCode) === f.status) && (!rid || (e.requestId ?? '').toLowerCase().includes(rid)));
}

export function pageCount(total: number, limit: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, limit)));
}

// ----- Diff -------------------------------------------------------------------

export type DiffKind = 'added' | 'removed' | 'changed' | 'same';

export interface DiffLine {
  key: string;
  kind: DiffKind;
  before: string | null;
  after: string | null;
}

/** A JSON column value as one line of text (objects compact, null as « null »). */
export function cellText(v: unknown): string {
  if (v === undefined) return '';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Column-by-column diff of a row change, changed columns first (in key
 * order), then the unchanged ones. An insert has only `after`, a delete
 * only `before`. `_redacted_changed` (a secret changed, never stored) is
 * kept as a changed line.
 */
export function rowDiff(change: Pick<AuditRowChange, 'before' | 'after'>): DiffLine[] {
  const before = change.before ?? {};
  const after = change.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  const lines: DiffLine[] = keys.map((key) => {
    const inB = Object.prototype.hasOwnProperty.call(before, key) && change.before !== null;
    const inA = Object.prototype.hasOwnProperty.call(after, key) && change.after !== null;
    const b = inB ? cellText(before[key]) : null;
    const a = inA ? cellText(after[key]) : null;
    const kind: DiffKind = !inB ? 'added' : !inA ? 'removed' : b === a ? 'same' : 'changed';
    return { key, kind, before: b, after: a };
  });
  const rank = (k: DiffKind) => (k === 'same' ? 1 : 0);
  return lines.sort((x, y) => rank(x.kind) - rank(y.kind) || x.key.localeCompare(y.key));
}

/** « 3 colonnes modifiées », for the row list. */
export function diffSummary(change: Pick<AuditRowChange, 'before' | 'after' | 'op'>): string {
  if (change.op === 'I') return 'Ligne créée';
  if (change.op === 'D') return 'Ligne supprimée';
  const n = rowDiff(change).filter((l) => l.kind !== 'same').length;
  return n === 0 ? 'Aucune colonne modifiée' : n === 1 ? '1 colonne modifiée' : `${n} colonnes modifiées`;
}

/** The event summary (request body without secrets) as key / value lines. */
export function summaryLines(summary: Record<string, unknown> | null): Array<{ key: string; value: string }> {
  if (!summary) return [];
  return Object.keys(summary)
    .sort()
    .map((key) => ({ key, value: cellText(summary[key]) }));
}

// ----- Seals ------------------------------------------------------------------

export const MISMATCH_LABELS: Readonly<Record<string, string>> = {
  COUNT: 'Nombre de lignes différent',
  HASH: 'Empreinte différente',
  CHAIN: 'Chaînage rompu',
  GAP: 'Jour manquant',
  UNSEALED_BEFORE_FIRST_SEAL: 'Lignes antérieures au premier sceau',
};

export interface SealVerdict {
  tone: 'emerald' | 'red' | 'slate';
  title: string;
  detail: string;
}

/** What the verification says, in French. */
export function sealVerdict(v: SealVerification): SealVerdict {
  const span = v.firstDay && v.lastDay ? (v.firstDay === v.lastDay ? `le ${v.firstDay}` : `du ${v.firstDay} au ${v.lastDay}`) : null;
  if (v.ok && v.checkedDays === 0) {
    return { tone: 'slate', title: 'Aucun sceau à vérifier', detail: 'Aucun jour scellé sur cette période : un jour est scellé 15 minutes après sa fin (UTC).' };
  }
  if (v.ok) {
    return {
      tone: 'emerald',
      title: 'Journal intègre',
      detail: `${v.checkedDays} jour${v.checkedDays > 1 ? 's' : ''} vérifié${v.checkedDays > 1 ? 's' : ''}${span ? ` (${span})` : ''} : chaque empreinte recalculée est identique au sceau et la chaîne est continue.`,
    };
  }
  const m = v.mismatch;
  return {
    tone: 'red',
    title: m ? `Incohérence le ${m.day} : ${MISMATCH_LABELS[m.reason] ?? m.reason}` : 'Incohérence détectée',
    detail: `${m?.message ?? ''}${v.checkedDays ? ` (${v.checkedDays} jour${v.checkedDays > 1 ? 's' : ''} vérifié${v.checkedDays > 1 ? 's' : ''} avant elle)` : ''}`.trim(),
  };
}

/** `{from,to}` body of `POST /audit/seals/verify` (all days when both are empty). */
export function verifyBody(from: string, to: string): { from?: string; to?: string } | { error: string } {
  if (from && to && from > to) return { error: 'Période invalide : la date de début suit la date de fin.' };
  return { ...(from ? { from } : {}), ...(to ? { to } : {}) };
}

export function shortHash(hash: string | null): string {
  return hash ? `${hash.slice(0, 12)}…` : '—';
}

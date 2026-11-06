import type { RefItem } from '../../api/types-programme';
import type { AlertFamily, SanitaryAlert, SanitaryAlertOrigin, TransitionBody } from '../../api/types-surveillance';

/**
 * Qualification circuit of the official sanitary alerts, as the server's
 * `sanitary-alert-rules.ts` (pure, keep them in step): NOUVELLE → EN_ANALYSE
 * → CONFIRMEE | INFIRMEE → CLOSE, another status of the same family allowed,
 * no skip, no going back, CLOSE final, a comment to confirm or rule out.
 * The server stays the authority: these only offer what it would accept.
 */

const NEXT_FAMILIES: Readonly<Record<string, readonly AlertFamily[]>> = {
  NOUVELLE: ['EN_ANALYSE'],
  EN_ANALYSE: ['CONFIRMEE', 'INFIRMEE'],
  CONFIRMEE: ['CLOSE'],
  INFIRMEE: ['CLOSE'],
  CLOSE: [],
};

const DECISION_FAMILIES: readonly string[] = ['CONFIRMEE', 'INFIRMEE'];

export const COMMENT_MIN_LENGTH = 3;

export const FAMILY_LABELS: Readonly<Record<AlertFamily, string>> = {
  NOUVELLE: 'Nouvelle',
  EN_ANALYSE: 'En analyse',
  CONFIRMEE: 'Confirmée',
  INFIRMEE: 'Infirmée',
  CLOSE: 'Close',
};

export const ORIGIN_LABELS: Readonly<Record<SanitaryAlertOrigin, string>> = {
  MORTALITE: 'Seuil de mortalité',
  DECLARATION: 'Déclaration de suspicion',
};

export type PillTone = 'emerald' | 'amber' | 'red' | 'brand' | 'slate';

export function familyLabel(family: string): string {
  return FAMILY_LABELS[family as AlertFamily] ?? family;
}

export function familyTone(family: string): PillTone {
  switch (family) {
    case 'NOUVELLE':
      return 'red';
    case 'EN_ANALYSE':
      return 'amber';
    case 'CONFIRMEE':
      return 'red';
    case 'INFIRMEE':
      return 'emerald';
    default:
      return 'slate';
  }
}

/** Label of a status code from the STATUT_ALERTE list, the code itself when unknown. */
export function statusLabelOf(code: string, statuses: readonly Pick<RefItem, 'code' | 'label'>[]): string {
  return statuses.find((s) => s.code === code)?.label ?? code;
}

export function requiresComment(targetFamily: string | null | undefined): boolean {
  return !!targetFamily && DECISION_FAMILIES.includes(targetFamily);
}

/**
 * Statuses the alert may move to: active items of the STATUT_ALERTE list of
 * the same family (another code) or of the next families, in list order.
 */
export function nextStatuses<T extends Pick<RefItem, 'code' | 'family' | 'active' | 'sort' | 'label'>>(
  current: { statusCode: string; statusFamily: string },
  statuses: readonly T[],
): T[] {
  if (current.statusFamily === 'CLOSE') return [];
  const next = NEXT_FAMILIES[current.statusFamily] ?? [];
  return statuses
    .filter((s) => s.active && s.family && s.code !== current.statusCode)
    .filter((s) => s.family === current.statusFamily || next.includes(s.family as AlertFamily))
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fr'));
}

/** French reason why the move can't be sent yet, or null. */
export function transitionProblem(
  target: Pick<RefItem, 'code' | 'family'> | null | undefined,
  comment: string,
): string | null {
  if (!target) return 'Choisissez le nouveau statut.';
  if (requiresComment(target.family) && comment.trim().length < COMMENT_MIN_LENGTH) {
    return `Un commentaire d’au moins ${COMMENT_MIN_LENGTH} caractères est obligatoire pour confirmer ou infirmer une alerte.`;
  }
  return null;
}

export function transitionBody(target: Pick<RefItem, 'code'>, comment: string): TransitionBody {
  const text = comment.trim();
  return text ? { statusCode: target.code, comment: text } : { statusCode: target.code };
}

/** Publication: once, and only for a confirmed outcome (server `publicationCheck`). */
export function publicationProblem(alert: Pick<SanitaryAlert, 'published' | 'outcome'>): string | null {
  if (alert.published) return 'Cette alerte est déjà publiée.';
  if (alert.outcome !== 'CONFIRMEE') return 'Seule une alerte confirmée peut être publiée.';
  return null;
}

/** « 3,25 % » (two decimals at most), « — » without a value. */
export function pctFr(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return `${(Math.round(n * 100) / 100).toString().replace('.', ',')} %`;
}

/** « 4,1 % (seuil 3 %) » for a mortality alert, null otherwise. */
export function mortalityVsThreshold(alert: Pick<SanitaryAlert, 'mortalityPct' | 'thresholdPct'>): string | null {
  if (alert.mortalityPct === null || alert.mortalityPct === undefined) return null;
  const base = pctFr(alert.mortalityPct);
  return alert.thresholdPct === null || alert.thresholdPct === undefined ? base : `${base} (seuil ${pctFr(alert.thresholdPct)})`;
}

// ---------------------------------------------------------------------------
// List filters (`GET /surveillance/alerts`)
// ---------------------------------------------------------------------------

export interface AlertFilters {
  statusFamily: string;
  statusCode: string;
  origin: string;
  provinceCode: string;
  /** '' all, 'true' published, 'false' not published. */
  published: string;
  from: string;
  to: string;
}

export const EMPTY_ALERT_FILTERS: AlertFilters = {
  statusFamily: '',
  statusCode: '',
  origin: '',
  provinceCode: '',
  published: '',
  from: '',
  to: '',
};

export const ALERT_PAGE_SIZE = 50;

/** Query string of the list (empty filters left out). */
export function alertQuery(filters: AlertFilters, offset = 0, limit = ALERT_PAGE_SIZE): string {
  const params = new URLSearchParams();
  for (const key of Object.keys(EMPTY_ALERT_FILTERS) as Array<keyof AlertFilters>) {
    const value = filters[key].trim();
    if (value) params.set(key, value);
  }
  params.set('limit', String(limit));
  if (offset > 0) params.set('offset', String(offset));
  return params.toString();
}

/** Filters from the page URL (`?statut=…&origine=…`), unknown keys ignored. */
export function filtersFromParams(params: URLSearchParams): AlertFilters {
  return {
    statusFamily: params.get('famille') ?? '',
    statusCode: params.get('statut') ?? '',
    origin: params.get('origine') ?? '',
    provinceCode: params.get('province') ?? '',
    published: params.get('publiee') ?? '',
    from: params.get('du') ?? '',
    to: params.get('au') ?? '',
  };
}

const URL_KEYS: Record<keyof AlertFilters, string> = {
  statusFamily: 'famille',
  statusCode: 'statut',
  origin: 'origine',
  provinceCode: 'province',
  published: 'publiee',
  from: 'du',
  to: 'au',
};

export function filtersToParams(filters: AlertFilters, keep?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams();
  const alert = keep?.get('alerte');
  if (alert) params.set('alerte', alert);
  for (const key of Object.keys(URL_KEYS) as Array<keyof AlertFilters>) {
    if (filters[key]) params.set(URL_KEYS[key], filters[key]);
  }
  return params;
}

/** French reason why the period is wrong, or null. */
export function periodProblem(filters: Pick<AlertFilters, 'from' | 'to'>): string | null {
  if (filters.from && filters.to && filters.from > filters.to) return 'La date de début est après la date de fin.';
  return null;
}

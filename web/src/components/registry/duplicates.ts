import { ApiError, errorBody } from '../../api/errors';
import type { DuplicateCandidate, DuplicateConflictBody, HiddenDuplicate } from '../../api/types-programme';

/** What a 409 « doublon probable » gives the form to show. */
export interface DuplicateConflict {
  message: string;
  visible: DuplicateCandidate[];
  /** Farms out of the caller's scope: no code nor name. */
  hidden: HiddenDuplicate[];
  /**
   * The caller may record the farm anyway (`confirmDuplicate`): never against
   * a hidden candidate, a national administrator decides.
   */
  canConfirm: boolean;
}

function isHidden(d: DuplicateCandidate | HiddenDuplicate): d is HiddenDuplicate {
  return (d as HiddenDuplicate).hidden === true;
}

/**
 * Reads a registry write's error as a duplicate conflict, or null when it is
 * another refusal (an AMI reference already taken is a 409 too, but without
 * candidates and with no override).
 */
export function readDuplicateConflict(err: unknown): DuplicateConflict | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  const body = errorBody<DuplicateConflictBody>(err);
  if (!body || !Array.isArray(body.duplicates) || body.duplicates.length === 0) return null;
  const list = body.duplicates.filter((d): d is DuplicateCandidate | HiddenDuplicate => !!d && typeof d === 'object');
  const hidden = list.filter(isHidden);
  const visible = list.filter((d): d is DuplicateCandidate => !isHidden(d)).sort((a, b) => b.score - a.score);
  return { message: err.message, visible, hidden, canConfirm: hidden.length === 0 };
}

/** Score as a percentage for the list (« 92 % »). */
export function scoreLabel(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)} %`;
}

/** Display line of a candidate: code and name, or the masked label. */
export function candidateTitle(d: DuplicateCandidate | HiddenDuplicate): string {
  if (isHidden(d)) return 'Ferme hors de votre périmètre';
  const where = d.code ?? (d.line !== undefined ? `Ligne ${d.line}` : null);
  return where ? `${where} · ${d.name}` : d.name;
}

export function reasonsLabel(reasons: readonly string[]): string {
  return reasons.length ? reasons.join(', ') : '—';
}

import { frToIso, isoToFr } from './format';

export type TypedDate =
  | { status: 'empty'; iso: ''; message: null }
  | { status: 'incomplete'; iso: ''; message: string }
  | { status: 'invalid'; iso: ''; message: string }
  | { status: 'out'; iso: string; message: string }
  | { status: 'ok'; iso: string; message: null };

/**
 * What a typed « jj/mm/aaaa » text means for a DateInput: nothing, an
 * unfinished or impossible date, a date outside `min`/`max` (ISO), or a valid one.
 */
export function checkTypedDate(text: string, min?: string, max?: string): TypedDate {
  const t = text.trim();
  if (!t) return { status: 'empty', iso: '', message: null };
  const iso = frToIso(t);
  if (!iso) {
    // Three parts with a 4-digit year were typed: the date itself is impossible.
    const complete = /^\d{1,2}[/.\-\s]\d{1,2}[/.\-\s]\d{4}$/.test(t);
    return complete
      ? { status: 'invalid', iso: '', message: 'Date impossible.' }
      : { status: 'incomplete', iso: '', message: 'Date incomplète : jj/mm/aaaa.' };
  }
  if (min && iso < min) return { status: 'out', iso, message: `Date à partir du ${isoToFr(min)}.` };
  if (max && iso > max) return { status: 'out', iso, message: `Date au plus tard le ${isoToFr(max)}.` };
  return { status: 'ok', iso, message: null };
}

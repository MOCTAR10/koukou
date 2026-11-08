export const WHOLE_FCFA_MESSAGE = 'Le montant se saisit en francs entiers : sans virgule ni point.';

/**
 * A FCFA amount field is whole francs. Digits and group spaces are kept; a
 * comma or a point is refused (`ok: false`, the caller keeps the previous text
 * and shows `WHOLE_FCFA_MESSAGE`) instead of gluing « 1500,50 » into 150050.
 */
export function readFcfaInput(raw: string): { ok: true; digits: string } | { ok: false } {
  if (/[.,]/.test(raw)) return { ok: false };
  return { ok: true, digits: raw.replace(/\D/g, '') };
}

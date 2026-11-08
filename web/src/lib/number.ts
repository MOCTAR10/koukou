export const INVALID_NUMBER_MESSAGE = 'Nombre invalide : saisissez des chiffres, par exemple 1 200,5.';

/**
 * Reads a number typed in French: spaces and no-break spaces (thousands
 * separators) are dropped, a comma becomes the decimal point. Returns `null`
 * for an empty or invalid text (never 0: « 1 200,5 » must not silently
 * become 0, and « abc » must not pass for an amount).
 */
export function parseDecimalFr(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const t = raw.replace(/[\s  ]/g, '').replace(',', '.');
  if (!/^[-+]?(\d+(\.\d*)?|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/** `parseDecimalFr`, with an empty text read as 0 (optional fields); invalid text stays `null`. */
export function parseDecimalOrZero(raw: string | null | undefined): number | null {
  return raw == null || raw.trim() === '' ? 0 : parseDecimalFr(raw);
}

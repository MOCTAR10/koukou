/**
 * Canonical phone identifier: "+241 74 12-34.56" and "+24174123456" are the
 * same account. Only separators are removed (no country code is guessed).
 */
export function normalizePhone(value: string): string {
  return value.trim().replace(/[\s.\-()]/g, '');
}

/** class-transformer helper for phone DTO fields. */
export const toPhone = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? normalizePhone(value) : value;

/**
 * Stored spellings to try when signing in with a Gabon number typed in any
 * usual way ("074 12 34 56", "77 00 00 01", "+241 77 00 00 01", "0024177...").
 * Accounts exist as "+241XXXXXXXX" (registry, seed) or "0XXXXXXXX" (older
 * mobile sign-ups), so both are tried, plus the value as typed.
 */
export function phoneLoginCandidates(raw: string): string[] {
  const typed = raw.trim();
  const out = [normalizePhone(typed), typed];
  let digits = typed.replace(/\D/g, '');
  if (digits.startsWith('00241')) digits = digits.slice(2);
  if (digits.startsWith('241')) digits = digits.slice(3);
  const national = digits.replace(/^0/, '');
  if (/^\d{8}$/.test(national)) out.push(`+241${national}`, `0${national}`);
  return [...new Set(out)];
}

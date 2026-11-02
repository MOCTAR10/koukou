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

/**
 * Programme identifiers built from `IdCounter` numbers. A code is never
 * changed nor reused once handed out.
 */

/** Farm code: province code + 4-digit number (`G1-0012`); widens past 9999. */
export function farmCode(provinceCode: string, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`Invalid farm number: ${n}`);
  }
  return `${provinceCode}-${String(n).padStart(4, '0')}`;
}

/** Locality code: province code + 2-digit number (`G1-01`); widens past 99. */
export function localiteCode(provinceCode: string, n: number): string {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`Invalid locality number: ${n}`);
  }
  return `${provinceCode}-${String(n).padStart(2, '0')}`;
}

/** `IdCounter` scope of the farm numbers of a province. */
export function farmCounterScope(provinceCode: string): string {
  return `FARM:${provinceCode}`;
}

/** `IdCounter` scope of the locality numbers of a province. */
export function localiteCounterScope(provinceId: string): string {
  return `LOCALITE:${provinceId}`;
}

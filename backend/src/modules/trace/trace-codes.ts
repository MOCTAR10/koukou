/**
 * Traceability identifiers (CDC §7.5: farm + band + order number, automatic,
 * never changed nor reused). Numbers come from `IdCounter`, which never goes
 * back, so a code is never handed out twice even when a band is abandoned.
 *
 * - root lot of a band: band code + `L` + 2-digit rank, `G1-0012-B07-L01`
 *   (counter `LOT:<band code>`);
 * - sub-lot (one per cession): lot code + 2-digit rank, `G1-0012-B07-L01-03`
 *   (counter `SOUS_LOT:<lot code>`);
 * - operator: `OP-` + 4 digits, `OP-0001` (counter `OPERATEUR:<programme>`).
 *
 * Every number widens past its padding (L100, -100, OP-10000).
 */

function rankOf(n: number, what: string): number {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError(`Invalid ${what} rank: ${n}`);
  }
  return n;
}

export function lotCode(bandeCode: string, rank: number): string {
  return `${bandeCode}-L${String(rankOf(rank, 'lot')).padStart(2, '0')}`;
}

export function subLotCode(parentCode: string, rank: number): string {
  return `${parentCode}-${String(rankOf(rank, 'sub-lot')).padStart(2, '0')}`;
}

export function operatorCode(rank: number): string {
  return `OP-${String(rankOf(rank, 'operator')).padStart(4, '0')}`;
}

export const lotCounterScope = (bandeCode: string) => `LOT:${bandeCode}`;
export const subLotCounterScope = (lotCode: string) => `SOUS_LOT:${lotCode}`;
export const operatorCounterScope = (programCode: string) =>
  `OPERATEUR:${programCode}`;

/**
 * Shape of a lot code as read from a QR address (letters, digits and
 * dashes, at most 60): anything else is answered « inconnu » without a
 * database lookup.
 */
export const LOT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,59}$/;

export function isLotCodeShape(value: string): boolean {
  return LOT_CODE_PATTERN.test(value);
}

/**
 * Versioned parameter resolution. Rows are never modified: a change inserts a
 * new row with its effective date. The value in force at a date D is the row
 * with the latest `validFrom` ≤ D; two rows with the same `validFrom` (a
 * scheduled value corrected before it took effect) are decided by the latest
 * `createdAt`.
 */

export interface ParameterVersionLike {
  readonly key: string;
  readonly validFrom: Date;
  readonly createdAt: Date;
}

function newer(a: ParameterVersionLike, b: ParameterVersionLike): boolean {
  const d = a.validFrom.getTime() - b.validFrom.getTime();
  return d !== 0 ? d > 0 : a.createdAt.getTime() > b.createdAt.getTime();
}

/** The version of one key in force at `at` (null before its first version). */
export function versionInForce<T extends ParameterVersionLike>(
  rows: readonly T[],
  at: Date,
): T | null {
  let best: T | null = null;
  for (const row of rows) {
    if (row.validFrom.getTime() > at.getTime()) continue;
    if (!best || newer(row, best)) best = row;
  }
  return best;
}

/** The version in force at `at` for every key present in `rows`. */
export function versionsInForce<T extends ParameterVersionLike>(
  rows: readonly T[],
  at: Date,
): Map<string, T> {
  const byKey = new Map<string, T[]>();
  for (const row of rows) {
    const list = byKey.get(row.key);
    if (list) list.push(row);
    else byKey.set(row.key, [row]);
  }
  const result = new Map<string, T>();
  for (const [key, list] of byKey) {
    const v = versionInForce(list, at);
    if (v) result.set(key, v);
  }
  return result;
}

import { describe, expect, it } from 'vitest';
import { versionInForce, versionsInForce } from './parameter-resolution.js';

const d = (iso: string) => new Date(iso);
const row = (
  key: string,
  validFrom: string,
  createdAt: string,
  value: number,
) => ({
  key,
  validFrom: d(validFrom),
  createdAt: d(createdAt),
  value,
});

describe('versionInForce', () => {
  const rows = [
    row('K', '2000-01-01T00:00:00Z', '2026-11-01T00:00:00Z', 45),
    row('K', '2026-12-01T00:00:00Z', '2026-11-05T10:00:00Z', 40),
    row('K', '2027-01-01T00:00:00Z', '2026-11-05T11:00:00Z', 42),
  ];

  it('is null before the first version', () => {
    expect(versionInForce(rows, d('1999-12-31T23:59:59Z'))).toBeNull();
    expect(versionInForce([], d('2026-01-01T00:00:00Z'))).toBeNull();
  });

  it('takes the latest validFrom at or before the date', () => {
    expect(versionInForce(rows, d('2026-11-30T23:59:59Z'))?.value).toBe(45);
    expect(versionInForce(rows, d('2026-12-01T00:00:00Z'))?.value).toBe(40);
    expect(versionInForce(rows, d('2026-12-31T00:00:00Z'))?.value).toBe(40);
    expect(versionInForce(rows, d('2030-01-01T00:00:00Z'))?.value).toBe(42);
  });

  it('does not depend on row order', () => {
    const shuffled = [rows[2], rows[0], rows[1]];
    expect(versionInForce(shuffled, d('2026-12-15T00:00:00Z'))?.value).toBe(40);
  });

  it('breaks a tie on validFrom by the latest createdAt (corrected schedule)', () => {
    const corrected = [
      ...rows,
      row('K', '2026-12-01T00:00:00Z', '2026-11-06T09:00:00Z', 38),
    ];
    expect(versionInForce(corrected, d('2026-12-02T00:00:00Z'))?.value).toBe(
      38,
    );
  });
});

describe('versionsInForce', () => {
  it('resolves every key separately', () => {
    const rows = [
      row('A', '2000-01-01T00:00:00Z', '2026-01-01T00:00:00Z', 1),
      row('A', '2026-06-01T00:00:00Z', '2026-01-01T00:00:00Z', 2),
      row('B', '2026-07-01T00:00:00Z', '2026-01-01T00:00:00Z', 3),
    ];
    const at = versionsInForce(rows, d('2026-06-15T00:00:00Z'));
    expect(at.get('A')?.value).toBe(2);
    expect(at.has('B')).toBe(false);
    expect(
      versionsInForce(rows, d('2026-08-01T00:00:00Z')).get('B')?.value,
    ).toBe(3);
  });
});

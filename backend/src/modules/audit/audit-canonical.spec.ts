import { createHash } from 'node:crypto';
import {
  addUtcDays,
  canonicalJson,
  lastSealableDay,
  SealHasher,
  sealHash,
  utcDayBounds,
} from './audit-canonical.js';

describe('audit canonical serialization and seal chain', () => {
  it('sorts keys at every level, keeps array order, no whitespace', () => {
    expect(
      canonicalJson({ b: 1, a: { d: [3, { z: 1, y: 2 }], c: null } }),
    ).toBe('{"a":{"c":null,"d":[3,{"y":2,"z":1}]},"b":1}');
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson({ a: undefined, b: 'é' })).toBe('{"b":"é"}');
  });

  it('hashes prevHash + day + events then row changes, documented format', () => {
    const events = [{ id: '1', route: '/farms' }];
    const rows = [{ id: '7', op: 'I' }];
    const expected = createHash('sha256')
      .update(
        'abc\n2026-11-04\nE {"id":"1","route":"/farms"}\nR {"id":"7","op":"I"}\n',
      )
      .digest('hex');
    expect(sealHash('abc', '2026-11-04', events, rows)).toBe(expected);
    // First seal: empty previous hash.
    expect(sealHash(null, '2026-11-04', [], [])).toBe(
      createHash('sha256').update('\n2026-11-04\n').digest('hex'),
    );
  });

  it('chains: any change in a day or in the previous hash changes the seal', () => {
    const day1 = sealHash(null, '2026-11-03', [{ id: '1', a: 'x' }], []);
    const day2 = sealHash(day1, '2026-11-04', [{ id: '2', a: 'y' }], []);
    expect(sealHash(day1, '2026-11-04', [{ id: '2', a: 'y' }], [])).toBe(day2);

    const tamperedDay1 = sealHash(
      null,
      '2026-11-03',
      [{ id: '1', a: 'X' }],
      [],
    );
    expect(tamperedDay1).not.toBe(day1);
    expect(
      sealHash(tamperedDay1, '2026-11-04', [{ id: '2', a: 'y' }], []),
    ).not.toBe(day2);
    // An added (back-dated) row changes the day's seal.
    expect(
      sealHash(
        day1,
        '2026-11-04',
        [
          { id: '2', a: 'y' },
          { id: '9', a: 'fake' },
        ],
        [],
      ),
    ).not.toBe(day2);
    // Order matters (rows are fed by id).
    const two = [{ id: '1' }, { id: '2' }];
    expect(sealHash(null, 'd', two, [])).not.toBe(
      sealHash(null, 'd', [...two].reverse(), []),
    );
  });

  it('refuses events after row changes and counts rows', () => {
    const hasher = new SealHasher(null, '2026-11-04');
    hasher.addEvent({ id: '1' });
    hasher.addRowChange({ id: '1' });
    expect(() => hasher.addEvent({ id: '2' })).toThrow();
    expect(hasher.eventsCount).toBe(1);
    expect(hasher.rowChangesCount).toBe(1);
  });

  it('computes UTC days and the last sealable day with the grace period', () => {
    expect(addUtcDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addUtcDays('2026-03-01', -1)).toBe('2026-02-28');
    const { start, end } = utcDayBounds('2026-11-04');
    expect(start.toISOString()).toBe('2026-11-04T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-05T00:00:00.000Z');
    const grace = 15 * 60 * 1000;
    expect(lastSealableDay(new Date('2026-11-05T00:20:00Z'), grace)).toBe(
      '2026-11-04',
    );
    expect(lastSealableDay(new Date('2026-11-05T00:10:00Z'), grace)).toBe(
      '2026-11-03',
    );
  });
});

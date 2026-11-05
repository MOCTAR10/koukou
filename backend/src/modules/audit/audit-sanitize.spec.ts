import {
  MAX_STRING_LENGTH,
  MAX_SUMMARY_BYTES,
  maskPhone,
  sanitizeSummary,
  sanitizeValue,
} from './audit-sanitize.js';

describe('audit sanitizer', () => {
  it('drops secret keys at every level, whatever their case', () => {
    const clean = sanitizeValue({
      phone: '+24174000000',
      code: '1234',
      password: 'x',
      newPassword: 'y',
      passwordHash: 'h',
      accessToken: 't',
      clientSecret: 's',
      otp: '000000',
      owner: {
        fullName: 'Awa',
        Code: '9999',
        nested: [{ refreshTOKEN: 'r', ok: 1 }],
      },
    });
    expect(clean).toEqual({
      phone: '+24174000000',
      owner: { fullName: 'Awa', nested: [{ ok: 1 }] },
    });
  });

  it('truncates long strings and keeps scalars', () => {
    const clean = sanitizeValue({
      notes: 'a'.repeat(MAX_STRING_LENGTH + 50),
      n: 12,
      ok: true,
      none: null,
      at: new Date('2026-11-05T10:00:00.000Z'),
    }) as Record<string, unknown>;
    expect((clean.notes as string).length).toBe(MAX_STRING_LENGTH + 1);
    expect((clean.notes as string).endsWith('…')).toBe(true);
    expect(clean).toMatchObject({
      n: 12,
      ok: true,
      none: null,
      at: '2026-11-05T10:00:00.000Z',
    });
  });

  it('caps the whole summary at ~8 KB with a preview', () => {
    const body = {
      items: Array.from({ length: 200 }, (_, i) => ({
        label: `ligne ${i}`.padEnd(100, '.'),
      })),
    };
    const summary = sanitizeSummary(body) as Record<string, unknown>;
    expect(summary._truncated).toBe(true);
    expect(summary._bytes).toBeGreaterThan(MAX_SUMMARY_BYTES);
    expect(Buffer.byteLength(JSON.stringify(summary))).toBeLessThanOrEqual(
      MAX_SUMMARY_BYTES,
    );
  });

  it('keeps a small body as is and returns null for an empty one', () => {
    expect(sanitizeSummary({ name: 'Lot A' })).toEqual({ name: 'Lot A' });
    expect(sanitizeSummary({})).toBeNull();
    expect(sanitizeSummary(undefined)).toBeNull();
  });

  it('masks a phone number, keeping the prefix and the last 3 digits', () => {
    expect(maskPhone('+24174123456')).toBe('+241*****456');
    expect(maskPhone('074 12 34 56')).toBe('07****456');
    expect(maskPhone(undefined)).toBeNull();
    expect(maskPhone('123')).toBe('***');
  });
});

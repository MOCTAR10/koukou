import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneLoginCandidates } from './phone.js';

describe('phoneLoginCandidates', () => {
  it('expands a local number to the stored spellings', () => {
    const c = phoneLoginCandidates('074 12 34 56');
    expect(c).toContain('+24174123456');
    expect(c).toContain('074123456');
  });

  it('accepts an 8-digit number without the leading zero', () => {
    expect(phoneLoginCandidates('77 00 00 01')).toEqual(
      expect.arrayContaining(['77000001', '+24177000001', '077000001']),
    );
  });

  it('accepts the international spellings', () => {
    expect(phoneLoginCandidates('+241 77 00 00 01')).toContain('+24177000001');
    expect(phoneLoginCandidates('00241 77.00.00.01')).toContain('+24177000001');
  });

  it('keeps the typed value and the separators-free value', () => {
    const c = phoneLoginCandidates(' 12-34 ');
    expect(c).toEqual(['1234', '12-34']);
    expect(normalizePhone(' 12-34 ')).toBe('1234');
  });
});

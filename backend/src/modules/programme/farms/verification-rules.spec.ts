import { describe, expect, it } from 'vitest';
import { verifiedAfterStatus } from './verification-rules.js';

describe('verifiedAfterStatus (F8)', () => {
  it('verifies an operational farm', () => {
    expect(verifiedAfterStatus('OPERATIONNELLE', false)).toBe(true);
  });

  it('withdraws the verification back in preparation', () => {
    expect(verifiedAfterStatus('PREPARATION', true)).toBe(false);
  });

  it('keeps the flag for a suspension or an unknown family', () => {
    expect(verifiedAfterStatus('SUSPENDUE', true)).toBe(true);
    expect(verifiedAfterStatus('SUSPENDUE', false)).toBe(false);
    expect(verifiedAfterStatus(null, true)).toBe(true);
  });
});

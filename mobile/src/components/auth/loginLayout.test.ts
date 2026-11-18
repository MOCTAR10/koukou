import { describe, expect, it } from 'vitest';

import { KEY_MAX, KEY_MIN, LOCKUP_MAX, loginLayout } from './loginLayout';

const base = { textScale: 1, phoneField: true, buying: false, hasError: false };

describe('loginLayout', () => {
  it('fits the smallest supported phone (360x640, bars removed) with 44 dp keys', () => {
    const l = loginLayout({ ...base, height: 568 });
    expect(l.fits).toBe(true);
    expect(l.key).toBeGreaterThanOrEqual(KEY_MIN);
    expect(l.contentHeight).toBeLessThanOrEqual(568);
  });

  it('never goes under 44 dp keys and never exceeds the content budget when it fits', () => {
    for (let h = 560; h <= 950; h += 5) {
      for (const textScale of [1, 1.15]) {
        const l = loginLayout({ ...base, textScale, height: h });
        expect(l.key).toBeGreaterThanOrEqual(KEY_MIN);
        expect(l.key).toBeLessThanOrEqual(KEY_MAX);
        if (l.fits) expect(l.contentHeight).toBeLessThanOrEqual(h);
      }
    }
  });

  it('every height from 568 to 950 fits at the font-scale cap', () => {
    for (let h = 568; h <= 950; h++) {
      expect(loginLayout({ ...base, textScale: 1.15 * 1.06, height: h }).fits).toBe(true);
    }
  });

  it('grows keys then lockup on tall screens, with caps', () => {
    const l = loginLayout({ ...base, height: 950 });
    expect(l.key).toBe(KEY_MAX);
    expect(l.lockupHeight).toBe(LOCKUP_MAX);
  });

  it('drops the lockup before shrinking the keys under 44', () => {
    const l = loginLayout({ ...base, height: 495 });
    expect(l.lockupHeight).toBe(0);
    expect(l.key).toBeLessThanOrEqual(KEY_MIN + 2);
  });

  it('buying mode has no lockup (the switch stands in) and an error costs room', () => {
    expect(loginLayout({ ...base, buying: true, height: 800 }).lockupHeight).toBe(0);
    const a = loginLayout({ ...base, height: 700 });
    const b = loginLayout({ ...base, height: 700, hasError: true });
    expect(b.key).toBeLessThanOrEqual(a.key);
  });

  it('the SMS-code step (no phone field) fits where sign-in does', () => {
    const l = loginLayout({ ...base, phoneField: false, height: 568 });
    expect(l.fits).toBe(true);
    expect(l.key).toBeGreaterThan(KEY_MIN);
  });
});

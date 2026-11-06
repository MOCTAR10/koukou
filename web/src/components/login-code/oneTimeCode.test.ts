import { describe, expect, it } from 'vitest';
import { dismissNeedsConfirm, formatLoginCode, NO_CODE, oneTimeCodeReducer } from './oneTimeCode';

describe('one-time login code', () => {
  const holder = { fullName: 'Jean Mba', phone: '074000000' };
  const reveal = (code: string, regenerated = false) =>
    oneTimeCodeReducer(NO_CODE, { type: 'reveal', code, holder, title: 'Code de connexion', regenerated });

  it('is shown once, then forgotten', () => {
    let s = reveal('12345678');
    expect(s).toMatchObject({ status: 'shown', title: 'Code de connexion', regenerated: false, copied: false, noted: false });
    expect(dismissNeedsConfirm(s)).toBe(true);
    s = oneTimeCodeReducer(s, { type: 'copied' });
    expect(dismissNeedsConfirm(s)).toBe(false);
    s = oneTimeCodeReducer(s, { type: 'dismiss' });
    expect(s).toEqual(NO_CODE);
    expect(JSON.stringify(s)).not.toContain('12345678');
  });

  it('closes without confirmation once noted, and asks again when unticked', () => {
    let s = oneTimeCodeReducer(reveal('1', true), { type: 'noted', value: true });
    expect(dismissNeedsConfirm(s)).toBe(false);
    s = oneTimeCodeReducer(s, { type: 'noted', value: false });
    expect(dismissNeedsConfirm(s)).toBe(true);
    expect(oneTimeCodeReducer(NO_CODE, { type: 'copied' })).toEqual(NO_CODE);
    expect(dismissNeedsConfirm(NO_CODE)).toBe(false);
  });

  it('starts over for a new code', () => {
    const copied = oneTimeCodeReducer(reveal('11112222'), { type: 'copied' });
    const next = oneTimeCodeReducer(copied, { type: 'reveal', code: '33334444', holder, title: 'Nouveau code', regenerated: true });
    expect(next).toMatchObject({ code: '33334444', copied: false, regenerated: true });
  });

  it('groups the digits for reading', () => {
    expect(formatLoginCode('12345678')).toBe('1234 5678');
    expect(formatLoginCode(' 123 45 ')).toBe('1234 5');
  });
});

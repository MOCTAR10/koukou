import { describe, expect, it } from 'vitest';
import { readFcfaInput } from './amount';

describe('readFcfaInput', () => {
  it('keeps the digits of a whole amount, group spaces dropped', () => {
    expect(readFcfaInput('1 500')).toEqual({ ok: true, digits: '1500' });
    expect(readFcfaInput('')).toEqual({ ok: true, digits: '' });
  });

  it('refuses a comma or a point instead of gluing the digits', () => {
    expect(readFcfaInput('1500,50')).toEqual({ ok: false });
    expect(readFcfaInput('1500.5')).toEqual({ ok: false });
  });
});

import { describe, expect, it } from 'vitest';

import { appendCodeDigit, CODE_MAX, removeCodeDigit } from './secretCodePad.logic';

describe('SecretCodePad — appendCodeDigit', () => {
  it('ajoute un chiffre à la fin', () => {
    expect(appendCodeDigit('12', '3')).toBe('123');
  });

  it('ignore tout ce qui n’est pas un chiffre unique', () => {
    expect(appendCodeDigit('12', 'a')).toBe('12');
    expect(appendCodeDigit('12', '34')).toBe('12');
    expect(appendCodeDigit('12', '')).toBe('12');
  });

  it('ne dépasse jamais la longueur maximale', () => {
    expect(appendCodeDigit('1'.repeat(CODE_MAX), '9')).toBe('1'.repeat(CODE_MAX));
  });

  it('honore une longueur maximale personnalisée', () => {
    expect(appendCodeDigit('123', '4', 3)).toBe('123');
  });
});

describe('SecretCodePad — removeCodeDigit', () => {
  it('retire le dernier chiffre', () => {
    expect(removeCodeDigit('123')).toBe('12');
    expect(removeCodeDigit('1')).toBe('');
  });

  it('est sûr sur un code vide', () => {
    expect(removeCodeDigit('')).toBe('');
  });
});
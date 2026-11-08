import { describe, expect, it } from 'vitest';
import { errorText, FORBIDDEN_TEXT, OFFLINE_TEXT } from './errorText';

class FakeApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

describe('errorText', () => {
  it('keeps the French message of a 4xx', () => {
    expect(errorText(new FakeApiError(400, 'Stock insuffisant.'))).toBe('Stock insuffisant.');
  });
  it('replaces a raw English or generic server message by French text', () => {
    expect(errorText(new FakeApiError(403, 'Forbidden resource'))).toBe(FORBIDDEN_TEXT);
    expect(errorText(new FakeApiError(500, 'Erreur serveur (500)'))).toMatch(/serveur/);
    expect(errorText(new FakeApiError(422, 'Bad Request'), 'Échec.')).toBe('Échec.');
  });
  it('turns a network failure into the offline message', () => {
    expect(errorText(new TypeError('Network request failed'))).toBe(OFFLINE_TEXT);
  });
  it('never prints [object Object]', () => {
    expect(errorText({})).toBe('Erreur inattendue.');
    expect(errorText({ message: { a: 1 } }, 'Échec.')).toBe('Échec.');
    expect(errorText(null, 'Échec.')).toBe('Échec.');
    expect(errorText(undefined)).toBe('Erreur inattendue.');
  });
  it('accepts a plain string', () => {
    expect(errorText('Déjà fait.')).toBe('Déjà fait.');
  });
});

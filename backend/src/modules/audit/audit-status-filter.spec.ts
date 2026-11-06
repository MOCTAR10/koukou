import { describe, expect, it } from 'vitest';
import { statusRange } from './audit-query.service.js';

describe('statusRange (journal status filter)', () => {
  it('reads an exact code and a class', () => {
    expect(statusRange('403')).toEqual({ min: 403, max: 404 });
    expect(statusRange('4xx')).toEqual({ min: 400, max: 500 });
    expect(statusRange('5XX')).toEqual({ min: 500, max: 600 });
  });

  it('reads success and failure', () => {
    expect(statusRange('succes')).toEqual({ min: 0, max: 400 });
    expect(statusRange('ECHEC')).toEqual({ min: 400, max: 1000 });
  });

  it('refuses anything else', () => {
    expect(statusRange('40')).toBeNull();
    expect(statusRange('6xx')).toBeNull();
    expect(statusRange('ok')).toBeNull();
  });
});

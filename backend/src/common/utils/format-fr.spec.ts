import { dateFr, fcfaFr } from './date.utils.js';

describe('dateFr (server-written messages)', () => {
  it('formats a calendar day without shifting it', () => {
    expect(dateFr('2026-11-04')).toBe('04 nov. 2026');
  });
  it('reads an instant in Gabon time (23:30Z is already the next day)', () => {
    expect(dateFr('2026-11-08T23:30:00Z')).toBe('09 nov. 2026');
  });
  it('accepts a Date and keeps unparsable input', () => {
    expect(dateFr(new Date('2026-11-06T10:00:00Z'))).toBe('06 nov. 2026');
    expect(dateFr('bientôt')).toBe('bientôt');
    expect(dateFr(null)).toBe('—');
  });
});

describe('fcfaFr', () => {
  const nbsp = (s: string) => s.replace(/[\u202f\u00a0]/g, ' ');
  it('groups thousands and rounds', () => {
    expect(nbsp(fcfaFr(975000))).toBe('975 000 FCFA');
    expect(nbsp(fcfaFr('30000.4'))).toBe('30 000 FCFA');
    expect(fcfaFr(-0.2)).toBe('0 FCFA');
    expect(fcfaFr(undefined)).toBe('—');
  });
});

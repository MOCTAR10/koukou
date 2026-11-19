import {
  libervilleDayEnd,
  libervilleDayStart,
  todayLocal,
} from './date.utils.js';
import { factInstant } from '../../modules/batches/poufa/bande-rules.js';

describe('bornes d’un jour de Libreville', () => {
  it('un jour commence à 23:00 UTC la veille et finit à 22:59:59.999 UTC', () => {
    expect(new Date(libervilleDayStart('2026-11-19')).toISOString()).toBe(
      '2026-11-18T23:00:00.000Z',
    );
    expect(new Date(libervilleDayEnd('2026-11-19')).toISOString()).toBe(
      '2026-11-19T22:59:59.999Z',
    );
  });

  it('un instant de 23:30 UTC tombe dans le jour suivant la fenêtre', () => {
    const at = Date.parse('2026-11-18T23:30:00Z');
    expect(at >= Date.parse(libervilleDayStart('2026-11-19'))).toBe(true);
    expect(at <= Date.parse(libervilleDayEnd('2026-11-18'))).toBe(false);
  });

  it('factInstant lit les paramètres à la fin du jour de Libreville', () => {
    const now = new Date('2026-11-20T10:00:00Z');
    expect(factInstant('2026-11-19', now).toISOString()).toBe(
      '2026-11-19T22:59:59.999Z',
    );
    expect(factInstant('2026-11-20', now)).toBe(now);
  });
});

describe('todayLocal (Gabon business day)', () => {
  it('is already the next day in Libreville at 23:30 UTC', () => {
    expect(todayLocal(new Date('2026-11-07T23:30:00Z'))).toBe('2026-11-08');
  });

  it('matches the UTC day during the day', () => {
    expect(todayLocal(new Date('2026-11-08T10:00:00Z'))).toBe('2026-11-08');
  });

  it('crosses the year at local midnight', () => {
    expect(todayLocal(new Date('2026-12-31T23:00:00Z'))).toBe('2027-01-01');
  });
});

import { describe, expect, it } from 'vitest';

import { videSanitaireHint } from './videSanitaire';

describe('videSanitaireHint', () => {
  it('bâtiment occupé : avertissement', () => {
    expect(videSanitaireHint({ activeLots: 1, lastLotEndedAt: '2026-01-01', placementDate: '2026-03-01' }).tone).toBe('warn');
  });

  it('aucun lot précédent : simple conseil', () => {
    const h = videSanitaireHint({ activeLots: 0, lastLotEndedAt: null, placementDate: '2026-03-01' });
    expect(h.tone).toBe('muted');
    expect(h.text).toContain('14 à 21 jours');
  });

  it('moins de 14 jours : danger, jours restants', () => {
    const h = videSanitaireHint({ activeLots: 0, lastLotEndedAt: '2026-03-01', placementDate: '2026-03-11' });
    expect(h.tone).toBe('danger');
    expect(h.text).toContain('10 jours seulement');
    expect(h.text).toContain('encore 4 jours');
  });

  it('14 à 20 jours : acceptable ; 21 et plus : parfait', () => {
    expect(videSanitaireHint({ activeLots: 0, lastLotEndedAt: '2026-03-01', placementDate: '2026-03-18' }).tone).toBe('warn');
    expect(videSanitaireHint({ activeLots: 0, lastLotEndedAt: '2026-03-01', placementDate: '2026-03-22' }).tone).toBe('ok');
  });

  it('mise en place antidatée avant la fin du lot : 0 jour', () => {
    const h = videSanitaireHint({ activeLots: 0, lastLotEndedAt: '2026-03-10', placementDate: '2026-03-05' });
    expect(h.tone).toBe('danger');
    expect(h.text).toContain('0 jour seulement');
  });
});

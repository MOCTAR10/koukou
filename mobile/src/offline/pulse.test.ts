import { describe, expect, it, vi } from 'vitest';

import { markAllSent, pulseFlags, pulseState, setSyncing, subscribePulse } from './pulse';

describe('pulseState (libellés de la pastille)', () => {
  it('en ligne, rien en attente', () => {
    expect(pulseState(true, 0, false)).toEqual({ tone: 'online', label: 'En ligne' });
  });
  it('hors ligne avec et sans file', () => {
    expect(pulseState(false, 0, false)).toEqual({ tone: 'offline', label: 'Hors ligne' });
    expect(pulseState(false, 1, false)).toEqual({ tone: 'offline', label: 'Hors ligne · 1 en attente' });
    expect(pulseState(false, 3, false).label).toBe('Hors ligne · 3 en attente');
  });
  it('en ligne avec une file : le nombre reste affiché', () => {
    expect(pulseState(true, 2, false)).toEqual({ tone: 'online', label: 'En ligne · 2 en attente' });
  });
  it('synchronisation : prioritaire sur tout, même hors ligne', () => {
    expect(pulseState(true, 1, true).label).toBe('Synchronisation…');
    expect(pulseState(false, 1, true).label).toBe('Synchronisation…');
  });
  it('« Tout est envoyé » seulement file vide et en ligne', () => {
    expect(pulseState(true, 0, false, true).label).toBe('Tout est envoyé');
    expect(pulseState(true, 1, false, true).label).toBe('En ligne · 1 en attente');
    expect(pulseState(false, 0, false, true).label).toBe('Hors ligne');
  });
});

describe('pulseFlags (ce que la pastille lit)', () => {
  it('change à chaque bascule de synchro et prévient les abonnés', () => {
    const listener = vi.fn();
    const off = subscribePulse(listener);
    expect(pulseFlags() & 1).toBe(0);
    setSyncing(true);
    expect(pulseFlags() & 1).toBe(1);
    setSyncing(false);
    // Régression : la pastille restait sur « Synchronisation… » parce que ce
    // drapeau était lu hors de l'abonnement et ignoré au rendu.
    expect(pulseFlags() & 1).toBe(0);
    expect(listener).toHaveBeenCalledTimes(2);
    off();
  });
  it('« Tout est envoyé » s’éteint seul après quelques secondes', () => {
    vi.useFakeTimers();
    try {
      markAllSent();
      expect(pulseFlags() & 2).toBe(2);
      vi.advanceTimersByTime(4_100);
      expect(pulseFlags() & 2).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

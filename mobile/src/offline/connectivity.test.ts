import { describe, expect, it } from 'vitest';

import { createConnectivity } from './connectivity-core';
import { pulseState } from './pulse';

function probeOf(results: boolean[]) {
  let i = 0;
  return async () => results[Math.min(i++, results.length - 1)] ?? true;
}

describe('connectivity', () => {
  it('une sonde qui échoue passe hors ligne, une sonde réussie repasse en ligne', async () => {
    const c = createConnectivity({ probe: probeOf([false, true]) });
    const seen: boolean[] = [];
    c.subscribe(() => seen.push(c.isOnline()));
    await c.suspectOffline();
    expect(c.isOnline()).toBe(false);
    await c.suspectOffline();
    expect(c.isOnline()).toBe(true);
    expect(seen).toEqual([false, true]);
  });

  it('une sonde qui lève une erreur compte comme hors ligne', async () => {
    const c = createConnectivity({
      probe: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await c.suspectOffline();
    expect(c.isOnline()).toBe(false);
  });

  it('le retour du réseau prévient une seule fois ceux qui écoutent la reconnexion', async () => {
    const c = createConnectivity({ probe: probeOf([false, true, true]) });
    let back = 0;
    c.onReconnect(() => (back += 1));
    await c.suspectOffline();
    await c.suspectOffline();
    await c.suspectOffline();
    expect(back).toBe(1);
  });

  it('une réponse de l’API remet en ligne sans sonde', async () => {
    const c = createConnectivity({ probe: probeOf([false]) });
    await c.suspectOffline();
    expect(c.isOnline()).toBe(false);
    c.reportReachable();
    expect(c.isOnline()).toBe(true);
  });

  it('les échecs simultanés partagent une seule sonde', async () => {
    let calls = 0;
    const c = createConnectivity({
      probe: async () => {
        calls += 1;
        return false;
      },
    });
    await Promise.all([c.suspectOffline(), c.suspectOffline(), c.suspectOffline()]);
    expect(calls).toBe(1);
  });
});

describe('pulseState', () => {
  it('en ligne au repos', () => expect(pulseState(true, 0, false)).toEqual({ tone: 'online', label: 'En ligne' }));
  it('hors ligne', () => expect(pulseState(false, 0, false)).toEqual({ tone: 'offline', label: 'Hors ligne' }));
  it('hors ligne avec saisies en attente', () => expect(pulseState(false, 3, false).label).toBe('Hors ligne · 3 en attente'));
  it('en ligne avec des saisies en attente', () => expect(pulseState(true, 2, false).label).toBe('En ligne · 2 en attente'));
  it('envoi en cours', () => expect(pulseState(true, 2, true)).toEqual({ tone: 'syncing', label: 'Synchronisation…' }));
  it('tout est envoyé juste après une synchronisation', () =>
    expect(pulseState(true, 0, false, true)).toEqual({ tone: 'online', label: 'Tout est envoyé' }));
  it('les saisies en attente priment sur « Tout est envoyé »', () => expect(pulseState(true, 1, false, true).label).toBe('En ligne · 1 en attente'));
});

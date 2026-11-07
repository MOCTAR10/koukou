import { describe, expect, it } from 'vitest';
import { pulseState } from './pulse';

describe('pulseState', () => {
  it('online and idle', () => expect(pulseState(true, 0, false)).toEqual({ tone: 'online', label: 'En ligne' }));
  it('offline', () => expect(pulseState(false, 0, false)).toEqual({ tone: 'offline', label: 'Hors ligne' }));
  it('offline with queued writes', () => expect(pulseState(false, 3, false)).toEqual({ tone: 'offline', label: 'Hors ligne · 3 en attente' }));
  it('online with a backlog', () => expect(pulseState(true, 2, false).label).toBe('En ligne · 2 en attente'));
  it('syncing wins', () => expect(pulseState(true, 2, true)).toEqual({ tone: 'syncing', label: 'Synchronisation…' }));
});

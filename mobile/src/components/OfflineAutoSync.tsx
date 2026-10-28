import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useAuth } from '@/auth/AuthContext';
import { useOfflineQueue } from '@/offline';

/** Retry cadence while ops are pending (the queue mutex prevents overlaps). */
const RETRY_INTERVAL_MS = 30_000;

/**
 * Pousse automatiquement la file offline. Ne rend rien. Déclencheurs :
 * nouvel op en attente, retour de l'app au premier plan, et relance
 * périodique tant qu'il reste des opérations (le réseau peut revenir sans
 * qu'aucune autre action ne relance la synchronisation).
 */
export function OfflineAutoSync() {
  const { farmId } = useAuth();
  const sync = useOfflineQueue(farmId);
  const pending = sync.pending.length;
  const prevPending = useRef(0);
  const flushRef = useRef(sync.flush);
  flushRef.current = sync.flush;

  useEffect(() => {
    const wasEmpty = prevPending.current === 0;
    prevPending.current = pending;

    const newlyPending = wasEmpty && pending > 0;
    if (newlyPending) {
      void sync.flush();
    }
  }, [pending, sync]);

  const hasPending = pending > 0;
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void flushRef.current(), RETRY_INTERVAL_MS);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void flushRef.current();
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [hasPending]);

  return null;
}

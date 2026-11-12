import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthContext';
import { toast } from '@/components/ui/Feedback';
import { consumeQueueRecovery, subscribeFlush, useOfflineQueue } from '@/offline';

/** Retry cadence while ops are pending (the queue mutex prevents overlaps). */
const RETRY_INTERVAL_MS = 30_000;

/** Retry cadence of failed reads that still show a saved answer. */
const READ_RETRY_INTERVAL_MS = 20_000;

let lastAuthToastAt = 0;

/**
 * Pousse automatiquement la file offline. Ne rend rien. Déclencheurs :
 * nouvel op en attente, retour de l'app au premier plan, et relance
 * périodique tant qu'il reste des opérations (le réseau peut revenir sans
 * qu'aucune autre action ne relance la synchronisation).
 */
export function OfflineAutoSync() {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const sync = useOfflineQueue(farmId);
  const pending = sync.pending.length;
  const prevPending = useRef(0);
  const flushRef = useRef(sync.flush);
  flushRef.current = sync.flush;

  // A queue file that could not be read: told once, the raw copy is kept.
  useEffect(() => {
    const r = consumeQueueRecovery();
    if (r) {
      toast.error(
        'File hors ligne endommagée',
        `${r.recovered} opération(s) récupérée(s). Une copie de sauvegarde a été conservée ; vérifiez vos dernières saisies.`,
      );
    }
  }, [pending]);

  useEffect(() => {
    const wasEmpty = prevPending.current === 0;
    prevPending.current = pending;

    const newlyPending = wasEmpty && pending > 0;
    if (newlyPending) {
      void sync.flush();
    }
  }, [pending, sync]);

  // Every flush pass (auto, manual, post-send) tells the user what was refused.
  useEffect(
    () =>
      subscribeFlush((summary) => {
        if (summary.unauthorized) {
          // The periodic retry would repeat it every 30 s: once per 5 minutes.
          const now = Date.now();
          if (now - lastAuthToastAt < 300_000) return;
          lastAuthToastAt = now;
          toast.error('Session expirée', 'Session expirée : reconnectez-vous pour synchroniser.');
          return;
        }
        const refused = summary.rejected + summary.dropped;
        if (refused > 0) {
          toast.error(
            refused === 1 ? 'Saisie refusée' : `${refused} saisies refusées`,
            refused === 1
              ? 'Le serveur a refusé 1 opération hors ligne. Consultez-la dans Menu pour la corriger.'
              : `Le serveur a refusé ${refused} opérations hors ligne. Consultez-les dans Menu pour les corriger.`,
          );
        }
      }),
    [],
  );

  // Reads that failed while a saved answer is on screen: try again every 20 s
  // so the screen catches up as soon as the network is back.
  useEffect(() => {
    const timer = setInterval(() => {
      void queryClient.refetchQueries({
        type: 'active',
        predicate: (q) => q.state.status === 'error' && q.state.fetchStatus === 'idle' && q.state.data !== undefined,
      });
    }, READ_RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [queryClient]);

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

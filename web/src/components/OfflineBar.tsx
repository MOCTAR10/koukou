import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CloudOff, RefreshCw, Trash2 } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { useFarm } from '../app/FarmContext';
import { useMenuAccess } from '../app/useMenuAccess';
import { dismissRejected, flushQueue, heldCashSummary, useOfflineQueue, useOnline } from '../offline';
import { onReconnect } from '../offline/connectivity';
import { dismissQueuedNotice, getQueuedNotice, subscribeQueuedNotice } from '../offline/notice';
import { oldestShownDate, resetShownDate, subscribeShownDate } from '../offline/readCache';
import { warmOfflineCache } from '../offline/warmup';
import { fcfa } from '../lib/format';
import { Button, Modal } from './form';

const RETRY_INTERVAL_MS = 30_000;
const NOTICE_MS = 6_000;

/** Above the modals (z-50): the form that queued the write may still be closing. */
function QueuedNotice() {
  const notice = useSyncExternalStore(subscribeQueuedNotice, getQueuedNotice, getQueuedNotice);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(dismissQueuedNotice, NOTICE_MS);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  return (
    <div role="status" className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
      <CloudOff className="h-4 w-4 shrink-0" />
      {notice.text}
    </div>
  );
}

function SyncCentre({ onClose, onSync, syncing }: { onClose: () => void; onSync: () => void; syncing: boolean }) {
  const { pending, rejected } = useOfflineQueue();
  return (
    <Modal title="Synchronisation" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <section>
          <h3 className="mb-1 font-semibold text-slate-800">En attente d’envoi ({pending.length})</h3>
          {pending.length === 0 ? (
            <p className="text-slate-500">Tout est envoyé.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {pending.map((op) => (
                <li key={op.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{op.label}</span>
                    <span className="text-xs text-slate-500">
                      {new Date(op.createdAt).toLocaleString('fr-FR')}
                      {op.heldByClosedCaisse ? ' · attend l’ouverture de la caisse' : ''}
                    </span>
                  </span>
                  {op.cashFcfa ? <b className="shrink-0 tabular-nums text-slate-700">{fcfa(op.cashFcfa)}</b> : null}
                </li>
              ))}
            </ul>
          )}
        </section>
        {rejected.length > 0 ? (
          <section>
            <h3 className="mb-1 font-semibold text-red-700">Refusées par le serveur ({rejected.length})</h3>
            <p className="mb-2 text-slate-500">Ces opérations n’ont pas été enregistrées : saisissez-les à nouveau si besoin.</p>
            <ul className="divide-y divide-slate-100 rounded-lg ring-1 ring-red-200">
              {rejected.map((op) => (
                <li key={op.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-800">{op.label}</span>
                    <span className="block text-xs text-red-700">{op.reason}</span>
                  </span>
                  <button
                    onClick={() => dismissRejected(op.id)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:text-red-600"
                    aria-label={`Retirer : ${op.label}`}
                    title="Retirer de la liste"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <div className="flex justify-end">
          <Button onClick={onSync} busy={syncing} disabled={pending.length === 0}>
            <RefreshCw className="h-4 w-4" /> Synchroniser maintenant
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Connection state, writes waiting to go out, and new versions of the app. */
export function OfflineBar({ note = 'Vos saisies, ventes et encaissements partiront au retour de la connexion.' }: { note?: string }) {
  const online = useOnline();
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const { pending, rejected } = useOfflineQueue();
  const savedAt = useSyncExternalStore(subscribeShownDate, oldestShownDate, oldestShownDate);
  const [syncing, setSyncing] = useState(false);
  const [open, setOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const applyUpdate = useRef<(() => void) | null>(null);
  const count = pending.length;

  const sync = useRef(async () => undefined as void);
  sync.current = async () => {
    setSyncing(true);
    try {
      const summary = await flushQueue();
      if (summary.synced > 0) {
        for (const id of summary.farmIds) void queryClient.invalidateQueries({ predicate: (q) => q.queryKey.includes(id) });
      }
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh: () => setUpdateReady(true),
    });
    applyUpdate.current = () => void update(true);
  }, []);

  // Back online: send what waits, then replace the saved data on screen.
  useEffect(
    () =>
      onReconnect(() => {
        resetShownDate();
        void sync.current().finally(() => void queryClient.invalidateQueries());
      }),
    [queryClient],
  );

  // The network can come back with nothing to tell us; keep trying while ops wait.
  const hasPending = count > 0;
  useEffect(() => {
    if (!hasPending) return;
    void sync.current();
    const timer = setInterval(() => void sync.current(), RETRY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [hasPending]);

  // An institution preloads only the domains its profile reads (no 403 storm); wait until that is known.
  const { canRead, isLoading: accessLoading } = useMenuAccess();
  const canReadRef = useRef(canRead);
  canReadRef.current = canRead;
  useEffect(() => {
    if (!farmId || !online || accessLoading) return;
    void warmOfflineCache(farmId, (domain) => canReadRef.current(domain));
  }, [farmId, online, accessLoading]);

  const held = farmId ? heldCashSummary(farmId) : { count: 0, amountFcfa: 0 };

  return (
    <>
      {!online ? (
        <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-amber-100 px-4 py-2 text-sm text-amber-900">
          <CloudOff className="h-4 w-4 shrink-0" />
          <b>Hors ligne.</b>
          <span>
            {savedAt
              ? `Données enregistrées du ${new Date(savedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}.`
              : 'Dernières données enregistrées.'}{' '}
            {note}
          </span>
        </div>
      ) : null}
      {count > 0 || rejected.length > 0 ? (
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-2 bg-brand-50 px-4 py-2 text-left text-sm font-medium text-brand-800 hover:bg-brand-100"
        >
          {rejected.length > 0 ? <AlertTriangle className="h-4 w-4 shrink-0 text-red-600" /> : <RefreshCw className={`h-4 w-4 shrink-0 ${syncing ? 'animate-spin' : ''}`} />}
          {count > 0 ? `${count} opération${count > 1 ? 's' : ''} en attente d’envoi` : ''}
          {count > 0 && rejected.length > 0 ? ' · ' : ''}
          {rejected.length > 0 ? `${rejected.length} refusée${rejected.length > 1 ? 's' : ''} par le serveur` : ''}
          <span className="ml-auto text-xs underline">Voir</span>
        </button>
      ) : null}
      {held.count > 0 ? (
        <div role="alert" className="bg-amber-50 px-4 py-2 text-sm text-amber-900">
          <b>
            {held.count} encaissement{held.count > 1 ? 's' : ''} hors ligne en attente · {fcfa(held.amountFcfa)}.
          </b>{' '}
          La caisse a été clôturée entre-temps. Rien n’est perdu : {held.count > 1 ? 'ils seront enregistrés' : 'il sera enregistré'} à la prochaine ouverture de la caisse.
        </div>
      ) : null}
      {updateReady ? (
        <div className="flex items-center gap-3 bg-brand-900 px-4 py-2 text-sm text-white">
          Une nouvelle version de Fermia est disponible.
          <button onClick={() => applyUpdate.current?.()} className="ml-auto rounded bg-white/15 px-2 py-1 text-xs font-semibold hover:bg-white/25">
            Mettre à jour
          </button>
        </div>
      ) : null}
      {open ? <SyncCentre onClose={() => setOpen(false)} onSync={() => void sync.current()} syncing={syncing} /> : null}
      <QueuedNotice />
    </>
  );
}

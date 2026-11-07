import { useSyncExternalStore } from 'react';
import { useOfflineQueue, useOnline } from '../offline';
import { isSyncing, pulseState, requestSyncCentre, subscribeSyncing, type PulseTone } from '../offline/pulse';
import { classNames } from '../lib/format';

const TONES: Record<PulseTone, { dot: string; ring: string; text: string; pulse: string }> = {
  online: { dot: 'bg-emerald-500', ring: 'bg-emerald-400', text: 'text-emerald-800 bg-emerald-50', pulse: 'motion-safe:animate-ping [animation-duration:2s]' },
  syncing: { dot: 'bg-sky-500', ring: 'bg-sky-400', text: 'text-sky-800 bg-sky-50', pulse: 'motion-safe:animate-ping [animation-duration:0.8s]' },
  // Offline: steady amber dot, no ripple; the ring only blinks slowly so it differs from "online" without relying on colour.
  offline: { dot: 'bg-amber-500', ring: 'bg-amber-400', text: 'text-amber-900 bg-amber-100', pulse: 'motion-safe:animate-pulse' },
};

/**
 * Connection indicator for the top of every screen: pulsing dot + short label.
 * `interactive` (inside the app frames, where OfflineBar is mounted) makes it open the sync centre.
 */
export function ConnectionPulse({ interactive = false, className }: { interactive?: boolean; className?: string }) {
  const online = useOnline();
  const { pending } = useOfflineQueue();
  const syncing = useSyncExternalStore(subscribeSyncing, isSyncing, isSyncing);
  const { tone, label } = pulseState(online, pending.length, syncing);
  const t = TONES[tone];
  const body = (
    <>
      <span aria-hidden className="relative flex h-2.5 w-2.5 shrink-0">
        <span className={classNames('absolute inline-flex h-full w-full rounded-full opacity-60', t.ring, t.pulse)} />
        <span className={classNames('relative inline-flex h-2.5 w-2.5 rounded-full', t.dot)} />
      </span>
      <span className="max-[479px]:sr-only">{label}</span>
    </>
  );
  const cls = classNames('inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold', t.text, className);
  return (
    <span role="status" aria-live="polite" className="contents">
      {interactive ? (
        <button type="button" onClick={requestSyncCentre} className={classNames(cls, 'hover:brightness-95')} title="Ouvrir le centre de synchronisation">
          {body}
        </button>
      ) : (
        <span className={cls}>{body}</span>
      )}
    </span>
  );
}

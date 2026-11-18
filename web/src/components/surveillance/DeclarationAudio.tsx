import { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { api } from '../../api/client';
import type { HealthEventAudio } from '../../api/types-surveillance';
import { Loading } from '../ui';

/** 83 000 ms -> « 1 min 23 s ». */
export function durationFr(ms: number | null): string {
  if (ms == null || ms <= 0) return '';
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')} s` : `${s} s`;
}

/** A voice note read through the authenticated route (no-store), played from a local object URL. */
function AudioPlayer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    api
      .blob(path)
      .then((blob) => {
        if (revoked) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        if (!revoked) setFailed(true);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (failed) return <p className="text-sm text-slate-500">Note vocale indisponible.</p>;
  if (!url) return <Loading label="" />;
  return <audio controls preload="metadata" src={url} className="h-10 w-full" />;
}

/**
 * Voice notes of a sanitary declaration (many farmers cannot write): listened
 * to by the farm and the veterinary services only, through the declaration's
 * own route. Nothing is rendered without a note.
 */
export function DeclarationAudio({
  farmId,
  batchId,
  eventId,
  audio,
}: {
  farmId: string;
  batchId: string;
  eventId: string;
  audio: HealthEventAudio[];
}) {
  if (audio.length === 0) return null;
  const base = `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/audio`;
  return (
    <div className="space-y-2">
      {audio.map((a) => (
        <div key={a.id} className="space-y-1 rounded-lg bg-slate-50 p-2 ring-1 ring-slate-200">
          <p className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Mic className="h-4 w-4" /> Note vocale de l&apos;éleveur
            {a.durationMs ? <span className="font-normal text-slate-500">· {durationFr(a.durationMs)}</span> : null}
          </p>
          <AudioPlayer path={`${base}/${a.id}`} />
        </div>
      ))}
    </div>
  );
}

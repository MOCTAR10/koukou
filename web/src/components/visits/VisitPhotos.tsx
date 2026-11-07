import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Download, ImageOff, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { VisitPhotoView } from '../../api/types-visits';
import { dateTimeFr } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';
import { Note } from '../flock/shared';
import { Loading } from '../ui';
import { PHOTO_ACCEPT, photoProblem, sizeFr } from '../surveillance/declaration';

export const VISIT_PHOTOS_MAX = 8;
const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** Files of one pick split into the ones to send and the French reasons for the others (8 per visit). */
export function splitVisitPhotos<F extends Pick<File, 'name' | 'size' | 'type'>>(files: readonly F[], existingCount: number) {
  const room = Math.max(0, VISIT_PHOTOS_MAX - existingCount);
  const accepted: F[] = [];
  const refused: string[] = [];
  for (const file of files) {
    // The shared check caps at 5 (declarations): only its format and size rules are used here.
    const problem = photoProblem(file, 0);
    if (problem) refused.push(`${file.name} : ${problem}`);
    else if (accepted.length >= room) refused.push(`${file.name} : ${VISIT_PHOTOS_MAX} photos au plus par visite.`);
    else accepted.push(file);
  }
  return { accepted, refused };
}

/** Sends the photos of a visit one by one, after its text; resolves with the French reasons for those that failed. */
export async function uploadVisitPhotos(farmId: string, visitId: string, files: File[]): Promise<string[]> {
  const failed: string[] = [];
  for (const file of files) {
    try {
      const form = new FormData();
      form.append('file', file);
      await api.upload<VisitPhotoView>(`/farms/${farmId}/visits/${visitId}/photos`, form);
    } catch (e) {
      failed.push(`${file.name} : ${e instanceof Error ? e.message : 'envoi impossible.'}`);
    }
  }
  return failed;
}

/** A photo read through the authenticated route (no-store), shown from a local object URL. */
function Thumb({ path, alt, onOpen }: { path: string; alt: string; onOpen: (url: string) => void }) {
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
  if (failed) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400" title="Photo indisponible (hors ligne ?)">
        <ImageOff className="h-6 w-6" />
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-50">
        <Loading label="" />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(url)} className="block w-full overflow-hidden rounded-lg ring-1 ring-slate-200 hover:ring-brand-400">
      <img src={url} alt={alt} className="h-28 w-full object-cover" />
    </button>
  );
}

/**
 * Photos of a visit: thumbnails, full view, and (for the recording agent) an
 * upload after the visit exists. A visit is never edited, photos are added to
 * it. Uploads need a connection on the web (files are not queued).
 */
export function VisitPhotos({ farmId, visitId, photos, canAdd }: { farmId: string; visitId: string; photos: VisitPhotoView[]; canAdd: boolean }) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [viewing, setViewing] = useState<{ url: string; photo: VisitPhotoView } | null>(null);
  const base = `/farms/${farmId}/visits/${visitId}/photos`;

  async function upload(files: File[]) {
    const { accepted, refused: nope } = splitVisitPhotos(files, photos.length);
    setError(null);
    if (accepted.length === 0) return setRefused(nope);
    setBusy(true);
    const failed = await uploadVisitPhotos(farmId, visitId, accepted);
    setRefused([...nope, ...failed]);
    await queryClient.invalidateQueries({ queryKey: ['visit', farmId, visitId] });
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  if (photos.length === 0 && !canAdd) return null;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Photos ({photos.length}/{VISIT_PHOTOS_MAX})
        </h4>
        {canAdd && photos.length < VISIT_PHOTOS_MAX ? (
          <>
            <input ref={input} type="file" accept={PHOTO_ACCEPT} multiple className="hidden" onChange={(e) => void upload(Array.from(e.target.files ?? []))} />
            <Button tone="secondary" busy={busy} onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" /> Ajouter des photos
            </Button>
          </>
        ) : null}
      </div>
      {canAdd ? <p className="text-xs text-slate-500">PNG, JPEG ou WEBP, 5 Mo au plus par photo, {VISIT_PHOTOS_MAX} au plus. L’envoi demande une connexion.</p> : null}
      {refused.length > 0 ? (
        <Note tone="amber">
          {refused.map((r) => (
            <span key={r} className="block">
              {r}
            </span>
          ))}
        </Note>
      ) : null}
      <ErrorNote error={error} />
      {photos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Camera className="h-4 w-4" /> Aucune photo pour cette visite.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {photos.map((p, i) => (
            <div key={p.id} className="space-y-1">
              <Thumb path={`${base}/${p.id}`} alt={`Photo ${i + 1} de la visite`} onOpen={(url) => setViewing({ url, photo: p })} />
              <span className="block text-xs text-slate-500">{sizeFr(p.sizeBytes)}</span>
            </div>
          ))}
        </div>
      )}
      {viewing ? (
        <Modal title="Photo de la visite" onClose={() => setViewing(null)} wide>
          <div className="space-y-3">
            <img src={viewing.url} alt="Photo de la visite" className="max-h-[70vh] w-full rounded-lg object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Ajoutée le {dateTimeFr(viewing.photo.createdAt)} · {sizeFr(viewing.photo.sizeBytes)}
              </span>
              <Button
                tone="secondary"
                onClick={() => void api.download(`${base}/${viewing.photo.id}`, `visite-${visitId.slice(0, 8)}-${viewing.photo.id.slice(0, 8)}.${EXTENSIONS[viewing.photo.mimeType] ?? 'jpg'}`).catch(setError)}
              >
                <Download className="h-4 w-4" /> Télécharger
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

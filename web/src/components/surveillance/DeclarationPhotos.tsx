import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Camera, Download, ImageOff, Trash2, Upload } from 'lucide-react';
import { api } from '../../api/client';
import type { HealthEventPhoto } from '../../api/types-surveillance';
import { dateTimeFr } from '../../lib/format';
import { Button, ErrorNote, Modal } from '../form';
import { Note } from '../flock/shared';
import { ConfirmModal } from '../org/shared';
import { Loading } from '../ui';
import { PHOTO_ACCEPT, PHOTOS_MAX, isDeclarationRefusal, sizeFr, splitPhotos } from './declaration';

const EXTENSIONS: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

/** A photo read through the authenticated route (no-store), shown from a local object URL. */
function PhotoThumb({ path, alt, onOpen }: { path: string; alt: string; onOpen: (url: string) => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
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
      .catch((e: unknown) => {
        if (!revoked) setError(e);
      });
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  if (error) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-lg bg-slate-100 text-slate-400" title={error instanceof Error ? error.message : undefined}>
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
 * Photos of a sanitary declaration (after its text): list, view, upload
 * (PNG/JPEG/WEBP, 5 Mo, 5 at most), delete. The farm and the veterinary
 * services only: the server's 403 is shown as is. Uploads need a connection.
 */
export function DeclarationPhotos({
  farmId,
  batchId,
  eventId,
  photos,
  canAdd,
  canDelete,
}: {
  farmId: string;
  batchId: string;
  eventId: string;
  photos: HealthEventPhoto[];
  canAdd: boolean;
  canDelete: boolean;
}) {
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [list, setList] = useState<HealthEventPhoto[]>(photos);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [viewing, setViewing] = useState<{ url: string; photo: HealthEventPhoto } | null>(null);
  const [toDelete, setToDelete] = useState<HealthEventPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const base = `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/photos`;

  // Follow the server's list when it changes (not on every new array of the same photos).
  const photoKey = photos.map((p) => p.id).join(',');
  const latest = useRef(photos);
  latest.current = photos;
  useEffect(() => setList(latest.current), [photoKey]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['health-events', farmId, batchId] });

  async function upload(files: File[]) {
    const { accepted, refused: nope } = splitPhotos(files, list.length);
    setRefused(nope);
    setError(null);
    if (accepted.length === 0) return;
    setBusy(true);
    try {
      const added: HealthEventPhoto[] = [];
      for (const file of accepted) {
        const form = new FormData();
        form.append('file', file);
        added.push(await api.upload<HealthEventPhoto>(base, form));
      }
      // The same file sent twice is the same photo: keep one.
      setList((cur) => [...cur, ...added.filter((p) => !cur.some((c) => c.id === p.id))]);
      await refresh();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  async function remove(photo: HealthEventPhoto) {
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.del(`${base}/${photo.id}`);
      setList((cur) => cur.filter((p) => p.id !== photo.id));
      setToDelete(null);
      await refresh();
    } catch (e) {
      setDeleteError(e);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-700">
          Photos ({list.length}/{PHOTOS_MAX})
        </p>
        {canAdd && list.length < PHOTOS_MAX ? (
          <>
            <input
              ref={input}
              type="file"
              accept={PHOTO_ACCEPT}
              multiple
              className="hidden"
              onChange={(e) => void upload(Array.from(e.target.files ?? []))}
            />
            <Button tone="secondary" busy={busy} onClick={() => input.current?.click()}>
              <Upload className="h-4 w-4" /> Ajouter des photos
            </Button>
          </>
        ) : null}
      </div>
      {canAdd ? <p className="text-xs text-slate-500">PNG, JPEG ou WEBP, 5 Mo au plus par photo. Visibles par la ferme et les services vétérinaires seulement.</p> : null}
      {refused.length > 0 ? (
        <Note tone="amber">
          {refused.map((r) => (
            <span key={r} className="block">
              {r}
            </span>
          ))}
        </Note>
      ) : null}
      {error && isDeclarationRefusal(error) ? <Note tone="red">{error instanceof Error ? error.message : ''}</Note> : <ErrorNote error={error} />}
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Camera className="h-4 w-4" /> Aucune photo pour cette déclaration.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {list.map((p, i) => (
            <div key={p.id} className="space-y-1">
              <PhotoThumb path={`${base}/${p.id}`} alt={`Photo ${i + 1} de la déclaration`} onOpen={(url) => setViewing({ url, photo: p })} />
              <div className="flex items-center justify-between gap-1 text-xs text-slate-500">
                <span>{sizeFr(p.sizeBytes)}</span>
                {canDelete ? (
                  <button type="button" className="rounded p-1 text-red-500 hover:bg-red-50" aria-label="Retirer la photo" title="Retirer la photo" onClick={() => setToDelete(p)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {viewing ? (
        <Modal title="Photo de la déclaration" onClose={() => setViewing(null)} wide>
          <div className="space-y-3">
            <img src={viewing.url} alt="Photo de la déclaration" className="max-h-[70vh] w-full rounded-lg object-contain" />
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
              <span>
                Ajoutée le {dateTimeFr(viewing.photo.createdAt)} · {sizeFr(viewing.photo.sizeBytes)}
              </span>
              <Button
                tone="secondary"
                onClick={() => void api.download(`${base}/${viewing.photo.id}`, `declaration-${eventId.slice(0, 8)}-${viewing.photo.id.slice(0, 8)}.${EXTENSIONS[viewing.photo.mimeType] ?? 'jpg'}`).catch(setError)}
              >
                <Download className="h-4 w-4" /> Télécharger
              </Button>
            </div>
          </div>
        </Modal>
      ) : null}
      {toDelete ? (
        <ConfirmModal
          title="Retirer cette photo ?"
          message="La photo sera retirée de la déclaration."
          confirmLabel="Retirer"
          busy={deleting}
          error={deleteError}
          onCancel={() => setToDelete(null)}
          onConfirm={() => void remove(toDelete)}
        />
      ) : null}
    </div>
  );
}

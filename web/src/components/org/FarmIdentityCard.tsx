import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Pencil, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { FarmWithLogo } from '../../api/types-org';
import { Button, ErrorNote, inputCls } from '../form';
import { Card } from '../ui';
import { FarmLogo } from './FarmLogo';
import { ConfirmModal, farmLogoSrc, Pill, uploadFarmLogo } from './shared';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function FarmIdentityCard({ farm }: { farm: FarmWithLogo }) {
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(farm.name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // The server keeps the same path when a logo is replaced: force the new image.
  const [logoVersion, setLogoVersion] = useState(0);

  const refreshFarms = () => queryClient.invalidateQueries({ queryKey: ['farms'] });

  const rename = useMutation({
    mutationFn: (name: string) => api.patch<FarmWithLogo>(`/farms/${farm.id}`, { name }),
    onSuccess: async () => {
      await refreshFarms();
      setEditing(false);
    },
  });
  const upload = useMutation({
    mutationFn: (file: File) => uploadFarmLogo(farm.id, file),
    onSuccess: async () => {
      setLogoVersion(Date.now());
      await refreshFarms();
    },
  });
  const removeLogo = useMutation({
    mutationFn: () => api.del<FarmWithLogo>(`/farms/${farm.id}/logo`),
    onSuccess: async () => {
      await refreshFarms();
      setConfirmRemove(false);
    },
  });

  const submitName = (e: FormEvent) => {
    e.preventDefault();
    const name = draft.trim();
    if (name.length < 2) return setNameError('Le nom doit comporter au moins 2 caractères.');
    setNameError(null);
    rename.mutate(name);
  };

  const pickFile = (file: File | undefined) => {
    setFileError(null);
    upload.reset();
    if (!file) return;
    if (file.size > LOGO_MAX_BYTES) return setFileError('Le logo ne doit pas dépasser 2 Mo.');
    upload.mutate(file);
  };

  const hasLogo = !!farmLogoSrc(farm);

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center gap-4">
        <FarmLogo farm={farm} version={logoVersion} size="h-14 w-14" />
        <div className="min-w-0 flex-1">
          {editing ? (
            <form className="flex flex-wrap items-center gap-2" onSubmit={submitName}>
              <input
                className={`${inputCls} max-w-sm`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="Nom de la ferme"
                autoFocus
              />
              <Button type="submit" busy={rename.isPending}>
                {rename.isPending ? null : <Check className="h-4 w-4" />}
                Enregistrer
              </Button>
              <Button
                tone="secondary"
                disabled={rename.isPending}
                onClick={() => {
                  setDraft(farm.name);
                  setNameError(null);
                  rename.reset();
                  setEditing(false);
                }}
              >
                Annuler
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="truncate text-base font-bold text-slate-900">{farm.name}</p>
              <button
                type="button"
                title="Renommer la ferme"
                aria-label="Renommer la ferme"
                className="rounded p-1 text-brand-600 hover:bg-slate-100"
                onClick={() => {
                  setDraft(farm.name);
                  setEditing(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="mt-0.5 text-sm text-slate-500">{farm.administrativeCity || 'Commune non renseignée'}</p>
        </div>
        <Pill tone={farm.active ? 'emerald' : 'red'}>{farm.active ? 'Active' : 'Suspendue'}</Pill>
      </div>

      <ErrorNote error={nameError ?? rename.error} />

      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          aria-label="Fichier du logo"
          onChange={(e) => {
            pickFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <Button tone="secondary" busy={upload.isPending} onClick={() => fileRef.current?.click()}>
          {upload.isPending ? null : <Camera className="h-4 w-4" />}
          {hasLogo ? 'Changer le logo' : 'Ajouter le logo de ma ferme'}
        </Button>
        {hasLogo ? (
          <>
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Check className="h-3.5 w-3.5 text-emerald-600" /> Logo personnalisé
            </span>
            <Button
              tone="secondary"
              className="text-red-600"
              onClick={() => {
                removeLogo.reset();
                setConfirmRemove(true);
              }}
            >
              <Trash2 className="h-4 w-4" /> Retirer
            </Button>
          </>
        ) : (
          <span className="text-xs text-slate-400">Sans logo, c’est la marque Fermia qui s’affiche. PNG, JPEG ou WEBP, 2 Mo maximum.</span>
        )}
      </div>

      <ErrorNote error={fileError ?? upload.error} />

      {confirmRemove ? (
        <ConfirmModal
          title="Retirer le logo"
          message="La ferme repassera au logo Fermia par défaut."
          confirmLabel="Retirer"
          busy={removeLogo.isPending}
          error={removeLogo.error}
          onConfirm={() => removeLogo.mutate()}
          onCancel={() => setConfirmRemove(false)}
        />
      ) : null}
    </Card>
  );
}

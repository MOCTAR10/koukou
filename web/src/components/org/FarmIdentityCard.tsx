import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, Check, Info, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '../../api/client';
import { useFarmProfile } from '../../app/useFarmProfile';
import type { FarmWithLogo } from '../../api/types-org';
import { Button, ErrorNote } from '../form';
import { Card } from '../ui';
import { FarmLogo } from './FarmLogo';
import { ConfirmModal, farmLogoSrc, Pill, uploadFarmLogo } from './shared';

const LOGO_MAX_BYTES = 2 * 1024 * 1024;

/**
 * The farm's identity. Name and code belong to the programme registry (its
 * duplicate checks): the owner reads them here and only manages the logo.
 */
export function FarmIdentityCard({ farm }: { farm: FarmWithLogo }) {
  const { hasPermission } = useFarmProfile();
  const canEdit = hasPermission('reglages:ferme');
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  // The server keeps the same path when a logo is replaced: force the new image.
  const [logoVersion, setLogoVersion] = useState(0);

  const refreshFarms = () => queryClient.invalidateQueries({ queryKey: ['farms'] });

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
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-base font-bold text-slate-900">{farm.name}</p>
            {farm.code ? (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs font-semibold text-slate-600">{farm.code}</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">{farm.administrativeCity || 'Commune non renseignée'}</p>
        </div>
        <Pill tone={farm.active ? 'emerald' : 'red'}>{farm.active ? 'Active' : 'Suspendue'}</Pill>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        Le nom et le code de la ferme sont ceux du registre du programme POUFA. Pour corriger le nom, adressez-vous à
        l’administration du programme.
      </p>

      {canEdit ? (
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
      ) : null}

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

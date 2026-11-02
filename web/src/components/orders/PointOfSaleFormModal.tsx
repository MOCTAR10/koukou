import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Home, Plus, Store } from 'lucide-react';
import { useState } from 'react';
import { api } from '../../api/client';
import type { PointOfSale, PointOfSaleBody } from '../../api/types-orders';
import { useFarm } from '../../app/FarmContext';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { geocodeGabonAddress } from './geo';
import { newIdempotencyKey } from './helpers';
import { AddressField, ProvinceSelect, Segmented, type AddressValue } from './shared';

export function PointOfSaleFormModal({ initial, onClose }: { initial?: PointOfSale; onClose: () => void }) {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [province, setProvince] = useState(initial?.province ?? '');
  const [where, setWhere] = useState<AddressValue>({
    address: initial?.address ?? '',
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
  });
  const [active, setActive] = useState(initial?.isActive ?? true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => newIdempotencyKey('pos'));
  const isDefault = initial?.isDefault === true;

  const save = useMutation({
    mutationFn: async () => {
      const address = where.address.trim();
      const geo = where.latitude == null ? await geocodeGabonAddress({ province, address }) : null;
      const latitude = where.latitude ?? geo?.latitude;
      const longitude = where.longitude ?? geo?.longitude;
      const body: PointOfSaleBody = {
        name: name.trim(),
        kind: initial?.kind ?? 'BOUTIQUE',
        isActive: active,
        // On an edit an emptied field is sent too, so it really gets cleared.
        ...(address || initial ? { address } : {}),
        ...(province || initial ? { province } : {}),
        ...(latitude != null && longitude != null ? { latitude, longitude } : {}),
      };
      return initial
        ? api.patch(`/farms/${farmId}/points-of-sale/${initial.id}`, body)
        : api.post(`/farms/${farmId}/points-of-sale`, { ...body, idempotencyKey });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['points-of-sale', farmId] });
      onClose();
    },
  });

  const title = isDefault
    ? 'Modifier la ferme, point de vente mère'
    : initial
      ? 'Modifier le point de vente'
      : 'Nouveau point de vente';

  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) {
            setLocalError('Nom du point de vente requis.');
            return;
          }
          setLocalError(null);
          save.mutate();
        }}
      >
        <p className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          {isDefault ? <Home className="mt-px h-3.5 w-3.5 shrink-0 text-brand-600" /> : <Store className="mt-px h-3.5 w-3.5 shrink-0 text-accent-700" />}
          {isDefault
            ? 'La ferme elle-même : un seul par exploitation, toujours active, non supprimable.'
            : 'Point de vente rattaché à la ferme, partout au Gabon. Il vend le stock transféré depuis la ferme (abattu, œufs, provende).'}
        </p>
        <Field label="Nom">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isDefault ? 'Ex. Ferme Fermia' : 'Ex. Point de vente Océan'}
            className={inputCls}
          />
        </Field>
        <Field label="Province">
          <ProvinceSelect value={province} onChange={setProvince} emptyLabel="Non renseignée" />
        </Field>
        <AddressField label="Adresse" value={where} province={province} onChange={setWhere} />
        {isDefault ? null : (
          <div>
            <span className="mb-1 block text-xs font-medium text-slate-600">Activation</span>
            <Segmented<'ON' | 'OFF'>
              ariaLabel="Activation du point de vente"
              value={active ? 'ON' : 'OFF'}
              onChange={(v) => setActive(v === 'ON')}
              options={[
                { key: 'ON', label: 'Actif : visible dans la caisse' },
                { key: 'OFF', label: 'En pause : masqué de la caisse' },
              ]}
            />
          </div>
        )}
        <ErrorNote error={localError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Fermer
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!name.trim()}>
            {save.isPending ? null : initial ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {initial ? 'Enregistrer les modifications' : 'Créer le point de vente'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

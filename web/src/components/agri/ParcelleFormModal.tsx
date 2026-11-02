import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { CropCategory, Parcelle, ParcelleInput, ParcelleStatus } from '../../api/types-agri';
import { useFarm } from '../../app/FarmContext';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { StageSummary } from './AgriBits';
import {
  cultureStage,
  groupCulturesByCategory,
  hectaresToM2Label,
  invalidateAgri,
  localYmd,
  PARCELLE_STATUS_HINTS,
  PARCELLE_STATUS_LABELS,
  PARCELLE_STATUS_ORDER,
  parseDecimal,
  useCultures,
} from './agri';

/** Creates or edits a parcel; deleting it goes through a confirmation step. */
export function ParcelleFormModal({ parcelle, onClose }: { parcelle: Parcelle | null; onClose: () => void }) {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();
  const cultures = useCultures(farmId);

  const [name, setName] = useState(parcelle?.name ?? '');
  const [category, setCategory] = useState<CropCategory | ''>(parcelle?.culture.category ?? '');
  const [cultureId, setCultureId] = useState(parcelle?.cultureId ?? '');
  const [area, setArea] = useState(parcelle?.areaHa ? String(parcelle.areaHa).replace('.', ',') : '');
  const [status, setStatus] = useState<ParcelleStatus>(parcelle?.status ?? 'ACTIVE');
  // A new parcel starts today so that its stage shows straight away.
  const [plantedAt, setPlantedAt] = useState(parcelle ? (parcelle.plantedAt?.slice(0, 10) ?? '') : localYmd());
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // A crop withdrawn from the reference list stays selectable on its own parcel.
  const options = useMemo(() => {
    const list = cultures.data ?? [];
    return parcelle && !list.some((c) => c.id === parcelle.cultureId) ? [...list, parcelle.culture] : list;
  }, [cultures.data, parcelle]);
  const groups = useMemo(() => groupCulturesByCategory(options), [options]);
  const activeGroup = groups.find((g) => g.category === category);
  const culture = options.find((c) => c.id === cultureId) ?? null;

  const areaBlank = area.trim() === '';
  const areaHa = parseDecimal(area);
  const areaInvalid = !areaBlank && areaHa === null;
  const stage = culture?.defaultCycleDays ? cultureStage(plantedAt || null, culture.defaultCycleDays) : null;

  const save = useMutation({
    mutationFn: () => {
      const body: ParcelleInput = {
        name: name.trim(),
        cultureId,
        areaHa: areaHa ?? 0,
        status,
        plantedAt: plantedAt || null,
      };
      return parcelle
        ? api.patch<Parcelle>(`/farms/${farmId}/parcelles/${parcelle.id}`, body)
        : api.post<Parcelle>(`/farms/${farmId}/parcelles`, { ...body, plantedAt: plantedAt || undefined });
    },
    onSuccess: () => {
      invalidateAgri(queryClient, farmId);
      onClose();
    },
  });

  const remove = useMutation({
    mutationFn: () => api.del<{ deleted: boolean }>(`/farms/${farmId}/parcelles/${parcelle?.id}`),
    onSuccess: () => {
      invalidateAgri(queryClient, farmId);
      onClose();
    },
  });

  const canSubmit = name.trim().length > 0 && Boolean(cultureId) && !areaInvalid;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) save.mutate();
  };

  if (confirmingDelete && parcelle) {
    return (
      <Modal title="Supprimer la parcelle" onClose={onClose}>
        <div className="space-y-4">
          <p className="text-sm text-slate-700">
            Supprimer définitivement <b>{parcelle.name}</b> ? Son journal de récoltes et le stock vendable
            correspondant seront aussi supprimés. Les ventes déjà enregistrées sont conservées.
          </p>
          <ErrorNote error={remove.error} />
          <div className="flex justify-end gap-2">
            <Button tone="secondary" onClick={() => setConfirmingDelete(false)} disabled={remove.isPending}>
              Annuler
            </Button>
            <Button tone="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
              Supprimer la parcelle
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={parcelle ? `Modifier « ${parcelle.name} »` : 'Nouvelle parcelle'} onClose={onClose}>
      <form className="space-y-4" onSubmit={onSubmit}>
        <Field label="Nom de la parcelle *">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. : Champ de plantain"
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Catégorie *">
            <select
              className={inputCls}
              value={category}
              disabled={cultures.isPending}
              onChange={(e) => {
                setCategory(e.target.value as CropCategory | '');
                // A crop from another category no longer applies.
                setCultureId('');
              }}
              required
            >
              <option value="">{cultures.isPending ? 'Chargement…' : 'Choisir une catégorie…'}</option>
              {groups.map((g) => (
                <option key={g.category} value={g.category}>
                  {g.label} ({g.cultures.length})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Culture *">
            <select
              className={inputCls}
              value={cultureId}
              disabled={!activeGroup}
              onChange={(e) => setCultureId(e.target.value)}
              required
            >
              <option value="">{activeGroup ? 'Choisir une culture…' : 'Choisissez d’abord la catégorie'}</option>
              {activeGroup?.cultures.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.defaultCycleDays ? `≈ ${c.defaultCycleDays} j` : 'cycle libre'})
                </option>
              ))}
            </select>
          </Field>
        </div>
        <ErrorNote error={cultures.error} />

        <Field
          label="Surface (ha)"
          hint={
            parcelle?.boundaryGeoJson
              ? 'Cette parcelle a un contour GPS : le serveur recalcule la surface à partir du contour.'
              : areaInvalid
                ? 'Saisissez un nombre, par exemple 1,5.'
                : `≈ ${hectaresToM2Label(areaHa ?? 0)}`
          }
        >
          <input
            className={inputCls}
            value={area}
            onChange={(e) => setArea(e.target.value)}
            inputMode="decimal"
            placeholder="0,00"
            aria-invalid={areaInvalid}
          />
        </Field>

        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Une parcelle porte une seule culture. Pour plusieurs cultures, créez plusieurs parcelles.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Statut" hint={PARCELLE_STATUS_HINTS[status]}>
            <select
              className={inputCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as ParcelleStatus)}
            >
              {PARCELLE_STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {PARCELLE_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date de plantation" hint="Indispensable pour calculer le stade et suivre la culture.">
            <input
              type="date"
              className={inputCls}
              value={plantedAt}
              onChange={(e) => setPlantedAt(e.target.value)}
            />
          </Field>
        </div>

        {stage ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="mb-2 text-xs font-medium text-slate-600">Stade estimé</p>
            <StageSummary stage={stage} culture={culture} />
          </div>
        ) : null}

        <ErrorNote error={save.error} />

        <div className="flex items-center justify-between gap-2 pt-1">
          {parcelle ? (
            <Button
              tone="secondary"
              className="text-red-700"
              disabled={save.isPending}
              onClick={() => {
                remove.reset();
                setConfirmingDelete(true);
              }}
            >
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
              Annuler
            </Button>
            <Button type="submit" busy={save.isPending} disabled={!canSubmit}>
              {parcelle ? 'Enregistrer' : 'Ajouter la parcelle'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

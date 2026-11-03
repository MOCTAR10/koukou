import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, Plus, Warehouse } from 'lucide-react';
import { api } from '../../api/client';
import type { BatchType } from '../../api/types';
import type { Building } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { dateFr, num } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { EmptyState, Loading, Td, Th } from '../ui';
import { Note, Pill, SectionCard, localYmd, parseNum, useBuildings, useInvalidateFarm, videSanitaireHint } from './shared';

/** Densities of the mobile building sheet, birds per m2. */
const DENSITY: Record<BatchType, number> = { CHAIR: 10, PONDEUSE: 6 };

export function BuildingFormModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (id: string) => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [type, setType] = useState<BatchType>('CHAIR');
  const [lastVide, setLastVide] = useState('');

  const areaNum = parseNum(area) ?? 0;
  const capacity = areaNum > 0 ? Math.round(areaNum * DENSITY[type]) : 0;

  const create = useMutation({
    mutationFn: () =>
      api.post<Building>(`/farms/${farmId}/buildings`, {
        name: name.trim(),
        buildingAreaM2: areaNum > 0 ? areaNum : undefined,
        capacity: capacity > 0 ? capacity : undefined,
        lastVideSanitaireAt: lastVide || undefined,
      }),
    onSuccess: async (b) => {
      await invalidate();
      if (onCreated) onCreated(b.id);
      else onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (name.trim()) create.mutate();
  };

  return (
    <Modal title="Nouveau bâtiment" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Nom du bâtiment *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Bâtiment A" required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Surface (m²)">
            <input className={inputCls} inputMode="decimal" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Ex : 300" />
          </Field>
          <Field label="Type d'élevage prévu">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value as BatchType)}>
              <option value="CHAIR">Chair</option>
              <option value="PONDEUSE">Pondeuse</option>
            </select>
          </Field>
        </div>
        {capacity > 0 ? (
          <Note tone="brand">
            Capacité enregistrée : {num(capacity)} oiseaux ({DENSITY[type]} oiseaux/m²).{' '}
            {type === 'CHAIR'
              ? `Saison chaude : ${num(Math.round(areaNum * 8))} oiseaux (8/m²).`
              : ''}{' '}
            Poussins en début de cycle : jusqu'à {num(Math.round(areaNum * 35))} (35/m²).
          </Note>
        ) : null}
        <Field label="Dernier vide sanitaire">
          <input className={inputCls} type="date" max={localYmd()} value={lastVide} onChange={(e) => setLastVide(e.target.value)} />
        </Field>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!name.trim()}>
            <Building2 className="h-4 w-4" /> Créer le bâtiment
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function BuildingsPanel() {
  const { hasPermission } = useFarmProfile();
  const buildings = useBuildings();
  const [adding, setAdding] = useState(false);

  if (buildings.isLoading) return <Loading label="Chargement des bâtiments…" />;

  return (
    <SectionCard
      title="Bâtiments"
      icon={<Warehouse />}
      subtitle="Occupation, densité et vide sanitaire"
      flush
      actions={
        hasPermission('production:gerer') ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Nouveau bâtiment
          </Button>
        ) : undefined
      }
    >
      <ErrorNote error={buildings.error} />
      {buildings.data?.length ? (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Bâtiment</Th>
                <Th>Surface</Th>
                <Th>Capacité</Th>
                <Th>Oiseaux présents</Th>
                <Th>Lots actifs</Th>
                <Th>Densité</Th>
                <Th>Dernier lot terminé</Th>
                <Th>Dernier vide</Th>
                <Th>Pour un nouveau lot aujourd'hui</Th>
              </tr>
            </thead>
            <tbody>
              {buildings.data.map((b) => {
                const hint = videSanitaireHint({
                  activeLots: b.stats?.activeLots ?? 0,
                  lastLotEndedAt: b.stats?.lastLotEndedAt,
                  placementDate: localYmd(),
                });
                return (
                  <tr key={b.id} className="border-t border-slate-100 align-top">
                    <Td className="font-medium">{b.name}</Td>
                    <Td>{b.buildingAreaM2 != null ? `${num(b.buildingAreaM2)} m²` : '—'}</Td>
                    <Td>{b.capacity != null ? num(b.capacity) : '—'}</Td>
                    <Td>{num(b.stats?.activeBirds ?? 0)}</Td>
                    <Td>{b.stats?.activeLots ?? 0}</Td>
                    <Td>{b.stats?.densityPerM2 != null ? `${num(b.stats.densityPerM2)}/m²` : '—'}</Td>
                    <Td>{dateFr(b.stats?.lastLotEndedAt)}</Td>
                    <Td>{dateFr(b.lastVideSanitaireAt)}</Td>
                    <Td className="max-w-xs">
                      <Pill tone={hint.tone}>{hint.text}</Pill>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState message="Aucun bâtiment. Créez-en un pour installer vos lots." icon={<Warehouse />} />
        </div>
      )}
      {adding ? <BuildingFormModal onClose={() => setAdding(false)} /> : null}
    </SectionCard>
  );
}

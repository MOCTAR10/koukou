import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info, Pencil, Search } from 'lucide-react';
import { api } from '../../api/client';
import type { ReferenceConstant } from '../../api/types';
import { num } from '../../lib/format';
import { Note, Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import type { AdminRights } from './adminRights';
import { ownerLabel } from './parameters';
import { groupThresholds, mayEditThreshold, ownerOf, parseThreshold, THRESHOLD_GROUP_LABELS, thresholdValueError } from './thresholds';

const KEY = ['reference-constants'] as const;

/**
 * POUFA lot A droits (F8): the Fermia conduct thresholds in the programme
 * settings (`/app/parametres/seuils`). Everyone with the parameters reads
 * them; the owner profile (veterinary services for the sanitary ones, DGE for
 * the rest) or the platform admin changes them. Each change is journaled.
 */
export function ThresholdsView({ rights }: { rights: AdminRights['parameters'] }) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<ReferenceConstant | null>(null);
  const constants = useQuery({ queryKey: KEY, queryFn: () => api.get<ReferenceConstant[]>('/reference-constants') });
  const groups = groupThresholds(constants.data ?? [], query);

  return (
    <div className="space-y-4">
      <Note tone="brand" icon={<Info />}>
        Ces seuils règlent les alertes et conseils de conduite de Fermia (vide sanitaire, prophylaxie, marges, autonomie d’aliment…). Les
        seuils sanitaires appartiennent aux services vétérinaires, les autres à la DGE : seul ce profil (ou l’administrateur plateforme) les
        modifie. La nouvelle valeur s’applique tout de suite et le changement est inscrit au journal d’audit.
      </Note>
      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input aria-label="Rechercher un seuil" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un seuil…" className={`${inputCls} pl-9`} />
        </div>
      </Card>
      <ErrorNote error={constants.error} />
      {constants.isLoading ? (
        <Loading label="Chargement des seuils…" />
      ) : groups.length === 0 ? (
        <EmptyState message={query ? 'Aucun seuil ne correspond à la recherche.' : 'Aucun seuil de conduite.'} />
      ) : (
        groups.map((g) => (
          <Card key={g.group} className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-700">{THRESHOLD_GROUP_LABELS[g.group]}</h2>
            </div>
            <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Seuil</Th>
                  <Th className="text-right">Valeur</Th>
                  <Th>Propriétaire</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.key} className="border-t border-slate-100">
                    <Td className="min-w-48">
                      <span className="font-medium text-slate-900">{r.description ?? r.key}</span>
                      <span className="block font-mono text-xs text-slate-500">{r.key}</span>
                    </Td>
                    <Td label="Valeur" className="whitespace-nowrap text-right font-semibold tabular-nums">{num(r.value, 2)}</Td>
                    <Td label="Propriétaire">
                      <Pill tone={ownerOf(r) === 'VETERINAIRE' ? 'emerald' : 'brand'}>{ownerLabel(ownerOf(r))}</Pill>
                      {!r.isEditable ? <span className="ml-2 text-xs text-slate-500">non modifiable</span> : null}
                    </Td>
                    <Td className="text-right">
                      {mayEditThreshold(rights, r) ? (
                        <Button tone="secondary" className="px-2.5 py-1 text-xs" onClick={() => setEditing(r)}>
                          <Pencil className="h-3.5 w-3.5" /> Modifier
                        </Button>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </Card>
        ))
      )}
      {editing ? <ThresholdModal row={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function ThresholdModal({ row, onClose }: { row: ReferenceConstant; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [raw, setRaw] = useState(String(row.value).replace('.', ','));
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (value: number) => api.patch<ReferenceConstant>(`/reference-constants/${row.key}`, { value }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: KEY });
      onClose();
    },
  });
  return (
    <Modal side title={row.description ?? row.key} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const invalid = thresholdValueError(raw);
          if (invalid) return setError(invalid);
          save.mutate(parseThreshold(raw));
        }}
      >
        <p className="text-sm text-slate-600">
          Valeur actuelle : <b>{num(row.value, 2)}</b> · propriétaire : {ownerLabel(ownerOf(row))}
        </p>
        <Field label="Nouvelle valeur">
          <input
            className={inputCls}
            inputMode="decimal"
            value={raw}
            onChange={(e) => {
              setRaw(e.target.value);
              setError(null);
            }}
            autoFocus
          />
        </Field>
        <ErrorNote error={error ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

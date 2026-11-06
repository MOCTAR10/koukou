import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { api } from '../../api/client';
import type { RefItem } from '../../api/types-programme';
import { useAuth } from '../../auth/AuthContext';
import { Button, ErrorNote, Field, inputCls } from '../form';
import { Note, Pill, SectionCard, Tabs } from '../flock/shared';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { familyLabel } from './alertRules';
import { invalidateList } from './queries';
import {
  SANITARY_LISTS,
  SANITARY_LIST_LABELS,
  STATUT_ALERTE_FAMILIES,
  codeFromLabel,
  lastActiveWarning,
  needsFamily,
  newItemBody,
  newItemProblem,
  nextSort,
  type SanitaryList,
} from './settingsRules';

const LIST_HINTS: Record<SanitaryList, string> = {
  SIGNE_CLINIQUE: 'Proposés dans le formulaire de déclaration sanitaire (web et mobile).',
  PRODUIT_TRAITEMENT: 'Proposés à la saisie d’un traitement.',
  STATUT_ALERTE: 'Statuts du circuit des alertes. La famille fixe le comportement : Nouvelle → En analyse → Confirmée ou Infirmée → Close.',
};

/**
 * The sanitary lists the veterinary services maintain (`/surveillance/lists`):
 * create, rename, deactivate (never delete). Codes and families never change.
 * The profiles that maintain the list (SANITAIRE:MODIFIER, platform admin)
 * read the deactivated items (`?all=true`, server `mayReadInactiveItems`); for
 * the others, the ones deactivated here stay listed for this visit.
 */
export function SanitaryListsAdmin({ canEdit }: { canEdit: boolean }) {
  const [list, setList] = useState<SanitaryList>('SIGNE_CLINIQUE');
  return (
    <div className="space-y-4">
      <Tabs<SanitaryList> value={list} onChange={setList} options={SANITARY_LISTS.map((l) => ({ key: l, label: SANITARY_LIST_LABELS[l] }))} />
      <ListEditor key={list} list={list} canEdit={canEdit} />
    </div>
  );
}

function ListEditor({ list, canEdit }: { list: SanitaryList; canEdit: boolean }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  // POUFA lot A indic: SANITAIRE:MODIFIER reads the deactivated items too.
  const all = user?.role === 'PLATFORM_ADMIN' || canEdit;
  const items = useQuery({
    queryKey: ['programme-list', list, all ? 'all' : 'active'],
    queryFn: () => api.getFresh<RefItem[]>(`/programme/lists/${list}${all ? '?all=true' : ''}`),
  });
  // Items deactivated during this visit (a vet can't read inactive items back).
  const [offList, setOffList] = useState<RefItem[]>([]);
  const rows = [...(items.data ?? []), ...offList.filter((o) => !(items.data ?? []).some((i) => i.code === o.code))].sort(
    (a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fr'),
  );
  const [editing, setEditing] = useState<{ code: string; label: string } | null>(null);
  const [form, setForm] = useState({ code: '', label: '', family: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const problem = newItemProblem(list, form, rows);

  const refresh = () => {
    invalidateList(queryClient, list);
    void items.refetch();
  };
  const create = useMutation({
    mutationFn: () => api.post<RefItem>(`/surveillance/lists/${list}`, newItemBody(list, form, nextSort(rows))),
    onSuccess: () => {
      setForm({ code: '', label: '', family: '' });
      setCodeTouched(false);
      refresh();
    },
  });
  const patch = useMutation({
    mutationFn: (v: { code: string; body: { label?: string; active?: boolean } }) => api.patch<RefItem>(`/surveillance/lists/${list}/${v.code}`, v.body),
    onSuccess: (item) => {
      setEditing(null);
      setOffList((cur) => (item.active ? cur.filter((o) => o.code !== item.code) : [...cur.filter((o) => o.code !== item.code), item]));
      refresh();
    },
  });

  return (
    <SectionCard title={SANITARY_LIST_LABELS[list]} subtitle={LIST_HINTS[list]} flush>
      <ErrorNote error={items.error ?? patch.error} />
      {items.isLoading ? (
        <div className="p-4">
          <Loading />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-4">
          <EmptyState message="Aucun élément dans cette liste." />
        </div>
      ) : (
        <DataTable>
          <thead className="bg-slate-50">
            <tr>
              <Th>Libellé</Th>
              <Th>Code</Th>
              {needsFamily(list) ? <Th>Famille</Th> : null}
              <Th>État</Th>
              <Th> </Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const warning = lastActiveWarning(list, item, rows);
              const isEditing = editing?.code === item.code;
              return (
                <tr key={item.code} className="border-t border-slate-100 align-top">
                  <Td>
                    {isEditing ? (
                      <input
                        className={inputCls}
                        aria-label="Libellé"
                        value={editing.label}
                        maxLength={200}
                        onChange={(e) => setEditing({ code: item.code, label: e.target.value })}
                      />
                    ) : (
                      <span className={item.active ? 'font-medium' : 'text-slate-400 line-through'}>{item.label}</span>
                    )}
                  </Td>
                  <Td label="Code">
                    <span className="font-mono text-xs">{item.code}</span>
                  </Td>
                  {needsFamily(list) ? <Td label="Famille">{item.family ? familyLabel(item.family) : '—'}</Td> : null}
                  <Td label="État">{item.active ? <Pill tone="emerald">Actif</Pill> : <Pill>Désactivé</Pill>}</Td>
                  <Td className="whitespace-nowrap text-right">
                    {canEdit ? (
                      isEditing ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            busy={patch.isPending}
                            disabled={!editing.label.trim()}
                            onClick={() => patch.mutate({ code: item.code, body: { label: editing.label.trim() } })}
                          >
                            <Check className="h-4 w-4" /> Enregistrer
                          </Button>
                          <Button tone="secondary" onClick={() => setEditing(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button tone="secondary" onClick={() => setEditing({ code: item.code, label: item.label })}>
                            <Pencil className="h-4 w-4" /> Renommer
                          </Button>
                          {item.active ? (
                            <Button
                              tone="secondary"
                              title={warning ?? undefined}
                              busy={patch.isPending && patch.variables?.code === item.code}
                              onClick={() => patch.mutate({ code: item.code, body: { active: false } })}
                            >
                              <EyeOff className="h-4 w-4" /> Désactiver
                            </Button>
                          ) : (
                            <Button
                              tone="secondary"
                              busy={patch.isPending && patch.variables?.code === item.code}
                              onClick={() => patch.mutate({ code: item.code, body: { active: true } })}
                            >
                              <RotateCcw className="h-4 w-4" /> Réactiver
                            </Button>
                          )}
                        </div>
                      )
                    ) : null}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
      {!all && canEdit ? (
        <p className="px-4 py-2 text-xs text-slate-500">
          Les éléments désactivés lors d’une visite précédente ne sont plus listés ici (lecture réservée à l’administrateur plateforme).
        </p>
      ) : null}
      {canEdit ? (
        <form
          className="space-y-3 border-t border-slate-100 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem) create.mutate();
          }}
        >
          <p className="text-sm font-semibold text-slate-700">Ajouter un élément</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Libellé *">
              <input
                className={inputCls}
                value={form.label}
                maxLength={200}
                onChange={(e) => {
                  const label = e.target.value;
                  setForm((f) => ({ ...f, label, code: codeTouched ? f.code : codeFromLabel(label) }));
                }}
              />
            </Field>
            <Field label="Code *" hint="Ne changera plus.">
              <input
                className={`${inputCls} font-mono`}
                value={form.code}
                maxLength={40}
                onChange={(e) => {
                  setCodeTouched(true);
                  setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }));
                }}
              />
            </Field>
            {needsFamily(list) ? (
              <Field label="Famille *" hint="Ne changera plus.">
                <select className={inputCls} value={form.family} onChange={(e) => setForm((f) => ({ ...f, family: e.target.value }))}>
                  <option value="">Choisir…</option>
                  {STATUT_ALERTE_FAMILIES.map((f) => (
                    <option key={f} value={f}>
                      {familyLabel(f)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
          </div>
          {form.label && problem ? <Note tone="amber">{problem}</Note> : null}
          <ErrorNote error={create.error} />
          <Button type="submit" busy={create.isPending} disabled={!!problem}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      ) : null}
    </SectionCard>
  );
}

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Info, Lock, Pencil, Plus, Power, RotateCcw } from 'lucide-react';
import { api } from '../../api/client';
import type { ListItem, ProgramListType, UpdateListItemBody } from '../../api/types-admin';
import { classNames } from '../../lib/format';
import { Note, Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, Modal } from '../form';
import { Card, DataTable, EmptyState, IconButton, Loading, Td, Th } from '../ui';
import type { AdminRights } from './adminRights';
import {
  codeFromLabel,
  createItemBody,
  FAMILY_LABELS,
  familiesOf,
  isVetList,
  LIST_TYPES,
  listLabel,
  newItemErrors,
  sortItems,
  updateItemBody,
  type NewItemDraft,
} from './lists';
import { invalidateList, useListItems } from './queries';

/**
 * Configurable lists of the programme (`ProgramListType`): add an item,
 * relabel, reorder, deactivate or reactivate (never deleted). Code and family
 * never change. The veterinary lists are maintained from the surveillance
 * screens and read-only here.
 */
export function ListsView({ rights }: { rights: AdminRights['lists'] }) {
  const [listType, setListType] = useState<ProgramListType>('STATUT_FERME');
  const items = useListItems(listType, rights.readInactive);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ListItem | null>(null);
  const [toggling, setToggling] = useState<ListItem | null>(null);
  const vet = isVetList(listType);
  const canWrite = rights.write && !vet;
  const families = familiesOf(listType);
  const def = LIST_TYPES.find((l) => l.type === listType);

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <Card className="p-2">
        <nav aria-label="Listes du programme" className="flex flex-wrap gap-1 lg:flex-col">
          {LIST_TYPES.map((l) => (
            <button
              key={l.type}
              type="button"
              onClick={() => setListType(l.type)}
              aria-current={l.type === listType ? 'true' : undefined}
              className={classNames(
                'flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm',
                l.type === listType ? 'bg-brand-50 font-semibold text-brand-800' : 'text-slate-600 hover:bg-slate-50',
              )}
            >
              <span>{l.label}</span>
              {isVetList(l.type) ? <Lock className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-label="Liste vétérinaire" /> : null}
            </button>
          ))}
        </nav>
      </Card>

      <div className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{listLabel(listType)}</h2>
            <p className="text-sm text-slate-500">{def?.help}</p>
            <p className="font-mono text-[11px] text-slate-400">{listType}</p>
          </div>
          {canWrite ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> Ajouter un élément
            </Button>
          ) : null}
        </div>

        {vet ? (
          <Note tone="amber" icon={<Lock />}>
            Liste tenue par les services vétérinaires depuis leurs écrans de surveillance sanitaire (droits SANITAIRE) : consultation seule
            ici.
          </Note>
        ) : !rights.write ? (
          <Note tone="slate" icon={<Info />}>
            Consultation seule : la modification des listes demande le droit Administration · Administrer.
          </Note>
        ) : null}
        {!rights.readInactive ? (
          <p className="text-xs text-slate-500">
            Seuls les éléments actifs sont affichés : les éléments désactivés ne sont visibles (et réactivables) que par l’administrateur
            plateforme.
          </p>
        ) : null}
        {families ? (
          <p className="text-xs text-slate-500">
            Chaque élément porte une famille ({families.map((f) => FAMILY_LABELS[f] ?? f).join(', ')}) : c’est elle, et non le code ou le
            libellé, qui règle le comportement de l’application.
          </p>
        ) : null}

        <ErrorNote error={items.error} />
        <Card className="overflow-hidden">
          {items.isLoading ? (
            <div className="p-4">
              <Loading />
            </div>
          ) : !items.data?.length ? (
            <div className="p-4">
              <EmptyState message="Aucun élément dans cette liste." />
            </div>
          ) : (
            <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Libellé</Th>
                  <Th>Code</Th>
                  {families ? <Th>Famille</Th> : null}
                  <Th className="hidden lg:table-cell">Ordre</Th>
                  <Th>État</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {sortItems(items.data).map((item) => (
                  <tr key={item.id} className={classNames('border-t border-slate-100', !item.active && 'bg-slate-50/60 text-slate-400')}>
                    <Td>
                      <span className={classNames('font-medium', item.active ? 'text-slate-900' : 'text-slate-500 line-through')}>{item.label}</span>
                    </Td>
                    <Td label="Code">
                      <span className="font-mono text-xs">{item.code}</span>
                    </Td>
                    {families ? (
                      <Td label="Famille">
                        <span className="text-xs">{item.family ? (FAMILY_LABELS[item.family] ?? item.family) : '—'}</span>
                      </Td>
                    ) : null}
                    <Td label="Ordre" className="md:max-lg:hidden">
                      <span className="tabular-nums">{item.sort}</span>
                    </Td>
                    <Td label="État">{item.active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="slate">Désactivé</Pill>}</Td>
                    <Td className="whitespace-nowrap">
                      {canWrite ? (
                        <div className="flex justify-end gap-1">
                          <IconButton label={`Modifier « ${item.label} »`} onClick={() => setEditing(item)}>
                            <Pencil className="h-4 w-4" />
                          </IconButton>
                          <IconButton
                            label={item.active ? `Désactiver « ${item.label} »` : `Réactiver « ${item.label} »`}
                            danger={item.active}
                            onClick={() => setToggling(item)}
                          >
                            {item.active ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
                          </IconButton>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Card>
      </div>

      {creating ? <CreateItemModal listType={listType} existing={items.data ?? []} onClose={() => setCreating(false)} /> : null}
      {editing ? <EditItemModal listType={listType} item={editing} onClose={() => setEditing(null)} /> : null}
      {toggling ? (
        <ToggleItemModal listType={listType} item={toggling} readInactive={rights.readInactive} onClose={() => setToggling(null)} />
      ) : null}
    </div>
  );
}

function useItemPatch(listType: ProgramListType, code: string, onDone: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateListItemBody) => api.patch<ListItem>(`/programme/lists/${listType}/${encodeURIComponent(code)}`, body),
    onSuccess: () => {
      invalidateList(queryClient, listType);
      onDone();
    },
  });
}

function CreateItemModal({ listType, existing, onClose }: { listType: ProgramListType; existing: readonly ListItem[]; onClose: () => void }) {
  const queryClient = useQueryClient();
  const families = familiesOf(listType);
  const [draft, setDraft] = useState<NewItemDraft>({ code: '', label: '', family: '' });
  const [codeTouched, setCodeTouched] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof NewItemDraft, string>>>({});
  const create = useMutation({
    mutationFn: () => api.post<ListItem>(`/programme/lists/${listType}`, createItemBody(listType, draft)),
    onSuccess: () => {
      invalidateList(queryClient, listType);
      onClose();
    },
  });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const found = newItemErrors(listType, draft, existing);
    setErrors(found);
    if (Object.keys(found).length === 0) create.mutate();
  };

  return (
    <Modal title={`Nouvel élément · ${listLabel(listType)}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Libellé">
          <input
            className={inputCls}
            value={draft.label}
            maxLength={200}
            autoFocus
            onChange={(e) => {
              const label = e.target.value;
              setDraft((d) => ({ ...d, label, code: codeTouched ? d.code : codeFromLabel(label) }));
            }}
          />
        </Field>
        {errors.label ? <p className="text-xs text-red-600">{errors.label}</p> : null}
        <Field label="Code" hint="Majuscules, chiffres et _ (40 au plus). Il ne pourra plus changer.">
          <input
            className={`${inputCls} font-mono`}
            value={draft.code}
            maxLength={40}
            onChange={(e) => {
              setCodeTouched(true);
              setDraft((d) => ({ ...d, code: e.target.value.toUpperCase() }));
            }}
          />
        </Field>
        {errors.code ? <p className="text-xs text-red-600">{errors.code}</p> : null}
        {families ? (
          <>
            <Field label="Famille" hint="Obligatoire pour cette liste : elle règle le comportement. Elle ne pourra plus changer.">
              <select className={inputCls} value={draft.family} onChange={(e) => setDraft((d) => ({ ...d, family: e.target.value }))}>
                <option value="">Choisir…</option>
                {families.map((f) => (
                  <option key={f} value={f}>
                    {FAMILY_LABELS[f] ?? f} ({f})
                  </option>
                ))}
              </select>
            </Field>
            {errors.family ? <p className="text-xs text-red-600">{errors.family}</p> : null}
          </>
        ) : null}
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={create.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending}>
            Ajouter
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditItemModal({ listType, item, onClose }: { listType: ProgramListType; item: ListItem; onClose: () => void }) {
  const [label, setLabel] = useState(item.label);
  const [sort, setSort] = useState(String(item.sort));
  const [formError, setFormError] = useState<string | null>(null);
  const patch = useItemPatch(listType, item.code, onClose);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = updateItemBody(item, { label, sort });
    if (body === null) return onClose();
    if ('error' in body) return setFormError(body.error);
    setFormError(null);
    patch.mutate(body);
  };

  return (
    <Modal title={`Modifier · ${item.label}`} onClose={onClose}>
      <form className="space-y-4" onSubmit={submit}>
        <dl className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
          <dt className="text-slate-500">Code</dt>
          <dd className="font-mono text-xs">{item.code}</dd>
          {item.family ? (
            <>
              <dt className="text-slate-500">Famille</dt>
              <dd>{FAMILY_LABELS[item.family] ?? item.family}</dd>
            </>
          ) : null}
          <dd className="col-span-2 text-xs text-slate-500">Le code et la famille ne changent jamais.</dd>
        </dl>
        <Field label="Libellé">
          <input className={inputCls} value={label} maxLength={200} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </Field>
        <Field label="Ordre d’affichage" hint="Entier ; les plus petits d’abord.">
          <input className={inputCls} inputMode="numeric" value={sort} onChange={(e) => setSort(e.target.value)} />
        </Field>
        <ErrorNote error={formError ?? patch.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={patch.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={patch.isPending}>
            Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function ToggleItemModal({ listType, item, readInactive, onClose }: { listType: ProgramListType; item: ListItem; readInactive: boolean; onClose: () => void }) {
  const patch = useItemPatch(listType, item.code, onClose);
  const deactivating = item.active;
  return (
    <Modal title={deactivating ? `Désactiver « ${item.label} » ?` : `Réactiver « ${item.label} » ?`} onClose={onClose}>
      <div className="space-y-4 text-sm text-slate-700">
        {deactivating ? (
          <>
            <p>
              L’élément ne sera plus proposé dans les écrans. Il n’est jamais supprimé : les fiches et les saisies qui l’utilisent le gardent.
            </p>
            {!readInactive ? (
              <Note tone="amber">
                Vous ne le verrez plus ici : seuls les éléments actifs vous sont affichés, et seul l’administrateur plateforme peut le réactiver.
              </Note>
            ) : null}
          </>
        ) : (
          <p>L’élément sera de nouveau proposé dans les écrans.</p>
        )}
        <ErrorNote error={patch.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={patch.isPending}>
            Annuler
          </Button>
          <Button tone={deactivating ? 'danger' : 'primary'} busy={patch.isPending} onClick={() => patch.mutate({ active: !deactivating })}>
            {deactivating ? 'Désactiver' : 'Réactiver'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

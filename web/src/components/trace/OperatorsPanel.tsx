import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, Pencil, Plus, Power, Search } from 'lucide-react';
import { api } from '../../api/client';
import type { OperatorView } from '../../api/types-trace';
import { dateFr } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal } from '../form';
import { useProvinces } from '../registry/queries';
import { useListItems } from '../supply/queries';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import { createPayload, draftOf, filterOperators, patchPayload, validateOperator, type OperatorDraft } from './operatorRules';
import { useOperators } from './queries';
import type { TraceRights } from './traceAccess';

/**
 * Operators registry (CDC « Registre des opérateurs », national): slaughter
 * houses, buyers, distributors and carriers the lots are ceded to. Every
 * account reads the active ones; the national administration creates, edits
 * and deactivates (never deletes).
 */
export function OperatorsPanel({ rights }: { rights: TraceRights }) {
  const [showInactive, setShowInactive] = useState(false);
  const operators = useOperators(rights.readInactiveOperators && showInactive);
  const types = useListItems('TYPE_OPERATEUR');
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [editing, setEditing] = useState<OperatorView | 'new' | null>(null);
  const rows = filterOperators(operators.data ?? [], q, type);

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom ou code (OP-0001)…" aria-label="Rechercher un opérateur" className={`${inputCls} pl-9`} />
        </div>
        <select aria-label="Type d’opérateur" className={`${inputCls} sm:w-56`} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">Tous les types</option>
          {(types.data ?? []).map((t) => (
            <option key={t.code} value={t.code}>
              {t.label}
            </option>
          ))}
        </select>
        {rights.readInactiveOperators ? (
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Désactivés inclus
          </label>
        ) : null}
        {rights.createOperator ? (
          <Button onClick={() => setEditing('new')}>
            <Plus className="h-4 w-4" /> Nouvel opérateur
          </Button>
        ) : null}
      </Card>
      <ErrorNote error={operators.error} />
      <Card className="overflow-hidden">
        {operators.isLoading ? (
          <div className="p-4">
            <Loading />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={<Building2 />} message={q || type ? 'Aucun opérateur ne correspond.' : 'Aucun opérateur enregistré.'} />
          </div>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Opérateur</Th>
                <Th>Type</Th>
                <Th className="hidden lg:table-cell">Localité</Th>
                <Th>Convention</Th>
                <Th>Contact</Th>
                <Th>Statut</Th>
                {rights.editOperator ? <Th /> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id}>
                  <Td className="font-medium">
                    {o.name}
                    <span className="block font-mono text-xs font-normal text-slate-500">{o.code}</span>
                  </Td>
                  <Td label="Type">{o.typeLabel ?? o.typeCode}</Td>
                  <Td label="Localité" className="md:max-lg:hidden">
                    {o.localite ? `${o.localite.name} (${o.localite.provinceCode})` : '—'}
                  </Td>
                  <Td label="Convention">
                    {o.conventionRef ?? '—'}
                    {o.conventionSignedAt ? <span className="block text-xs text-slate-500">signée le {dateFr(o.conventionSignedAt)}</span> : null}
                  </Td>
                  <Td label="Contact">{[o.contactName, o.contactPhone, o.contactEmail].filter(Boolean).join(' · ') || '—'}</Td>
                  <Td label="Statut">{o.active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="slate">Désactivé</Pill>}</Td>
                  {rights.editOperator ? (
                    <Td className="text-right" label="Action">
                      <Button tone="secondary" onClick={() => setEditing(o)}>
                        <Pencil className="h-4 w-4" /> Modifier
                      </Button>
                    </Td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Card>
      {editing ? <OperatorFormModal operator={editing === 'new' ? null : editing} canEdit={rights.editOperator} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function OperatorFormModal({ operator, canEdit, onClose }: { operator: OperatorView | null; canEdit: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const types = useListItems('TYPE_OPERATEUR');
  const provinces = useProvinces();
  const initial = draftOf(operator);
  const [draft, setDraft] = useState<OperatorDraft>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const set = <K extends keyof OperatorDraft>(k: K, v: OperatorDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const done = () => {
    void qc.invalidateQueries({ queryKey: ['trace-operators'] });
    onClose();
  };
  const save = useMutation({
    mutationFn: (body: object) => (operator ? api.patch<OperatorView>(`/trace/operators/${operator.id}`, body) : api.post<OperatorView>('/trace/operators', body)),
    onSuccess: done,
  });
  const toggle = useMutation({
    mutationFn: () => api.patch<OperatorView>(`/trace/operators/${operator!.id}`, { active: !operator!.active }),
    onSuccess: done,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs = validateOperator(draft);
    setErrors(errs);
    if (errs.length > 0) return;
    const body = operator ? patchPayload(initial, draft) : createPayload(draft);
    if (operator && Object.keys(body).length === 0) return onClose();
    save.mutate(body);
  };

  return (
    <Modal title={operator ? `Modifier ${operator.code}` : 'Nouvel opérateur'} onClose={onClose} large>
      <form onSubmit={submit} className="space-y-4">
        <FormColumns>
          <div className="min-w-0 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Type *">
                <select className={inputCls} value={draft.typeCode} onChange={(e) => set('typeCode', e.target.value)}>
                  <option value="">Choisir…</option>
                  {(types.data ?? []).map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nom *" hint="Unique dans le programme (accents et majuscules ignorés).">
                <input className={inputCls} value={draft.name} onChange={(e) => set('name', e.target.value)} />
              </Field>
              <Field label="Localité">
                <select className={inputCls} value={draft.localiteId} onChange={(e) => set('localiteId', e.target.value)}>
                  <option value="">Aucune</option>
                  {(provinces.data ?? []).map((p) => (
                    <optgroup key={p.code} label={`${p.code} · ${p.name}`}>
                      {p.localites
                        .filter((l) => l.active || l.id === draft.localiteId)
                        .map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </Field>
              <Field label="Adresse">
                <input className={inputCls} value={draft.address} onChange={(e) => set('address', e.target.value)} />
              </Field>
            </div>
          </div>
          <div className="min-w-0 space-y-3">
            <Field label="Référence de la convention">
              <input className={inputCls} value={draft.conventionRef} onChange={(e) => set('conventionRef', e.target.value)} />
            </Field>
            <Field label="Date de signature">
              <input className={inputCls} type="date" value={draft.conventionSignedAt} onChange={(e) => set('conventionSignedAt', e.target.value)} />
            </Field>
            <Field label="Personne à contacter">
              <input className={inputCls} value={draft.contactName} onChange={(e) => set('contactName', e.target.value)} />
            </Field>
            <Field label="Téléphone">
              <input className={inputCls} inputMode="tel" value={draft.contactPhone} onChange={(e) => set('contactPhone', e.target.value)} />
            </Field>
            <Field label="E-mail">
              <input className={inputCls} type="email" value={draft.contactEmail} onChange={(e) => set('contactEmail', e.target.value)} />
            </Field>
          </div>
        </FormColumns>
        {errors.length > 0 ? <ErrorNote error={errors.join(' ')} /> : null}
        <ErrorNote error={save.error ?? toggle.error} />
        <div className="flex flex-wrap justify-between gap-2">
          {operator && canEdit ? (
            <Button tone={operator.active ? 'danger' : 'secondary'} busy={toggle.isPending} onClick={() => toggle.mutate()}>
              <Power className="h-4 w-4" /> {operator.active ? 'Désactiver' : 'Réactiver'}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button tone="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button type="submit" busy={save.isPending}>
              Enregistrer
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

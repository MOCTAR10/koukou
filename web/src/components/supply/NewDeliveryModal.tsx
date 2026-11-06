import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Truck } from 'lucide-react';
import { api } from '../../api/client';
import type { Lot } from '../../api/types-flock';
import type { DeliveryView } from '../../api/types-supply';
import { useFarm } from '../../app/FarmContext';
import { useCanRead } from '../../app/useMenuAccess';
import { fcfa } from '../../lib/format';
import { FEED_PHASE_LABEL, Note } from '../flock/shared';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal, todayIso, DateInput } from '../form';
import { FarmPicker } from '../programme/FarmPicker';
import {
  DELIVERY_SOURCE_LABEL,
  FEED_PHASE_CODES,
  MAX_DELIVERY_LINES,
  draftTotals,
  emptyLine,
  isBagUnit,
  itemsByCode,
  metaFeedPhase,
  unitsFor,
  validateDelivery,
  validateLine,
  type DeliveryDraft,
  type DeliveryLinePayload,
  type LineDraft,
} from './deliveryRules';
import { useListItems } from './queries';

/** « Nouvelle livraison » (`POST /programme/input-deliveries`): DGE or platform admin, a farm of the caller's scope. */
export function NewDeliveryModal({ onClose, onCreated }: { onClose: () => void; onCreated: (d: DeliveryView) => void }) {
  const { farms, farmId: activeFarmId } = useFarm();
  const qc = useQueryClient();
  const canRead = useCanRead();
  const seq = useRef(1);
  const newLine = () => emptyLine(`l${seq.current++}`);
  const [draft, setDraft] = useState<DeliveryDraft>(() => ({
    farmId: activeFarmId ?? '',
    bandId: '',
    source: 'ETAT_SMAG',
    supplierName: '',
    shippedAt: todayIso(),
    notes: '',
    lines: [newLine()],
  }));
  const [errors, setErrors] = useState<string[]>([]);

  const intrants = useListItems('INTRANT');
  const units = useListItems('UNITE');
  const items = useMemo(() => itemsByCode(intrants.data ?? [], units.data ?? []), [intrants.data, units.data]);
  // Bands of the chosen farm: TECHNIQUE for an institution (else the band stays optional and hidden).
  const bands = useQuery({
    queryKey: ['batches', draft.farmId],
    queryFn: () => api.get<Lot[]>(`/farms/${draft.farmId}/batches`),
    enabled: !!draft.farmId && canRead('TECHNIQUE'),
  });
  const openBands = (bands.data ?? []).filter((b) => b.status !== 'CLOTURE');

  const set = <K extends keyof DeliveryDraft>(key: K, value: DeliveryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setLine = (key: string, patch: Partial<LineDraft>) =>
    setDraft((d) => ({ ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) }));

  const validLines = draft.lines.map((l) => validateLine(l, items).payload).filter((p): p is DeliveryLinePayload => p != null);
  const totals = draftTotals(validLines);

  const create = useMutation({
    mutationFn: (body: object) => api.post<DeliveryView>('/programme/input-deliveries', body),
    onSuccess: (d) => {
      void qc.invalidateQueries({ queryKey: ['programme-deliveries'] });
      void qc.invalidateQueries({ queryKey: ['input-deliveries', d.farm.id] });
      onCreated(d);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateDelivery(draft, items, todayIso());
    setErrors(res.errors);
    if (res.payload) create.mutate(res.payload);
  };

  return (
    <Modal title="Nouvelle livraison d’intrants" onClose={onClose} large>
      <form onSubmit={submit} className="space-y-5">
        <FormColumns>
          <div className="min-w-0 space-y-4">
            <h3 className="text-sm font-semibold text-slate-700">Lignes ({draft.lines.length} / {MAX_DELIVERY_LINES})</h3>
            {draft.lines.map((line, i) => {
              const intrant = items.intrants.get(line.intrantCode);
              const family = intrant?.family ?? null;
              const unit = items.units.get(line.unitCode);
              const lineErrors = errors.length > 0 ? validateLine(line, items).errors : [];
              return (
                <fieldset key={line.key} className="space-y-3 rounded-xl border border-slate-200 p-3">
                  <legend className="px-1 text-xs font-semibold text-slate-600">Ligne {i + 1}</legend>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Intrant *">
                      <select
                        className={inputCls}
                        value={line.intrantCode}
                        onChange={(e) => {
                          const next = items.intrants.get(e.target.value);
                          const allowed = unitsFor(next?.family, units.data ?? []);
                          setLine(line.key, {
                            intrantCode: e.target.value,
                            unitCode: allowed.some((u) => u.code === line.unitCode) ? line.unitCode : (allowed[0]?.code ?? ''),
                            feedPhase: next?.family === 'ALIMENT' ? (metaFeedPhase(next) ?? '') : '',
                          });
                        }}
                      >
                        <option value="">Choisir…</option>
                        {(intrants.data ?? []).filter((x) => x.active).map((x) => (
                          <option key={x.code} value={x.code}>
                            {x.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Unité *">
                      <select className={inputCls} value={line.unitCode} onChange={(e) => setLine(line.key, { unitCode: e.target.value })}>
                        <option value="">Choisir…</option>
                        {unitsFor(family, units.data ?? []).map((u) => (
                          <option key={u.code} value={u.code}>
                            {u.label}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={family === 'POUSSIN' ? 'Nombre de têtes *' : 'Quantité expédiée *'}>
                      <input className={inputCls} inputMode="decimal" value={line.quantity} onChange={(e) => setLine(line.key, { quantity: e.target.value })} />
                    </Field>
                    {family === 'ALIMENT' ? (
                      <Field label="Phase *">
                        <select className={inputCls} value={line.feedPhase} onChange={(e) => setLine(line.key, { feedPhase: e.target.value })}>
                          <option value="">Choisir…</option>
                          {FEED_PHASE_CODES.map((p) => (
                            <option key={p} value={p}>
                              {FEED_PHASE_LABEL[p] ?? p}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : null}
                    {unit && isBagUnit(unit) ? (
                      <Field label="Poids d’un sac (kg)" hint="Vide : poids de sac de la ferme (50 kg par défaut).">
                        <input className={inputCls} inputMode="decimal" value={line.bagSizeKg} onChange={(e) => setLine(line.key, { bagSizeKg: e.target.value })} />
                      </Field>
                    ) : null}
                    <Field label="Valeur unitaire (FCFA, avant subvention)">
                      <input
                        className={inputCls}
                        inputMode="numeric"
                        value={line.unitValueFcfa}
                        onChange={(e) => setLine(line.key, { unitValueFcfa: e.target.value.replace(/[^\d]/g, '') })}
                      />
                    </Field>
                    <div className="flex items-end gap-2">
                      <label className="flex items-center gap-2 pb-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={line.subsidized}
                          onChange={(e) => setLine(line.key, { subsidized: e.target.checked, subsidyRate: e.target.checked ? line.subsidyRate : '' })}
                        />
                        Subventionné
                      </label>
                      {line.subsidized ? (
                        <Field label="Taux (%) *" className="flex-1">
                          <input className={inputCls} inputMode="decimal" value={line.subsidyRate} onChange={(e) => setLine(line.key, { subsidyRate: e.target.value })} />
                        </Field>
                      ) : null}
                    </div>
                    <Field label="N° de lot fournisseur">
                      <input className={inputCls} value={line.supplierLotNumber} onChange={(e) => setLine(line.key, { supplierLotNumber: e.target.value })} />
                    </Field>
                    <Field label="Péremption">
                      <DateInput className={inputCls} value={line.expirationDate} onChange={(e) => setLine(line.key, { expirationDate: e.target.value })} />
                    </Field>
                  </div>
                  {lineErrors.length > 0 ? <p className="text-xs text-red-700">{lineErrors.join(' · ')}</p> : null}
                  {draft.lines.length > 1 ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:underline"
                      onClick={() => set('lines', draft.lines.filter((l) => l.key !== line.key))}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Retirer la ligne
                    </button>
                  ) : null}
                </fieldset>
              );
            })}
            {draft.lines.length < MAX_DELIVERY_LINES ? (
              <Button tone="secondary" onClick={() => set('lines', [...draft.lines, newLine()])}>
                <Plus className="h-4 w-4" /> Ajouter une ligne
              </Button>
            ) : null}
          </div>

          <div className="min-w-0 space-y-4">
            <div>
              <span className="mb-1 block text-xs font-medium text-slate-600">Ferme destinataire *</span>
              <FarmPicker tone="light" farms={farms} farmId={draft.farmId || null} onPick={(id) => setDraft((d) => ({ ...d, farmId: id, bandId: '' }))} label="Ferme destinataire" />
            </div>
            {canRead('TECHNIQUE') ? (
              <Field label="Bande (facultatif)" hint="Une livraison de poussins peut précéder la bande : l’éleveur l’ouvrira à la réception.">
                <select className={inputCls} value={draft.bandId} onChange={(e) => set('bandId', e.target.value)} disabled={!draft.farmId}>
                  <option value="">Aucune</option>
                  {openBands.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.batchName ?? b.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field label="Source *">
              <select className={inputCls} value={draft.source} onChange={(e) => set('source', e.target.value as DeliveryDraft['source'])}>
                {(['ETAT_SMAG', 'AUTRE'] as const).map((s) => (
                  <option key={s} value={s}>
                    {DELIVERY_SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={draft.source === 'AUTRE' ? 'Fournisseur *' : 'Fournisseur (facultatif)'}>
              <input className={inputCls} value={draft.supplierName} onChange={(e) => set('supplierName', e.target.value)} />
            </Field>
            <Field label="Date d’expédition *">
              <DateInput className={inputCls} value={draft.shippedAt} max={todayIso()} onChange={(e) => set('shippedAt', e.target.value)} />
            </Field>
            <Field label="Notes">
              <textarea className={inputCls} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
            <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
              <p className="flex justify-between">
                <span className="text-slate-500">Valeur expédiée</span>
                <span className="font-semibold tabular-nums">{fcfa(totals.shippedValueFcfa)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Coût éleveur prévu</span>
                <span className="font-semibold tabular-nums">{fcfa(totals.farmerCostFcfa)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Subvention prévue</span>
                <span className="font-semibold tabular-nums text-emerald-700">{fcfa(totals.subsidyFcfa)}</span>
              </p>
            </div>
            <Note tone="brand">
              L’éleveur confirme ce qu’il a réellement reçu : c’est sa confirmation qui crée les lots de stock et la dépense de la ferme.
            </Note>
          </div>
        </FormColumns>
        {errors.length > 0 ? <ErrorNote error={errors.join(' ')} /> : null}
        <ErrorNote error={create.error ?? intrants.error ?? units.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending}>
            <Truck className="h-4 w-4" /> Enregistrer la livraison
          </Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut, Plus } from 'lucide-react';
import { api } from '../../api/client';
import type { Lot } from '../../api/types-flock';
import type { SortieView } from '../../api/types-trace';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import { dateFr, fcfa, num } from '../../lib/format';
import { Note, SectionCard, useInvalidateFarm } from '../flock/shared';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal, todayIso, DateInput } from '../form';
import { useListItems } from '../supply/queries';
import { useOperators } from '../trace/queries';
import { DataTable, EmptyState, Loading, Td, Th } from '../ui';
import {
  SALE_ALREADY_BOOKED,
  emptySortie,
  reasonChoices,
  sortieEffect,
  sortieOutcome,
  validateSortie,
  type SortieDraft,
} from './sortieRules';

/**
 * Sorties of a band (CDC 9 « Sorties d'animaux »,
 * `GET/POST /farms/:farmId/bandes/:batchId/sorties`). A sale sortie books the
 * sale, an abattoir sortie the draft slaughter order (its birds leave the
 * headcount at the sortie), so the farmer never types them twice; the
 * recipient is required (a name or an operator); an operator makes it a
 * cession (traceability sub-lot).
 */
export function SortiesTab({ lot }: { lot: Lot }) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const [adding, setAdding] = useState(false);
  const sorties = useQuery({
    queryKey: ['sorties', farmId, lot.id],
    queryFn: () => api.get<SortieView[]>(`/farms/${farmId}/bandes/${lot.id}/sorties`),
    enabled: !!farmId,
  });
  const operators = useOperators();
  const opName = new Map((operators.data ?? []).map((o) => [o.id, o.name]));
  const isActive = lot.status !== 'CLOTURE';
  const rows = sorties.data ?? [];
  const total = rows.reduce((s, r) => s + r.count, 0);

  return (
    <SectionCard
      title="Sorties d’animaux"
      subtitle={`${num(total, 0)} sujet${total > 1 ? 's' : ''} sorti${total > 1 ? 's' : ''} · ${num(lot.quantityAlive, 0)} présents`}
      icon={<LogOut />}
      flush
      actions={
        isActive && hasPermission('saisie:creer') ? (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Nouvelle sortie
          </Button>
        ) : null
      }
    >
      {sorties.isLoading ? (
        <div className="p-4">
          <Loading />
        </div>
      ) : null}
      <div className="px-4 pt-3">
        <ErrorNote error={sorties.error} />
      </div>
      {sorties.data && rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<LogOut />} message="Aucune sortie enregistrée pour cette bande." />
        </div>
      ) : null}
      {rows.length > 0 ? (
        <DataTable>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th>Motif</Th>
              <Th>Sujets</Th>
              <Th className="hidden lg:table-cell">Poids</Th>
              <Th>Destinataire</Th>
              <Th>Suite</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <Td className="whitespace-nowrap">{dateFr(s.sortieDate)}</Td>
                <Td label="Motif">{s.reasonLabel ?? s.reasonCode}</Td>
                <Td label="Sujets" className="tabular-nums">
                  {num(s.count, 0)}
                </Td>
                <Td label="Poids" className="whitespace-nowrap tabular-nums md:max-lg:hidden">
                  {s.weightKg ? `${num(s.weightKg)} kg` : '—'}
                </Td>
                <Td label="Destinataire">
                  {s.operatorId ? (opName.get(s.operatorId) ?? 'Opérateur du programme') : (s.recipientName ?? '—')}
                  {s.unitPriceFcfa != null ? (
                    <span className="block text-xs text-slate-500">
                      {fcfa(s.unitPriceFcfa)} / {s.priceUnit === 'KG' ? 'kg' : 'tête'}
                    </span>
                  ) : null}
                </Td>
                <Td label="Suite" className="text-xs text-slate-600">
                  {sortieOutcome(s)}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : null}
      <p className="px-4 py-3 text-xs text-slate-400">
        Les ventes faites au point de vente et les ordres d’abattage créés depuis l’écran Abattage retirent déjà leurs sujets de la bande :
        ne les enregistrez pas une seconde fois ici. Une sortie ne dépasse jamais l’effectif présent.
      </p>
      {adding && farmId ? <SortieModal farmId={farmId} lot={lot} onClose={() => setAdding(false)} /> : null}
    </SectionCard>
  );
}

function SortieModal({ farmId, lot, onClose }: { farmId: string; lot: Lot; onClose: () => void }) {
  const { hasPermission } = useFarmProfile();
  const invalidate = useInvalidateFarm();
  const reasons = useListItems('MOTIF_SORTIE');
  const operators = useOperators();
  const [draft, setDraft] = useState<SortieDraft>(() => emptySortie(todayIso()));
  const [errors, setErrors] = useState<string[]>([]);
  const choices = reasonChoices(reasons.data ?? [], hasPermission);
  const reason = choices.find((c) => c.code === draft.reasonCode);
  const family = reason?.family ?? null;
  const set = <K extends keyof SortieDraft>(k: K, v: SortieDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = useMutation({
    mutationFn: (body: object) =>
      sendOrQueue<SortieView>({
        kind: 'band-sortie',
        farmId,
        path: `/farms/${farmId}/bandes/${lot.id}/sorties`,
        body: { ...body, capturedAt: new Date().toISOString() },
        label: `Sortie · ${draft.count} sujet(s) · ${reason?.label ?? draft.reasonCode}`,
      }),
    onSuccess: async (res) => {
      if (res.status === 'queued') showQueuedNotice();
      else await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = validateSortie(draft, {
      reason,
      present: lot.quantityAlive,
      integrationDate: lot.integrationDate,
      closed: lot.status === 'CLOTURE',
      todayUtc: todayIso(),
    });
    setErrors(res.errors);
    if (res.payload) save.mutate(res.payload);
  };

  const effects = sortieEffect(family, !!draft.operatorId);

  return (
    <Modal title="Nouvelle sortie d’animaux" onClose={onClose} large>
      <form onSubmit={submit} className="space-y-4">
        <FormColumns>
          <div className="min-w-0 space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Motif *">
                <select className={inputCls} value={draft.reasonCode} onChange={(e) => set('reasonCode', e.target.value)}>
                  <option value="">Choisir…</option>
                  {choices.map((c) => (
                    <option key={c.code} value={c.code} disabled={!c.allowed}>
                      {c.label}
                      {c.allowed ? '' : ' (non autorisé)'}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date *">
                <DateInput className={inputCls} value={draft.sortieDate} min={lot.integrationDate.slice(0, 10)} max={todayIso()} onChange={(e) => set('sortieDate', e.target.value)} />
              </Field>
              <Field label="Nombre de sujets *" hint={`${num(lot.quantityAlive, 0)} présents`}>
                <input className={inputCls} inputMode="numeric" value={draft.count} onChange={(e) => set('count', e.target.value.replace(/[^\d]/g, ''))} />
              </Field>
              <Field label={family === 'VENTE' && draft.priceUnit === 'KG' ? 'Poids vif total (kg) *' : 'Poids vif total (kg)'}>
                <input className={inputCls} inputMode="decimal" value={draft.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
              </Field>
            </div>
            {family === 'VENTE' ? <Note tone="amber">{SALE_ALREADY_BOOKED}</Note> : null}
            {family === 'VENTE' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Prix unitaire (FCFA) *">
                  <input className={inputCls} inputMode="numeric" value={draft.unitPriceFcfa} onChange={(e) => set('unitPriceFcfa', e.target.value.replace(/[^\d]/g, ''))} />
                </Field>
                <Field label="Prix par">
                  <select className={inputCls} value={draft.priceUnit} onChange={(e) => set('priceUnit', e.target.value as SortieDraft['priceUnit'])}>
                    <option value="TETE">Tête</option>
                    <option value="KG">Kilogramme</option>
                  </select>
                </Field>
              </div>
            ) : null}
            {family === 'ABATTOIR' ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Type d’abattage">
                  <select className={inputCls} value={draft.slaughterType} onChange={(e) => set('slaughterType', e.target.value as SortieDraft['slaughterType'])}>
                    <option value="ABATTU">Abattu (carcasses)</option>
                    <option value="VIVANT">Vivant</option>
                  </select>
                </Field>
                <Field label="Destination">
                  <select className={inputCls} value={draft.destination} onChange={(e) => set('destination', e.target.value as SortieDraft['destination'])}>
                    <option value="EXTERNE">Abattoir externe</option>
                    <option value="INTERNE">Abattage à la ferme</option>
                  </select>
                </Field>
              </div>
            ) : null}
            <Field label="Notes">
              <textarea className={inputCls} rows={2} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
            </Field>
          </div>
          <div className="min-w-0 space-y-4">
            <Field label="Opérateur du programme (cession)" hint={
                (operators.data ?? []).length === 0 && !operators.isLoading
                  ? 'Le registre des opérateurs du programme est vide : demandez à la DGE d’y inscrire l’abattoir ou l’acheteur pour créer le sous-lot tracé (QR). Sinon, saisissez le nom du destinataire.'
                  : 'Abattoir, acheteur, distributeur… du registre : crée un sous-lot de traçabilité.'
              }>
              <select className={inputCls} value={draft.operatorId} onChange={(e) => set('operatorId', e.target.value)}>
                <option value="">{(operators.data ?? []).length === 0 ? 'Aucun opérateur enregistré' : 'Aucun (pas de cession)'}</option>
                {(operators.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {o.typeLabel ?? o.typeCode}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={draft.operatorId ? 'Destinataire (nom)' : 'Destinataire (nom) *'} hint="Obligatoire : un nom, ou un opérateur du registre ci-dessus.">
              <input className={inputCls} value={draft.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
            </Field>
            <Field label="Destinataire (téléphone)">
              <input className={inputCls} inputMode="tel" value={draft.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} />
            </Field>
            {effects.length > 0 ? (
              <Note tone="brand">
                <ul className="list-disc space-y-1 pl-4">
                  {effects.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </Note>
            ) : null}
          </div>
        </FormColumns>
        {errors.length > 0 ? <ErrorNote error={errors.join(' ')} /> : null}
        <ErrorNote error={save.error ?? reasons.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending}>
            <LogOut className="h-4 w-4" /> Enregistrer la sortie
          </Button>
        </div>
      </form>
    </Modal>
  );
}

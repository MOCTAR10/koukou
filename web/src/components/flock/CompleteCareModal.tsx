import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Bird, Calendar, Check, Pill as PillIcon, ShieldCheck } from 'lucide-react';
import type { CareType, ProphylaxisEvent } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useIdempotencyKey } from '../../lib/idempotency';
import { dateFr } from '../../lib/format';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import { useSanitaryList } from '../surveillance/queries';
import { Button, ErrorNote, Field, Modal, inputCls, DateInput } from '../form';
import { CARE_TYPE_LABEL, IconField, Note, localYmd, useInvalidateFarm } from './shared';
import {
  EMPTY_PRODUCT_LIST_NOTE,
  REFERENCE_STEP_LABEL,
  UNKNOWN_PRODUCT_LIST_NOTE,
  careNeedsTreatmentDetails,
  careOpensTreatment,
  careTreatmentBody,
  completionBody,
  postponedLabel,
} from './sanitaryRecords';

const QUEUED_COMPLETION_MESSAGE = 'Soin réalisé enregistré hors ligne : il sera envoyé au retour de la connexion.';

/** The band a completion is recorded on (sanitary page, band sheet, advice list). */
export interface CareLotRef {
  id: string;
  liveCount: number;
  batchName: string | null;
  code: string | null;
}

/** The planned care being closed. */
export type CompletableCare = Pick<
  ProphylaxisEvent,
  'id' | 'name' | 'scheduledDate' | 'route' | 'withdrawalDays' | 'protocolStepId'
> & {
  careType: CareType | string;
  productCode?: string | null;
  isReference?: boolean;
  originalDate?: string | null;
};

/**
 * Marks a planned care done (CDC n° 22: date, vaccine, route, number of
 * animals). Every « Fait » of the web goes through it and the offline queue:
 * the same key on a retry or a replay returns the care the server already
 * completed. POUFA lot A2 sante: a manual care with a withdrawal period opens
 * a treatment, so it asks the register's data (product from the vets' list,
 * end day, reason, CDC n° 23).
 */
export function CompleteCareModal({ lot, event, onClose }: { lot: CareLotRef; event: CompletableCare; onClose: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const idempotency = useIdempotencyKey('care');
  const [completedAt, setCompletedAt] = useState(localYmd());
  const [animalCount, setAnimalCount] = useState(lot.liveCount > 0 ? String(lot.liveCount) : '');
  const [route, setRoute] = useState(event.route ?? '');
  const [notes, setNotes] = useState('');
  const [productCode, setProductCode] = useState(event.productCode ?? '');
  const [endDate, setEndDate] = useState(localYmd());
  const [reason, setReason] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const today = localYmd();
  const care = {
    name: event.name,
    withdrawalDays: event.withdrawalDays,
    protocolStepId: event.protocolStepId,
    productCode: event.productCode ?? null,
    isReference: event.isReference,
    originalDate: event.originalDate ?? null,
  };
  const opens = careOpensTreatment(care);
  const details = careNeedsTreatmentDetails(care);
  const products = useSanitaryList('PRODUIT_TRAITEMENT', details);
  const productList = products.data ?? (products.isError ? null : undefined);
  const postponed = postponedLabel(care, dateFr);

  const build = () => {
    const base = completionBody({ completedAt, animalCount, route, notes }, event.route);
    if (!base.ok) return base;
    const extra = careTreatmentBody(care, { productCode, endDate, reason }, completedAt, productList ?? null);
    if (!extra.ok) return extra;
    return { ok: true as const, body: { ...base.body, ...extra.body } };
  };

  const save = useMutation({
    mutationFn: async () => {
      const built = build();
      if (!built.ok) throw new Error(built.error);
      const body = { ...built.body, idempotencyKey: idempotency.keyFor({ ...built.body, event: event.id }) };
      return sendOrQueue({
        kind: 'prophylaxis-complete',
        farmId: farmId!,
        path: `/farms/${farmId}/batches/${lot.id}/prophylaxis/${event.id}/complete`,
        body,
        label: `Soin réalisé : ${event.name} · ${lot.batchName ?? lot.code ?? 'Lot'}`,
      });
    },
    onSuccess: async (res) => {
      idempotency.settle();
      if (res.status === 'queued') showQueuedNotice(QUEUED_COMPLETION_MESSAGE);
      else await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const built = build();
    setFormError(built.ok ? null : built.error);
    if (built.ok) save.mutate();
  };

  const listed = productList && productList.length > 0 ? productList : null;

  return (
    <Modal title="Soin réalisé" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-600">
          <span className="font-medium text-slate-800">{event.name}</span> ·{' '}
          {CARE_TYPE_LABEL[event.careType as CareType] ?? event.careType} · prévu le {dateFr(event.scheduledDate)}
          {lot.batchName || lot.code ? ` · ${lot.batchName ?? lot.code}` : ''}
        </p>
        {event.isReference ? (
          <Note tone="brand" icon={<ShieldCheck />}>
            {REFERENCE_STEP_LABEL}
            {postponed ? ` · ${postponed}` : ''}
          </Note>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <IconField label="Date de réalisation *" icon={<Calendar />}>
            <DateInput className={inputCls} max={today} value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} required />
          </IconField>
          <IconField label="Nombre d'animaux *" icon={<Bird />}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={animalCount}
              onChange={(e) => setAnimalCount(e.target.value.replace(/\D/g, ''))}
              required
            />
          </IconField>
        </div>
        <Field label="Voie d'administration" hint={event.route ? `Prévue : ${event.route}` : undefined}>
          <input className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)} />
        </Field>
        {opens ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold text-slate-600">
              Traitement (délai d'attente de {event.withdrawalDays} j) : inscrit au registre des traitements
            </p>
            {details ? (
              listed ? (
                <IconField label="Produit *" icon={<PillIcon />}>
                  <select className={inputCls} value={productCode} onChange={(e) => setProductCode(e.target.value)} required>
                    <option value="">Choisir dans la liste des vétérinaires</option>
                    {listed.map((p) => (
                      <option key={p.code} value={p.code}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </IconField>
              ) : productList === undefined && products.isLoading ? null : (
                <Note tone="amber" icon={<AlertTriangle />}>
                  {productList === null ? UNKNOWN_PRODUCT_LIST_NOTE : EMPTY_PRODUCT_LIST_NOTE} Produit enregistré : « {event.name} ».
                </Note>
              )
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <IconField label={details ? 'Fin du traitement *' : 'Fin du traitement'} icon={<Calendar />}>
                <DateInput className={inputCls} min={completedAt} value={endDate} onChange={(e) => setEndDate(e.target.value)} required={details} />
              </IconField>
              <Field label={details ? 'Motif *' : 'Motif'}>
                <input
                  className={inputCls}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={details ? 'Ex. : coryza, diarrhée' : 'Calendrier sanitaire (prévention)'}
                  required={details}
                />
              </Field>
            </div>
          </div>
        ) : null}
        <Field label="Remarques (lot du vaccin, réaction…)">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote error={formError ?? save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Fermer
          </Button>
          <Button type="submit" busy={save.isPending}>
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

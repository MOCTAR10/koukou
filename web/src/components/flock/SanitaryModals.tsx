import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bird, Calendar, Check, ClipboardPlus, HeartPulse, Pill, ShieldCheck, Stethoscope, Syringe, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import type {
  CareType,
  DiseaseSeverity,
  GenerateProgramResult,
  HealthEventKind,
  InputLot,
  Lot,
  ProphylaxisEvent,
  SanitaryProtocol,
  SanitaryProtocolWithSteps,
} from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { useCanRead } from '../../app/useMenuAccess';
import { lotImage } from '../../lib/animalImages';
import { classNames, dateFr, num } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { PhotoThumb } from '../ui';
import {
  CARE_TYPES,
  CARE_TYPE_LABEL,
  HEALTH_KIND_LABEL,
  IconField,
  Note,
  Tabs,
  addUtcDays,
  kindLabel,
  localYmd,
  lotName,
  parseNum,
  useInvalidateFarm,
  utcYmd,
} from './shared';

const KIND_ICON = { MALADIE: <Stethoscope />, MORTALITE: <HeartPulse />, REFORME: <Trash2 /> };

const DISEASES: Array<{ value: string; label: string }> = [
  { value: 'Newcastle disease', label: 'Maladie de Newcastle' },
  { value: "Marek's disease", label: 'Maladie de Marek' },
  { value: 'Infectious bursal disease', label: 'Gumboro (bursite infectieuse)' },
  { value: 'Ranikhet', label: 'Ranikhet' },
  { value: 'Coccidiosis', label: 'Coccidiose' },
  { value: 'Salmonellosis', label: 'Salmonellose' },
  { value: 'Fowl pox', label: 'Variole aviaire' },
  { value: 'Infectious bronchitis', label: 'Bronchite infectieuse' },
  { value: 'Avian influenza', label: 'Influenza aviaire' },
  { value: 'Mycoplasma', label: 'Mycoplasmose' },
];

const SYMPTOMS = [
  'Détresse respiratoire',
  'Diarrhée',
  'Léthargie',
  'Gonflement tête/face',
  'Baisse de ponte',
  'Perte de poids',
  'Plumes hérissées',
  'Morts brutales',
  'Paralysie/tremblements',
  'Toux/éternuements',
];

const SEVERITIES: Array<{ key: DiseaseSeverity; label: string; level: 'VERT' | 'JAUNE' | 'ROUGE' }> = [
  { key: 'LOW', label: 'Faible', level: 'VERT' },
  { key: 'MEDIUM', label: 'Moyenne', level: 'JAUNE' },
  { key: 'HIGH', label: 'Élevée', level: 'ROUGE' },
  { key: 'CRITICAL', label: 'Critique', level: 'ROUGE' },
];

const MORTALITY_CAUSES = [
  { key: 'MALADIE', label: 'Maladie' },
  { key: 'HEAT_STRESS', label: 'Stress thermique' },
  { key: 'INJURY', label: 'Blessure' },
  { key: 'PREDATOR', label: 'Prédateur' },
  { key: 'UNKNOWN', label: 'Inconnue' },
];

const ROUTES = [
  'Injection sous-cutanée',
  'Injection intramusculaire',
  'Goutte œil / narine',
  'Eau de boisson',
  'Voile alaire',
  'Oral / aliment',
];

const GABON_DIRECTIVES = [
  'Chaîne du froid : conserver les vaccins entre 2 et 8 °C jusqu’à leur utilisation.',
  'Eau de boisson : eau sans chlore, additionnée de 2,5 g/l de lait écrémé.',
  'Ne pas vacciner des oiseaux malades ; déparasiter avant la vaccination.',
  'Pas d’antibiotiques 3 jours avant et 7 jours après un vaccin vivant.',
];

export function HealthEventModal({ lot, onClose }: { lot: Lot; onClose: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const [kind, setKind] = useState<'MALADIE' | 'MORTALITE' | 'REFORME'>('MALADIE');
  const [occurredAt, setOccurredAt] = useState(localYmd());
  const [disease, setDisease] = useState(DISEASES[0].value);
  const [customDisease, setCustomDisease] = useState('');
  const [severity, setSeverity] = useState<DiseaseSeverity>('MEDIUM');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [treatment, setTreatment] = useState('');
  const [vetConsulted, setVetConsulted] = useState(false);
  const [vetName, setVetName] = useState('');
  const [resolved, setResolved] = useState(false);
  const [cause, setCause] = useState('UNKNOWN');
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  const qty = parseInt(quantity, 10) || 0;
  const diseaseName = disease === '__custom' ? customDisease.trim() : disease;
  const needsQty = kind !== 'MALADIE';
  const canSubmit = kind === 'MALADIE' ? diseaseName.length >= 2 : qty > 0;

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        kind,
        occurredAt,
        notes: notes.trim() || undefined,
        quantity: qty > 0 ? qty : undefined,
        resolved: resolved || undefined,
      };
      if (kind === 'MALADIE') {
        const level = SEVERITIES.find((s) => s.key === severity)?.level ?? 'JAUNE';
        body.title = DISEASES.find((d) => d.value === diseaseName)?.label ?? diseaseName;
        body.disease = diseaseName;
        body.diseaseSeverity = severity;
        body.severity = level;
        if (symptoms.length) body.symptoms = symptoms.join(', ');
        if (treatment.trim()) body.treatmentGiven = treatment.trim();
        body.vetConsulted = vetConsulted;
        if (vetConsulted && vetName.trim()) body.vetName = vetName.trim();
      } else if (kind === 'MORTALITE') {
        const label = MORTALITY_CAUSES.find((c) => c.key === cause)?.label;
        body.title = cause === 'UNKNOWN' ? 'Pic de mortalité' : `Mortalité : ${label?.toLowerCase()}`;
        body.severity = 'JAUNE';
      } else {
        body.title = 'Abattage sanitaire';
        body.severity = 'JAUNE';
        if (reason.trim()) body.description = reason.trim();
      }
      return api.post(`/farms/${farmId}/batches/${lot.id}/health-events`, body);
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) save.mutate();
  };

  return (
    <Modal title="Signaler un événement de santé" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center gap-2.5">
          <PhotoThumb src={lotImage(lot.breedName, lot.species)} />
          <p className="text-sm text-slate-500">
            {lotName(lot)} · {kindLabel(lot)} · {num(lot.metrics.liveCount)} vivants
          </p>
        </div>
        <Tabs
          value={kind}
          onChange={setKind}
          options={(['MALADIE', 'MORTALITE', 'REFORME'] as const).map((k: HealthEventKind & typeof kind) => ({
            key: k,
            label: HEALTH_KIND_LABEL[k],
            icon: KIND_ICON[k],
          }))}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField label="Date *" icon={<Calendar />}>
            <input className={inputCls} type="date" max={localYmd()} value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
          </IconField>
          <IconField
            label={needsQty ? "Nombre d'oiseaux *" : "Oiseaux touchés"}
            icon={<Bird />}
            hint={kind === 'REFORME' ? "Un abattage sanitaire retire ces oiseaux de l'effectif vivant." : undefined}
          >
            <input
              className={inputCls}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ''))}
              placeholder="0"
              required={needsQty}
            />
          </IconField>
          {kind === 'MALADIE' ? (
            <>
              <Field label="Maladie *">
                <select className={inputCls} value={disease} onChange={(e) => setDisease(e.target.value)}>
                  {DISEASES.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                  <option value="__custom">Autre maladie…</option>
                </select>
              </Field>
              {disease === '__custom' ? (
                <Field label="Nom de la maladie *">
                  <input className={inputCls} value={customDisease} onChange={(e) => setCustomDisease(e.target.value)} required />
                </Field>
              ) : null}
              <Field label="Sévérité">
                <select className={inputCls} value={severity} onChange={(e) => setSeverity(e.target.value as DiseaseSeverity)}>
                  {SEVERITIES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          ) : null}
          {kind === 'MORTALITE' ? (
            <Field label="Cause">
              <select className={inputCls} value={cause} onChange={(e) => setCause(e.target.value)}>
                {MORTALITY_CAUSES.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {kind === 'REFORME' ? (
            <Field label="Motif">
              <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} />
            </Field>
          ) : null}
        </div>
        {kind === 'MALADIE' ? (
          <>
            <div>
              <p className="mb-1 text-xs font-medium text-slate-600">Symptômes</p>
              <div className="flex flex-wrap gap-1.5">
                {SYMPTOMS.map((s) => {
                  const on = symptoms.includes(s);
                  return (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSymptoms((cur) => (on ? cur.filter((x) => x !== s) : [...cur, s]))}
                      className={classNames(
                        'rounded-full px-2.5 py-1 text-xs font-medium ring-1',
                        on ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <IconField label="Traitement administré" icon={<Pill />}>
              <input className={inputCls} value={treatment} onChange={(e) => setTreatment(e.target.value)} />
            </IconField>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={vetConsulted} onChange={(e) => setVetConsulted(e.target.checked)} />
                Vétérinaire consulté
              </label>
              {vetConsulted ? (
                <input
                  className={`${inputCls} !w-64`}
                  aria-label="Nom du vétérinaire"
                  placeholder="Nom du vétérinaire"
                  value={vetName}
                  onChange={(e) => setVetName(e.target.value)}
                />
              ) : null}
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={resolved} onChange={(e) => setResolved(e.target.checked)} />
                Événement résolu
              </label>
            </div>
          </>
        ) : null}
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!canSubmit}>
            <ClipboardPlus className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export function EditScheduleModal({
  lot,
  event,
  onClose,
}: {
  lot: Lot;
  event: ProphylaxisEvent;
  onClose: () => void;
}) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const [careType, setCareType] = useState<CareType>(event.careType);
  const [name, setName] = useState(event.name);
  const [scheduledDate, setScheduledDate] = useState(event.scheduledDate.slice(0, 10));
  const [route, setRoute] = useState(event.route ?? '');
  const [dosage, setDosage] = useState(event.dosage ?? '');
  const [withdrawal, setWithdrawal] = useState(String(event.withdrawalDays ?? 0));
  const [notes, setNotes] = useState(event.notes ?? '');

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/farms/${farmId}/batches/${lot.id}/vaccine-schedules/${event.id}`, {
        careType,
        name: name.trim(),
        scheduledDate,
        route: route.trim() || undefined,
        dosage: dosage.trim() || undefined,
        notes: notes.trim() || undefined,
        withdrawalDays: parseInt(withdrawal, 10) || 0,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  return (
    <Modal title="Modifier le soin" onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length >= 2) save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <select className={inputCls} value={careType} onChange={(e) => setCareType(e.target.value as CareType)}>
              {CARE_TYPES.map((c) => (
                <option key={c} value={c}>
                  {CARE_TYPE_LABEL[c]}
                </option>
              ))}
            </select>
          </Field>
          <IconField label="Date prévue" icon={<Calendar />}>
            <input className={inputCls} type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} required />
          </IconField>
        </div>
        <Field label="Nom *">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Voie">
            <input className={inputCls} list="flock-routes" value={route} onChange={(e) => setRoute(e.target.value)} />
            <datalist id="flock-routes">
              {ROUTES.map((r) => (
                <option key={r} value={r} />
              ))}
            </datalist>
          </Field>
          <Field label="Dosage">
            <input className={inputCls} value={dosage} onChange={(e) => setDosage(e.target.value)} />
          </Field>
          <Field label="Délai d'attente (j)">
            <input className={inputCls} inputMode="numeric" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value.replace(/\D/g, ''))} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={name.trim().length < 2}>
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** Plans one care on several lots, by hand or from a vaccination program. */
export function PlanCareModal({
  lots,
  initialLotId,
  onClose,
}: {
  lots: Lot[];
  initialLotId?: string;
  onClose: () => void;
}) {
  const { farmId } = useFarm();
  const { hasPermission } = useFarmProfile();
  const invalidate = useInvalidateFarm();
  const [lotIds, setLotIds] = useState<string[]>(initialLotId ? [initialLotId] : []);
  const [mode, setMode] = useState<'manuel' | 'programme'>('manuel');
  const [careType, setCareType] = useState<'VACCIN' | 'MEDICAMENT'>('VACCIN');
  const [provenance, setProvenance] = useState<'externe' | 'stock'>('externe');
  const [medLotId, setMedLotId] = useState('');
  const [medQty, setMedQty] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState(utcYmd());
  const [route, setRoute] = useState('');
  const [dosage, setDosage] = useState('');
  const [withdrawal, setWithdrawal] = useState('0');
  const [notes, setNotes] = useState('');
  const [protocolId, setProtocolId] = useState('');
  const [result, setResult] = useState<GenerateProgramResult | null>(null);

  const selected = lots.filter((l) => lotIds.includes(l.id));
  const first = selected[0];
  const uniform =
    selected.length > 0 && selected.every((l) => l.species === first?.species && l.type === first?.type);

  // The medicine lots are INTRANTS: a veterinary profile plans the care without them.
  const canReadInputs = useCanRead()('INTRANTS');
  const inputs = useQuery({
    queryKey: ['inputs', farmId],
    queryFn: () => api.get<InputLot[]>(`/farms/${farmId}/inputs`),
    enabled: !!farmId && canReadInputs,
  });
  const medLots = (inputs.data ?? []).filter((i) => i.entryType === 'MEDICAMENT' && i.quantity > 0);
  const medLot = medLots.find((m) => m.id === medLotId) ?? null;
  const qtyN = parseNum(medQty) ?? 0;
  const qtyExceeds = medLot != null && qtyN > medLot.quantity;

  const protocols = useQuery({
    queryKey: ['protocols', farmId, first?.species, first?.type],
    queryFn: () =>
      api.get<SanitaryProtocol[]>(
        `/sanitary/protocols?farmId=${encodeURIComponent(farmId ?? '')}&species=${first?.species}&type=${first?.type}`,
      ),
    enabled: !!farmId && mode === 'programme' && uniform,
  });
  const programs = (protocols.data ?? []).filter((p) => p.code.startsWith('vacc-'));
  const chosenId = protocolId || programs[0]?.id || '';
  const program = useQuery({
    queryKey: ['protocol-detail', farmId, chosenId],
    queryFn: () =>
      api.get<SanitaryProtocolWithSteps>(`/sanitary/protocols/${chosenId}?farmId=${encodeURIComponent(farmId ?? '')}`),
    enabled: !!chosenId && mode === 'programme',
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post<GenerateProgramResult>(`/farms/${farmId}/vaccine-schedules/programs/generate`, {
        protocolId: chosenId,
        lotIds,
      }),
    onSuccess: async (res) => {
      await invalidate();
      setResult(res);
    },
  });
  const planManual = useMutation({
    mutationFn: () => {
      const fromStock = careType === 'MEDICAMENT' && provenance === 'stock' && !!medLot;
      return api.post(`/farms/${farmId}/vaccine-schedules/manual`, {
        lotIds,
        careType,
        name: name.trim(),
        scheduledDate: date,
        route: route || undefined,
        dosage: dosage.trim() || undefined,
        notes: notes.trim() || undefined,
        withdrawalDays: parseInt(withdrawal, 10) || 0,
        decrementStock: fromStock,
        medicationLotId: fromStock ? medLot?.id : undefined,
        medicationQty: fromStock ? qtyN : undefined,
        medicationUnit: fromStock ? (medLot?.doseUnit ?? undefined) : undefined,
      });
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const canManual =
    lotIds.length > 0 &&
    name.trim().length >= 2 &&
    !!date &&
    (careType !== 'MEDICAMENT' || provenance === 'externe' || (!!medLot && qtyN > 0 && !qtyExceeds));

  return (
    <Modal title="Planifier un soin" onClose={onClose} wide>
      <div className="space-y-4">
        <Tabs
          value={mode}
          onChange={setMode}
          options={[
            { key: 'manuel', label: 'Soin ponctuel', icon: <Syringe /> },
            ...(hasPermission('sanitaire:gerer')
              ? [{ key: 'programme' as const, label: 'Programme de vaccination', icon: <ShieldCheck /> }]
              : []),
          ]}
        />
        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Lots concernés *</p>
          <div className="grid max-h-36 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-2">
            {lots.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={lotIds.includes(l.id)}
                  onChange={() =>
                    setLotIds((cur) => (cur.includes(l.id) ? cur.filter((x) => x !== l.id) : [...cur, l.id]))
                  }
                />
                <PhotoThumb src={lotImage(l.breedName, l.species)} size="sm" />
                <span className="truncate">
                  {lotName(l)} · {kindLabel(l)}
                </span>
              </label>
            ))}
          </div>
        </div>

        {mode === 'manuel' ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canManual) planManual.mutate();
            }}
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Type de soin">
                <select className={inputCls} value={careType} onChange={(e) => setCareType(e.target.value as 'VACCIN' | 'MEDICAMENT')}>
                  <option value="VACCIN">Vaccin</option>
                  <option value="MEDICAMENT">Médicament</option>
                </select>
              </Field>
              <Field label="Nom du produit *" className="sm:col-span-2">
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex : Newcastle HB1" required />
              </Field>
              <IconField label="Date prévue *" icon={<Calendar />}>
                <input className={inputCls} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </IconField>
              <Field label="Voie d'administration">
                <select className={inputCls} value={route} onChange={(e) => setRoute(e.target.value)}>
                  <option value="">Non précisée</option>
                  {ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Dosage">
                <input className={inputCls} value={dosage} onChange={(e) => setDosage(e.target.value)} />
              </Field>
              <Field label="Délai d'attente (j)">
                <input className={inputCls} inputMode="numeric" value={withdrawal} onChange={(e) => setWithdrawal(e.target.value.replace(/\D/g, ''))} />
              </Field>
              {careType === 'MEDICAMENT' ? (
                <Field label="Provenance">
                  <select className={inputCls} value={provenance} onChange={(e) => setProvenance(e.target.value as 'externe' | 'stock')}>
                    <option value="externe">Achat externe</option>
                    <option value="stock">Sortir du stock</option>
                  </select>
                </Field>
              ) : null}
              {careType === 'MEDICAMENT' && provenance === 'stock' ? (
                <>
                  <Field label="Lot de médicament *">
                    <select className={inputCls} value={medLotId} onChange={(e) => setMedLotId(e.target.value)} required>
                      <option value="">Sélectionner…</option>
                      {medLots.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.productName} ({num(m.quantity)} {m.doseUnit ?? ''})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Quantité à sortir *">
                    <input className={inputCls} inputMode="decimal" value={medQty} onChange={(e) => setMedQty(e.target.value)} required />
                  </Field>
                </>
              ) : null}
            </div>
            {careType === 'MEDICAMENT' && provenance === 'stock' && qtyExceeds ? <Note tone="red">Quantité supérieure au stock de ce lot ({num(medLot?.quantity ?? 0)}).</Note> : null}
            <Field label="Notes">
              <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {careType === 'VACCIN' ? <Directives /> : null}
            <ErrorNote error={planManual.error} />
            <div className="flex justify-end gap-2">
              <Button tone="secondary" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" busy={planManual.isPending} disabled={!canManual}>
                <Check className="h-4 w-4" /> Planifier
              </Button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {lotIds.length > 0 && !uniform ? (
              <Note tone="amber">Un programme s'applique à des lots de même espèce et de même type.</Note>
            ) : null}
            {uniform && !protocols.isLoading && programs.length === 0 ? (
              <Note tone="amber">Aucun programme de vaccination pour ce type de lot.</Note>
            ) : null}
            {uniform && programs.length > 0 ? (
              <Field label="Programme">
                <select className={inputCls} value={chosenId} onChange={(e) => setProtocolId(e.target.value)}>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            {uniform && program.data && first ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  Aperçu pour {lotName(first)} (J{first.metrics.ageDays})
                </p>
                <ul className="max-h-48 space-y-0.5 overflow-y-auto text-sm text-slate-700">
                  {program.data.steps
                    .filter((s) => s.active)
                    .sort((a, b) => a.dayFrom - b.dayFrom)
                    .map((s) => {
                      const passed = s.dayFrom < first.metrics.ageDays;
                      return (
                        <li key={s.id} className={passed ? 'text-slate-400 line-through' : undefined}>
                          J{s.dayFrom} : {s.name}
                          {s.route ? ` · ${s.route}` : ''}
                          {passed ? '' : ` · ${dateFr(addUtcDays(first.integrationDate, s.dayFrom))}`}
                        </li>
                      );
                    })}
                </ul>
                <p className="mt-1 text-xs text-slate-500">Les étapes déjà passées ne seront pas planifiées.</p>
              </div>
            ) : null}
            <Directives />
            {result ? (
              <Note tone="emerald">
                {result.planned} soin{result.planned > 1 ? 's' : ''} planifié{result.planned > 1 ? 's' : ''},{' '}
                {result.skipped} ignoré{result.skipped > 1 ? 's' : ''}.
              </Note>
            ) : null}
            <ErrorNote error={generate.error} />
            <div className="flex justify-end gap-2">
              <Button tone="secondary" onClick={onClose}>
                {result ? 'Fermer' : 'Annuler'}
              </Button>
              {!result ? (
                <Button busy={generate.isPending} disabled={!uniform || !chosenId} onClick={() => generate.mutate()}>
                  <Check className="h-4 w-4" /> Générer le programme
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Directives() {
  return (
    <Note tone="brand" icon={<ShieldCheck />}>
      <p className="font-semibold">Directives vaccinales (Gabon)</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
        {GABON_DIRECTIVES.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
    </Note>
  );
}

export function ConfirmModal({
  title,
  message,
  confirmLabel,
  confirmIcon,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  confirmIcon?: ReactNode;
  busy: boolean;
  error: unknown;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">{message}</p>
        <ErrorNote error={error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Retour
          </Button>
          <Button tone="danger" busy={busy} onClick={onConfirm}>
            {confirmIcon}
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}


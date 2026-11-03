import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bird, Building, CalendarX, Calendar, Check, Factory, FileText, Package, Plus, Printer, Scale, Send, TrendingUp, Truck } from 'lucide-react';
import { api } from '../api/client';
import type { Lot, SlaughterOrderFull, SlaughterStatus } from '../api/types-flock';
import { useFarm } from '../app/FarmContext';
import { ConfirmModal } from '../components/flock/SanitaryModals';
import {
  IconField,
  Metric,
  Note,
  SectionCard,
  Tabs,
  addLocalDays,
  localYmd,
  lotName,
  lotOption,
  parseNum,
  speciesName,
  useAsyncAction,
  useInvalidateFarm,
  useLots,
} from '../components/flock/shared';
import { Button, ErrorNote, Field, Modal, inputCls } from '../components/form';
import { EmptyState, Loading, PageHeader, PhotoThumb, Td, Th } from '../components/ui';
import { lotImage } from '../lib/animalImages';
import { dateFr, num } from '../lib/format';

type Horizon = 'today' | 'week' | 'month' | 'all' | 'custom';

const TYPE_LABEL = { VIVANT: 'Vivant', ABATTU: 'Abattu' };
const DEST_LABEL = { INTERNE: 'Interne', EXTERNE: 'Externe' };
const SECTION_ICON: Record<SlaughterStatus, React.ReactNode> = {
  DRAFT: <Send />,
  SENT: <Truck />,
  PROCESSED: <Check />,
  CANCELLED: <CalendarX />,
};

export function SlaughterPage() {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const lots = useLots();
  const [creating, setCreating] = useState(false);
  const [horizon, setHorizon] = useState<Horizon>('month');
  const [from, setFrom] = useState(addLocalDays(localYmd(), -30));
  const [to, setTo] = useState(addLocalDays(localYmd(), 30));
  const [carcass, setCarcass] = useState<SlaughterOrderFull | null>(null);
  const [cancelling, setCancelling] = useState<SlaughterOrderFull | null>(null);
  const action = useAsyncAction();

  const orders = useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => api.get<SlaughterOrderFull[]>(`/farms/${farmId}/slaughter-orders`),
    enabled: !!farmId,
  });
  const lotById = useMemo(() => new Map((lots.data ?? []).map((l) => [l.id, l])), [lots.data]);

  const shown = useMemo(() => {
    const today = localYmd();
    const bounds: Record<Horizon, [string | null, string | null]> = {
      today: [today, today],
      week: [addLocalDays(today, -7), addLocalDays(today, 7)],
      month: [addLocalDays(today, -30), addLocalDays(today, 30)],
      all: [null, null],
      custom: [from, to],
    };
    const [lo, hi] = bounds[horizon];
    return (orders.data ?? []).filter((o) => {
      const d = o.plannedDate.slice(0, 10);
      return (!lo || d >= lo) && (!hi || d <= hi);
    });
  }, [orders.data, horizon, from, to]);

  const bucket = (s: SlaughterStatus) => shown.filter((o) => o.status === s);
  const processed = bucket('PROCESSED');
  const totalCarcass = processed.reduce((s, o) => s + (o.carcassWeightKg ?? 0), 0);
  const rendements = processed.flatMap((o) => (o.rendementPercent != null ? [o.rendementPercent] : []));
  const avgRendement = rendements.length ? rendements.reduce((s, v) => s + v, 0) / rendements.length : null;

  const name = (o: SlaughterOrderFull) => o.batch?.batchName ?? lotName(lotById.get(o.batchId));
  const base = `/farms/${farmId}/slaughter-orders`;

  const section = (status: SlaughterStatus, title: string) => {
    const rows = bucket(status);
    if (rows.length === 0) return null;
    return (
      <SectionCard key={status} title={`${title} (${rows.length})`} icon={SECTION_ICON[status]} iconTone={status === 'CANCELLED' ? 'slate' : 'brand'} flush>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Référence</Th>
                <Th>Lot</Th>
                <Th>Type et destination</Th>
                <Th>Date prévue</Th>
                <Th>Oiseaux</Th>
                <Th>Poids vif</Th>
                <Th>Carcasse</Th>
                <Th>Code</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <tr key={o.id} className="border-t border-slate-100 align-top">
                  <Td className="font-medium">
                    {o.referenceNumber}
                    {o.abattoirNotes ? <span className="block text-xs font-normal text-slate-500">{o.abattoirNotes}</span> : null}
                  </Td>
                  <Td>{name(o)}</Td>
                  <Td>
                    {TYPE_LABEL[o.slaughterType]}
                    <span className="block text-xs text-slate-500">{DEST_LABEL[o.destination]}</span>
                  </Td>
                  <Td>
                    {dateFr(o.plannedDate)}
                    {o.processedAt ? <span className="block text-xs text-slate-500">traité le {dateFr(o.processedAt)}</span> : null}
                  </Td>
                  <Td>{num(o.birdCount, 0)}</Td>
                  <Td>{o.totalWeightKg != null ? `${num(o.totalWeightKg)} kg` : '—'}</Td>
                  <Td>
                    {o.carcassWeightKg != null ? `${num(o.carcassWeightKg)} kg` : '—'}
                    {o.rendementPercent != null ? (
                      <span className="block text-xs text-slate-500">rendement {num(o.rendementPercent)} %</span>
                    ) : null}
                  </Td>
                  <Td>{o.abattoirLotCode ?? o.internalBatchCode ?? '—'}</Td>
                  <Td className="whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      {o.status === 'DRAFT' ? (
                        <Button
                          busy={action.busy === `s-${o.id}`}
                          onClick={() =>
                            void action.run(`s-${o.id}`, async () => {
                              await api.post(`${base}/${o.id}/send`, o.abattoirLotCode ? { abattoirLotCode: o.abattoirLotCode } : {});
                              await invalidate();
                            })
                          }
                        >
                          <Send className="h-4 w-4" /> Envoyer
                        </Button>
                      ) : null}
                      {o.status === 'SENT' ? (
                        <Button onClick={() => setCarcass(o)}>
                          <Check className="h-4 w-4" /> Réceptionner
                        </Button>
                      ) : null}
                      {o.destination === 'EXTERNE' && o.status !== 'CANCELLED' ? (
                        <Button
                          tone="secondary"
                          busy={action.busy === `b-${o.id}`}
                          onClick={() =>
                            void action.run(`b-${o.id}`, () =>
                              api.download(`${base}/${o.id}/bordereau`, `bordereau-${o.referenceNumber}.pdf`),
                            )
                          }
                        >
                          <FileText className="h-4 w-4" /> Bordereau
                        </Button>
                      ) : null}
                      {o.status === 'DRAFT' || o.status === 'SENT' ? (
                        <Button tone="secondary" onClick={() => setCancelling(o)}>
                          <CalendarX className="h-4 w-4" /> Annuler
                        </Button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Abattage"
        icon={<Factory />}
        subtitle="Ordres, envoi à l'abattoir et rendement carcasse"
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Nouvel ordre
          </Button>
        }
      />
      <ErrorNote error={orders.error ?? action.error} />
      <div className="flex flex-wrap items-center gap-3">
        <Tabs<Horizon>
          value={horizon}
          onChange={setHorizon}
          options={[
            { key: 'today', label: "Aujourd'hui" },
            { key: 'week', label: '± 7 jours' },
            { key: 'month', label: '± 30 jours' },
            { key: 'all', label: 'Tout' },
            { key: 'custom', label: 'Période' },
          ]}
        />
        {horizon === 'custom' ? (
          <div className="flex items-center gap-2 text-xs text-slate-500">
            Du
            <input className={`${inputCls} w-auto py-1 text-xs`} aria-label="Début de période" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            au
            <input className={`${inputCls} w-auto py-1 text-xs`} aria-label="Fin de période" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Metric label="À envoyer" icon={<Send />} value={bucket('DRAFT').length} />
        <Metric label="À réceptionner" icon={<Truck />} value={bucket('SENT').length} />
        <Metric label="Traités" icon={<Check />} value={processed.length} sub={`${num(processed.reduce((s, o) => s + o.birdCount, 0))} oiseaux`} />
        <Metric label="Carcasse totale" icon={<Package />} value={`${num(totalCarcass)} kg`} />
        <Metric label="Rendement moyen" icon={<TrendingUp />} value={avgRendement != null ? `${num(avgRendement)} %` : '—'} />
      </div>
      {orders.isLoading ? (
        <Loading label="Chargement des ordres…" />
      ) : shown.length === 0 ? (
        <EmptyState message="Aucun ordre d'abattage sur cette période." icon={<Factory />} />
      ) : (
        <>
          {section('DRAFT', 'À envoyer')}
          {section('SENT', 'À réceptionner')}
          {section('PROCESSED', 'Traités')}
          {section('CANCELLED', 'Annulés')}
        </>
      )}

      {creating ? <NewOrderModal lots={lots.data ?? []} orders={orders.data ?? []} onClose={() => setCreating(false)} /> : null}
      {carcass ? <ProcessModal order={carcass} onClose={() => setCarcass(null)} /> : null}
      {cancelling ? (
        <ConfirmModal
          title="Annuler cet ordre ?"
          message={`L'ordre ${cancelling.referenceNumber} de ${num(cancelling.birdCount, 0)} oiseaux sera annulé.`}
          confirmLabel="Annuler l'ordre"
          confirmIcon={<CalendarX className="h-4 w-4" />}
          busy={action.busy === 'cancel'}
          error={action.error}
          onClose={() => setCancelling(null)}
          onConfirm={() =>
            void action.run('cancel', async () => {
              await api.post(`${base}/${cancelling.id}/cancel`, { reason: 'Annulé depuis le web' });
              await invalidate();
              setCancelling(null);
            })
          }
        />
      ) : null}
    </div>
  );
}

function ProcessModal({ order, onClose }: { order: SlaughterOrderFull; onClose: () => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const [carcass, setCarcass] = useState('');
  const [code, setCode] = useState(order.abattoirLotCode ?? '');
  const kg = parseNum(carcass) ?? 0;
  const rendement = order.totalWeightKg && kg > 0 ? (kg / order.totalWeightKg) * 100 : null;
  const save = useMutation({
    mutationFn: () =>
      api.post(`/farms/${farmId}/slaughter-orders/${order.id}/process`, {
        carcassWeightKg: kg,
        abattoirLotCode: code.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });
  return (
    <Modal title={`Réceptionner ${order.referenceNumber}`} onClose={onClose}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (kg > 0) save.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField label="Poids carcasse (kg) *" icon={<Scale />}>
            <input className={inputCls} inputMode="decimal" value={carcass} onChange={(e) => setCarcass(e.target.value)} required />
          </IconField>
          <Field label="Code abattoir">
            <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
          </Field>
        </div>
        {rendement != null ? (
          <Note tone={rendement > 100 ? 'red' : 'brand'}>Rendement carcasse : {num(rendement)} %</Note>
        ) : null}
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={kg <= 0}>
            <Check className="h-4 w-4" /> Enregistrer
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function NewOrderModal({
  lots,
  orders,
  onClose,
}: {
  lots: Lot[];
  orders: SlaughterOrderFull[];
  onClose: () => void;
}) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const eligible = lots.filter((l) => l.status === 'ACTIF' || l.status === 'EN_VENTE');
  const [batchId, setBatchId] = useState('');
  const [destination, setDestination] = useState<'INTERNE' | 'EXTERNE'>('INTERNE');
  const [slaughterType, setSlaughterType] = useState<'VIVANT' | 'ABATTU'>('ABATTU');
  const [plannedDate, setPlannedDate] = useState(localYmd());
  const [birdCount, setBirdCount] = useState('');
  const [weight, setWeight] = useState('');
  const [code, setCode] = useState('');
  const [notes, setNotes] = useState('');
  const pdf = useAsyncAction();

  const lot = eligible.find((l) => l.id === batchId) ?? null;
  const birds = parseInt(birdCount, 10) || 0;
  const alive = lot?.metrics.liveCount ?? 0;
  const ordered = orders
    .filter((o) => o.batchId === batchId && (o.status === 'DRAFT' || o.status === 'SENT'))
    .reduce((s, o) => s + o.birdCount, 0);
  const remaining = Math.max(0, alive - ordered);
  const processedBirds = orders
    .filter((o) => o.batchId === batchId && o.status === 'PROCESSED')
    .reduce((s, o) => s + o.birdCount, 0);
  const ordersExceedAlive = ordered > alive;
  const fillPct = alive > 0 ? Math.min(100, Math.round((ordered / alive) * 100)) : 0;
  const overbooked = lot != null && birds > remaining;
  const type = destination === 'INTERNE' ? 'ABATTU' : slaughterType;

  // Projection from the farm's own processed orders of the same species.
  const projection = useMemo(() => {
    if (!lot || birds <= 0) return null;
    const speciesLots = new Set(lots.filter((l) => l.species === lot.species).map((l) => l.id));
    const done = orders.filter((o) => o.status === 'PROCESSED' && speciesLots.has(o.batchId) && o.totalWeightKg && o.birdCount > 0);
    if (done.length === 0) return null;
    const avgKg = done.reduce((s, o) => s + (o.totalWeightKg ?? 0), 0) / done.reduce((s, o) => s + o.birdCount, 0);
    const rend = done.flatMap((o) => (o.rendementPercent != null ? [o.rendementPercent] : []));
    const avgRend = rend.length ? rend.reduce((s, v) => s + v, 0) / rend.length : null;
    const live = avgKg * birds;
    return { live, carcass: avgRend != null ? (live * avgRend) / 100 : null, avgRend };
  }, [lot, birds, lots, orders]);

  const create = useMutation({
    mutationFn: () =>
      api.post(`/farms/${farmId}/slaughter-orders`, {
        batchId,
        slaughterType: type,
        destination,
        plannedDate,
        birdCount: birds,
        totalWeightKg: parseNum(weight),
        abattoirLotCode: destination === 'EXTERNE' && code.trim() ? code.trim() : undefined,
        abattoirNotes: destination === 'EXTERNE' && notes.trim() ? notes.trim() : undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const canSubmit = !!lot && birds > 0 && !overbooked && !!plannedDate;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) create.mutate();
  };

  return (
    <Modal title="Nouvel ordre d'abattage" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Lot *">
          <div className="flex items-center gap-2">
            <PhotoThumb src={lot ? lotImage(lot.breedName, lot.species) : null} />
            <select className={`${inputCls} min-w-0`} value={batchId} onChange={(e) => setBatchId(e.target.value)} required>
              <option value="">Sélectionner un lot…</option>
              {eligible.map((l) => (
                <option key={l.id} value={l.id}>
                  {lotOption(l)}
                </option>
              ))}
            </select>
          </div>
        </Field>
        {lot ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disposition du lot : {speciesName(lot)}</p>
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Vivants" icon={<Bird />} value={num(alive, 0)} />
              <Metric label="Déjà ordonnés" icon={<FileText />} value={num(ordered, 0)} tone={ordersExceedAlive ? 'bad' : undefined} />
              <Metric label="Restants" icon={<Check />} value={num(remaining, 0)} tone={remaining <= 0 ? 'bad' : 'good'} />
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
              <div
                className={`h-full rounded-full ${ordersExceedAlive ? 'bg-red-500' : fillPct >= 70 ? 'bg-amber-500' : 'bg-brand-500'}`}
                style={{ width: `${fillPct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${ordersExceedAlive ? 'text-amber-700' : 'text-slate-500'}`}>
              {ordersExceedAlive
                ? 'Attention : les ordres en cours du lot couvrent déjà le cheptel vivant.'
                : `${processedBirds > 0 ? `${num(processedBirds, 0)} oiseaux déjà traités · ` : ''}${num(remaining, 0)} oiseaux encore disponibles à planifier.`}
            </p>
            <Button
              tone="secondary"
              busy={pdf.busy === 'pdf'}
              onClick={() =>
                void pdf.run('pdf', () =>
                  api.download(`/farms/${farmId}/batches/${lot.id}/passeport`, `passeport-${lotName(lot)}.pdf`),
                )
              }
            >
              <Printer className="h-4 w-4" /> Passeport du lot
            </Button>
            </div>
          </div>
        ) : null}
        <ErrorNote error={pdf.error} />
        <div className="grid gap-4 sm:grid-cols-2">
          <IconField label="Destination" icon={destination === 'INTERNE' ? <Building /> : <Truck />}>
            <select className={inputCls} value={destination} onChange={(e) => setDestination(e.target.value as 'INTERNE' | 'EXTERNE')}>
              <option value="INTERNE">Interne (abattage sur place)</option>
              <option value="EXTERNE">Externe (abattoir partenaire)</option>
            </select>
          </IconField>
          {destination === 'EXTERNE' ? (
            <Field
              label="Type"
              hint={slaughterType === 'VIVANT' ? "L'abattoir reçoit les oiseaux vivants." : "L'abattoir restitue des carcasses."}
            >
              <select className={inputCls} value={slaughterType} onChange={(e) => setSlaughterType(e.target.value as 'VIVANT' | 'ABATTU')}>
                <option value="ABATTU">Abattu</option>
                <option value="VIVANT">Vivant</option>
              </select>
            </Field>
          ) : (
            <Field label="Type">
              <input className={inputCls} value="Abattu" disabled />
            </Field>
          )}
          <IconField label="Nombre d'oiseaux *" icon={<Bird />}>
            <input className={inputCls} inputMode="numeric" value={birdCount} onChange={(e) => setBirdCount(e.target.value.replace(/\D/g, ''))} required />
          </IconField>
          <IconField label="Date prévue *" icon={<Calendar />}>
            <input className={inputCls} type="date" value={plannedDate} onChange={(e) => setPlannedDate(e.target.value)} required />
          </IconField>
          <IconField label="Poids vif total (kg)" icon={<Scale />}>
            <input className={inputCls} inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} />
          </IconField>
          {destination === 'EXTERNE' ? (
            <>
              <Field label="Code abattoir">
                <input className={inputCls} value={code} onChange={(e) => setCode(e.target.value)} />
              </Field>
              <Field label="Notes pour l'abattoir" className="sm:col-span-2">
                <textarea className={inputCls} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </Field>
            </>
          ) : null}
        </div>
        {overbooked ? <Note tone="red">Seulement {num(remaining)} oiseaux disponibles sur ce lot.</Note> : null}
        {projection ? (
          <Note tone="brand">
            Projection selon vos abattages : environ {num(projection.live, 0)} kg vifs
            {projection.carcass != null ? `, ${num(projection.carcass, 0)} kg de carcasse (rendement ${num(projection.avgRend ?? 0)} %)` : ''}.
          </Note>
        ) : null}
        <p className="text-xs text-slate-500">Envoi : les critères sanitaires du lot sont vérifiés par le serveur.</p>
        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!canSubmit}>
            <FileText className="h-4 w-4" /> Créer l'ordre
          </Button>
        </div>
      </form>
    </Modal>
  );
}

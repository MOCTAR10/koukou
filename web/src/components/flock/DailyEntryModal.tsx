import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  Bird,
  Boxes,
  CalendarDays,
  Check,
  Copy,
  Droplets,
  Egg,
  EggOff,
  Lightbulb,
  PackageCheck,
  PackageOpen,
  Scale,
  Shrink,
  Skull,
  Target,
  Weight,
  Wheat,
} from 'lucide-react';
import { api } from '../../api/client';
import type { FeedStockSummary } from '../../api/types';
import type { DailyEntryRecord, Lot } from '../../api/types-flock';
import type { BandSheet } from '../../api/types-pilotage';
import { useFarm } from '../../app/FarmContext';
import { useCanRead } from '../../app/useMenuAccess';
import { lotAgeOn } from './band';
import { sendOrQueue, showQueuedNotice } from '../../offline';
import { dailyEntryBase } from '../../offline/syncMeta';
import { initialSampleSize, sampleBelowExpected, sampleSizeError } from './weighing';
import { EGG_IMAGES, lotImage } from '../../lib/animalImages';
import { classNames, dateFr, num } from '../../lib/format';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal, DateInput } from '../form';
import { EmptyState, Loading, PhotoThumb } from '../ui';
import { ageWeek, estimateDailyFeed } from './feedRecommendation';
import {
  EGGS_PER_ALVEOL,
  FEED_PHASE_LABEL,
  IconField,
  Metric,
  Note,
  addLocalDays,
  kindLabel,
  localYmd,
  lotOption,
  parseNum,
  useBreedStandards,
  useInvalidateFarm,
  useLots,
} from './shared';

const BAG_SIZES = [10, 25, 40, 50];
const WATER_LO = 1.8;
const WATER_HI = 2.6;

/** Feed phase advised at `age` (the birds' age on the entry's day). */
function suggestedPhase(b: Lot, age: number): string {
  if (age <= 10) return 'POUSSIN';
  if (age <= 24) return 'DEMARRAGE';
  if (b.type === 'PONDEUSE') {
    if (age <= 112) return 'CROISSANCE';
    if (age <= 126) return 'PRE_PONTE';
    return 'PONTE_PHASE_1';
  }
  return age <= 35 ? 'CROISSANCE' : 'FINITION';
}

function phasesFor(b: Lot): string[] {
  return b.type === 'PONDEUSE'
    ? ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'PRE_PONTE', 'PONTE_PHASE_1', 'PONTE_PHASE_2', 'PONTE_PHASE_3', 'PERSONNALISE']
    : ['POUSSIN', 'DEMARRAGE', 'CROISSANCE', 'FINITION', 'PERSONNALISE'];
}

/** Picks the lot and the date, then mounts a form initialised for that pair. */
/** Average egg weight behind the egg-mass figure, as on mobile. */
const EGG_MASS_G = 60;

export function DailyEntryModal({
  initialBatchId,
  initialDate,
  onClose,
}: {
  initialBatchId?: string;
  initialDate?: string;
  onClose: () => void;
}) {
  const { farmId } = useFarm();
  const lots = useLots();
  const active = (lots.data ?? []).filter((b) => b.status !== 'CLOTURE');
  const [lotId, setLotId] = useState(initialBatchId ?? '');
  const lot = active.find((b) => b.id === lotId) ?? active[0];
  const [date, setDate] = useState(initialDate ?? localYmd());

  const entries = useQuery({
    queryKey: ['daily-entries', farmId, lot?.id],
    queryFn: () => api.get<DailyEntryRecord[]>(`/farms/${farmId}/batches/${lot?.id}/daily-entries`),
    enabled: !!farmId && !!lot,
    // A stale cache would prefill a blank form and the save would replace the entry.
    refetchOnMount: 'always',
  });

  const today = localYmd();
  const yesterday = addLocalDays(today, -1);

  return (
    <Modal title="Saisie journalière" onClose={onClose} large>
      {lots.isLoading ? (
        <Loading label="Chargement des lots…" />
      ) : active.length === 0 || !lot ? (
        <EmptyState message="Aucun lot actif : créez d'abord un lot." icon={<Bird />} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Lot">
              <div className="flex items-center gap-2">
                <PhotoThumb src={lotImage(lot.breedName, lot.species)} />
                <select className={`${inputCls} min-w-0`} value={lot.id} onChange={(e) => setLotId(e.target.value)}>
                  {active.map((b) => (
                    <option key={b.id} value={b.id}>
                      {lotOption(b)}
                    </option>
                  ))}
                </select>
              </div>
            </Field>
            <IconField label="Date de la saisie" icon={<CalendarDays />}>
              <div className="flex items-center gap-1">
                <DateChip active={date === today} onClick={() => setDate(today)}>
                  Aujourd'hui
                </DateChip>
                <DateChip active={date === yesterday} onClick={() => setDate(yesterday)}>
                  Hier
                </DateChip>
                <DateInput
                  
                  className={inputCls}
                  aria-label="Date de la saisie"
                  max={today}
                  min={lot.integrationDate.slice(0, 10)}
                  value={date}
                  onChange={(e) => setDate(e.target.value || today)}
                />
              </div>
            </IconField>
          </div>
          <p className="text-xs text-slate-500">
            {kindLabel(lot)} · {lot.breedName ?? lot.customBreed ?? 'Souche non renseignée'} · J{lotAgeOn(lot, date, today)}
            {date !== today ? ' ce jour-là' : ''} · semaine {ageWeek(lotAgeOn(lot, date, today))} · {num(lot.metrics.liveCount)} vivants sur{' '}
            {num(lot.quantityAtStart)}
            {' '}· mortalité {num(lot.metrics.mortalityPercent)} %
          </p>
          <ErrorNote error={entries.error} />
          {entries.isLoading || entries.isFetching ? (
            <Loading label="Lecture des saisies du lot…" />
          ) : (
            <EntryForm key={`${lot.id}|${date}`} lot={lot} date={date} entries={entries.data ?? []} onClose={onClose} />
          )}
        </div>
      )}
    </Modal>
  );
}

function DateChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={classNames(
        'whitespace-nowrap rounded-lg px-2.5 py-2 text-xs font-medium',
        active ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200',
      )}
    >
      {children}
    </button>
  );
}

const str = (n: number | null | undefined) => (n ? String(n) : '');

function EntryForm({
  lot,
  date,
  entries,
  onClose,
}: {
  lot: Lot;
  date: string;
  entries: DailyEntryRecord[];
  onClose: () => void;
}) {
  const { farmId, farm } = useFarm();
  const invalidate = useInvalidateFarm();
  const isLayer = lot.type === 'PONDEUSE';
  // A back-dated entry: the birds' age on that day (J+x rule), not today's.
  const ageDays = lotAgeOn(lot, date, localYmd());
  const existing = entries.find((e) => e.entryDate.slice(0, 10) === date) ?? null;
  const allowedPhases = phasesFor(lot);
  const defaultPhase =
    existing?.feedPhase && allowedPhases.includes(existing.feedPhase) ? existing.feedPhase : suggestedPhase(lot, ageDays);

  const defaultBag = existing?.bagSizeKg ?? farm?.defaultSacKg ?? 50;
  const [deaths, setDeaths] = useState(str(existing?.deaths));
  const [feedMode, setFeedMode] = useState<'kg' | 'sacs'>(existing?.feedUnit === 'SAC' ? 'sacs' : 'kg');
  const [feedKg, setFeedKg] = useState(existing?.feedUnit === 'SAC' ? '' : str(existing?.feedQuantity));
  const [feedSacs, setFeedSacs] = useState(
    existing?.feedUnit === 'SAC' ? str(Math.round(existing.feedQuantity / defaultBag)) : '',
  );
  const [bagSize, setBagSize] = useState(String(defaultBag));
  const [phase, setPhase] = useState(defaultPhase);
  const [customPhase, setCustomPhase] = useState(existing?.customFeedPhaseName ?? '');
  const [source, setSource] = useState(
    existing?.skipStockDeduction ? 'externe' : (existing?.inputLotId ?? 'auto'),
  );
  const [water, setWater] = useState(str(existing?.waterL));
  const [weightG, setWeightG] = useState(existing?.avgWeightKg ? String(Math.round(existing.avgWeightKg * 1000)) : '');
  // Programme sample size (PESEE_ECHANTILLON_TETES), from the band sheet.
  const sheet = useQuery({
    queryKey: ['bande-sheet', farmId, lot.id],
    queryFn: () => api.get<BandSheet>(`/farms/${farmId}/bandes/${lot.id}`),
    enabled: !!farmId,
  });
  const expectedSample = sheet.data?.weighing.expectedSampleSize ?? null;
  const [sampleSize, setSampleSize] = useState(initialSampleSize(existing, null));
  const [sampleTouched, setSampleTouched] = useState(false);
  const sampleValue = sampleTouched || sampleSize ? sampleSize : initialSampleSize(existing, expectedSample);
  const [eggs, setEggs] = useState(existing?.eggsCollected ?? 0);
  const [cracked, setCracked] = useState(str(existing?.eggsCracked));
  const [small, setSmall] = useState(str(existing?.eggsSmall));
  const [doubleYolk, setDoubleYolk] = useState(str(existing?.eggsDoubleYolk));
  const [dirty, setDirty] = useState(str(existing?.eggsDirty));

  // INTRANTS: the feed lots to pick from, when the account reads them.
  const canReadStock = useCanRead()('INTRANTS');
  const stock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled: !!farmId && canReadStock,
  });
  const standards = useBreedStandards(lot.breedId);

  const n = (raw: string) => parseNum(raw) ?? 0;
  const deathsN = n(deaths);
  const waterN = n(water);
  const weightGN = n(weightG);
  const crackedN = n(cracked);
  const smallN = n(small);
  const doubleN = n(doubleYolk);
  const dirtyN = n(dirty);
  const bagKg = n(bagSize) || 50;
  const feedKgEq = feedMode === 'kg' ? n(feedKg) : n(feedSacs) * bagKg;

  const live = lot.metrics.liveCount;
  const sampleError = sampleSizeError(weightGN, sampleValue, live);
  const deathsExceed = deathsN > 0 && deathsN >= live;
  const rejects = crackedN + smallN + doubleN + dirtyN;
  const rejectsExceed = rejects > eggs;
  const sellable = Math.max(0, eggs - rejects);

  const phaseStock = stock.data?.byType.find((t) => t.feedPhase === phase) ?? null;
  const suggestedLotId = phaseStock?.suggestedLotId ?? null;
  const lotsOfPhase = (stock.data?.lots ?? []).filter((l) => l.feedPhase === phase && l.availableKg > 0);
  const stockLotId = source === 'auto' ? suggestedLotId : source === 'externe' ? null : source;
  const chosenLot = stock.data?.lots.find((l) => l.id === stockLotId) ?? null;

  const recent = useMemo(
    () =>
      entries
        .filter((e) => e.entryDate.slice(0, 10) < date)
        .sort((a, b) => b.entryDate.localeCompare(a.entryDate))
        .slice(0, 7),
    [entries, date],
  );
  const previousDay = entries.find((e) => e.entryDate.slice(0, 10) === addLocalDays(date, -1));
  const lastWeighing = recent.find((e) => e.avgWeightKg != null) ?? null;
  const prevWeightG = lastWeighing?.avgWeightKg != null ? lastWeighing.avgWeightKg * 1000 : null;

  const week = ageWeek(ageDays);
  const std = standards.data;
  const standardRow = std?.find((s) => s.week === week) ?? (std ? [...std].reverse().find((s) => s.week <= week) : undefined);
  const targetWeight = standardRow?.targetAvgWeightKg ?? null;
  const targetLay = standardRow?.targetLayRatePercent ?? null;

  const rec = estimateDailyFeed({
    ageDays,
    isLayer,
    liveCount: live,
    weighedWeightKg: weightGN > 0 ? weightGN / 1000 : prevWeightG != null ? prevWeightG / 1000 : null,
    standards: std ?? [],
  });
  const feedDevPct =
    feedKgEq > 0 && rec.totalKgPerDay ? ((feedKgEq - rec.totalKgPerDay) / rec.totalKgPerDay) * 100 : null;
  const waterRatio = waterN > 0 && feedKgEq > 0 ? waterN / feedKgEq : null;
  const waterDrop =
    previousDay && previousDay.waterL > 0 && waterN > 0
      ? ((waterN - previousDay.waterL) / previousDay.waterL) * 100
      : null;
  const weightDev = weightGN > 0 && targetWeight ? ((weightGN / 1000 - targetWeight) / targetWeight) * 100 : null;
  const weightDelta = weightGN > 0 && prevWeightG != null ? weightGN - prevWeightG : null;
  const layRate = live > 0 && eggs > 0 ? (eggs / live) * 100 : null;

  const hasAnything =
    deathsN > 0 || feedKgEq > 0 || waterN > 0 || weightGN > 0 || eggs > 0 || rejects > 0 || existing != null;

  const save = useMutation({
    mutationFn: () => {
      const editing = existing != null;
      const p: Record<string, unknown> = { entryDate: date };
      const send = (v: number) => v > 0 || editing;
      const sendEgg = (v: number) => v > 0 || (editing && isLayer);
      if (send(deathsN)) p.deaths = deathsN;
      const hasFeed = feedKgEq > 0;
      if (feedMode === 'kg' && hasFeed) {
        p.feedUnit = 'KG';
        p.feedQuantity = n(feedKg);
      } else if (feedMode === 'sacs' && hasFeed) {
        p.feedUnit = 'SAC';
        p.feedBags = n(feedSacs);
        p.bagSizeKg = bagKg;
      } else if (editing) {
        // Feed corrected back to nothing: the server gives the stock back.
        p.feedUnit = 'KG';
        p.feedQuantity = 0;
      }
      if (hasFeed) {
        p.feedPhase = phase;
        if (phase === 'PERSONNALISE' && customPhase.trim()) p.customFeedPhaseName = customPhase.trim();
        if (source === 'externe') p.skipStockDeduction = true;
        else if (stockLotId) p.inputLotId = stockLotId;
      }
      if (send(waterN)) p.waterL = waterN;
      if (weightGN > 0) {
        p.avgWeightKg = weightGN / 1000;
        p.sampleSize = Number(sampleValue.trim());
      }
      if (sendEgg(eggs)) {
        p.eggsCollected = eggs;
        p.eggsSellable = sellable;
      }
      if (sendEgg(crackedN)) p.eggsCracked = crackedN;
      if (sendEgg(smallN)) p.eggsSmall = smallN;
      if (sendEgg(doubleN)) p.eggsDoubleYolk = doubleN;
      if (sendEgg(dirtyN)) p.eggsDirty = dirtyN;
      return sendOrQueue({
        kind: 'daily-entry',
        farmId: farmId!,
        path: `/farms/${farmId}/batches/${lot.id}/daily-entries`,
        // Offline conflict rule: the entry this form was opened on.
        body: { ...p, ...dailyEntryBase(existing) },
        label: `Saisie du ${date.slice(8, 10)}/${date.slice(5, 7)} · ${lot.batchName ?? 'Lot'}`,
      });
    },
    onSuccess: async (res) => {
      if (res.status === 'queued') showQueuedNotice();
      else await invalidate();
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (hasAnything && !deathsExceed && !rejectsExceed && !sampleError) save.mutate();
  };

  const trays = Math.floor(eggs / EGGS_PER_ALVEOL);
  const loose = eggs % EGGS_PER_ALVEOL;

  return (
    <form onSubmit={submit} className="space-y-4">
      {existing ? (
        <Note tone="brand">
          Une saisie existe déjà pour le {dateFr(date)} : ses valeurs sont reprises et seront remplacées.
        </Note>
      ) : null}

      <FormColumns>
      <div className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <IconField label="Morts du jour" icon={<Skull className="text-red-600" />}>
          <input className={inputCls} inputMode="numeric" value={deaths} onChange={(e) => setDeaths(e.target.value.replace(/\D/g, ''))} placeholder="0" />
        </IconField>
        <IconField label="Eau (L)" icon={<Droplets className="text-brand-600" />}>
          <input className={inputCls} inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} placeholder="0" />
        </IconField>
        <IconField label="Poids moyen pesé (g)" icon={<Scale className="text-emerald-600" />}>
          <input className={inputCls} inputMode="numeric" value={weightG} onChange={(e) => setWeightG(e.target.value.replace(/\D/g, ''))} placeholder="Facultatif" />
        </IconField>
      </div>

      {weightGN > 0 ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <IconField
            label="Sujets pesés"
            icon={<Scale className="text-emerald-600" />}
            hint={expectedSample ? `Échantillon demandé par le programme : ${expectedSample} sujets` : 'Obligatoire avec un poids moyen'}
          >
            <input
              className={inputCls}
              inputMode="numeric"
              aria-invalid={sampleError ? true : undefined}
              value={sampleValue}
              onChange={(e) => {
                setSampleTouched(true);
                setSampleSize(e.target.value.replace(/\D/g, ''));
              }}
              placeholder={expectedSample ? String(expectedSample) : 'Nombre'}
            />
          </IconField>
          <div className="sm:col-span-2 self-end">
            {sampleError ? (
              <Note tone="red">{sampleError}</Note>
            ) : sampleBelowExpected(sampleValue, expectedSample) ? (
              <Note tone="amber">Moins de sujets que les {expectedSample} demandés par le programme : la pesée sera signalée.</Note>
            ) : null}
          </div>
        </div>
      ) : null}

      {deathsExceed ? (
        <Note tone="red">
          Impossible : {num(deathsN)} {deathsN > 1 ? 'morts atteignent' : 'mort atteint'} l'effectif vivant ({num(live)}).
        </Note>
      ) : deathsN > 0 && live > 0 ? (
        <p className="text-xs text-slate-500">Soit {num((deathsN / live) * 100, 2)} % de l'effectif vivant.</p>
      ) : null}

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-600">
          <Wheat className="h-3.5 w-3.5 text-amber-600" /> Aliment
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Unité">
            <select className={inputCls} value={feedMode} onChange={(e) => setFeedMode(e.target.value as 'kg' | 'sacs')}>
              <option value="kg">Kilogrammes</option>
              <option value="sacs">Sacs</option>
            </select>
          </Field>
          {feedMode === 'kg' ? (
            <IconField label="Quantité donnée (kg)" icon={<Wheat className="text-amber-600" />}>
              <input className={inputCls} inputMode="decimal" value={feedKg} onChange={(e) => setFeedKg(e.target.value)} placeholder="0" />
            </IconField>
          ) : (
            <>
              <IconField label="Nombre de sacs" icon={<PackageOpen className="text-amber-600" />}>
                <input className={inputCls} inputMode="decimal" value={feedSacs} onChange={(e) => setFeedSacs(e.target.value)} placeholder="0" />
              </IconField>
              <Field label="Taille du sac (kg)">
                <select className={inputCls} value={bagSize} onChange={(e) => setBagSize(e.target.value)}>
                  {[...new Set([...BAG_SIZES, bagKg])].sort((a, b) => a - b).map((s) => (
                    <option key={s} value={s}>
                      {s} kg
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
          <Field label="Phase d'alimentation" hint={`Conseillée à J${ageDays} : ${FEED_PHASE_LABEL[suggestedPhase(lot, ageDays)]}`}>
            <select
              className={inputCls}
              value={phase}
              onChange={(e) => {
                setPhase(e.target.value);
                setSource((s) => (s === 'externe' ? s : 'auto'));
              }}
            >
              {allowedPhases.map((p) => (
                <option key={p} value={p}>
                  {FEED_PHASE_LABEL[p]}
                </option>
              ))}
            </select>
          </Field>
          {phase === 'PERSONNALISE' ? (
            <Field label="Nom de la phase">
              <input className={inputCls} value={customPhase} onChange={(e) => setCustomPhase(e.target.value)} />
            </Field>
          ) : null}
          <IconField
            label="Provenance de l'aliment"
            icon={<Boxes />}
            className="sm:col-span-2"
            hint={
              source === 'externe'
                ? 'Achat externe : la consommation est enregistrée sans toucher au stock suivi.'
                : chosenLot
                  ? `${num(chosenLot.availableKg)} kg disponibles${feedKgEq > 0 ? `, ${num(Math.max(0, chosenLot.availableKg - feedKgEq))} kg après cette saisie` : ''}${phaseStock?.autonomyDays != null ? ` · autonomie ${num(phaseStock.autonomyDays)} j` : ''}`
                  : 'Aucun lot de provende disponible pour cette phase.'
            }
          >
            <select className={inputCls} value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="auto">
                Stock : automatique (premier périmé, premier sorti)
                {phaseStock?.suggestedLotName ? ` · ${phaseStock.suggestedLotName}` : ''}
              </option>
              {lotsOfPhase.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.supplierLotNumber} - {l.productName} ({num(l.availableKg)} kg)
                </option>
              ))}
              <option value="externe">Achat externe (hors stock)</option>
            </select>
          </IconField>
        </div>
        {source !== 'externe' && feedKgEq > 0 && chosenLot == null ? (
          <Note tone="red">
            Stock d'aliment vide pour cette phase : la consommation sera enregistrée « depuis le stock » mais le stock
            passera en négatif (-{num(feedKgEq)} kg) et une alerte sera levée. Enregistrez une entrée de provende pour régulariser.
          </Note>
        ) : source !== 'externe' && chosenLot != null && feedKgEq > chosenLot.availableKg ? (
          <Note tone="amber">
            La consommation ({num(feedKgEq)} kg) dépasse le stock du lot ({num(chosenLot.availableKg)} kg) : elle sera refusée.
            Choisissez un autre lot, corrigez la quantité ou ajoutez du stock.
          </Note>
        ) : null}
        <FeedAdvice recKg={rec.totalKgPerDay} perBirdG={rec.perBirdG} feedKg={feedKgEq} devPct={feedDevPct} isLayer={isLayer} />
        {waterRatio != null ? <WaterRatio ratio={waterRatio} /> : null}
        {rec.totalKgPerDay ? (
          <p className="text-xs text-slate-500">
            Eau conseillée : environ {num(Math.ceil(rec.totalKgPerDay * WATER_LO), 0)} à{' '}
            {num(Math.floor(rec.totalKgPerDay * WATER_HI), 0)} L par jour (norme 1,8 à 2,6 L par kg d'aliment).
          </p>
        ) : null}
        {waterDrop != null && waterDrop <= -15 ? (
          <Note tone="amber" icon={<Droplets />}>
            Eau en baisse de {num(Math.abs(waterDrop), 0)} % par rapport à la veille : vérifiez les abreuvoirs et l'état
            du lot.
          </Note>
        ) : null}
      </fieldset>
      </div>

      <div className="min-w-0 space-y-4">
      {isLayer || eggs > 0 ? (
      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-600">
          <Egg className="h-3.5 w-3.5 text-accent-700" /> Œufs{isLayer ? '' : ' (si le lot pond)'}
        </legend>
        <div className="grid items-end gap-4 sm:grid-cols-3 lg:grid-cols-2">
          <IconField label={`Alvéoles (${EGGS_PER_ALVEOL} œufs)`} image={EGG_IMAGES.alveole}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={trays > 0 ? String(trays) : ''}
              onChange={(e) => setEggs((parseInt(e.target.value, 10) || 0) * EGGS_PER_ALVEOL + loose)}
              placeholder="0"
            />
          </IconField>
          <IconField label="Œufs en vrac" image={EGG_IMAGES.oeuf}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={loose > 0 ? String(loose) : ''}
              onChange={(e) => setEggs(trays * EGGS_PER_ALVEOL + (parseInt(e.target.value, 10) || 0))}
              placeholder="0"
            />
          </IconField>
          <IconField label="Fêlés" icon={<EggOff className="text-red-600" />}>
            <input className={inputCls} inputMode="numeric" value={cracked} onChange={(e) => setCracked(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </IconField>
          <IconField label="Petits" icon={<Shrink className="text-amber-600" />}>
            <input className={inputCls} inputMode="numeric" value={small} onChange={(e) => setSmall(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </IconField>
          <IconField label="Double jaune" icon={<Copy className="text-brand-600" />}>
            <input className={inputCls} inputMode="numeric" value={doubleYolk} onChange={(e) => setDoubleYolk(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </IconField>
          <IconField label="Sales" icon={<Droplets className="text-accent-700" />}>
            <input className={inputCls} inputMode="numeric" value={dirty} onChange={(e) => setDirty(e.target.value.replace(/\D/g, ''))} placeholder="0" />
          </IconField>
        </div>
        {eggs > 0 || rejects > 0 ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            <Metric label="Total collecté" image={EGG_IMAGES.oeuf} value={num(eggs, 0)} />
            <Metric label="Commercialisables" icon={<PackageCheck />} value={num(sellable, 0)} />
            <Metric
              label="Taux de ponte"
              icon={<Egg />}
              value={layRate != null ? `${num(layRate)} %` : '—'}
              sub={targetLay != null ? `cible souche ${num(targetLay)} %` : undefined}
            />
            <Metric label="Écarts" icon={<AlertTriangle />} value={num(rejects, 0)} tone={rejectsExceed ? 'bad' : undefined} />
          </div>
        ) : null}
        {rejectsExceed ? (
          <Note tone="red">
            Écarts ({num(rejects, 0)}) supérieurs au total d'œufs collectés ({num(eggs, 0)}).
          </Note>
        ) : null}
        {eggs > 0 && eggs >= live ? (
          <Note tone="amber">
            {num(eggs, 0)} œufs pour {num(live)} oiseaux : vérifiez qu'il n'y a pas de double saisie.
          </Note>
        ) : null}
      </fieldset>
      ) : null}

      {weightGN > 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
          <Metric
            label="Écart à la souche"
            icon={<Target />}
            value={weightDev != null ? `${weightDev >= 0 ? '+' : ''}${num(weightDev, 0)} %` : '—'}
            sub={targetWeight != null ? `cible ${num(targetWeight, 2)} kg` : undefined}
            tone={weightDev == null ? undefined : Math.abs(weightDev) <= 10 ? 'good' : Math.abs(weightDev) <= 20 ? 'warn' : 'bad'}
          />
          <Metric
            label="Depuis la dernière pesée"
            icon={<Scale />}
            value={weightDelta != null ? `${weightDelta >= 0 ? '+' : ''}${num(weightDelta, 0)} g` : '—'}
            sub={lastWeighing ? dateFr(lastWeighing.entryDate) : undefined}
          />
          <Metric label="Biomasse du lot" icon={<Weight />} value={`${num((live * weightGN) / 1000, 0)} kg`} />
          <Metric
            label="Besoin aliment estimé"
            icon={<Wheat />}
            value={`${num(weightGN * 0.03, 0)} à ${num(weightGN * 0.05, 0)} g`}
            sub="par oiseau et par jour"
          />
          {isLayer && eggs > 0 ? (
            <Metric label="Masse ovulaire / jour" icon={<Egg />} value={`${num((eggs * EGG_MASS_G) / 1000, 1)} kg`} sub="à 60 g l'œuf" />
          ) : null}
        </div>
      ) : null}
      </div>
      </FormColumns>

      <ErrorNote error={save.error} />
      <div className="flex justify-end gap-2">
        <Button tone="secondary" onClick={onClose}>
          Annuler
        </Button>
        <Button type="submit" busy={save.isPending} disabled={!hasAnything || deathsExceed || rejectsExceed || !!sampleError}>
          <Check className="h-4 w-4" /> {existing ? 'Mettre à jour la saisie' : 'Enregistrer la saisie'}
        </Button>
      </div>
    </form>
  );
}

function FeedAdvice({
  recKg,
  perBirdG,
  feedKg,
  devPct,
  isLayer,
}: {
  recKg: number | null;
  perBirdG: number | null;
  feedKg: number;
  devPct: number | null;
  isLayer: boolean;
}) {
  if (recKg == null || perBirdG == null) {
    return (
      <Note tone="amber" icon={<Lightbulb />}>
        Pas encore de recommandation pour cette souche : une pesée du lot permet d'estimer le besoin quotidien (environ{' '}
        {isLayer ? '5' : '4'} % du poids vif).
      </Note>
    );
  }
  const abs = devPct != null ? Math.abs(devPct) : 0;
  const tone = devPct == null ? 'brand' : abs <= 15 ? 'emerald' : abs > 45 ? 'red' : 'amber';
  let message = 'Indiquez la quantité donnée pour comparer au besoin estimé du lot.';
  if (devPct != null) {
    if (abs <= 15) message = "Bon dosage pour l'effectif et l'âge du lot.";
    else if (devPct < -45) message = 'Nettement sous le besoin : un aliment insuffisant pèse sur la croissance du lot.';
    else if (devPct < 0) message = 'En dessous du besoin estimé : revérifiez la quantité distribuée.';
    else if (devPct > 45) message = 'Nettement au-dessus du besoin estimé : sacs non comptés ou double saisie ?';
    else message = 'Un peu au-dessus du besoin : contrôlez les sacs à vide et le gaspillage.';
  }
  return (
    <Note tone={tone} icon={<Lightbulb />}>
      <strong>Recommandation du jour : environ {num(recKg)} kg</strong> ({num(perBirdG, 0)} g par oiseau)
      {feedKg > 0 && devPct != null ? ` · saisi ${num(feedKg)} kg (${devPct >= 0 ? '+' : ''}${num(devPct, 0)} %)` : ''}.{' '}
      {message}
    </Note>
  );
}

function WaterRatio({ ratio }: { ratio: number }) {
  const zone =
    ratio < WATER_LO ? (ratio < 1.2 ? 'lowCritical' : 'low') : ratio > WATER_HI ? (ratio > 3.5 ? 'highCritical' : 'high') : 'ok';
  const messages: Record<string, string> = {
    ok: "Consommation d'eau normale pour l'aliment distribué.",
    low: "Eau faible pour l'aliment donné : vérifiez les abreuvoirs et la santé du lot.",
    lowCritical: 'Eau nettement insuffisante : risque de déshydratation, agir sans attendre.',
    high: "Au-dessus de la norme : fuite d'abreuvoir ou forte chaleur.",
    highCritical: "Excès d'eau très marqué : vérifiez les fuites d'abreuvoirs.",
  };
  return (
    <Note tone={zone === 'ok' ? 'emerald' : zone === 'low' || zone === 'high' ? 'amber' : 'red'} icon={<Droplets />}>
      Eau bue / aliment donné : {num(ratio)} L par kg (norme 1,8 à 2,6). {messages[zone]}
    </Note>
  );
}

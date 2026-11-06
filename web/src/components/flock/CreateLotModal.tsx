import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Bird,
  Calendar,
  Check,
  Clock,
  Egg,
  Eye,
  Layers,
  Lightbulb,
  Plus,
  Scale,
  ShieldCheck,
  Syringe,
  TrendingUp,
  Warehouse,
  Wheat,
  Zap,
} from 'lucide-react';
import { api } from '../../api/client';
import type { BatchType } from '../../api/types';
import type { BreedStandard, Lot, SanitaryProtocol, SanitaryProtocolWithSteps } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { useFarmProfile } from '../../app/useFarmProfile';
import { EGG_IMAGES, SPECIES_IMAGES, lotImage } from '../../lib/animalImages';
import { classNames, dateFr, num } from '../../lib/format';
import { Button, ErrorNote, Field, FormColumns, inputCls, Modal } from '../form';
import { PhotoThumb } from '../ui';
import {
  bandOpening,
  feedAdviceFor,
  MAX_ARRIVAL_AGE_DAYS,
  MAX_ARRIVAL_WEIGHT_G,
  parseArrivalAgeDays,
  parseArrivalWeightG,
  splitStepsByAge,
  stepDate,
} from './band';
import { BREED_INFO } from './breedInfo';
import { BuildingFormModal } from './Buildings';
import {
  CARE_TYPE_LABEL,
  EGGS_PER_ALVEOL,
  IconField,
  Metric,
  Note,
  SPECIES_LABEL,
  addLocalDays,
  localYmd,
  useBreedStandards,
  useBreeds,
  useBuildings,
  useInvalidateFarm,
  videSanitaireHint,
} from './shared';

/** Recommended top density (birds per m2), like the mobile lot sheet. */
const DENSITY_MAX: Record<BatchType, number> = { CHAIR: 15, PONDEUSE: 8 };

// Pheasant is no longer offered for new lots; existing ones keep displaying it through SPECIES_LABEL.
const CREATABLE_SPECIES = Object.entries(SPECIES_LABEL).filter(([k]) => k !== 'FAISAN');

function defaultProtocol(list: SanitaryProtocol[] | undefined, species: string, type: BatchType) {
  return (
    list?.find((p) => p.species === species && p.type === type && p.isDefault) ??
    list?.find((p) => p.species === species && p.type === type) ??
    list?.find((p) => p.type === type && p.isDefault) ??
    list?.find((p) => p.type === type) ??
    null
  );
}

function weeksAfter(start: string, weeks: number): string {
  return addLocalDays(start, weeks * 7);
}

function digits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * POUFA L4: a band opened after a confirmed chick delivery (`openBandHint`),
 * pre-filled; the chicks' cost is already an expense, so no chick price.
 */
export interface LotPrefill {
  quantityAtStart: number;
  integrationDate: string;
  couvoirSupplier?: string;
  chickLotNumber?: string;
  /** Shown above the form. */
  note?: string;
}

export function CreateLotModal({
  onClose,
  onCreated,
  prefill,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
  prefill?: LotPrefill;
}) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const buildings = useBuildings();
  const breeds = useBreeds();
  // The care records are posted after the lot: a 403 there would leave a created lot and an error.
  const { hasPermission } = useFarmProfile();
  const canRecordCare = hasPermission('sanitaire:gerer', 'sanitaire:signaler');

  const [running, setRunning] = useState(false);
  const [type, setType] = useState<BatchType>('CHAIR');
  const [species, setSpecies] = useState('POULET');
  const [breedId, setBreedId] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [customBreed, setCustomBreed] = useState('');
  const [batchName, setBatchName] = useState('');
  const [quantity, setQuantity] = useState(prefill ? String(prefill.quantityAtStart) : '');
  /** The arrival (opening) day of the band: never back-dated to the hatch or the placement. */
  const [integrationDate, setIntegrationDate] = useState(prefill?.integrationDate.slice(0, 10) ?? localYmd());
  /** « Âge à l'arrivée (jours) », sent as `initialAgeDays` (empty = 0, day-old chicks). */
  const [arrivalAge, setArrivalAge] = useState('');
  /** « Poids moyen à l'arrivée (g) », sent as `initialAvgWeightG` (optional). */
  const [arrivalWeight, setArrivalWeight] = useState('');
  const [buildingId, setBuildingId] = useState('');
  const [supplier, setSupplier] = useState(prefill?.couvoirSupplier ?? '');
  const [chickLot, setChickLot] = useState(prefill?.chickLotNumber ?? '');
  const [hatchDate, setHatchDate] = useState('');
  const [chickPrice, setChickPrice] = useState('');
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const [addingBuilding, setAddingBuilding] = useState(false);

  const isAutre = species === 'AUTRE';
  // POUFA band opening (J+x): age, feed phase and care due count from the birds' J0.
  const arrivalAgeDays = parseArrivalAgeDays(arrivalAge);
  const arrivalWeightG = parseArrivalWeightG(arrivalWeight);
  const opening = bandOpening({ arrivalDay: integrationDate, arrivalAgeDays: arrivalAgeDays ?? 0, today: localYmd() });
  const ageDays = opening.ageToday;
  const qty = parseInt(quantity, 10) || 0;

  const filteredBreeds = (breeds.data ?? []).filter((b) => b.type === type && b.species === species);
  const breed = filteredBreeds.find((b) => b.id === breedId) ?? null;
  const standards = useBreedStandards(breed?.id);

  const protocols = useQuery({
    queryKey: ['protocols', farmId, species, type],
    queryFn: () =>
      api.get<SanitaryProtocol[]>(
        `/sanitary/protocols?farmId=${encodeURIComponent(farmId ?? '')}&species=${species}&type=${type}`,
      ),
    enabled: !!farmId && running,
  });
  const protocol = defaultProtocol(protocols.data, species, type);
  const program = useQuery({
    queryKey: ['protocol-detail', farmId, protocol?.id],
    queryFn: () =>
      api.get<SanitaryProtocolWithSteps>(
        `/sanitary/protocols/${protocol?.id}?farmId=${encodeURIComponent(farmId ?? '')}`,
      ),
    enabled: !!protocol && running,
  });
  const { due: dueSteps, upcoming: upcomingSteps } = splitStepsByAge(
    (program.data?.steps ?? []).filter((s) => s.active),
    ageDays,
  );

  const space = useMemo(() => {
    const map = new Map<string, { occupied: number; available: number | null }>();
    for (const b of buildings.data ?? []) {
      const occupied = b.stats?.activeBirds ?? 0;
      const byCapacity = b.capacity != null ? Math.max(0, b.capacity - occupied) : null;
      const byDensity =
        b.buildingAreaM2 != null && b.buildingAreaM2 > 0
          ? Math.max(0, Math.floor(b.buildingAreaM2 * DENSITY_MAX[type]) - occupied)
          : null;
      map.set(b.id, {
        occupied,
        available:
          byCapacity != null && byDensity != null ? Math.min(byCapacity, byDensity) : (byCapacity ?? byDensity),
      });
    }
    return map;
  }, [buildings.data, type]);

  const building = buildings.data?.find((b) => b.id === buildingId) ?? null;
  const buildingSpace = building ? space.get(building.id) : undefined;
  const buildingFull = buildingSpace?.available != null && buildingSpace.available <= 0;
  const hint = building
    ? videSanitaireHint({
        activeLots: building.stats?.activeLots ?? 0,
        lastLotEndedAt: building.stats?.lastLotEndedAt,
        placementDate: integrationDate,
      })
    : null;

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        batchName: batchName.trim(),
        integrationDate: opening.integrationDate,
        initialAgeDays: opening.initialAgeDays,
        quantityAtStart: qty,
        type,
        species,
        buildingId,
      };
      // A running lot opens with the birds present that day: the server requires both counts equal.
      if (running) body.quantityAlive = qty;
      if (arrivalWeightG != null) body.initialAvgWeightG = arrivalWeightG;
      if (isAutre) {
        body.customSpecies = customSpecies.trim();
        body.customBreed = customBreed.trim();
      } else {
        body.breedId = breedId;
      }
      if (supplier.trim()) body.couvoirSupplier = supplier.trim();
      if (chickLot.trim()) body.chickLotNumber = chickLot.trim();
      if (hatchDate) body.hatchDate = hatchDate;
      if (chickPrice.trim() && !prefill) body.chickUnitPriceFcfa = parseInt(chickPrice, 10);
      const lot = await api.post<Lot>(`/farms/${farmId}/batches`, body);
      const selected = running && canRecordCare ? dueSteps.filter((s) => doneSteps.includes(s.id)) : [];
      await Promise.all(
        selected.map((step) =>
          api.post(`/farms/${farmId}/batches/${lot.id}/treatments`, {
            careType: step.careType,
            productName: step.name,
            // POUFA lot A sante: a step of the vets' calendar, accepted outside the PRODUIT_TRAITEMENT list.
            protocolStepId: step.id,
            reason: 'Soin du calendrier sanitaire',
            dosage: step.dosage ?? undefined,
            route: step.route ?? undefined,
            // Step of day N = J0 + N (may precede the opening: care given before arrival).
            administeredAt: stepDate(opening, step.dayFrom),
            withdrawalDays: step.withdrawalDays || undefined,
            notes: `Renseigné lors de l'ajout du lot en cours (âge ${ageDays} j)`,
          }),
        ),
      );
      return lot;
    },
    onSuccess: async (lot) => {
      await invalidate();
      onCreated(lot.id);
    },
  });

  const canSubmit =
    batchName.trim().length > 0 &&
    qty > 0 &&
    (isAutre ? customSpecies.trim().length > 0 && customBreed.trim().length > 0 : !!breed) &&
    !!buildingId &&
    !buildingFull &&
    arrivalAgeDays != null &&
    arrivalWeightG !== null &&
    // A lot already on the farm: its age at opening must be typed (no silent J0).
    (!running || arrivalAge.trim().length > 0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) create.mutate();
  };

  const feedAdvice = feedAdviceFor(type, ageDays);

  return (
    <Modal title={running ? 'Ajouter un lot en cours' : 'Créer un lot'} onClose={onClose} large>
      <form onSubmit={submit} className="space-y-5">
        {prefill?.note ? <Note tone="brand">{prefill.note}</Note> : null}
        <FormColumns>
        <div className="min-w-0 space-y-5">
        <Toggle
          options={[
            { key: false, label: 'Nouveau lot', icon: <Plus /> },
            { key: true, label: 'Lot déjà en cours', icon: <Zap /> },
          ]}
          value={running}
          onChange={setRunning}
        />
        {running ? (
          <Note tone="brand">
            La bande s’ouvre à la date choisie (en général aujourd’hui), à l’âge des sujets ce jour-là (J+x). Les sujets
            présents ce jour-là sont son effectif de départ : la mortalité passée n’est pas reprise et aucune saisie ne
            peut précéder cette date.
          </Note>
        ) : null}

        <div>
          <p className="mb-1 text-xs font-medium text-slate-600">Espèce *</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-7" role="group" aria-label="Espèce">
            {CREATABLE_SPECIES.map(([k, v]) => (
              <button
                key={k}
                type="button"
                aria-pressed={species === k}
                onClick={() => {
                  if (k === species) return;
                  setSpecies(k);
                  setBreedId('');
                }}
                className={classNames(
                  'flex flex-col overflow-hidden rounded-xl bg-white text-center transition',
                  species === k ? 'ring-2 ring-brand-600' : 'ring-1 ring-slate-200 hover:ring-slate-300',
                )}
              >
                <img src={SPECIES_IMAGES[k]} alt="" loading="lazy" className="aspect-square w-full bg-white object-contain" />
                <span
                  className={classNames(
                    'flex flex-1 items-center justify-center px-1 py-1 text-[11px] font-medium leading-tight',
                    species === k ? 'bg-brand-600 text-white' : 'text-slate-700',
                  )}
                >
                  {v}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type *">
            <Toggle
              options={[
                { key: 'CHAIR' as BatchType, label: 'Chair', icon: <Bird /> },
                { key: 'PONDEUSE' as BatchType, label: 'Pondeuse', icon: <Egg /> },
              ]}
              value={type}
              onChange={(t) => {
                setType(t);
                setBreedId('');
              }}
            />
          </Field>
          {isAutre ? (
            <>
              <Field label="Espèce précise *">
                <input
                  className={inputCls}
                  value={customSpecies}
                  onChange={(e) => setCustomSpecies(e.target.value)}
                  placeholder="Ex : Canard, Autruche…"
                />
              </Field>
              <Field label="Souche / race *">
                <input
                  className={inputCls}
                  value={customBreed}
                  onChange={(e) => setCustomBreed(e.target.value)}
                  placeholder="Ex : Coureur indien, Rouge…"
                />
              </Field>
            </>
          ) : (
            <Field label="Souche *">
              <div className="flex items-center gap-2">
                <PhotoThumb src={lotImage(breed?.name, species)} />
                <select className={`${inputCls} min-w-0`} value={breedId} onChange={(e) => setBreedId(e.target.value)} required>
                  <option value="">Sélectionner une souche…</option>
                  {filteredBreeds.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                      {b.refCode ? ` (${b.refCode})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {!breeds.isLoading && filteredBreeds.length === 0 ? (
                <span className="mt-1 block text-xs text-amber-700">
                  Aucune souche pour cette espèce et ce type.
                </span>
              ) : null}
              {breed && BREED_INFO[breed.name] ? (
                <span className="mt-1 block text-xs text-slate-500">
                  {BREED_INFO[breed.name].origin} · {BREED_INFO[breed.name].cycle} · {BREED_INFO[breed.name].trait}
                </span>
              ) : null}
            </Field>
          )}
          <Field label="Nom du lot *">
            <input
              className={inputCls}
              value={batchName}
              onChange={(e) => setBatchName(e.target.value)}
              placeholder="Ex : Lot B-049"
              required
            />
          </Field>
          <IconField
            label={running ? 'Effectif vivant à l’ouverture *' : 'Quantité de sujets *'}
            icon={<Bird />}
            hint={running ? 'Les pertes d’avant l’ouverture ne sont pas comptées.' : undefined}
          >
            <input
              className={inputCls}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(digits(e.target.value))}
              placeholder={running ? 'Ex : 2850' : 'Ex : 3000'}
              required
            />
          </IconField>
          <IconField
            label={running ? 'Date d’ouverture de la bande *' : 'Date d’arrivée des sujets *'}
            icon={<Calendar />}
            hint={
              running
                ? `En général aujourd’hui : les saisies commencent à cette date.${ageDays > 0 ? ` J${ageDays} aujourd’hui.` : ''}`
                : `La bande s’ouvre ce jour-là.${ageDays > 0 ? ` J${ageDays} aujourd’hui.` : ''}`
            }
          >
            <input
              className={inputCls}
              type="date"
              value={integrationDate}
              onChange={(e) => setIntegrationDate(e.target.value || localYmd())}
              required
            />
          </IconField>
          <IconField
            label={running ? 'Âge des sujets à l’ouverture (jours) *' : 'Âge à l’arrivée (jours)'}
            icon={<Clock />}
            hint={
              arrivalAgeDays == null
                ? undefined
                : running
                  ? `La bande s’ouvre à J${opening.initialAgeDays}.`
                  : `0 = poussins d’un jour. Des sujets démarrés arrivent à J+x${opening.initialAgeDays > 0 ? ` (ici J${opening.initialAgeDays})` : ''}.`
            }
          >
            <input
              className={inputCls}
              inputMode="numeric"
              value={arrivalAge}
              onChange={(e) => setArrivalAge(digits(e.target.value))}
              placeholder={running ? 'Ex : 21' : '0'}
              required={running}
              aria-invalid={arrivalAgeDays == null}
            />
            {arrivalAgeDays == null ? (
              <span className="mt-1 block text-xs text-red-600">Âge entre 0 et {MAX_ARRIVAL_AGE_DAYS} jours.</span>
            ) : null}
          </IconField>
          <IconField
            label={running ? 'Poids moyen à l’ouverture (g)' : 'Poids moyen à l’arrivée (g)'}
            icon={<Scale />}
            hint="Facultatif : un échantillon pesé à la mise en place sert de point de départ au GMQ."
          >
            <input
              className={inputCls}
              inputMode="decimal"
              value={arrivalWeight}
              onChange={(e) => setArrivalWeight(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder={running ? 'Ex : 650' : 'Ex : 42'}
              aria-invalid={arrivalWeightG === null}
            />
            {arrivalWeightG === null ? (
              <span className="mt-1 block text-xs text-red-600">Poids entre 1 et {MAX_ARRIVAL_WEIGHT_G.toLocaleString('fr-FR')} g.</span>
            ) : null}
          </IconField>
          <IconField label="Bâtiment *" icon={<Warehouse />}>
            {buildings.data?.length ? (
              <select className={inputCls} value={buildingId} onChange={(e) => setBuildingId(e.target.value)} required>
                <option value="">Sélectionner un bâtiment…</option>
                {buildings.data.map((b) => {
                  const s = space.get(b.id);
                  const full = s?.available != null && s.available <= 0;
                  return (
                    <option key={b.id} value={b.id} disabled={full}>
                      {b.name}
                      {s?.available != null ? ` · ${num(s.available)} places conseillées` : ''}
                      {full ? ' · complet' : ''}
                    </option>
                  );
                })}
              </select>
            ) : (
              <Note tone="amber">Créez d'abord un bâtiment pour installer ce lot.</Note>
            )}
            <button
              type="button"
              onClick={() => setAddingBuilding(true)}
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline"
            >
              <Plus className="h-3 w-3" /> Nouveau bâtiment
            </button>
          </IconField>
        </div>

        {building ? (
          <div className="space-y-2">
            <p className="flex flex-wrap items-center gap-1 text-xs text-slate-500">
              <Warehouse className="h-3.5 w-3.5 text-brand-600" />
              {building.buildingAreaM2 != null ? `${num(building.buildingAreaM2)} m² · ` : ''}
              {buildingSpace?.available != null
                ? `${num(buildingSpace.available)} places restantes (conseillé) · `
                : ''}
              {num(buildingSpace?.occupied ?? 0)} oiseaux présents
            </p>
            {qty > 0 && buildingSpace?.available != null && qty > buildingSpace.available ? (
              <Note tone="amber">
                {num(qty)} oiseaux dépassent les {num(buildingSpace.available)} places conseillées : densité élevée.
              </Note>
            ) : null}
            {hint ? <Note tone={hint.tone}>{hint.text}</Note> : null}
          </div>
        ) : null}

        </div>

        <div className="min-w-0 space-y-5">
        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-brand-600" /> Traçabilité et coût (facultatif)
          </legend>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            <Field label="Fournisseur (couvoir)">
              <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </Field>
            <Field label="N° de lot des poussins">
              <input className={inputCls} value={chickLot} onChange={(e) => setChickLot(e.target.value)} />
            </Field>
            <IconField label="Date d'éclosion" icon={<Calendar />}>
              <input className={inputCls} type="date" value={hatchDate} onChange={(e) => setHatchDate(e.target.value)} />
            </IconField>
            {prefill ? (
              <p className="text-xs text-slate-500">Poussins reçus d’une livraison du programme : leur coût est déjà passé en dépense, pas de prix à saisir.</p>
            ) : (
              <Field label="Prix d'achat unitaire (FCFA)" hint="Crée automatiquement la dépense d'achat des poussins.">
                <input
                  className={inputCls}
                  inputMode="numeric"
                  value={chickPrice}
                  onChange={(e) => setChickPrice(digits(e.target.value))}
                  placeholder="Ex : 750"
                />
              </Field>
            )}
          </div>
        </fieldset>

        {running ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-700">
              <Eye className="h-4 w-4 text-brand-600" /> Recommandations à {ageDays} j
            </h3>
            <p className="flex items-center gap-1.5 text-sm text-slate-600">
              <Wheat className="h-4 w-4 shrink-0 text-amber-600" /> Alimentation recommandée : {feedAdvice.label}
            </p>
            {dueSteps.length > 0 && canRecordCare ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" /> Soins prophylactiques déjà réalisés (cochez-les : ils sont datés du J0 des sujets + le jour du protocole)
                </p>
                <div className="space-y-1">
                  {dueSteps.map((s) => (
                    <label key={s.id} className="flex items-start gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={doneSteps.includes(s.id)}
                        onChange={() =>
                          setDoneSteps((cur) => (cur.includes(s.id) ? cur.filter((x) => x !== s.id) : [...cur, s.id]))
                        }
                      />
                      <span>
                        J{s.dayFrom} : {s.name} ({CARE_TYPE_LABEL[s.careType]})
                        {s.dosage ? ` · ${s.dosage}` : ''}
                      </span>
                    </label>
                  ))}
                </div>
                {dueSteps.length > doneSteps.length ? (
                  <p className="mt-1 text-xs text-amber-700">
                    {dueSteps.length - doneSteps.length} soin(s) prévu(s) à cet âge ne seront pas marqués comme faits.
                  </p>
                ) : null}
              </div>
            ) : null}
            {upcomingSteps.length > 0 ? (
              <div>
                <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <Syringe className="h-3.5 w-3.5 shrink-0 text-brand-600" /> Prochains soins à planifier
                </p>
                <ul className="space-y-0.5 text-sm text-slate-600">
                  {upcomingSteps.slice(0, 3).map((s) => (
                    <li key={s.id}>
                      Jour {s.dayFrom} : {s.name} ({CARE_TYPE_LABEL[s.careType]})
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        {standards.data?.length ? (
          // The breed curves count from the birds' J0, not from the opening.
          <LotForecast type={type} standards={standards.data} qty={qty} start={opening.ageZeroDay} />
        ) : null}

        </div>
        </FormColumns>

        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!canSubmit}>
            <Check className="h-4 w-4" /> {running ? 'Ajouter le lot' : 'Créer le lot'}
          </Button>
        </div>
      </form>
      {addingBuilding ? (
        <BuildingFormModal
          onClose={() => setAddingBuilding(false)}
          onCreated={(id) => {
            setBuildingId(id);
            setAddingBuilding(false);
          }}
        />
      ) : null}
    </Modal>
  );
}

function Toggle<K extends string | boolean>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: K; label: string; icon?: React.ReactNode }>;
  value: K;
  onChange: (k: K) => void;
}) {
  return (
    <div className="inline-flex gap-1 rounded-lg bg-slate-100 p-1">
      {options.map((o) => (
        <button
          key={String(o.key)}
          type="button"
          onClick={() => onChange(o.key)}
          className={classNames(
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium [&>svg]:h-4 [&>svg]:w-4',
            value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "Analyse et conseils" panel: what the breed curve projects for this lot. */
function LotForecast({
  type,
  standards,
  qty,
  start,
}: {
  type: BatchType;
  standards: BreedStandard[];
  qty: number;
  start: string;
}) {
  const last = standards[standards.length - 1];
  if (type === 'CHAIR') {
    const finalWeight = last?.targetAvgWeightKg ?? 0;
    const threshold = finalWeight >= 2 ? 2 : 0.9 * finalWeight;
    const readyWeek = standards.find((s) => (s.targetAvgWeightKg ?? 0) >= threshold)?.week ?? last?.week ?? 6;
    const totalKg = qty * finalWeight;
    return (
      <div className="rounded-xl border border-slate-200 p-4">
        <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <TrendingUp className="h-4 w-4 text-brand-600" /> Analyse et conseils
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Cycle" icon={<Clock />} value={`${last?.week ?? 12} semaines`} />
          <Metric label="Prêt à la vente" icon={<Calendar />} value={dateFr(weeksAfter(start, readyWeek))} />
          <Metric label="Poids final" icon={<TrendingUp />} value={`${finalWeight.toFixed(1)} kg`} />
          <Metric label="IC final" icon={<Scale />} value={(last?.targetFcr ?? 0).toFixed(2)} />
          {qty > 0 ? (
            <>
              <Metric label="Résultat estimé" icon={<TrendingUp />} value={`${num(totalKg, 0)} kg`} />
              <Metric label="Surface conseillée" icon={<Layers />} value={`${num(qty / 10, 0)} m²`} />
              <Metric label="Revenu estimé" icon={<TrendingUp />} value={`≈ ${num(totalKg * 2500, 0)} FCFA`} sub="à 2 500 FCFA/kg" />
              <Metric label="Vente à la pièce" icon={<TrendingUp />} value={`≈ ${num(qty * 5000, 0)} FCFA`} sub="à 5 000 FCFA/tête" />
            </>
          ) : null}
        </div>
        <LotTimeline
          start={start}
          steps={[
            { week: 0, label: 'Poussins', desc: 'Démarrage, chaleur, eau et vitamines' },
            { week: readyWeek, label: 'Prêt à vendre', desc: `${finalWeight.toFixed(1)} kg, IC ${(last?.targetFcr ?? 0).toFixed(2)}` },
            { week: last?.week ?? 12, label: 'Fin de cycle', desc: 'Abattage ou vente vivante' },
          ]}
        />
      </div>
    );
  }
  const peak = standards.reduce((best, s) =>
    (s.targetLayRatePercent ?? 0) > (best.targetLayRatePercent ?? 0) ? s : best,
  );
  const startLaying = standards.find((s) => (s.targetLayRatePercent ?? 0) >= 10);
  const peakRate = peak.targetLayRatePercent ?? 85;
  const dailyEggs = Math.round((qty * peakRate) / 100);
  const monthlyEggs = dailyEggs * 30;
  // Weeks before the peak also sit under 60 %: only a drop after the peak ends the laying cycle.
  const endWeek = standards.find((s) => s.week > peak.week && (s.targetLayRatePercent ?? 0) < 60)?.week ?? last?.week ?? 72;
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-slate-700">
          <TrendingUp className="h-4 w-4 text-brand-600" /> Analyse et conseils
        </h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Cycle total" icon={<Clock />} value={`${last?.week ?? 72} semaines`} />
        <Metric label="Début de ponte" icon={<Calendar />} value={dateFr(weeksAfter(start, startLaying?.week ?? 18))} />
        <Metric label="Pic de production" icon={<TrendingUp />} value={`${peakRate.toFixed(0)} %`} />
        <Metric label="Pic atteint" icon={<Calendar />} value={dateFr(weeksAfter(start, peak.week))} />
        {qty > 0 ? (
          <>
            <Metric label="Œufs/jour (pic)" image={EGG_IMAGES.oeuf} value={num(dailyEggs, 0)} />
            <Metric label="Œufs/mois (pic)" image={EGG_IMAGES.oeuf} value={num(monthlyEggs, 0)} />
            <Metric label="Alvéoles/mois (pic)" image={EGG_IMAGES.alveole} value={`≈ ${num(monthlyEggs / EGGS_PER_ALVEOL, 0)}`} />
            <Metric label="Revenu ponte/mois" icon={<TrendingUp />} value={`≈ ${num(monthlyEggs * 100, 0)} FCFA`} sub="à 100 FCFA/œuf" />
          </>
        ) : null}
      </div>
      <LotTimeline
        start={start}
        steps={[
          { week: 0, label: 'Poussins', desc: 'Démarrage, croissance' },
          { week: startLaying?.week ?? 18, label: 'Début de ponte', desc: 'Premiers œufs, montée en cadence' },
          { week: peak.week, label: 'Pic de production', desc: `${peakRate.toFixed(0)} % de ponte` },
          { week: endWeek, label: 'Fin de ponte', desc: 'Transition vers la vente vivante ou l’abattage' },
        ]}
      />
      <div className="mt-3">
        <Note tone="brand" icon={<Lightbulb />}>
          <p className="font-semibold">Conseil de fin de cycle</p>
          <p>Après {endWeek} semaines, les pondeuses peuvent être vendues vivantes, abattues pour la viande, ou gardées pour la reproduction si la souche s’y prête.</p>
        </Note>
      </div>
    </div>
  );
}

/** Key dates of the lot, computed from the breed curve: indicative, not a promise. */
function LotTimeline({
  start,
  steps,
}: {
  start: string;
  steps: Array<{ week: number; label: string; desc: string }>;
}) {
  return (
    <div className="mt-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">Chronologie du lot</p>
      <ol className="space-y-2 border-l-2 border-slate-200 pl-3">
        {steps.map((step, i) => (
          <li key={step.label} className="relative text-sm">
            <span
              aria-hidden="true"
              className={classNames(
                'absolute -left-[1.0625rem] top-1.5 h-2 w-2 rounded-full',
                i === 0 ? 'bg-brand-600' : i === steps.length - 1 ? 'bg-slate-400' : 'bg-accent-500',
              )}
            />
            <span className="font-semibold text-slate-800">
              {dateFr(weeksAfter(start, step.week))} : {step.label}
            </span>
            <span className="block text-xs text-slate-500">{step.desc}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        Projections calculées à partir des standards de la souche, à titre indicatif : ce n’est pas une garantie des résultats réels.
      </p>
    </div>
  );
}

import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../api/client';
import type { BatchType } from '../../api/types';
import type { BreedStandard, Lot, SanitaryProtocol, SanitaryProtocolWithSteps } from '../../api/types-flock';
import { useFarm } from '../../app/FarmContext';
import { classNames, dateFr, num } from '../../lib/format';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { BREED_INFO } from './breedInfo';
import { BuildingFormModal } from './Buildings';
import {
  CARE_TYPE_LABEL,
  EGGS_PER_ALVEOL,
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

const FEED_ADVICE: Record<BatchType, Array<{ label: string; from: number; to: number }>> = {
  CHAIR: [
    { label: 'Poussin (0 à 10 j)', from: 0, to: 10 },
    { label: 'Démarrage (11 à 24 j)', from: 11, to: 24 },
    { label: 'Croissance (25 à 35 j)', from: 25, to: 35 },
    { label: 'Finition (36 j et plus)', from: 36, to: 99999 },
  ],
  PONDEUSE: [
    { label: 'Poussin (0 à 10 j)', from: 0, to: 10 },
    { label: 'Démarrage (11 à 24 j)', from: 11, to: 24 },
    { label: 'Croissance (25 à 112 j)', from: 25, to: 112 },
    { label: 'Pré-ponte (113 à 126 j)', from: 113, to: 126 },
    { label: 'Ponte 1 (127 j et plus)', from: 127, to: 99999 },
  ],
};

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

export function CreateLotModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const buildings = useBuildings();
  const breeds = useBreeds();

  const [running, setRunning] = useState(false);
  const [type, setType] = useState<BatchType>('CHAIR');
  const [species, setSpecies] = useState('POULET');
  const [breedId, setBreedId] = useState('');
  const [customSpecies, setCustomSpecies] = useState('');
  const [customBreed, setCustomBreed] = useState('');
  const [batchName, setBatchName] = useState('');
  const [quantity, setQuantity] = useState('');
  const [integrationDate, setIntegrationDate] = useState(localYmd());
  const [buildingId, setBuildingId] = useState('');
  const [supplier, setSupplier] = useState('');
  const [chickLot, setChickLot] = useState('');
  const [hatchDate, setHatchDate] = useState('');
  const [chickPrice, setChickPrice] = useState('');
  const [doneSteps, setDoneSteps] = useState<string[]>([]);
  const [addingBuilding, setAddingBuilding] = useState(false);

  const isAutre = species === 'AUTRE';
  const ageDays = Math.max(
    0,
    Math.floor((Date.parse(`${localYmd()}T00:00:00Z`) - Date.parse(`${integrationDate}T00:00:00Z`)) / 86_400_000),
  );
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
  const steps = (program.data?.steps ?? []).filter((s) => s.active).sort((a, b) => a.dayFrom - b.dayFrom);
  const dueSteps = steps.filter((s) => s.dayFrom <= ageDays);
  const upcomingSteps = steps.filter((s) => s.dayFrom > ageDays);

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
        integrationDate,
        quantityAtStart: qty,
        type,
        species,
        buildingId,
      };
      // The server keeps a running lot's start count equal to its live count.
      if (running) body.quantityAlive = qty;
      if (isAutre) {
        body.customSpecies = customSpecies.trim();
        body.customBreed = customBreed.trim();
      } else {
        body.breedId = breedId;
      }
      if (supplier.trim()) body.couvoirSupplier = supplier.trim();
      if (chickLot.trim()) body.chickLotNumber = chickLot.trim();
      if (hatchDate) body.hatchDate = hatchDate;
      if (chickPrice.trim()) body.chickUnitPriceFcfa = parseInt(chickPrice, 10);
      const lot = await api.post<Lot>(`/farms/${farmId}/batches`, body);
      const selected = running ? dueSteps.filter((s) => doneSteps.includes(s.id)) : [];
      await Promise.all(
        selected.map((step) =>
          api.post(`/farms/${farmId}/batches/${lot.id}/treatments`, {
            careType: step.careType,
            productName: step.name,
            dosage: step.dosage ?? undefined,
            route: step.route ?? undefined,
            administeredAt: addLocalDays(integrationDate, step.dayFrom),
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
    !buildingFull;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (canSubmit) create.mutate();
  };

  const feedAdvice = FEED_ADVICE[type].find((p) => ageDays >= p.from && ageDays <= p.to) ?? FEED_ADVICE[type][0];

  return (
    <Modal title={running ? 'Ajouter un lot en cours' : 'Créer un lot'} onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-5">
        <Toggle
          options={[
            { key: false, label: 'Nouveau lot' },
            { key: true, label: 'Lot déjà en cours' },
          ]}
          value={running}
          onChange={setRunning}
        />
        {running ? (
          <Note tone="brand">
            Pour un lot déjà en cours, l'effectif vivant actuel devient l'effectif de départ du suivi. La mortalité
            passée n'est pas reprise.
          </Note>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Espèce *">
            <select
              className={inputCls}
              value={species}
              onChange={(e) => {
                setSpecies(e.target.value);
                setBreedId('');
              }}
            >
              {Object.entries(SPECIES_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Type *">
            <Toggle
              options={[
                { key: 'CHAIR' as BatchType, label: 'Chair' },
                { key: 'PONDEUSE' as BatchType, label: 'Pondeuse' },
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
            <Field label="Souche *" className="sm:col-span-2">
              <select className={inputCls} value={breedId} onChange={(e) => setBreedId(e.target.value)} required>
                <option value="">Sélectionner une souche…</option>
                {filteredBreeds.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.refCode ? ` (${b.refCode})` : ''}
                  </option>
                ))}
              </select>
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
          <Field label={running ? 'Effectif vivant actuel *' : 'Quantité de poussins *'}>
            <input
              className={inputCls}
              inputMode="numeric"
              value={quantity}
              onChange={(e) => setQuantity(digits(e.target.value))}
              placeholder="Ex : 3000"
              required
            />
          </Field>
          <Field
            label={running ? 'Date de mise en place du lot *' : "Date d'arrivée des poussins *"}
            hint={running ? `Âge du lot : ${ageDays} j` : undefined}
          >
            <input
              className={inputCls}
              type="date"
              value={integrationDate}
              onChange={(e) => setIntegrationDate(e.target.value)}
              required
            />
          </Field>
          <Field label="Bâtiment *">
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
          </Field>
        </div>

        {building ? (
          <div className="space-y-2">
            <p className="text-xs text-slate-500">
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

        <fieldset className="rounded-xl border border-slate-200 p-4">
          <legend className="px-1 text-xs font-semibold text-slate-600">Traçabilité et coût (facultatif)</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Fournisseur (couvoir)">
              <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </Field>
            <Field label="N° de lot des poussins">
              <input className={inputCls} value={chickLot} onChange={(e) => setChickLot(e.target.value)} />
            </Field>
            <Field label="Date d'éclosion">
              <input className={inputCls} type="date" value={hatchDate} onChange={(e) => setHatchDate(e.target.value)} />
            </Field>
            <Field label="Prix d'achat unitaire (FCFA)" hint="Crée automatiquement la dépense d'achat des poussins.">
              <input
                className={inputCls}
                inputMode="numeric"
                value={chickPrice}
                onChange={(e) => setChickPrice(digits(e.target.value))}
                placeholder="Ex : 750"
              />
            </Field>
          </div>
        </fieldset>

        {running ? (
          <div className="space-y-3 rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold text-slate-700">Recommandations à {ageDays} j</h3>
            <p className="text-sm text-slate-600">Alimentation recommandée : {feedAdvice.label}</p>
            {dueSteps.length > 0 ? (
              <div>
                <p className="mb-1 text-xs font-semibold text-slate-600">
                  Soins prophylactiques déjà réalisés (cochez-les pour les enregistrer)
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
                <p className="mb-1 text-xs font-semibold text-slate-600">Prochains soins à planifier</p>
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
          <LotForecast type={type} standards={standards.data} qty={qty} start={integrationDate} />
        ) : null}

        <ErrorNote error={create.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button type="submit" busy={create.isPending} disabled={!canSubmit}>
            {running ? 'Ajouter le lot' : 'Créer le lot'}
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
  options: Array<{ key: K; label: string }>;
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
            'rounded-md px-3 py-1.5 text-sm font-medium',
            value === o.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
          )}
        >
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
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Analyse et conseils</h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Metric label="Cycle" value={`${last?.week ?? 12} semaines`} />
          <Metric label="Prêt à la vente" value={dateFr(weeksAfter(start, readyWeek))} />
          <Metric label="Poids final" value={`${finalWeight.toFixed(1)} kg`} />
          <Metric label="IC final" value={(last?.targetFcr ?? 0).toFixed(2)} />
          {qty > 0 ? (
            <>
              <Metric label="Résultat estimé" value={`${num(totalKg, 0)} kg`} />
              <Metric label="Surface conseillée" value={`${num(qty / 10, 0)} m²`} />
              <Metric label="Revenu estimé" value={`≈ ${num(totalKg * 2500, 0)} FCFA`} sub="à 2 500 FCFA/kg" />
              <Metric label="Vente à la pièce" value={`≈ ${num(qty * 5000, 0)} FCFA`} sub="à 5 000 FCFA/tête" />
            </>
          ) : null}
        </div>
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
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-700">Analyse et conseils</h3>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Cycle total" value={`${last?.week ?? 72} semaines`} />
        <Metric label="Début de ponte" value={dateFr(weeksAfter(start, startLaying?.week ?? 18))} />
        <Metric label="Pic de production" value={`${peakRate.toFixed(0)} %`} />
        <Metric label="Pic atteint" value={dateFr(weeksAfter(start, peak.week))} />
        {qty > 0 ? (
          <>
            <Metric label="Œufs/jour (pic)" value={num(dailyEggs, 0)} />
            <Metric label="Œufs/mois (pic)" value={num(monthlyEggs, 0)} />
            <Metric label="Alvéoles/mois (pic)" value={`≈ ${num(monthlyEggs / EGGS_PER_ALVEOL, 0)}`} />
            <Metric label="Revenu ponte/mois" value={`≈ ${num(monthlyEggs * 100, 0)} FCFA`} sub="à 100 FCFA/œuf" />
          </>
        ) : null}
      </div>
    </div>
  );
}

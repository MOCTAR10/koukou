import { useMemo } from 'react';
import type { PosBatch } from '../../api/types-sales';
import { SPECIES_IMAGES, lotImage } from '../../lib/animalImages';
import { classNames, num, plural } from '../../lib/format';
import { ErrorNote, Modal } from '../form';
import { Loading, PhotoThumb } from '../ui';
import { SPECIES_LABEL } from './shared';

/** The server sends these fields although PosBatch does not declare them. */
type CheptelBatch = PosBatch & {
  breedName?: string | null;
  breedCode?: string | null;
  customSpecies?: string | null;
};

interface BreedGroup {
  key: string;
  label: string;
  code: string | null;
  speciesCaption: string;
  image: string | null;
  alive: number;
  started: number;
  losses: number;
}

function speciesLabel(species: string): string {
  return SPECIES_LABEL[species] ?? species;
}

/** Same grouping as mobile: one row per breed, or per species when no breed is known. */
function groupByBreed(batches: CheptelBatch[]): BreedGroup[] {
  const byKey = new Map<string, BreedGroup>();
  for (const b of batches) {
    const species = b.species ?? 'AUTRE';
    const breed = b.breedName?.trim();
    const label = breed || (species === 'AUTRE' ? (b.customSpecies ?? speciesLabel(species)) : speciesLabel(species));
    const key = `${species}|${label}`;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label,
        code: b.breedCode ?? null,
        speciesCaption: speciesLabel(species),
        image: lotImage(breed, species),
        alive: 0,
        started: 0,
        losses: 0,
      };
      byKey.set(key, group);
    }
    group.started += b.quantityAtStart;
    group.alive += b.metrics.liveCount;
  }
  const groups = [...byKey.values()].filter((g) => g.started > 0 || g.alive > 0);
  for (const g of groups) g.losses = Math.max(0, g.started - g.alive);
  return groups.sort((a, b) => b.alive - a.alive);
}

/** Photo of the species with the most live birds among these lots, poultry by default. */
export function mainSpeciesImage(batches: PosBatch[]): string | undefined {
  const live = new Map<string, number>();
  for (const b of batches) {
    const species = b.species ?? 'AUTRE';
    live.set(species, (live.get(species) ?? 0) + b.metrics.liveCount);
  }
  const top = [...live.entries()].sort((a, b) => b[1] - a[1])[0];
  return (top && top[1] > 0 ? SPECIES_IMAGES[top[0]] : undefined) ?? SPECIES_IMAGES.POULET;
}

function Stat({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <div className="min-w-0 flex-1 text-center">
      <p className={classNames('text-sm font-bold tabular-nums', tone)}>{num(value)}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

/** Live flock of the active lots, by breed. `batches` is undefined until they are loaded. */
export function CheptelModal({
  batches,
  error,
  onClose,
}: {
  batches: PosBatch[] | undefined;
  error: unknown;
  onClose: () => void;
}) {
  const groups = useMemo(() => (batches ? groupByBreed(batches) : []), [batches]);
  const totalAlive = groups.reduce((s, g) => s + g.alive, 0);

  return (
    <Modal title="Cheptel vivant" onClose={onClose}>
      {!batches ? (
        error ? <ErrorNote error={error} /> : <Loading />
      ) : groups.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-500">Aucun oiseau dans le cheptel pour l’instant.</p>
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-500">
            {plural(groups.length, 'souche')} · {plural(totalAlive, 'oiseau', 'oiseaux')}
          </p>
          <ul className="space-y-2.5">
            {groups.map((g) => (
              <li key={g.key} className="flex items-center gap-3 rounded-xl bg-slate-50 p-2.5">
                <PhotoThumb src={g.image} size="lg" className="!h-16 !w-16" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-900">{g.label}</p>
                  <p className="truncate text-xs text-slate-500">
                    {g.speciesCaption}
                    {g.code ? ` · ${g.code}` : ''}
                  </p>
                  <div className="mt-1.5 flex items-center divide-x divide-slate-200">
                    <Stat value={g.alive} label="Vivants" tone="text-emerald-600" />
                    <Stat value={g.started} label="Démarrage" tone="text-brand-700" />
                    <Stat value={g.losses} label="Pertes" tone={g.losses > 0 ? 'text-red-600' : 'text-slate-500'} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Modal>
  );
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Check, Wheat } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { api } from '../../api/client';
import type { FeedStockSummary } from '../../api/types';
import type { CarcassPool, PointOfSale, SellableBatch, StockTransferBody, StockTransferProductType } from '../../api/types-orders';
import { useFarm } from '../../app/FarmContext';
import { lotImage } from '../../lib/animalImages';
import { classNames, num, pct } from '../../lib/format';
import { QUEUED_MESSAGE, sendOrQueue } from '../../offline';
import { Button, ErrorNote, Field, Modal, inputCls } from '../form';
import { IconTile, Loading, PhotoThumb } from '../ui';
import { invalidateTransferQueries, newIdempotencyKey, parseWhole } from './helpers';
import { Segmented } from './shared';

type Tab = 'VIVANT' | StockTransferProductType;

const TABS: { key: Tab; label: string }[] = [
  { key: 'VIVANT', label: 'Vivant' },
  { key: 'ABATTU', label: 'Abattu' },
  { key: 'OEUFS', label: 'Œufs' },
  { key: 'PROVENDE', label: 'Provende' },
];

const PRODUCT_NOUN: Record<StockTransferProductType, string> = { ABATTU: 'Abattu', OEUFS: 'Œufs', PROVENDE: 'Provende' };

function typeLabel(type: string): string {
  return type === 'CHAIR' ? 'Chair' : 'Pondeuse';
}

function SourceOption({
  thumb,
  title,
  subtitle,
  stats,
  selected,
  onSelect,
}: {
  thumb: ReactNode;
  title: string;
  subtitle: string;
  stats: string;
  selected?: boolean;
  onSelect?: () => void;
}) {
  const body = (
    <span className="flex items-start gap-2.5">
      {thumb}
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        {subtitle ? <span className="block text-xs text-slate-500">{subtitle}</span> : null}
        <span className="mt-0.5 block text-xs font-medium text-slate-700">{stats}</span>
      </span>
    </span>
  );
  if (!onSelect) return <li className="rounded-lg border border-slate-200 px-3 py-2">{body}</li>;
  return (
    <li>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={classNames(
          'w-full rounded-lg border px-3 py-2 text-left transition',
          selected ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:bg-slate-50',
        )}
      >
        {body}
      </button>
    </li>
  );
}

function eggLabel(eggs: number): string {
  const alveoles = Math.floor(eggs / 30);
  const rest = eggs % 30;
  if (alveoles === 0) return 'moins d’une alvéole';
  return `${num(alveoles, 0)} alvéole(s)${rest ? ` + ${num(rest, 0)} œufs` : ''}`;
}

/** Moves stock from the farm to a shop, where it becomes a sellable reserve. */
export function TransferModal({ boutiques, onClose }: { boutiques: PointOfSale[]; onClose: () => void }) {
  const { farmId, farm } = useFarm();
  const queryClient = useQueryClient();
  const sacKg = farm?.defaultSacKg ?? 50;

  const [tab, setTab] = useState<Tab>('VIVANT');
  const [sourceId, setSourceId] = useState('');
  const [unit, setUnit] = useState<'SAC' | 'KG'>('SAC');
  const [boutiqueId, setBoutiqueId] = useState(boutiques.length === 1 ? boutiques[0].id : '');
  const [quantity, setQuantity] = useState(0);
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey('transfer'));

  const batchesQuery = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<SellableBatch[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });
  const slaughterQuery = useQuery({
    queryKey: ['slaughter-orders', farmId],
    queryFn: () => api.get<CarcassPool[]>(`/farms/${farmId}/slaughter-orders`),
    enabled: !!farmId,
  });
  const feedQuery = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled: !!farmId,
  });

  const liveLots = (batchesQuery.data ?? []).filter((b) => b.quantityAlive > 0);
  const pools = (slaughterQuery.data ?? []).filter(
    (p) => p.status === 'PROCESSED' && p.slaughterType === 'ABATTU' && (p.carcassesAvailable ?? 0) > 0,
  );
  // Any lot carrying eggs qualifies; those with the most eggs come first.
  const eggScore = (b: SellableBatch) => (b.metrics.eggStockAvailableEggs ?? 0) + (b.metrics.eggsCollectedTotal ?? 0);
  const eggLots = liveLots
    .filter((b) => b.type === 'PONDEUSE' || eggScore(b) > 0)
    .sort((a, b) => eggScore(b) - eggScore(a));
  const feedLots = (feedQuery.data?.lots ?? []).filter((l) => l.availableKg > 0 && l.entryType !== 'MEDICAMENT');

  const pool = pools.find((p) => p.id === sourceId);
  const eggLot = eggLots.find((b) => b.id === sourceId);
  const feedLot = feedLots.find((l) => l.id === sourceId);
  const feedKg = feedLot ? Math.floor(feedLot.availableKg) : 0;
  const feedSacs = feedLot ? Math.floor(feedLot.availableKg / sacKg) : 0;

  const maxQuantity =
    tab === 'ABATTU'
      ? (pool?.carcassesAvailable ?? 0)
      : tab === 'OEUFS'
        ? Math.max(eggLot?.metrics.eggStockAvailableAlveoles ?? 0, 0)
        : tab === 'PROVENDE'
          ? unit === 'SAC'
            ? feedSacs
            : feedKg
          : 0;
  const suffix = tab === 'ABATTU' ? 'carcasses' : tab === 'OEUFS' ? 'alvéoles' : unit === 'SAC' ? 'sacs' : 'kg';

  const selectTab = (next: Tab) => {
    setTab(next);
    setSourceId('');
    setQuantity(0);
    setLocalError(null);
    setDone(null);
  };

  const create = useMutation({
    mutationFn: () => {
      const product = tab as StockTransferProductType;
      const body: StockTransferBody = {
        productType: product,
        pointOfSaleId: boutiqueId,
        quantity,
        idempotencyKey,
        ...(product === 'ABATTU' ? { slaughterOrderId: sourceId } : {}),
        ...(product === 'OEUFS' ? { batchId: sourceId } : {}),
        ...(product === 'PROVENDE' ? { inputLotId: sourceId, unit } : {}),
      };
      const destination = boutiques.find((b) => b.id === boutiqueId)?.name ?? 'point de vente';
      return sendOrQueue({
        kind: 'stock-transfer-create',
        farmId: farmId!,
        path: `/farms/${farmId}/stock-transfers`,
        body,
        label: `Transfert · ${PRODUCT_NOUN[product]} vers ${destination}`,
      });
    },
    onSuccess: (res) => {
      if (res.status === 'queued') {
        setDone(QUEUED_MESSAGE);
      } else {
        invalidateTransferQueries(queryClient, farmId);
        setDone(`Transfert enregistré : ${PRODUCT_NOUN[tab as StockTransferProductType].toLowerCase()} en réserve boutique.`);
      }
      setQuantity(0);
      setIdempotencyKey(newIdempotencyKey('transfer'));
    },
  });

  const submit = () => {
    setDone(null);
    if (!sourceId) return setLocalError('Sélectionnez la source du stock.');
    if (!boutiqueId) return setLocalError('Sélectionnez le point de vente destinataire.');
    if (quantity <= 0 || quantity > maxQuantity) {
      return setLocalError(`Quantité invalide (1 à ${num(Math.max(maxQuantity, 1), 0)} ${suffix}).`);
    }
    setLocalError(null);
    create.mutate();
  };

  const loadError = batchesQuery.error ?? slaughterQuery.error ?? feedQuery.error;
  const loading = batchesQuery.isLoading || slaughterQuery.isLoading || feedQuery.isLoading;

  return (
    <Modal title="Transférer du stock : ferme vers point de vente" onClose={onClose} wide>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Segmented<Tab> ariaLabel="Type de stock" value={tab} onChange={selectTab} options={TABS} />
        <ErrorNote error={loadError} />

        {loading ? (
          <Loading label="Chargement du stock…" />
        ) : tab === 'VIVANT' ? (
          <>
            <ul className="grid gap-2 sm:grid-cols-2">
              {liveLots.map((b) => (
                <SourceOption
                  key={b.id}
                  thumb={<PhotoThumb src={lotImage(b.breedName, b.species)} />}
                  title={b.batchName ?? 'Lot'}
                  subtitle={[b.breedCode, b.breedName, typeLabel(b.type)].filter(Boolean).join(' · ')}
                  stats={`${num(b.quantityAlive, 0)} vivants · J${b.metrics.ageDays} · ${
                    b.type === 'PONDEUSE'
                      ? `${pct(b.metrics.layRatePercent ?? 0, 0)} de ponte`
                      : `${pct(b.metrics.mortalityPercent)} de mortalité`
                  }`}
                />
              ))}
              {liveLots.length === 0 ? <li className="text-sm text-slate-500">Aucun lot vivant enregistré sur la ferme.</li> : null}
            </ul>
            <p className="text-xs text-slate-500">
              Les volailles vivantes restent à la ferme (vente directe au point ferme). Choisissez « Abattu » pour transférer des
              carcasses vers un point de vente.
            </p>
          </>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                1. Source du stock{maxQuantity > 0 ? ` · ${num(maxQuantity, 0)} ${suffix} disponibles` : ''}
              </h3>
              <ul className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
                {tab === 'ABATTU'
                  ? pools.map((p) => (
                      <SourceOption
                        key={p.id}
                        thumb={<PhotoThumb src={lotImage(p.batch?.breedName, p.batch?.species)} />}
                        title={p.batch?.batchName ?? 'Lot'}
                        subtitle={[p.batch?.breedName, p.referenceNumber].filter(Boolean).join(' · ')}
                        stats={`${num(p.carcassesAvailable ?? 0, 0)} carcasses disponibles`}
                        selected={p.id === sourceId}
                        onSelect={() => setSourceId(p.id)}
                      />
                    ))
                  : null}
                {tab === 'OEUFS'
                  ? eggLots.map((b) => (
                      <SourceOption
                        key={b.id}
                        thumb={<PhotoThumb src={lotImage(b.breedName, b.species)} />}
                        title={b.batchName ?? 'Lot'}
                        subtitle={[b.breedCode, b.breedName, typeLabel(b.type)].filter(Boolean).join(' · ')}
                        stats={`${num(b.metrics.eggStockAvailableEggs ?? 0, 0)} œufs disponibles · ${eggLabel(b.metrics.eggStockAvailableEggs ?? 0)}`}
                        selected={b.id === sourceId}
                        onSelect={() => setSourceId(b.id)}
                      />
                    ))
                  : null}
                {tab === 'PROVENDE'
                  ? feedLots.map((l) => (
                      <SourceOption
                        key={l.id}
                        thumb={<IconTile icon={<Wheat />} tone="amber" />}
                        title={l.productName}
                        subtitle={[l.supplier, l.supplierLotNumber].filter(Boolean).join(' · ')}
                        stats={`${num(Math.floor(l.availableKg), 0)} kg disponibles · ${num(Math.floor(l.availableKg / sacKg), 0)} sacs`}
                        selected={l.id === sourceId}
                        onSelect={() => {
                          setSourceId(l.id);
                          setUnit(l.unit === 'KG' ? 'KG' : 'SAC');
                          setQuantity(0);
                        }}
                      />
                    ))
                  : null}
                {tab === 'ABATTU' && pools.length === 0 ? (
                  <li className="text-sm text-slate-500">Aucune carcasse disponible : un ordre d’abattage traité est requis.</li>
                ) : null}
                {tab === 'OEUFS' && eggLots.length === 0 ? (
                  <li className="text-sm text-slate-500">Aucun lot actif avec des œufs à transférer : saisissez d’abord une collecte.</li>
                ) : null}
                {tab === 'PROVENDE' && feedLots.length === 0 ? (
                  <li className="text-sm text-slate-500">Aucune provende en stock : réceptionnez d’abord un lot d’aliment.</li>
                ) : null}
              </ul>
            </div>

            {tab === 'PROVENDE' && feedLot ? (
              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">Unité</span>
                <Segmented<'SAC' | 'KG'>
                  ariaLabel="Unité de la provende"
                  value={unit}
                  onChange={(u) => {
                    setUnit(u);
                    setQuantity(0);
                  }}
                  options={[
                    { key: 'SAC', label: `Sacs · ${num(feedSacs, 0)}` },
                    { key: 'KG', label: `Kg · ${num(feedKg, 0)}` },
                  ]}
                />
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="2. Point de vente destinataire">
                <select value={boutiqueId} onChange={(e) => setBoutiqueId(e.target.value)} className={inputCls}>
                  <option value="">{boutiques.length ? 'Choisir un point de vente' : 'Aucun point de vente actif'}</option>
                  {boutiques.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={`3. Quantité (${suffix})`} hint={tab === 'OEUFS' ? '1 alvéole = 30 œufs.' : undefined}>
                <input
                  inputMode="numeric"
                  value={quantity > 0 ? String(quantity) : ''}
                  onChange={(e) => {
                    setQuantity(parseWhole(e.target.value));
                    setLocalError(null);
                    setDone(null);
                  }}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
            </div>

            <p className="text-xs text-slate-500">Le stock quitte la source et devient une réserve vendable au point de vente.</p>
          </>
        )}

        <ErrorNote error={localError ?? create.error} />
        {done ? (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 ring-1 ring-emerald-200">
            <Check className="h-4 w-4 shrink-0" />
            {done}
          </p>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={create.isPending}>
            Fermer
          </Button>
          {tab === 'VIVANT' ? null : (
            <Button type="submit" busy={create.isPending} disabled={!boutiqueId || maxQuantity <= 0 || quantity <= 0}>
              {create.isPending ? null : <ArrowRightLeft className="h-4 w-4" />}
              Transférer
            </Button>
          )}
        </div>
      </form>
    </Modal>
  );
}

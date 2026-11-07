import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowDownRight, Box, Clock, Coins, Layers, Package, PackageOpen, PackagePlus, PackageX, Pill as PillIcon, Plus, Scale, TrendingDown, TrendingUp, Truck, Warehouse, Wheat, type LucideIcon } from 'lucide-react';
import { api } from '../api/client';
import type { FeedProduct, FeedStockSummary } from '../api/types';
import type { FeedEntryType, FeedMovement } from '../api/types-flock';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { FeedEntryModal, LossModal } from '../components/flock/StockModals';
import {
  ENTRY_TYPE_LABEL,
  FEED_PHASES,
  FEED_PHASE_LABEL,
  LIVE_PERIOD,
  LOSS_REASON_LABEL,
  MOVEMENT_TYPE_LABEL,
  Metric,
  Note,
  type Period,
  PeriodBar,
  Pill,
  SectionCard,
  Tabs,
  addLocalDays,
  inPeriod,
  localYmd,
  parseNum,
  phaseLabel,
  useInvalidateFarm,
} from '../components/flock/shared';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr, fcfa, num } from '../lib/format';
// POUFA W6: declarative stock tab and the pending deliveries reminder.
import { DeclarativeStockPanel } from '../components/supply/DeclarativeStockPanel';
import { PendingDeliveriesNote } from '../components/supply/PendingDeliveriesNote';

// POUFA W6: 'declaratif' (programme deliveries received minus declared use).
type TabKey = 'stock' | 'lots' | 'mouvements' | 'catalogue' | 'declaratif';

const entryLabel = (t: string) => (ENTRY_TYPE_LABEL as Record<string, string>)[t] ?? 'Autre';
const reasonLabel = (r: string | null | undefined) =>
  r ? ((LOSS_REASON_LABEL as Record<string, string>)[r] ?? 'Autre') : '—';

const ENTRY_TYPE_ORDER: FeedEntryType[] = ['BULKER', 'BAG', 'MEDICAMENT', 'MATIERE_PREMIERE'];

// Same icon per entry type as mobile's provende screen.
const ENTRY_TYPE_ICON: Record<FeedEntryType, LucideIcon> = {
  BULKER: Truck,
  BAG: PackageOpen,
  MEDICAMENT: PillIcon,
  MATIERE_PREMIERE: Box,
};

type StockLot = FeedStockSummary['lots'][number];
type PhaseStock = FeedStockSummary['byType'][number];

function entryIcon(entryType: string): LucideIcon {
  return ENTRY_TYPE_ICON[entryType as FeedEntryType] ?? Package;
}

/** Icon of a phase row: a phase can mix entry types, so it takes the one holding the most stock. */
function phaseIcon(row: PhaseStock, lots: StockLot[]): LucideIcon {
  const inPhase = lots
    .filter((l) => l.entryType !== 'MEDICAMENT')
    // The server files a lot without a phase under its food type's phase.
    .filter((l) => l.feedPhase === row.feedPhase || (!l.feedPhase && !!l.foodType && l.foodType === row.foodType));
  const main = inPhase.slice().sort((a, b) => b.availableKg - a.availableKg || b.receivedKg - a.receivedKg)[0];
  return main ? entryIcon(main.entryType) : Wheat;
}

/** Per-entry-type total, like mobile: kg for feed, a lot count for medication (not sold by weight). */
function TypeStatCard({ entryType, lots }: { entryType: FeedEntryType; lots: StockLot[] }) {
  const Icon = ENTRY_TYPE_ICON[entryType];
  const ofType = lots.filter((l) => l.entryType === entryType && l.availableKg > 0);
  const kg = ofType.reduce((s, l) => s + l.availableKg, 0);
  const hasData = ofType.length > 0;
  const total = !hasData
    ? '—'
    : entryType === 'MEDICAMENT'
      ? `${num(ofType.length)} lot${ofType.length > 1 ? 's' : ''}`
      : `${num(kg, 0)} kg`;
  return (
    <Card className="flex flex-col items-center gap-1 p-3 text-center">
      <IconTile icon={<Icon />} tone={hasData ? 'accent' : 'slate'} />
      <p className="mt-1 text-xs font-semibold text-slate-500">{ENTRY_TYPE_LABEL[entryType]}</p>
      <p className={hasData ? 'text-base font-bold tabular-nums text-slate-900' : 'text-base font-bold text-slate-400'}>{total}</p>
    </Card>
  );
}

/** Name preceded by its entry-type icon, for table cells. */
function IconLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      <IconTile icon={<Icon />} size="sm" tone="accent" />
      {children}
    </span>
  );
}

function stockTone(autonomy: number | null, available: number): { tone: 'red' | 'amber' | 'emerald' | 'slate'; label: string } {
  if (available <= 0) return { tone: 'red', label: 'Épuisé' };
  if (autonomy == null) return { tone: 'slate', label: 'Pas de consommation' };
  if (autonomy < 3) return { tone: 'red', label: 'Critique' };
  if (autonomy < 5) return { tone: 'amber', label: 'Bas' };
  return { tone: 'emerald', label: 'Correct' };
}

export function StockPage() {
  const { farmId } = useFarm();
  // POUFA lot A droits: an institution (INTRANTS:CONSULTER) reads the FEFO stock, never receives nor declares.
  const canWrite = useFarmProfile().hasPermission('stock:gerer');
  const [tab, setTab] = useState<TabKey>('stock');
  const [receiving, setReceiving] = useState(false);
  const [losing, setLosing] = useState(false);
  const [period, setPeriod] = useState<Period>(LIVE_PERIOD);

  const stock = useQuery({
    queryKey: ['feed-stock', farmId],
    queryFn: () => api.get<FeedStockSummary>(`/farms/${farmId}/feed-stock`),
    enabled: !!farmId,
  });
  const movements = useQuery({
    queryKey: ['feed-movements', farmId],
    queryFn: () => api.get<FeedMovement[]>(`/farms/${farmId}/feed-stock/movements`),
    enabled: !!farmId,
  });
  const mvts = useMemo(() => movements.data ?? [], [movements.data]);

  const priceOf = useMemo(() => {
    const map = new Map<string, number>();
    const phases = new Set(mvts.map((m) => m.feedPhase ?? ''));
    for (const p of phases) {
      const priced = mvts.filter((m) => (m.feedPhase ?? '') === p && m.valueFcfa != null && m.quantityKg > 0);
      const kg = priced.reduce((s, m) => s + m.quantityKg, 0);
      if (kg > 0) map.set(p, priced.reduce((s, m) => s + (m.valueFcfa ?? 0), 0) / kg);
    }
    return map;
  }, [mvts]);

  const byType = useMemo(() => stock.data?.byType ?? [], [stock.data]);
  const summary = useMemo(() => {
    const available = byType.reduce((s, t) => s + t.availableKg, 0);
    const value = byType.reduce((s, t) => s + t.availableKg * (priceOf.get(t.feedPhase ?? '') ?? 0), 0);
    const autonomies = byType.flatMap((t) => (t.autonomyDays != null && t.availableKg > 0 ? [t.autonomyDays] : []));
    return {
      available,
      value,
      phases: byType.filter((t) => t.availableKg > 0).length,
      minAutonomy: autonomies.length ? Math.min(...autonomies) : null,
    };
  }, [byType, priceOf]);

  const insight = useMemo(() => {
    const today = localYmd();
    const cons = mvts.filter((m) => m.type === 'CONSOMMATION');
    const sumBetween = (from: string, to: string) =>
      cons.filter((m) => m.date.slice(0, 10) >= from && m.date.slice(0, 10) <= to).reduce((s, m) => s + m.quantityKg, 0);
    const avg7 = sumBetween(addLocalDays(today, -6), today) / 7;
    const avg14 = sumBetween(addLocalDays(today, -13), today) / 14;
    const prev7 = sumBetween(addLocalDays(today, -13), addLocalDays(today, -7)) / 7;
    if (avg7 <= 0 && avg14 <= 0) return null;
    const priced = cons.filter((m) => m.valueFcfa != null && m.quantityKg > 0);
    const pricedKg = priced.reduce((s, m) => s + m.quantityKg, 0);
    const pricePerKg = pricedKg > 0 ? priced.reduce((s, m) => s + (m.valueFcfa ?? 0), 0) / pricedKg : null;
    const need7 = avg7 * 7;
    const critical = byType
      .filter((t) => t.availableKg > 0 && t.autonomyDays != null)
      .sort((a, b) => (a.autonomyDays ?? 0) - (b.autonomyDays ?? 0))[0];
    return {
      avg7,
      avg14,
      trend: prev7 > 0 ? ((avg7 - prev7) / prev7) * 100 : null,
      coverage: avg7 > 0 ? summary.available / avg7 : null,
      pricePerKg,
      costPerDay: pricePerKg != null ? avg7 * pricePerKg : null,
      need7,
      sacs: Math.ceil(Math.max(0, need7 - summary.available) / 50),
      critical,
    };
  }, [mvts, byType, summary.available]);

  const expiringSoon = (stock.data?.lots ?? []).filter(
    (l) => l.availableKg > 0 && l.expirationDate && l.expirationDate.slice(0, 10) <= addLocalDays(localYmd(), 14),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Stock"
        icon={<Warehouse />}
        subtitle="Provende, médicaments et matières premières"
        actions={
          canWrite ? (
            <div className="flex gap-2">
              <Button tone="secondary" onClick={() => setLosing(true)}>
                <PackageX className="h-4 w-4" /> Déclarer une perte
              </Button>
              <Button onClick={() => setReceiving(true)}>
                <PackagePlus className="h-4 w-4" /> Réception de stock
              </Button>
            </div>
          ) : undefined
        }
      />
      <ReadOnlyNotice what="stock FEFO" />
      <ErrorNote error={stock.error} />
      {canWrite ? <PendingDeliveriesNote /> : null}
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        options={[
          { key: 'stock', label: 'Stock', icon: <Wheat /> },
          { key: 'lots', label: 'Lots reçus', icon: <Package /> },
          { key: 'mouvements', label: 'Mouvements', icon: <ArrowDownRight /> },
          { key: 'catalogue', label: 'Catalogue', icon: <PackagePlus /> },
          { key: 'declaratif', label: 'Stock déclaratif', icon: <Truck /> },
        ]}
      />

      {stock.isLoading ? <Loading label="Chargement du stock…" /> : null}

      {tab === 'stock' && stock.data ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {ENTRY_TYPE_ORDER.map((et) => (
              <TypeStatCard key={et} entryType={et} lots={stock.data?.lots ?? []} />
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Disponible" icon={<Wheat />} value={`${num(summary.available, 0)} kg`} />
            <Metric label="Valeur estimée" icon={<Coins />} value={summary.value > 0 ? fcfa(Math.round(summary.value)) : '—'} sub="au prix moyen constaté" />
            <Metric label="Phases en stock" icon={<Layers />} value={summary.phases} />
            <Metric
              label="Autonomie minimale"
              icon={<Package />}
              value={summary.minAutonomy != null ? `${num(summary.minAutonomy)} j` : '—'}
              tone={summary.minAutonomy == null ? undefined : summary.minAutonomy < 3 ? 'bad' : summary.minAutonomy < 5 ? 'warn' : 'good'}
            />
          </div>
          {(stock.data?.deficitKg ?? 0) > 0 ? (
            <Note tone="red" icon={<AlertTriangle />}>
              Stock négatif : {num(-(stock.data?.deficitKg ?? 0))} kg. Des consommations ont été saisies « depuis le stock » alors
              qu'aucun lot n'était disponible. Enregistrez une entrée de provende pour régulariser.
            </Note>
          ) : null}
          {expiringSoon.length > 0 ? (
            <Note tone="amber" icon={<AlertTriangle />}>
              {expiringSoon.length} lot{expiringSoon.length > 1 ? 's' : ''} périmé{expiringSoon.length > 1 ? 's' : ''} ou proche
              {expiringSoon.length > 1 ? 's' : ''} de la péremption (14 jours) : {expiringSoon.map((l) => l.productName).join(', ')}.
            </Note>
          ) : null}
          {insight ? (
            <SectionCard title="Analyse de la consommation" icon={<TrendingUp />}>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                <Metric label="Moyenne 7 jours" icon={<Wheat />} value={`${num(insight.avg7)} kg/j`} sub={`sur 14 jours : ${num(insight.avg14)} kg/j`} />
                <Metric
                  label="Tendance"
                  icon={insight.trend != null && insight.trend < 0 ? <TrendingDown /> : <TrendingUp />}
                  value={insight.trend != null ? `${insight.trend >= 0 ? '+' : ''}${num(insight.trend, 0)} %` : '—'}
                />
                <Metric label="Couverture" icon={<Clock />} value={insight.coverage != null ? `${num(insight.coverage, 0)} j` : '—'} />
                <Metric
                  label="Coût quotidien"
                  icon={<Coins />}
                  value={insight.costPerDay != null ? fcfa(Math.round(insight.costPerDay)) : '—'}
                  sub={insight.pricePerKg != null ? `${fcfa(Math.round(insight.pricePerKg))} / kg` : undefined}
                />
              </div>
              <p className="mt-3 text-sm text-slate-600">
                Besoin sur 7 jours : {num(insight.need7, 0)} kg
                {insight.sacs > 0 ? `, soit ${insight.sacs} sacs de 50 kg à prévoir` : ', couvert par le stock'}.
                {insight.critical
                  ? ` Phase la plus tendue : ${phaseLabel(insight.critical.feedPhase).toLowerCase()} (${num(insight.critical.autonomyDays ?? 0)} j).`
                  : ''}
              </p>
            </SectionCard>
          ) : null}
          <SectionCard title="Inventaire par phase" icon={<Wheat />} subtitle="Autonomie en jours et lot à utiliser en premier" flush>
            {byType.length === 0 ? (
              <div className="p-4">
                <EmptyState message="Aucun stock : enregistrez votre première réception." icon={<Scale />} />
              </div>
            ) : (
              <DataTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Phase</Th>
                      <Th className="hidden lg:table-cell">Reçu</Th>
                      <Th className="hidden lg:table-cell">Consommé</Th>
                      <Th className="hidden xl:table-cell">Perdu</Th>
                      <Th className="hidden xl:table-cell">Vendu</Th>
                      <Th>Disponible</Th>
                      <Th>Autonomie</Th>
                      <Th>Valeur</Th>
                      <Th>État</Th>
                      <Th className="hidden lg:table-cell">Lot à utiliser</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {byType.map((t, i) => {
                      const s = stockTone(t.autonomyDays, t.availableKg);
                      const price = priceOf.get(t.feedPhase ?? '');
                      return (
                        <tr key={`${t.feedPhase ?? 'x'}-${i}`} className="border-t border-slate-100">
                          <Td className="font-medium">
                            <IconLabel icon={phaseIcon(t, stock.data?.lots ?? [])}>
                              {t.feedPhase ? phaseLabel(t.feedPhase) : (t.foodType ?? 'Sans phase')}
                            </IconLabel>
                          </Td>
                          <Td label="Reçu" className="md:max-lg:hidden">{num(t.receivedKg)} kg</Td>
                          <Td label="Consommé" className="md:max-lg:hidden">{num(t.usedKg)} kg</Td>
                          <Td label="Perdu" className="md:max-xl:hidden">{num(t.lostKg)} kg</Td>
                          <Td label="Vendu" className="md:max-xl:hidden">{num(t.soldKg)} kg</Td>
                          <Td label="Disponible" className="font-semibold">{num(t.availableKg)} kg</Td>
                          <Td label="Autonomie">{t.autonomyDays != null ? `${num(t.autonomyDays)} j` : '—'}</Td>
                          <Td label="Valeur">{price ? fcfa(Math.round(t.availableKg * price)) : '—'}</Td>
                          <Td label="État">
                            <Pill tone={s.tone}>{s.label}</Pill>
                          </Td>
                          <Td label="Lot à utiliser" className="md:max-lg:hidden">{t.suggestedLotName ?? '—'}</Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </DataTable>
            )}
          </SectionCard>
        </>
      ) : null}

      {tab === 'lots' && stock.data ? (
        <SectionCard title="Lots reçus" icon={<Package />} subtitle="Traçabilité fournisseur et péremption" flush>
          {stock.data.lots.length === 0 ? (
            <div className="p-4">
              <EmptyState message="Aucun lot reçu." icon={<Package />} />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Produit</Th>
                    <Th>Type</Th>
                    <Th>Phase</Th>
                    <Th className="hidden lg:table-cell">Fournisseur</Th>
                    <Th className="hidden lg:table-cell">N° de lot</Th>
                    <Th>Reçu le</Th>
                    <Th>Reçu</Th>
                    <Th>Restant</Th>
                    <Th>Péremption</Th>
                  </tr>
                </thead>
                <tbody>
                  {stock.data.lots.map((l) => (
                    <tr key={l.id} className="border-t border-slate-100">
                      <Td className="font-medium">{l.productName}</Td>
                      <Td label="Type">
                        <IconLabel icon={entryIcon(l.entryType)}>{entryLabel(l.entryType)}</IconLabel>
                      </Td>
                      <Td label="Phase">{phaseLabel(l.feedPhase, l.customFeedPhaseName)}</Td>
                      <Td label="Fournisseur" className="md:max-lg:hidden">{l.supplier}</Td>
                      <Td label="N° de lot" className="md:max-lg:hidden">{l.supplierLotNumber}</Td>
                      <Td label="Reçu le">{dateFr(l.receivedDate)}</Td>
                      <Td label="Reçu">{num(l.receivedKg)} kg</Td>
                      <Td label="Restant" className="font-semibold">{num(l.availableKg)} kg</Td>
                      <Td label="Péremption">
                        {l.expirationDate ? dateFr(l.expirationDate) : '—'}
                        {l.expired ? (
                          <span className="ml-1">
                            <Pill tone="red">Périmé</Pill>
                          </span>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          )}
        </SectionCard>
      ) : null}

      {tab === 'mouvements' ? (
        <SectionCard title="Journal des mouvements" icon={<ArrowDownRight />} subtitle="Consommations liées, pertes et ventes" actions={<PeriodBar value={period} onChange={setPeriod} />} flush>
          <ErrorNote error={movements.error} />
          {movements.isLoading ? (
            <Loading />
          ) : mvts.filter((m) => inPeriod(period, m.date)).length === 0 ? (
            <div className="p-4">
              <EmptyState message="Aucun mouvement sur cette période." icon={<ArrowDownRight />} />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Date</Th>
                    <Th>Type</Th>
                    <Th>Produit</Th>
                    <Th>Phase</Th>
                    <Th>Quantité</Th>
                    <Th>Valeur</Th>
                    <Th>Raison</Th>
                  </tr>
                </thead>
                <tbody>
                  {mvts
                    .filter((m) => inPeriod(period, m.date))
                    .map((m) => (
                      <tr key={m.id} className="border-t border-slate-100">
                        <Td>{dateFr(m.date)}</Td>
                        <Td label="Type">
                          <Pill tone={m.type === 'PERTE' ? 'red' : m.type === 'VENTE' ? 'emerald' : 'slate'}>{MOVEMENT_TYPE_LABEL[m.type]}</Pill>
                        </Td>
                        <Td label="Produit">{m.productName ?? '—'}</Td>
                        <Td label="Phase">{phaseLabel(m.feedPhase)}</Td>
                        <Td label="Quantité">{num(m.quantityKg)} kg</Td>
                        <Td label="Valeur">{m.valueFcfa != null ? fcfa(m.valueFcfa) : '—'}</Td>
                        <Td label="Raison">{m.type === 'PERTE' ? reasonLabel(m.reason) : '—'}</Td>
                      </tr>
                    ))}
                </tbody>
              </DataTable>
          )}
        </SectionCard>
      ) : null}

      {tab === 'catalogue' ? <CatalogPanel readOnly={!canWrite} /> : null}
      {tab === 'declaratif' ? <DeclarativeStockPanel /> : null}

      {receiving ? <FeedEntryModal stock={stock.data} onClose={() => setReceiving(false)} /> : null}
      {losing ? <LossModal stock={stock.data} onClose={() => setLosing(false)} /> : null}
    </div>
  );
}

function CatalogPanel({ readOnly = false }: { readOnly?: boolean }) {
  const { farmId } = useFarm();
  const invalidate = useInvalidateFarm();
  const products = useQuery({
    queryKey: ['feed-products', farmId],
    queryFn: () => api.get<FeedProduct[]>(`/farms/${farmId}/feed-products`),
    enabled: !!farmId,
  });
  const [name, setName] = useState('');
  const [entryType, setEntryType] = useState('BAG');
  const [phase, setPhase] = useState('');
  const [supplier, setSupplier] = useState('');
  const [price, setPrice] = useState('');
  const [bagKg, setBagKg] = useState('');
  const [costMt, setCostMt] = useState('');

  const add = useMutation({
    mutationFn: () =>
      api.post(`/farms/${farmId}/feed-products`, {
        name: name.trim(),
        entryType,
        feedPhase: phase || undefined,
        supplier: supplier.trim() || undefined,
        defaultBagSizeKg: parseNum(bagKg),
        defaultUnitPriceFcfa: parseNum(price),
        defaultCostPerMtFcfa: parseNum(costMt),
      }),
    onSuccess: async () => {
      await invalidate();
      setName('');
      setSupplier('');
      setPrice('');
      setBagKg('');
      setCostMt('');
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim()) add.mutate();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className={readOnly ? 'lg:col-span-3' : 'lg:col-span-2'}>
        <SectionCard title="Catalogue de la ferme" icon={<PackagePlus />} subtitle="Votre provende habituelle" flush>
          <ErrorNote error={products.error} />
          {products.isLoading ? (
            <Loading />
          ) : !products.data?.length ? (
            <div className="p-4">
              <EmptyState message="Aucun produit au catalogue." icon={<Package />} />
            </div>
          ) : (
            <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Produit</Th>
                    <Th>Type</Th>
                    <Th>Phase</Th>
                    <Th>Fournisseur</Th>
                    <Th>Prix</Th>
                    <Th>Sac</Th>
                    <Th>Statut</Th>
                  </tr>
                </thead>
                <tbody>
                  {products.data.map((p) => (
                    <tr key={p.id} className="border-t border-slate-100">
                      <Td className="font-medium">{p.name}</Td>
                      <Td label="Type">{entryLabel(p.entryType)}</Td>
                      <Td label="Phase">{phaseLabel(p.feedPhase)}</Td>
                      <Td label="Fournisseur">{p.supplier ?? '—'}</Td>
                      <Td label="Prix">
                        {p.entryType === 'BULKER'
                          ? p.defaultCostPerMtFcfa != null
                            ? `${fcfa(p.defaultCostPerMtFcfa)} / t`
                            : '—'
                          : p.defaultUnitPriceFcfa != null
                            ? fcfa(p.defaultUnitPriceFcfa)
                            : '—'}
                      </Td>
                      <Td label="Sac">{p.defaultBagSizeKg != null ? `${num(p.defaultBagSizeKg)} kg` : '—'}</Td>
                      <Td label="Statut">
                        <Pill tone={p.active ? 'emerald' : 'slate'}>{p.active ? 'Actif' : 'Archivé'}</Pill>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
          )}
        </SectionCard>
      </div>
      {readOnly ? null : (
      <SectionCard title="Ajouter un produit" icon={<Plus />}>
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nom *">
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Provende ponte 50" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type">
              <select className={inputCls} value={entryType} onChange={(e) => setEntryType(e.target.value)}>
                {Object.entries(ENTRY_TYPE_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Phase">
              <select className={inputCls} value={phase} onChange={(e) => setPhase(e.target.value)}>
                <option value="">Non applicable</option>
                {FEED_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {FEED_PHASE_LABEL[p]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Prix du sac (FCFA)">
              <input className={inputCls} inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Taille du sac (kg)">
              <input className={inputCls} inputMode="numeric" value={bagKg} onChange={(e) => setBagKg(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Coût par tonne (FCFA)">
              <input className={inputCls} inputMode="numeric" value={costMt} onChange={(e) => setCostMt(e.target.value.replace(/\D/g, ''))} />
            </Field>
            <Field label="Fournisseur">
              <input className={inputCls} value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </Field>
          </div>
          <ErrorNote error={add.error} />
          <Button type="submit" busy={add.isPending} disabled={!name.trim()}>
            <Plus className="h-4 w-4" /> Ajouter
          </Button>
        </form>
      </SectionCard>
      )}
    </div>
  );
}

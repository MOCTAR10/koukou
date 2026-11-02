import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CloudSun, Droplets, Egg, ListChecks, Thermometer, Trophy } from 'lucide-react';
import type { DashboardData } from '../../api/types';
import type {
  AdvisoryNextActions,
  CarcassPool,
  CustomerSummary,
  FarmWeather,
  OverviewPnl,
  OwnerDashboard,
  PosBatch,
} from '../../api/types-sales';
import { BarChart } from '../Charts';
import { Card } from '../ui';
import { classNames, dateFr, fcfa, num, pct } from '../../lib/format';
import { AlertLevelBadge, FilterChip } from './shared';

/** Same advice as the mobile home screen. */
function weatherHint(tempC: number, humidityPct: number): string {
  if (tempC >= 33) return 'Chaleur forte : ventilez et abreuvez bien vos oiseaux.';
  if (tempC >= 30) return 'Chaleur soutenue : surveillez l’abreuvement.';
  if (humidityPct >= 75) return 'Humidité élevée : pensez à ventiler les bâtiments.';
  if (humidityPct <= 35) return 'Air sec : assurez l’abreuvement des sujets.';
  return 'Conditions favorables pour vos élevages.';
}

export function WeatherCard({ weather }: { weather: FarmWeather | null }) {
  const today = weather?.available ? weather.today : null;
  return (
    <Card className="flex items-center gap-4 p-4">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
        <CloudSun className="h-6 w-6" />
      </span>
      {today ? (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-4 text-lg font-bold text-slate-900">
            <span className="flex items-center gap-1">
              <Thermometer className="h-4 w-4 text-slate-400" /> {num(today.tempC)} °C
            </span>
            <span className="flex items-center gap-1">
              <Droplets className="h-4 w-4 text-slate-400" /> {num(today.humidityPct)} %
            </span>
          </p>
          <p className="text-sm text-slate-500">{weatherHint(today.tempC, today.humidityPct)}</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-slate-700">Météo indisponible</p>
          <p className="text-sm text-slate-500">Les prévisions de la ferme n’ont pas pu être chargées.</p>
        </div>
      )}
    </Card>
  );
}

/** The most urgent actions; the full queue lives on the alerts page. */
export function ActionQueue({ advisory, error }: { advisory: AdvisoryNextActions | undefined; error: boolean }) {
  const actions = advisory?.actions ?? [];
  const rank = (level: string) => (level === 'ROUGE' ? 0 : level === 'JAUNE' ? 1 : 2);
  const top = actions
    .filter((a) => !a.acknowledged)
    .slice()
    .sort((a, b) => rank(a.level) - rank(b.level))
    .slice(0, 5);
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <ListChecks className="h-4 w-4 text-brand-600" /> Actions à traiter
          {advisory ? <span className="font-normal text-slate-400">({num(advisory.summary.total)})</span> : null}
        </h2>
        <Link to="/app/alerts" className="flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline">
          Tout voir <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
      {error ? (
        <p className="px-4 py-6 text-center text-sm text-red-600">Impossible de charger les actions à traiter.</p>
      ) : top.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-500">Rien à traiter pour l’instant.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {top.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-2.5">
              <AlertLevelBadge level={a.level} />
              <div className="min-w-0 text-sm">
                <p className="font-medium text-slate-800">{a.title}</p>
                <p className="text-xs text-slate-500">
                  {[a.batchName, a.dueDate ? `Échéance ${dateFr(a.dueDate)}` : null].filter(Boolean).join(' · ') || 'Ferme'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={classNames('text-lg font-bold tabular-nums', tone ?? 'text-slate-900')}>{value}</p>
      {sub ? <p className="text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function weightedAvg(batches: PosBatch[], pick: (b: PosBatch) => number | null | undefined): number | null {
  let sum = 0;
  let live = 0;
  for (const b of batches) {
    const v = pick(b);
    if (v == null) continue;
    sum += v * b.metrics.liveCount;
    live += b.metrics.liveCount;
  }
  return live > 0 ? sum / live : null;
}

export function PerformanceTiles({ batches }: { batches: PosBatch[] }) {
  const active = batches.filter((b) => b.status !== 'CLOTURE');
  const fcr = weightedAvg(active, (b) => b.metrics.fcr);
  const gmq = weightedAvg(active, (b) => b.metrics.gmqGramsPerDay);
  const ipe = weightedAvg(active, (b) => b.metrics.ipe);
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Performance moyenne des lots</h2>
      <div className="grid grid-cols-3 gap-3">
        <Tile
          label="IC moyen"
          value={fcr != null ? num(fcr, 2) : '—'}
          sub={fcr == null ? 'Pas de donnée' : fcr > 2.2 ? 'Élevé' : fcr < 1.8 ? 'Excellent' : 'Conforme'}
          tone={fcr != null && fcr > 2.2 ? 'text-red-600' : undefined}
        />
        <Tile
          label="GMQ moyen"
          value={gmq != null ? `${num(gmq)} g/j` : '—'}
          sub={gmq == null ? 'Pas de donnée' : gmq > 55 ? 'Croissance rapide' : gmq < 0 ? 'Perte de poids' : 'Croissance normale'}
          tone={gmq != null && gmq < 0 ? 'text-red-600' : undefined}
        />
        <Tile
          label="IPE moyen"
          value={ipe != null && ipe > 0 ? num(Math.round(ipe)) : '—'}
          sub={ipe == null ? 'Pas de donnée' : 'Indice de performance'}
        />
      </div>
    </Card>
  );
}

function StatGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="grid grid-cols-2 gap-2">{children}</div>
    </div>
  );
}

function signed(n: number | null | undefined, unit: string, digits = 0): string {
  if (n == null) return 'Pas de comparaison';
  return `${n > 0 ? '+' : ''}${num(n, digits)}${unit} vs semaine passée`;
}

export function OwnerStats({
  dash,
  batches,
  slaughter,
  pnl,
  clients,
}: {
  dash: OwnerDashboard;
  batches: PosBatch[];
  slaughter: CarcassPool[];
  pnl: OverviewPnl | undefined;
  clients: CustomerSummary | undefined;
}) {
  const active = batches.filter((b) => b.status !== 'CLOTURE');
  const avgAge = active.length ? Math.round(active.reduce((s, b) => s + b.metrics.ageDays, 0) / active.length) : null;
  const maxDensity = active.reduce((m, b) => Math.max(m, b.metrics.densityPerM2 ?? 0), 0);
  const live = active.reduce((s, b) => s + b.metrics.liveCount, 0);
  const feedKg = active.reduce((s, b) => s + (b.metrics.totalFeedKg ?? 0), 0);
  const autonomy = dash.feedAutonomyDays;
  const water = dash.waterDropPercent;

  const processed = slaughter.filter((o) => o.status === 'PROCESSED');
  const yields = processed.filter((o) => o.rendementPercent != null);
  const avgYield = yields.length ? yields.reduce((s, o) => s + (o.rendementPercent ?? 0), 0) / yields.length : null;

  return (
    <Card className="p-4">
      <h2 className="mb-4 text-sm font-semibold text-slate-700">Statistiques détaillées</h2>
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        <StatGroup title="Lots">
          <Tile label="Âge moyen" value={avgAge != null ? `${num(avgAge)} j` : '—'} />
          <Tile
            label="Densité max."
            value={maxDensity > 0 ? `${num(maxDensity, 1)} /m²` : '—'}
            tone={maxDensity > 18 ? 'text-red-600' : maxDensity > 15 ? 'text-amber-600' : undefined}
          />
        </StatGroup>
        <StatGroup title="Alimentation">
          <Tile
            label="Autonomie"
            value={autonomy != null ? `${num(autonomy)} j` : '—'}
            sub={autonomy == null ? undefined : autonomy < 3 ? 'Critique' : autonomy < 5 ? 'Bas' : 'OK'}
            tone={autonomy != null && autonomy < 3 ? 'text-red-600' : autonomy != null && autonomy < 5 ? 'text-amber-600' : undefined}
          />
          <Tile label="Conso. par oiseau" value={live > 0 ? `${num(feedKg / live, 1)} kg` : '—'} />
        </StatGroup>
        <StatGroup title="Tendances de la semaine">
          <Tile label="Mortalité" value={`${num(dash.deltas.mortalityThisWeek)} sujet(s)`} sub={signed(dash.deltas.mortalityDelta, '')} />
          <Tile label="Aliment" value={`${num(dash.deltas.feedThisWeekKg)} kg`} sub={signed(dash.deltas.feedDeltaKg, ' kg')} />
          <Tile
            label="Taux de ponte"
            value={dash.deltas.layRateThisWeekPct != null ? pct(dash.deltas.layRateThisWeekPct) : '—'}
            sub={signed(dash.deltas.layRateDeltaPct, ' pts', 1)}
          />
        </StatGroup>
        <StatGroup title="Infrastructures">
          <Tile label="Bâtiments" value={num(dash.buildingsCount)} sub={dash.totalAreaM2 != null ? `${num(dash.totalAreaM2)} m²` : undefined} />
          <Tile label="Densité ferme" value={dash.farmDensityPerM2 != null ? `${num(dash.farmDensityPerM2, 1)} /m²` : '—'} />
          <Tile
            label="Eau aujourd’hui"
            value={dash.waterConsumptionTodayL != null ? `${num(dash.waterConsumptionTodayL)} L` : '—'}
            sub={water == null ? undefined : water > 25 ? 'Baisse critique' : water > 10 ? 'En baisse' : water < -5 ? 'En hausse' : 'Stable'}
            tone={water != null && water > 25 ? 'text-red-600' : water != null && water > 10 ? 'text-amber-600' : undefined}
          />
        </StatGroup>
        <StatGroup title="Abattage et vente">
          <Tile label="Ordres traités" value={num(processed.length)} sub={`${num(processed.reduce((s, o) => s + o.birdCount, 0))} oiseaux`} />
          <Tile
            label="Poids total"
            value={`${num(processed.reduce((s, o) => s + (o.totalWeightKg ?? 0), 0))} kg`}
            sub={avgYield != null ? `Rendement ${num(avgYield)} %` : 'Sans rendement'}
          />
        </StatGroup>
        <StatGroup title="Finances (30 jours)">
          <Tile label="Ventes" value={pnl ? fcfa(pnl.sales.totalFcfa) : '—'} />
          <Tile label="Charges" value={pnl ? fcfa(pnl.expenses.totalFcfa) : '—'} />
          <Tile label="Résultat net" value={pnl ? fcfa(pnl.netFcfa) : '—'} tone={pnl && pnl.netFcfa < 0 ? 'text-red-600' : 'text-emerald-600'} />
          <Tile label="Créances" value={pnl ? fcfa(pnl.outstandingFcfa) : '—'} tone={pnl && pnl.outstandingFcfa > 0 ? 'text-amber-600' : undefined} />
        </StatGroup>
        <StatGroup title="Clients">
          <Tile label="Portefeuille" value={clients ? num(clients.total) : '—'} sub={clients ? `${num(clients.debtors)} débiteur(s)` : undefined} />
          <Tile
            label="Encaissé"
            value={clients ? fcfa(clients.paidFcfa) : '—'}
            sub={clients ? `sur ${fcfa(clients.totalInvoicedFcfa)} facturés` : undefined}
          />
        </StatGroup>
      </div>
    </Card>
  );
}

export function EggStockPanel({
  stock,
  batches,
  series,
}: {
  stock: OwnerDashboard['eggStock'];
  batches: PosBatch[];
  series: Array<{ date: string; count: number }>;
}) {
  const [inTrays, setInTrays] = useState(false);
  const layers = batches.filter((b) => b.status !== 'CLOTURE' && b.type === 'PONDEUSE');
  const live = layers.reduce((s, b) => s + b.metrics.liveCount, 0);
  const layRate = live > 0 ? layers.reduce((s, b) => s + (b.metrics.layRatePercent ?? 0) * b.metrics.liveCount, 0) / live : null;
  const breakdown = { collected: 0, sellable: 0, cracked: 0, small: 0, doubleYolk: 0, dirty: 0 };
  for (const b of layers) {
    const e = b.metrics.eggBreakdown;
    if (!e) continue;
    breakdown.collected += e.collected;
    breakdown.sellable += e.sellable;
    breakdown.cracked += e.cracked;
    breakdown.small += e.small;
    breakdown.doubleYolk += e.doubleYolk;
    breakdown.dirty += e.dirty;
  }
  const rows = inTrays ? series.map((d) => Math.floor(d.count / 30)) : series.map((d) => d.count);
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Egg className="h-4 w-4 text-brand-600" /> Stock d’œufs
        </h2>
        <div className="flex gap-1.5">
          <FilterChip label="Œufs" active={!inTrays} onClick={() => setInTrays(false)} />
          <FilterChip label="Alvéoles" active={inTrays} onClick={() => setInTrays(true)} />
        </div>
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Tile
              label="Disponible"
              value={inTrays ? `${num(stock.availableAlveoles)} alv.` : `${num(stock.availableEggs)} œufs`}
              sub={inTrays ? `= ${num(stock.availableEggs)} œufs` : `= ${num(stock.availableAlveoles)} alvéole(s)`}
            />
            <Tile label="Vendu" value={`${num(stock.soldAlveoles ?? 0)} alv.`} sub={layRate != null ? `Ponte ${pct(layRate)}` : 'Ponte —'} />
          </div>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-500">
            <li className="flex justify-between"><span>Collectés</span><b className="text-slate-700">{num(breakdown.collected)}</b></li>
            <li className="flex justify-between"><span>Vendables</span><b className="text-slate-700">{num(breakdown.sellable)}</b></li>
            <li className="flex justify-between"><span>Fêlés</span><b className="text-slate-700">{num(breakdown.cracked)}</b></li>
            <li className="flex justify-between"><span>Petits</span><b className="text-slate-700">{num(breakdown.small)}</b></li>
            <li className="flex justify-between"><span>Double jaune</span><b className="text-slate-700">{num(breakdown.doubleYolk)}</b></li>
            <li className="flex justify-between"><span>Sales</span><b className="text-slate-700">{num(breakdown.dirty)}</b></li>
          </ul>
        </div>
        <div>
          <p className="mb-1 text-xs text-slate-500">Collecte des 7 derniers jours ({inTrays ? 'alvéoles' : 'œufs'})</p>
          <BarChart
            data={rows}
            labels={series.map((d) => new Date(`${d.date}T12:00:00`).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }))}
            height={130}
          />
        </div>
      </div>
    </Card>
  );
}

/** Best lot and the breed closest to its reference curve. */
export function Ranking({ dash, typeLabel }: { dash: OwnerDashboard; typeLabel: (t: DashboardData['leaderboard'][number]['type']) => string }) {
  const top = dash.leaderboard[0] ?? null;
  const deviation = (h: OwnerDashboard['healthOverview'][number]) =>
    Math.abs(h.breedStatus?.fcrDeviationPct ?? h.breedStatus?.layRateDeviationPct ?? 999);
  const best = dash.healthOverview
    .filter((h) => h.breedStatus != null)
    .reduce<OwnerDashboard['healthOverview'][number] | null>((b, h) => (!b || deviation(h) < deviation(b) ? h : b), null);
  if (!top && !best) return null;
  return (
    <Card className="p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <Trophy className="h-4 w-4 text-brand-600" /> Classement
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {top ? (
          <Tile
            label="Meilleur lot"
            value={top.batchName ?? 'Lot'}
            sub={`${typeLabel(top.type)} · IC ${top.fcr != null ? num(top.fcr, 2) : '—'} · ${num(top.liveCount)} vivants`}
          />
        ) : null}
        {best?.breedStatus ? (
          <Tile
            label="Souche la plus proche de sa référence"
            value={best.breedStatus.breedName}
            sub={`${best.batchName ?? 'Lot'} · semaine ${num(best.breedStatus.week)}${
              best.breedStatus.fcrDeviationPct != null
                ? ` · écart IC ${best.breedStatus.fcrDeviationPct > 0 ? '+' : ''}${num(best.breedStatus.fcrDeviationPct, 1)} %`
                : best.breedStatus.layRateDeviationPct != null
                  ? ` · écart ponte ${best.breedStatus.layRateDeviationPct > 0 ? '+' : ''}${num(best.breedStatus.layRateDeviationPct, 1)} %`
                  : ''
            }`}
          />
        ) : null}
      </div>
    </Card>
  );
}

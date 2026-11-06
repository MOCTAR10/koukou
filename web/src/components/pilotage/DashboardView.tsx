import { useQuery } from '@tanstack/react-query';
import { Activity, AlertTriangle, Bird, CalendarCheck, Coins, Factory, Package, ShieldAlert, Skull, Tractor } from 'lucide-react';
import { api } from '../../api/client';
import type { CountItem, PilotageDashboard, PilotageMetrics } from '../../api/types-pilotage';
import { LineChart } from '../Charts';
import { ErrorNote } from '../form';
import { Note, SectionCard } from '../flock/shared';
import { DataTable, Loading, StatCard, Td, Th } from '../ui';
import { periodError, pilotageQueryString, type PilotageFilters } from './filters';
import {
  countLabel,
  fcfaLabel,
  headsLabel,
  hiddenWeeks,
  pctLabel,
  shownFigure,
  suppressedLabel,
  suppressedSentence,
  tonnesLabel,
  weekLabel,
  weightLabel,
} from './format';
import { ExportsCard } from './ExportsCard';
import { bandTypesLabel, PILOTAGE_REFRESH_MS } from './perimeter';
import { FigureRow, FigureText, MethodNotes, ScopeBanner, Suppressed } from './shared';

/**
 * Province / national dashboard (`GET /pilotage/dashboard`, CDC rows 16, 37,
 * 47): totals, provinces, farms by status and cohort, the weekly series,
 * published sanitary alerts and the inputs recoupement. Aggregates only: no
 * farm row is ever listed here.
 */
export function DashboardView({ filters, aggregateOnly }: { filters: PilotageFilters; aggregateOnly: boolean }) {
  const invalid = periodError(filters);
  const qs = pilotageQueryString(filters);
  const query = useQuery({
    queryKey: ['pilotage-dashboard', qs],
    queryFn: () => api.get<PilotageDashboard>(`/pilotage/dashboard${qs}`),
    enabled: !invalid,
    retry: false,
    refetchInterval: PILOTAGE_REFRESH_MS,
  });

  if (invalid) return null;
  if (query.isLoading) return <Loading label="Calcul du tableau de bord…" />;
  if (query.error || !query.data) return <ErrorNote error={query.error ?? 'Tableau de bord indisponible.'} />;
  const d = query.data;
  const k = d.scope.minGroupSize;
  const t = d.totals;
  const fig = (pick: (m: PilotageMetrics) => number | null | undefined, fmt: (n: number | null | undefined) => string) => shownFigure(t, pick, fmt, k);
  const m = t.metrics;

  return (
    <div className="space-y-6">
      <ScopeBanner scope={d.scope} period={d.period} generatedAt={d.generatedAt} />
      {t.suppressed ? <Note tone="slate">{suppressedSentence(k)}</Note> : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Fermes"
          value={countLabel(t.farms, 'ferme', 'fermes')}
          hint={`${countLabel(d.farms.producing, 'en production', 'en production')} en fin de période`}
          icon={<Tractor className="h-4 w-4" />}
        />
        <StatCard
          label="Effectif présent"
          value={<FigureText shown={fig((x) => x.headcount, headsLabel)} />}
          hint={m ? `${countLabel(m.activeBands, 'bande active', 'bandes actives')} · ${headsLabel(m.placedHeads)} mis en place` : undefined}
          icon={<Bird className="h-4 w-4" />}
        />
        <StatCard
          label="Mortalité de la période"
          value={<FigureText shown={fig((x) => x.mortalityPct, pctLabel)} />}
          hint={m ? `${headsLabel(m.deaths)} morts` : undefined}
          icon={<Skull className="h-4 w-4" />}
        />
        <StatCard
          label="Complétude des saisies"
          value={<FigureText shown={fig((x) => x.completeness.pct, pctLabel)} />}
          hint={m ? `${m.completeness.daysEntered} jours saisis sur ${m.completeness.daysElapsed}` : undefined}
          icon={<CalendarCheck className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Volumes produits" subtitle="Animaux sortis vivants sur la période" icon={<Factory />}>
          {m ? (
            <>
              <FigureRow label="Têtes">{headsLabel(m.produced.heads)}</FigureRow>
              <FigureRow label="Poids vif">{weightLabel(m.produced.kg)}</FigureRow>
              <FigureRow label="Tonnes">{tonnesLabel(m.produced.tonnes)}</FigureRow>
            </>
          ) : (
            <Suppressed k={k} />
          )}
        </SectionCard>
        <SectionCard title="Ventes" subtitle="Vif et carcasses, ventes non annulées" icon={<Coins />}>
          {m ? (
            <>
              <FigureRow label="Vif vendu">
                {headsLabel(m.sold.liveHeads)} · {weightLabel(m.sold.liveKg)}
              </FigureRow>
              <FigureRow label="Prix moyen par tête">{fcfaLabel(m.sold.avgPricePerHeadFcfa)}</FigureRow>
              <FigureRow label="Prix moyen par kg vif">{fcfaLabel(m.sold.avgPricePerKgFcfa)}</FigureRow>
              <FigureRow label="Carcasses vendues">
                {headsLabel(m.sold.carcassHeads)} · {weightLabel(m.sold.carcassKg)}
              </FigureRow>
              <FigureRow label="Prix moyen par carcasse">{fcfaLabel(m.sold.avgCarcassPricePerPieceFcfa)}</FigureRow>
              <FigureRow label="Prix moyen par kg de carcasse">{fcfaLabel(m.sold.avgCarcassPricePerKgFcfa)}</FigureRow>
              <FigureRow label="Chiffre d’affaires">{fcfaLabel(m.sold.revenueFcfa)}</FigureRow>
            </>
          ) : (
            <Suppressed k={k} />
          )}
        </SectionCard>
        <SectionCard title="Alertes sanitaires" subtitle="Publiées par les services vétérinaires" icon={<AlertTriangle />} iconTone="amber">
          <FigureRow label="Alertes sanitaires publiées">
            {d.publishedAlerts.available ? d.publishedAlerts.count : <span className="text-xs italic text-slate-400">source indisponible</span>}
          </FigureRow>
          <p className="mt-2 text-xs text-slate-500">Seules les alertes publiées comptent comme « alerte ». Les alertes nationales et provinciales comptent dans le total, pas dans une ferme.</p>
          {/* POUFA lot A pilot: Fermia advisory alerts, apart and never « alerte ». */}
          <div className="mt-4 border-t border-slate-100 pt-3">
            <p className="text-sm font-medium text-slate-700">{conductLabel(d)}</p>
            {m ? (
              <>
                <FigureRow label="Levées sur la période">{m.alerts.conduct.raised}</FigureRow>
                <FigureRow label="dont rouges">{m.alerts.conduct.raisedRed}</FigureRow>
                <FigureRow label="Actives aujourd’hui">
                  {m.alerts.conduct.activeNow} (dont {m.alerts.conduct.activeRedNow} rouges)
                </FigureRow>
              </>
            ) : (
              <Suppressed k={k} />
            )}
            <p className="mt-2 text-xs text-slate-500">Conseils de conduite d’élevage : ils ne colorent jamais une ferme en rouge.</p>
          </div>
        </SectionCard>
      </div>

      <PerimeterNote d={d} />

      <SeriesCard d={d} />

      <ProvincesTable d={d} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CountsCard title="Fermes par statut" items={d.farms.byStatus} total={d.farms.total} />
        <CountsCard title="Fermes par cohorte" items={d.farms.byCohort} total={d.farms.total} />
      </div>

      <InputsCard d={d} />

      <ExportsCard filters={filters} aggregateOnly={aggregateOnly || d.scope.aggregateOnly} />

      <MethodNotes notes={d.notes} />
    </div>
  );
}

function SeriesCard({ d }: { d: PilotageDashboard }) {
  const k = d.scope.minGroupSize;
  const labels = d.series.map((w) => weekLabel(w.weekStart));
  const hidden = hiddenWeeks(d.series);
  return (
    <SectionCard title="Évolution par semaine" subtitle="Semaines du lundi au dimanche" icon={<Activity />}>
      {d.series.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune semaine dans la période.</p>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <MiniChart title="Mortalité (%)" data={d.series.map((w) => w.mortalityPct)} labels={labels} fmt={(v) => pctLabel(v)} color="#dc2626" />
            <MiniChart title="Volumes produits (t)" data={d.series.map((w) => w.producedTonnes)} labels={labels} fmt={(v) => tonnesLabel(v)} color="#0284c7" />
            <MiniChart title="Complétude (%)" data={d.series.map((w) => w.completenessPct)} labels={labels} fmt={(v) => pctLabel(v)} color="#059669" />
          </div>
          {hidden > 0 ? (
            <p className="mt-2 text-xs text-slate-500">
              {hidden} semaine{hidden > 1 ? 's' : ''} masquée{hidden > 1 ? 's' : ''} ({suppressedLabel(k)}) : absente{hidden > 1 ? 's' : ''} des courbes.
            </p>
          ) : null}
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-brand-700">Voir le tableau des semaines</summary>
            <div className="mt-2">
              <DataTable>
                <thead>
                  <tr>
                    <Th>Semaine du</Th>
                    <Th>Fermes</Th>
                    <Th>Morts</Th>
                    <Th>Mortalité</Th>
                    <Th>Produit</Th>
                    <Th>Complétude</Th>
                  </tr>
                </thead>
                <tbody>
                  {d.series.map((w) => (
                    <tr key={w.weekStart}>
                      <Td>{weekLabel(w.weekStart)}</Td>
                      <Td label="Fermes">{w.farms}</Td>
                      {w.suppressed ? (
                        <Td label="Chiffres" className="italic text-slate-400">
                          {suppressedLabel(k)}
                        </Td>
                      ) : (
                        <>
                          <Td label="Morts">{headsLabel(w.deaths)}</Td>
                          <Td label="Mortalité">{pctLabel(w.mortalityPct)}</Td>
                          <Td label="Produit">
                            {headsLabel(w.producedHeads)} · {tonnesLabel(w.producedTonnes)}
                          </Td>
                          <Td label="Complétude">{pctLabel(w.completenessPct)}</Td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>
          </details>
        </>
      )}
    </SectionCard>
  );
}

function MiniChart({ title, data, labels, fmt, color }: { title: string; data: (number | null)[]; labels: string[]; fmt: (v: number) => string; color: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-slate-600">{title}</p>
      <LineChart data={data} labels={labels} height={150} valueFmt={fmt} color={color} />
    </div>
  );
}

function ProvincesTable({ d }: { d: PilotageDashboard }) {
  const k = d.scope.minGroupSize;
  return (
    <SectionCard title="Par province" subtitle="Provinces ayant des fermes dans le périmètre et les filtres" flush>
      {d.provinces.length === 0 ? (
        <p className="p-4 text-sm text-slate-500">Aucune ferme dans le périmètre et les filtres.</p>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Province</Th>
              <Th>Fermes</Th>
              <Th>Effectif</Th>
              <Th>Mortalité</Th>
              <Th>Produit</Th>
              <Th className="hidden lg:table-cell">Vendu (vif)</Th>
              <Th className="hidden lg:table-cell">Chiffre d’affaires</Th>
              <Th>Complétude</Th>
              <Th>Alertes de conduite actives</Th>
            </tr>
          </thead>
          <tbody>
            {d.provinces.map((p) => {
              const pm = p.metrics;
              return (
                <tr key={p.provinceId || 'none'}>
                  <Td>
                    <span className="font-medium text-slate-800">{p.code ? `${p.code} · ` : ''}{p.name}</span>
                  </Td>
                  <Td label="Fermes">{p.farms}</Td>
                  {p.suppressed || !pm ? (
                    <Td label="Chiffres" className="italic text-slate-400">
                      {suppressedLabel(k)}
                    </Td>
                  ) : (
                    <>
                      <Td label="Effectif">{headsLabel(pm.headcount)}</Td>
                      <Td label="Mortalité">{pctLabel(pm.mortalityPct)}</Td>
                      <Td label="Produit">
                        {headsLabel(pm.produced.heads)} · {tonnesLabel(pm.produced.tonnes)}
                      </Td>
                      <Td label="Vendu (vif)" className="md:max-lg:hidden">
                        {headsLabel(pm.sold.liveHeads)}
                      </Td>
                      <Td label="Chiffre d’affaires" className="md:max-lg:hidden">
                        {fcfaLabel(pm.sold.revenueFcfa)}
                      </Td>
                      <Td label="Complétude">{pctLabel(pm.completeness.pct)}</Td>
                      <Td label="Alertes de conduite actives">
                        {pm.alerts.conduct.activeNow}
                        {pm.alerts.conduct.activeRedNow > 0 ? <span className="ml-1 text-amber-700">({pm.alerts.conduct.activeRedNow} rouges)</span> : null}
                      </Td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </SectionCard>
  );
}

// POUFA lot A pilot: what the figures count (programme parameters).
function conductLabel(d: PilotageDashboard): string {
  return d.perimeter?.conductAlerts.label ?? 'Alertes de conduite (conseil Fermia, non sanitaires)';
}

function PerimeterNote({ d }: { d: PilotageDashboard }) {
  const p = d.perimeter;
  if (!p) return null;
  return (
    <Note tone="slate">
      Périmètre du programme : {bandTypesLabel(p.eligibleBandTypes)}. Les autres bandes des fermes sont hors programme et ne comptent pas dans ces chiffres.
      {p.mortalityFormula ? ` Mortalité de la période = ${p.mortalityFormula.expression} (paramètre ${p.mortalityFormula.parameterKey}).` : ''}
    </Note>
  );
}

function CountsCard({ title, items, total }: { title: string; items: CountItem[]; total: number }) {
  return (
    <SectionCard title={title} icon={<Tractor />}>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune ferme.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => (
            <li key={i.code ?? 'none'}>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">{i.label}</span>
                <span className="font-medium tabular-nums text-slate-800">{i.count}</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${total > 0 ? (i.count / total) * 100 : 0}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

function InputsCard({ d }: { d: PilotageDashboard }) {
  const k = d.scope.minGroupSize;
  const i = d.inputs;
  return (
    <SectionCard
      title="Recoupement des intrants"
      subtitle={`Livraisons de l’État et stock déclaré face au stock compté · seuil d’écart ${pctLabel(i.thresholdPct)}`}
      icon={<Package />}
    >
      {!i.available ? (
        <p className="text-sm text-slate-500">Le module des intrants ne fournit pas encore de données.</p>
      ) : i.suppressed ? (
        <p className="text-sm italic text-slate-400">{suppressedSentence(k)}</p>
      ) : !i.figures ? (
        <p className="text-sm text-slate-500">Aucune livraison ni stock déclaré dans le périmètre.</p>
      ) : (
        <div className="grid gap-x-8 md:grid-cols-2">
          <div>
            <FigureRow label="Fermes concernées">{i.figures.farms}</FigureRow>
            <FigureRow label="Livraisons en attente">{i.figures.deliveries.pending}</FigureRow>
            <FigureRow label="Livraisons confirmées">{i.figures.deliveries.confirmed}</FigureRow>
            <FigureRow label="Livraisons annulées">{i.figures.deliveries.cancelled}</FigureRow>
          </div>
          <div>
            <FigureRow label="Livraisons avec écart reçu / expédié">
              <span className={i.figures.deliveries.withGap > 0 ? 'text-amber-700' : undefined}>{i.figures.deliveries.withGap}</span>
            </FigureRow>
            <FigureRow label="Lignes de stock comptées">{i.figures.stockLinesCounted}</FigureRow>
            <FigureRow label="Lignes au-delà du seuil">
              <span className={i.figures.stockLinesOverThreshold > 0 ? 'text-red-700' : undefined}>{i.figures.stockLinesOverThreshold}</span>
            </FigureRow>
            <FigureRow label="Fermes avec écart de stock">
              <span className="inline-flex items-center gap-1">
                {i.figures.farmsWithStockGap > 0 ? <ShieldAlert className="h-3.5 w-3.5 text-red-600" /> : null}
                {i.figures.farmsWithStockGap}
              </span>
            </FigureRow>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

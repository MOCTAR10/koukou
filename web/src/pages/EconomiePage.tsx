import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Banknote, BookOpen, Briefcase, ClipboardCheck, Download, Landmark, MapPinned, Scale, Search, Store, TrendingUp, Wallet, Warehouse } from 'lucide-react';
import { api } from '../api/client';
import type { EconomieFormat, EconomieRow, EconomieSynthese } from '../api/types-economie';
import { useFarm } from '../app/FarmContext';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useAuth } from '../auth/AuthContext';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { useProvinces } from '../components/access/queries';
import {
  ECONOMIE_VIEWS,
  availableViews,
  defaultPeriod,
  economieRights,
  effectiveView,
  exportFilename,
  exportPath,
  marginRate,
  marginTone,
  matchesSearch,
  missingAreas,
  periodError,
  sortByMargin,
  synthesePath,
  type EconomieFilters,
  type EconomieView,
} from '../components/economie/economie';
import { Button, ErrorNote, Field, inputCls, DateInput } from '../components/form';
import { Card, DataTable, EmptyState, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { classNames, fcfa, num, pct, plural } from '../lib/format';

const FORMATS: Array<{ format: EconomieFormat; label: string }> = [
  { format: 'csv', label: 'CSV' },
  { format: 'xlsx', label: 'Excel' },
];

const marginCls = (m: number | null) =>
  classNames('whitespace-nowrap text-right font-semibold tabular-nums', marginTone(m) === 'bad' ? 'text-red-600' : marginTone(m) === 'good' ? 'text-emerald-600' : 'text-slate-700');

/**
 * POUFA lot A droits: programme economic synthesis for the DGE (and any
 * profile granted ECONOMIQUE, on its scope): sales, collected cash, expenses,
 * margin, payroll and feed stock per farm and per province, exportable. A
 * column the profile is not granted comes empty from the server and is left
 * out here. Clicking a farm opens its profitability.
 */
export function EconomiePage() {
  const { user } = useAuth();
  const inst = useInstitutionAccess();
  const rights = economieRights(user?.role, inst.access?.profile);
  const { setFarm } = useFarm();
  const navigate = useNavigate();
  const provinces = useProvinces();
  const [filters, setFilters] = useState<EconomieFilters>(() => ({ ...defaultPeriod(), provinceId: '' }));
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<EconomieView>('ventes');
  const [busy, setBusy] = useState<EconomieFormat | null>(null);
  const [exportError, setExportError] = useState<unknown>(null);
  const invalid = periodError(filters);

  const synthese = useQuery({
    queryKey: ['economie-synthese', filters],
    queryFn: () => api.get<EconomieSynthese>(synthesePath(filters)),
    enabled: rights.view && !invalid,
    placeholderData: keepPreviousData,
  });

  const data = synthese.data;
  const farms = useMemo(() => sortByMargin((data?.farms ?? []).filter((r) => matchesSearch(r, q))), [data, q]);

  if (inst.pending) return <Loading label="Chargement de votre accès…" />;
  if (!rights.view) return <PageNotOpen />;

  const cols = data?.columns ?? { sales: true, collected: true, payroll: true, stock: true };
  const total = data?.total;
  const views = availableViews(cols);
  const view = effectiveView(picked, cols) ?? 'ventes';
  const missing = missingAreas(cols);

  const runExport = async (format: EconomieFormat) => {
    setBusy(format);
    setExportError(null);
    try {
      await api.download(exportPath(filters, format), exportFilename(filters, format));
    } catch (err) {
      setExportError(err);
    } finally {
      setBusy(null);
    }
  };

  const openFarm = (row: EconomieRow) => {
    if (!row.farmId) return;
    setFarm(row.farmId);
    navigate(view === 'comptabilite' ? '/app/accounting' : view === 'market' ? '/app/market' : view === 'production' ? '/app/batches' : view === 'biosecurite' ? '/app/visites' : '/app/reports');
  };

  const kg = (v: number | null) => (v != null ? `${num(v, 0)} kg` : '—');
  const count = (v: number | null) => (v != null ? num(v, 0) : '—');
  const cell = 'whitespace-nowrap text-right tabular-nums';

  const salesFigures = (r: EconomieRow) => (
    <>
      {cols.sales ? (
        <Td label="Chiffre d’affaires" className={cell}>
          {fcfa(r.salesFcfa)}
          {r.salesCount != null ? <span className="block text-xs text-slate-500">{num(r.salesCount, 0)} vente(s)</span> : null}
        </Td>
      ) : null}
      {cols.collected ? (
        <Td label="Encaissé" className={`${cell} md:max-xl:hidden`}>
          {fcfa(r.collectedFcfa)}
        </Td>
      ) : null}
      <Td label="Charges" className={cell}>
        {fcfa(r.expensesFcfa)}
      </Td>
      <Td label="Marge" className={marginCls(r.marginFcfa)}>
        {fcfa(r.marginFcfa)}
        <span className="block text-xs font-normal text-slate-500">{pct(marginRate(r))}</span>
      </Td>
      {cols.payroll ? (
        <Td label="Masse salariale / mois" className={`${cell} md:max-lg:hidden`}>
          {fcfa(r.payrollMonthlyFcfa)}
          {r.employeeCount != null ? <span className="block text-xs text-slate-500">{num(r.employeeCount, 0)} employé(s)</span> : null}
        </Td>
      ) : null}
      {cols.stock ? (
        <Td label="Stock aliment" className={`${cell} md:max-xl:hidden`}>
          {kg(r.feedStockKg)}
        </Td>
      ) : null}
    </>
  );

  const salesHeads = (
    <>
      {cols.sales ? <Th className="text-right">Chiffre d’affaires</Th> : null}
      {cols.collected ? <Th className="hidden text-right xl:table-cell">Encaissé</Th> : null}
      <Th className="text-right">Charges</Th>
      <Th className="text-right">Marge</Th>
      {cols.payroll ? <Th className="hidden text-right lg:table-cell">Masse salariale / mois</Th> : null}
      {cols.stock ? <Th className="hidden text-right xl:table-cell">Stock aliment</Th> : null}
    </>
  );

  // POUFA lot A2 dge: SYSCOHADA, Market and production column groups.
  const accountingFigures = (r: EconomieRow) => (
    <>
      <Td label="Produits (classe 7)" className={cell}>{fcfa(r.accountingProductsFcfa)}</Td>
      <Td label="Charges (classe 6)" className={cell}>{fcfa(r.accountingChargesFcfa)}</Td>
      <Td label="Résultat" className={marginCls(r.accountingResultFcfa)}>{fcfa(r.accountingResultFcfa)}</Td>
      <Td label="Trésorerie" className={`${cell} md:max-lg:hidden`}>{fcfa(r.treasuryFcfa)}</Td>
      <Td label="Créances clients" className={`${cell} md:max-xl:hidden`}>{fcfa(r.receivablesFcfa)}</Td>
    </>
  );
  const accountingHeads = (
    <>
      <Th className="text-right">Produits (classe 7)</Th>
      <Th className="text-right">Charges (classe 6)</Th>
      <Th className="text-right">Résultat</Th>
      <Th className="hidden text-right lg:table-cell">Trésorerie</Th>
      <Th className="hidden text-right xl:table-cell">Créances clients</Th>
    </>
  );

  const marketFigures = (r: EconomieRow) => (
    <>
      <Td label="Demandes" className={cell}>
        {count(r.marketRequests)}
        {r.marketAccepted != null ? <span className="block text-xs text-slate-500">{num(r.marketAccepted, 0)} acceptée(s)</span> : null}
      </Td>
      <Td label="Livrées" className={cell}>{count(r.marketDelivered)}</Td>
      <Td label="Ventes livrées" className={cell}>{fcfa(r.marketSalesFcfa)}</Td>
      <Td label="Poulets vifs" className={`${cell} md:max-lg:hidden`}>{count(r.marketBirds)}</Td>
      <Td label="Carcasses" className={`${cell} md:max-xl:hidden`}>{count(r.marketCarcasses)}</Td>
    </>
  );
  const marketHeads = (
    <>
      <Th className="text-right">Demandes</Th>
      <Th className="text-right">Livrées</Th>
      <Th className="text-right">Ventes livrées</Th>
      <Th className="hidden text-right lg:table-cell">Poulets vifs (têtes)</Th>
      <Th className="hidden text-right xl:table-cell">Carcasses (pièces)</Th>
    </>
  );

  const productionFigures = (r: EconomieRow) => (
    <>
      <Td label="Complétude" className={cell}>{pct(r.completenessPct)}</Td>
      <Td label="Volumes (têtes)" className={cell}>{count(r.producedHeads)}</Td>
      <Td label="Volumes (poids vif)" className={cell}>{kg(r.producedKg)}</Td>
    </>
  );
  const productionHeads = (
    <>
      <Th className="text-right">Complétude</Th>
      <Th className="text-right">Volumes produits (têtes)</Th>
      <Th className="text-right">Volumes produits (poids vif)</Th>
    </>
  );

  // Biosecurity: a farm row shows its latest control, a group row the distribution.
  const bioFigures = (r: EconomieRow) =>
    r.farmId ? (
      <>
        <Td label="Classe" className={cell}>{r.bioClass ?? '—'}</Td>
        <Td label="Score" className={cell}>{pct(r.bioScorePct ?? null)}</Td>
        <Td label="Date du contrôle" className={cell}>{r.bioDate ?? '—'}</Td>
      </>
    ) : (
      <>
        <Td label="Classe A / B / C" className={cell}>{`${count(r.bioA ?? null)} / ${count(r.bioB ?? null)} / ${count(r.bioC ?? null)}`}</Td>
        <Td label="Jamais contrôlées" className={cell}>{count(r.bioNever ?? null)}</Td>
        <Td label="Score moyen" className={cell}>{pct(r.bioAverageScorePct ?? null)}</Td>
      </>
    );
  const bioHeads = (
    <>
      <Th className="text-right">Classe (ou A / B / C)</Th>
      <Th className="text-right">Score (ou jamais contrôlées)</Th>
      <Th className="text-right">Date (ou score moyen)</Th>
    </>
  );

  const figures = { ventes: salesFigures, comptabilite: accountingFigures, market: marketFigures, production: productionFigures, biosecurite: bioFigures }[view];
  const figureHeads = { ventes: salesHeads, comptabilite: accountingHeads, market: marketHeads, production: productionHeads, biosecurite: bioHeads }[view];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Synthèse économique du programme"
        subtitle="Ventes, charges, marge, comptabilité, Market, salaires, stock, complétude et volumes des fermes de votre périmètre, par province. Chaque consultation et chaque export sont journalisés."
        icon={<Landmark />}
        actions={FORMATS.map(({ format, label }) => (
          <Button key={format} tone="secondary" disabled={!!invalid} busy={busy === format} onClick={() => void runExport(format)}>
            <Download className="h-4 w-4" /> {label}
          </Button>
        ))}
      />

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Du">
            <DateInput className={inputCls} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </Field>
          <Field label="Au">
            <DateInput className={inputCls} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
          </Field>
          <Field label="Province">
            <select className={inputCls} value={filters.provinceId} onChange={(e) => setFilters((f) => ({ ...f, provinceId: e.target.value }))}>
              <option value="">Toutes les provinces</option>
              {(provinces.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Rechercher une ferme">
            <span className="relative block">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input className={`${inputCls} pl-9`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nom, code ou province" />
            </span>
          </Field>
        </div>
        {invalid ? <p className="mt-2 text-sm text-red-600">{invalid}</p> : null}
      </Card>

      <ErrorNote error={synthese.error ?? exportError} />

      {synthese.isLoading ? (
        <Loading label="Calcul de la synthèse…" />
      ) : !data || !total ? null : (
        <>
          {view === 'ventes' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {cols.sales ? (
                <StatCard label="Chiffre d’affaires" value={fcfa(total.salesFcfa)} hint={`${plural(total.salesCount ?? 0, 'vente')} · ${plural(total.farmCount ?? data.farms.length, 'ferme')}`} icon={<TrendingUp />} tone="accent" />
              ) : null}
              <StatCard label="Charges" value={fcfa(total.expensesFcfa)} hint={cols.collected ? `Encaissé : ${fcfa(total.collectedFcfa)}` : undefined} icon={<Wallet />} />
              <StatCard label="Marge" value={fcfa(total.marginFcfa)} hint={pct(marginRate(total))} icon={<Banknote />} tone={marginTone(total.marginFcfa)} />
              {cols.payroll ? (
                <StatCard label="Masse salariale mensuelle" value={fcfa(total.payrollMonthlyFcfa)} hint={`${plural(total.employeeCount ?? 0, 'employé actif', 'employés actifs')}`} icon={<Briefcase />} />
              ) : cols.stock ? (
                <StatCard label="Stock d’aliment" value={kg(total.feedStockKg)} icon={<Warehouse />} />
              ) : null}
            </div>
          ) : view === 'comptabilite' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Produits (classe 7)" value={fcfa(total.accountingProductsFcfa)} hint={`Charges : ${fcfa(total.accountingChargesFcfa)}`} icon={<BookOpen />} tone="accent" />
              <StatCard label="Résultat SYSCOHADA" value={fcfa(total.accountingResultFcfa)} hint="Produits − charges de la période" icon={<Scale />} tone={marginTone(total.accountingResultFcfa)} />
              <StatCard label="Trésorerie" value={fcfa(total.treasuryFcfa)} hint={`Au ${data.to}`} icon={<Wallet />} />
              <StatCard label="Créances clients" value={fcfa(total.receivablesFcfa)} hint={`Au ${data.to}`} icon={<Banknote />} />
            </div>
          ) : view === 'market' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Demandes Market" value={count(total.marketRequests)} hint={`${count(total.marketAccepted)} acceptée(s)`} icon={<Store />} tone="accent" />
              <StatCard label="Commandes livrées" value={count(total.marketDelivered)} icon={<ClipboardCheck />} />
              <StatCard label="Ventes Market livrées" value={fcfa(total.marketSalesFcfa)} icon={<TrendingUp />} />
              <StatCard label="Volumes livrés" value={`${count(total.marketBirds)} poulet(s)`} hint={`${count(total.marketCarcasses)} carcasse(s)`} icon={<Warehouse />} />
            </div>
          ) : view === 'biosecurite' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Fermes contrôlées" value={pct(total.bioControlledPct ?? null)} hint={`${count(total.bioNever ?? null)} jamais contrôlée(s)`} icon={<ClipboardCheck />} tone="accent" />
              <StatCard label="Classe A" value={count(total.bioA ?? null)} icon={<ClipboardCheck />} />
              <StatCard label="Classes B et C" value={`${count(total.bioB ?? null)} / ${count(total.bioC ?? null)}`} hint={`${count(total.bioStale ?? null)} contrôle(s) ancien(s)`} icon={<Scale />} />
              <StatCard label="Score moyen" value={pct(total.bioAverageScorePct ?? null)} hint="Dernier contrôle de chaque ferme contrôlée" icon={<TrendingUp />} />
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <StatCard label="Complétude des saisies" value={pct(total.completenessPct)} hint="Formule du programme (FORMULE_COMPLETUDE_PCT)" icon={<ClipboardCheck />} tone="accent" />
              <StatCard label="Volumes produits" value={`${count(total.producedHeads)} tête(s)`} hint="Formule FORMULE_VOLUME_PRODUIT_TETES" icon={<TrendingUp />} />
              <StatCard label="Poids vif produit" value={kg(total.producedKg)} hint="Formule FORMULE_VOLUME_PRODUIT_KG" icon={<Scale />} />
            </div>
          )}

          {missing.length > 0 ? (
            <p className="text-xs text-slate-500">Certaines colonnes ne sont pas affichées : votre profil n’ouvre pas {missing.join(', ')}.</p>
          ) : null}

          {views.length > 1 ? (
            <div role="tablist" aria-label="Colonnes affichées" className="flex flex-wrap gap-1 border-b border-slate-200">
              {ECONOMIE_VIEWS.filter((v) => views.includes(v.key)).map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={view === v.key}
                  onClick={() => setPicked(v.key)}
                  className={classNames(
                    '-mb-px border-b-2 px-3.5 py-2 text-sm font-semibold transition',
                    view === v.key ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-800',
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          ) : null}

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
              <MapPinned className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-700">Par province ({data.provinces.length})</h2>
            </div>
            {data.provinces.length === 0 ? (
              <div className="p-4">
                <EmptyState message="Aucune ferme dans le périmètre pour ces critères." icon={<MapPinned />} />
              </div>
            ) : (
              <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Province</Th>
                    <Th className="text-right">Fermes</Th>
                    {figureHeads}
                  </tr>
                </thead>
                <tbody>
                  {data.provinces.map((r) => (
                    <tr key={r.provinceCode ?? 'none'} className="border-t border-slate-100">
                      <Td className="font-medium text-slate-900">{r.provinceName ?? 'Sans province'}</Td>
                      <Td label="Fermes" className="text-right tabular-nums">{num(r.farmCount ?? 0, 0)}</Td>
                      {figures(r)}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
              <Landmark className="h-4 w-4 text-brand-600" />
              <h2 className="text-sm font-semibold text-slate-700">Par ferme ({farms.length})</h2>
              <span className="text-xs text-slate-400">Marge la plus faible en premier ; cliquez une ferme pour ouvrir sa page {view === 'comptabilite' ? 'comptable' : view === 'market' ? 'Market' : view === 'production' ? 'des lots' : view === 'biosecurite' ? 'des visites' : 'de rentabilité'}.</span>
            </div>
            {farms.length === 0 ? (
              <div className="p-4">
                <EmptyState message={q ? 'Aucune ferme ne correspond à la recherche.' : 'Aucune ferme dans le périmètre pour ces critères.'} icon={<Landmark />} />
              </div>
            ) : (
              <DataTable>
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Ferme</Th>
                    <Th className="hidden lg:table-cell">Province</Th>
                    {figureHeads}
                  </tr>
                </thead>
                <tbody>
                  {farms.map((r) => (
                    <tr key={r.farmId ?? r.code} onClick={() => openFarm(r)} className="cursor-pointer border-t border-slate-100 hover:bg-slate-50">
                      <Td className="font-medium text-slate-900">
                        <button
                          type="button"
                          className="text-left text-brand-700 hover:underline"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFarm(r);
                          }}
                        >
                          {r.name ?? '—'}
                        </button>
                        {r.code ? <span className="block font-mono text-xs font-normal text-slate-500">{r.code}</span> : null}
                      </Td>
                      <Td label="Province" className="md:max-lg:hidden">{r.provinceName ?? '—'}</Td>
                      {figures(r)}
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </Card>
          <p className="text-xs text-slate-400">
            Chiffre d’affaires = ventes non annulées de la période ; charges = dépenses de la période ; marge et taux de marge = formules du programme
            (FORMULE_MARGE_FCFA, FORMULE_TAUX_MARGE). La masse salariale est celle des employés actifs (salaire mensuel des dossiers RH), le stock celui
            de l’aliment disponible aujourd’hui. Comptabilité : produits (classe 7) et charges (classe 6) de la période, trésorerie (classe 5) et créances
            clients (411, 416) en fin de période. Market : demandes reçues et acceptées, commandes livrées dans la période. Complétude et volumes produits :
            bandes du programme, formules FORMULE_COMPLETUDE_PCT et FORMULE_VOLUME_PRODUIT_* en vigueur.
          </p>
        </>
      )}
    </div>
  );
}

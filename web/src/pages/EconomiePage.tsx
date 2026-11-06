import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Banknote, Briefcase, Download, Landmark, MapPinned, Search, TrendingUp, Wallet, Warehouse } from 'lucide-react';
import { api } from '../api/client';
import type { EconomieFormat, EconomieRow, EconomieSynthese } from '../api/types-economie';
import { useFarm } from '../app/FarmContext';
import { useInstitutionAccess } from '../app/useInstitutionAccess';
import { useAuth } from '../auth/AuthContext';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { useProvinces } from '../components/access/queries';
import {
  defaultPeriod,
  economieRights,
  exportFilename,
  exportPath,
  marginRate,
  marginTone,
  matchesSearch,
  periodError,
  sortByMargin,
  synthesePath,
  type EconomieFilters,
} from '../components/economie/economie';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { Card, DataTable, EmptyState, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { classNames, fcfa, num, pct } from '../lib/format';

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
    navigate('/app/reports');
  };

  const figures = (r: EconomieRow) => (
    <>
      {cols.sales ? (
        <Td label="Chiffre d’affaires" className="whitespace-nowrap text-right tabular-nums">
          {fcfa(r.salesFcfa)}
          {r.salesCount != null ? <span className="block text-xs text-slate-500">{num(r.salesCount, 0)} vente(s)</span> : null}
        </Td>
      ) : null}
      {cols.collected ? (
        <Td label="Encaissé" className="whitespace-nowrap text-right tabular-nums md:max-xl:hidden">
          {fcfa(r.collectedFcfa)}
        </Td>
      ) : null}
      <Td label="Charges" className="whitespace-nowrap text-right tabular-nums">
        {fcfa(r.expensesFcfa)}
      </Td>
      <Td label="Marge" className={marginCls(r.marginFcfa)}>
        {fcfa(r.marginFcfa)}
        <span className="block text-xs font-normal text-slate-500">{pct(marginRate(r))}</span>
      </Td>
      {cols.payroll ? (
        <Td label="Masse salariale / mois" className="whitespace-nowrap text-right tabular-nums md:max-lg:hidden">
          {fcfa(r.payrollMonthlyFcfa)}
          {r.employeeCount != null ? <span className="block text-xs text-slate-500">{num(r.employeeCount, 0)} employé(s)</span> : null}
        </Td>
      ) : null}
      {cols.stock ? (
        <Td label="Stock aliment" className="whitespace-nowrap text-right tabular-nums md:max-xl:hidden">
          {r.feedStockKg != null ? `${num(r.feedStockKg, 0)} kg` : '—'}
        </Td>
      ) : null}
    </>
  );

  const figureHeads = (
    <>
      {cols.sales ? <Th className="text-right">Chiffre d’affaires</Th> : null}
      {cols.collected ? <Th className="hidden text-right xl:table-cell">Encaissé</Th> : null}
      <Th className="text-right">Charges</Th>
      <Th className="text-right">Marge</Th>
      {cols.payroll ? <Th className="hidden text-right lg:table-cell">Masse salariale / mois</Th> : null}
      {cols.stock ? <Th className="hidden text-right xl:table-cell">Stock aliment</Th> : null}
    </>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Synthèse économique du programme"
        subtitle="Ventes, charges, marge, salaires et stock des fermes de votre périmètre, par province. Chaque consultation et chaque export sont journalisés."
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
            <input type="date" className={inputCls} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))} />
          </Field>
          <Field label="Au">
            <input type="date" className={inputCls} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))} />
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
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {cols.sales ? (
              <StatCard label="Chiffre d’affaires" value={fcfa(total.salesFcfa)} hint={`${num(total.salesCount ?? 0, 0)} vente(s) · ${num(total.farmCount ?? data.farms.length, 0)} ferme(s)`} icon={<TrendingUp />} tone="accent" />
            ) : null}
            <StatCard label="Charges" value={fcfa(total.expensesFcfa)} hint={cols.collected ? `Encaissé : ${fcfa(total.collectedFcfa)}` : undefined} icon={<Wallet />} />
            <StatCard label="Marge" value={fcfa(total.marginFcfa)} hint={pct(marginRate(total))} icon={<Banknote />} tone={marginTone(total.marginFcfa)} />
            {cols.payroll ? (
              <StatCard label="Masse salariale mensuelle" value={fcfa(total.payrollMonthlyFcfa)} hint={`${num(total.employeeCount ?? 0, 0)} employé(s) actif(s)`} icon={<Briefcase />} />
            ) : cols.stock ? (
              <StatCard label="Stock d’aliment" value={total.feedStockKg != null ? `${num(total.feedStockKg, 0)} kg` : '—'} icon={<Warehouse />} />
            ) : null}
          </div>

          {!cols.sales || !cols.payroll || !cols.collected || !cols.stock ? (
            <p className="text-xs text-slate-500">
              Certaines colonnes ne sont pas affichées : votre profil n’ouvre pas{' '}
              {[!cols.sales && 'les ventes', !cols.collected && 'la caisse', !cols.payroll && 'les salaires (Équipe et RH)', !cols.stock && 'le stock (Intrants)']
                .filter(Boolean)
                .join(', ')}
              .
            </p>
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
              <span className="text-xs text-slate-400">Marge la plus faible en premier ; cliquez une ferme pour ouvrir sa rentabilité.</span>
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
            Chiffre d’affaires = ventes non annulées de la période ; charges = dépenses de la période ; marge = chiffre d’affaires − charges. La masse
            salariale est celle des employés actifs (salaire mensuel des dossiers RH), le stock celui de l’aliment disponible aujourd’hui.
          </p>
        </>
      )}
    </div>
  );
}

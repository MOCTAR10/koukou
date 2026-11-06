import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookMarked, ChevronLeft, ChevronRight, FileUp, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import type { RegistryFarmPage } from '../api/types-programme';
import { useMenuAccess } from '../app/useMenuAccess';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote, inputCls } from '../components/form';
import { useFarmStatusItems } from '../components/programme/FarmStatusModal';
import { FarmFormModal } from '../components/registry/FarmFormModal';
import { ImportModal } from '../components/registry/ImportModal';
import { useProgrammeList, useProvinces } from '../components/registry/queries';
import { registryRights } from '../components/registry/registryAccess';
import {
  hasActiveFilter,
  localitesOf,
  pageCount,
  pageRangeLabel,
  parseRegistryParams,
  REGISTRY_PAGE_SIZE,
  registryParamsOf,
  registryQueryString,
  withFilter,
  type RegistryFilters,
} from '../components/registry/registryQuery';
import { RegistrySheetPanel } from '../components/registry/RegistrySheetPanel';
import { RegistryStatusPill } from '../components/registry/shared';
import { Card, DataTable, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { num } from '../lib/format';

/** URL parameter of the open sheet: `/app/registre?ferme=<id>` (linked from the platform). */
const SHEET_PARAM = 'ferme';

/**
 * Farm registry of the programme (POUFA §5.1): every farm is created here (or
 * imported), then handed to its exploitant. Filters live in the URL, the
 * server filters and pages (the scope of an institution included).
 */
export function RegistryPage() {
  const { user } = useAuth();
  const { canOpenRegistry } = useMenuAccess();
  const rights = registryRights(user?.role);
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseRegistryParams(params), [params]);
  const openId = params.get(SHEET_PARAM);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState(filters.q);
  const writtenQ = useRef(filters.q);

  const provinces = useProvinces(canOpenRegistry);
  const cohorts = useProgrammeList('COHORTE', canOpenRegistry);
  const statuses = useFarmStatusItems();
  const qs = registryQueryString(filters, REGISTRY_PAGE_SIZE);
  const list = useQuery({
    queryKey: ['programme-farms', qs],
    queryFn: () => api.get<RegistryFarmPage>(`/programme/farms${qs}`),
    placeholderData: keepPreviousData,
    enabled: canOpenRegistry,
  });

  const update = (next: RegistryFilters) => setParams(registryParamsOf(next, params), { replace: true });
  const setFilter = <K extends keyof RegistryFilters>(key: K, value: RegistryFilters[K]) =>
    update(withFilter(filters, key, value, provinces.data));
  const openSheet = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set(SHEET_PARAM, id);
    else next.delete(SHEET_PARAM);
    setParams(next);
  };

  // The search box writes the URL once typing pauses; the URL wins when it changes otherwise (back, « effacer »).
  useEffect(() => {
    const typed = q.trim();
    const t = window.setTimeout(() => {
      writtenQ.current = typed;
      setParams(
        (prev) => {
          const current = parseRegistryParams(prev);
          return current.q === typed ? prev : registryParamsOf(withFilter(current, 'q', typed), prev);
        },
        { replace: true },
      );
    }, 350);
    return () => window.clearTimeout(t);
  }, [q, setParams]);
  useEffect(() => {
    if (filters.q === writtenQ.current) return;
    writtenQ.current = filters.q;
    setQ(filters.q);
  }, [filters.q]);

  if (!canOpenRegistry) return <Navigate to="/app" replace />;

  const data = list.data;
  const pages = data ? pageCount(data.total, data.pageSize) : 1;
  const localites = localitesOf(provinces.data ?? [], filters.province).filter((l) => l.active || l.id === filters.localiteId);
  const provinceOfLocalite = new Map((provinces.data ?? []).flatMap((p) => p.localites.map((l) => [l.id, p.code] as const)));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Registre des fermes"
        icon={<BookMarked />}
        subtitle="Fermes du programme POUFA : fiche, statut, position, infrastructures et compte de l’exploitant."
        actions={
          <>
            {rights.import ? (
              <Button tone="secondary" onClick={() => setImporting(true)}>
                <FileUp className="h-4 w-4" /> Importer un CSV
              </Button>
            ) : null}
            {rights.edit ? (
              <Button onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> Nouvelle ferme
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, code, exploitant, téléphone ou référence AMI…"
              aria-label="Rechercher une ferme"
              className={`${inputCls} pl-9`}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <select aria-label="Province" className={inputCls} value={filters.province} onChange={(e) => setFilter('province', e.target.value)}>
            <option value="">Toutes les provinces</option>
            {(provinces.data ?? []).map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select aria-label="Localité" className={inputCls} value={filters.localiteId} onChange={(e) => setFilter('localiteId', e.target.value)}>
            <option value="">Toutes les localités</option>
            {localites.map((l) => (
              <option key={l.id} value={l.id}>
                {filters.province ? l.name : `${l.name} (${provinceOfLocalite.get(l.id) ?? ''})`}
              </option>
            ))}
          </select>
          <select aria-label="Cohorte" className={inputCls} value={filters.cohort} onChange={(e) => setFilter('cohort', e.target.value)}>
            <option value="">Toutes les cohortes</option>
            {(cohorts.data ?? []).map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
          <select aria-label="Statut" className={inputCls} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">Tous les statuts</option>
            {(statuses.data ?? []).map((s) => (
              <option key={s.code} value={s.code}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
        {hasActiveFilter(filters) ? (
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline"
            onClick={() => {
              setQ('');
              writtenQ.current = '';
              update({ province: '', localiteId: '', cohort: '', status: '', q: '', page: 1 });
            }}
          >
            Effacer les filtres
          </button>
        ) : null}
      </Card>

      <ErrorNote error={list.error ?? provinces.error} />

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="p-4">
            <Loading label="Chargement du registre…" />
          </div>
        ) : !data?.items.length ? (
          <div className="p-4">
            <EmptyState
              icon={<BookMarked />}
              message={
                hasActiveFilter(filters)
                  ? 'Aucune ferme ne correspond à ces critères.'
                  : 'Le registre est vide. Enregistrez une ferme ou importez la liste du programme.'
              }
            />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Ferme</Th>
                <Th>Province</Th>
                <Th className="hidden lg:table-cell">Localité</Th>
                <Th>Exploitant</Th>
                <Th>Statut</Th>
                <Th className="hidden lg:table-cell">Compte</Th>
                <Th className="hidden lg:table-cell">GPS</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((f) => (
                <tr
                  key={f.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                  onClick={() => openSheet(f.id)}
                >
                  <Td>
                    <button
                      type="button"
                      className="text-left"
                      onClick={(e) => {
                        e.stopPropagation();
                        openSheet(f.id);
                      }}
                    >
                      <span className="block font-mono text-xs font-semibold text-slate-500">{f.code ?? 'Sans code'}</span>
                      <span className="font-medium text-slate-900 hover:underline">{f.name}</span>
                    </button>
                  </Td>
                  <Td label="Province">{f.province ? `${f.province.code} · ${f.province.name}` : '—'}</Td>
                  <Td label="Localité" className="md:max-lg:hidden">
                    {f.localite?.name ?? '—'}
                  </Td>
                  <Td label="Exploitant">
                    <span className="block">{f.exploitantName ?? '—'}</span>
                    {f.exploitantPhone ? <span className="block font-mono text-xs text-slate-500">{f.exploitantPhone}</span> : null}
                    {/* The account column is hidden between md and lg: say it here. */}
                    <span className="hidden text-xs text-slate-500 md:max-lg:block">{f.hasOwnerAccount ? 'Compte activé' : 'Compte non activé'}</span>
                  </Td>
                  <Td label="Statut">
                    <RegistryStatusPill status={f.status} active={f.active} />
                  </Td>
                  <Td label="Compte" className="md:max-lg:hidden">
                    {f.hasOwnerAccount ? (
                      <span className="text-emerald-700">Activé</span>
                    ) : (
                      <span className="text-slate-500">Non activé</span>
                    )}
                  </Td>
                  <Td label="GPS" className="md:max-lg:hidden">
                    {f.gpsProvinceWarning ? (
                      <span className="inline-flex items-center gap-1 text-amber-700" title={f.gpsProvinceWarning}>
                        <AlertTriangle className="h-4 w-4" /> Hors province
                      </span>
                    ) : (
                      ''
                    )}
                  </Td>
                  <Td className="row-chevron w-8">
                    <ChevronRight className="h-4 w-4 text-slate-300" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {data && data.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600">
            <span>
              {pageRangeLabel(data.total, data.page, data.pageSize)} {list.isFetching ? <span className="text-slate-400">· mise à jour…</span> : null}
            </span>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <Button tone="secondary" disabled={data.page <= 1} onClick={() => setFilter('page', data.page - 1)} aria-label="Page précédente">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  Page {num(data.page, 0)} / {num(pages, 0)}
                </span>
                <Button tone="secondary" disabled={data.page >= pages} onClick={() => setFilter('page', data.page + 1)} aria-label="Page suivante">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {openId ? <RegistrySheetPanel farmId={openId} rights={rights} onClose={() => openSheet(null)} /> : null}
      {creating ? (
        <FarmFormModal
          onClose={() => setCreating(false)}
          onSaved={(sheet) => {
            setCreating(false);
            openSheet(sheet.id);
          }}
        />
      ) : null}
      {importing ? <ImportModal onClose={() => setImporting(false)} /> : null}
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Navigate, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, ArrowUpDown, BookMarked, ChevronLeft, ChevronRight, FileUp, MapPin, Plus, Search } from 'lucide-react';
import { api } from '../api/client';
import type { RegistryFarmPage, RegistryFarmRow } from '../api/types-programme';
import { useMenuAccess } from '../app/useMenuAccess';
import { Button, ErrorNote, inputCls } from '../components/form';
import { useFarmStatusItems } from '../components/programme/FarmStatusModal';
import { FarmFormModal } from '../components/registry/FarmFormModal';
import { ImportModal } from '../components/registry/ImportModal';
import { useProgrammeList, useProvinces } from '../components/registry/queries';
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
import { Card, DataTable, EmptyState, Loading, PageHeader, SkeletonRows, StatusBadge, Td, Th } from '../components/ui';
import { classNames, num } from '../lib/format';

/** URL parameter of the open sheet: `/app/registre?ferme=<id>` (linked from the platform). */
const SHEET_PARAM = 'ferme';

type SortKey = 'name' | 'province' | 'exploitant' | 'status' | 'account';
const SORT_VALUE: Record<SortKey, (f: RegistryFarmRow) => string> = {
  name: (f) => f.name,
  province: (f) => f.province?.code ?? '~',
  exploitant: (f) => f.exploitantName ?? '~',
  status: (f) => f.status?.label ?? '~',
  account: (f) => (f.hasOwnerAccount ? '0' : '1'),
};

/** Header cell that sorts the rows of the page on screen (the server has no sort option). */
function SortTh({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: 'asc' | 'desc' } | null;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <Th className={className}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        aria-label={`Trier par ${label.toLowerCase()}`}
        className={classNames('inline-flex items-center gap-1 uppercase tracking-wide hover:text-slate-800', active && 'text-slate-900')}
      >
        {label}
        <Icon className={classNames('h-3 w-3', !active && 'text-slate-300')} />
      </button>
    </Th>
  );
}

/**
 * Farm registry of the programme (POUFA §5.1): every farm is created here (or
 * imported), then handed to its exploitant. Filters live in the URL, the
 * server filters and pages (the scope of an institution included).
 */
export function RegistryPage() {
  const { registry: rights, isLoading: accessLoading } = useMenuAccess();
  const canOpenRegistry = rights.view;
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => parseRegistryParams(params), [params]);
  const openId = params.get(SHEET_PARAM);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [q, setQ] = useState(filters.q);
  const writtenQ = useRef(filters.q);
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null);

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

  // An institution's access profile may still be loading: wait before sending it away.
  if (!canOpenRegistry) return accessLoading ? <Loading /> : <Navigate to="/app" replace />;

  const data = list.data;
  // The server fills biosecurity only for a profile that reads TECHNIQUE.
  const showBiosecurity = data?.biosecurityStaleAfterDays != null;
  const onSort = (key: SortKey) =>
    setSort((prev) => (prev?.key !== key ? { key, dir: 'asc' } : prev.dir === 'asc' ? { key, dir: 'desc' } : null));
  const rows = useMemo(() => {
    const items = data?.items ?? [];
    if (!sort) return items;
    const value = SORT_VALUE[sort.key];
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => sign * value(a).localeCompare(value(b), 'fr', { sensitivity: 'base', numeric: true }));
  }, [data, sort]);
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
            {rights.create ? (
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
          {showBiosecurity || filters.biosecurity ? (
            <select aria-label="Biosécurité" className={inputCls} value={filters.biosecurity} onChange={(e) => setFilter('biosecurity', e.target.value)}>
              <option value="">Toutes les classes de biosécurité</option>
              <option value="A">Classe A</option>
              <option value="B">Classe B</option>
              <option value="C">Classe C</option>
              <option value="NONE">Jamais contrôlées</option>
            </select>
          ) : null}
        </div>
        {hasActiveFilter(filters) ? (
          <button
            type="button"
            className="text-xs font-semibold text-brand-700 hover:underline"
            onClick={() => {
              setQ('');
              writtenQ.current = '';
              update({ province: '', localiteId: '', cohort: '', status: '', biosecurity: '', q: '', page: 1 });
            }}
          >
            Effacer les filtres
          </button>
        ) : null}
      </Card>

      <ErrorNote error={list.error ?? provinces.error} />

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <SkeletonRows rows={8} label="Chargement du registre…" />
        ) : !data?.items.length ? (
          <div className="p-4">
            <EmptyState
              icon={<BookMarked />}
              title={hasActiveFilter(filters) ? 'Aucun résultat' : 'Registre vide'}
              message={
                hasActiveFilter(filters)
                  ? 'Aucune ferme ne correspond à ces critères.'
                  : 'Enregistrez une ferme ou importez la liste du programme.'
              }
              action={
                hasActiveFilter(filters) ? (
                  <Button
                    tone="secondary"
                    onClick={() => {
                      setQ('');
                      writtenQ.current = '';
                      update({ province: '', localiteId: '', cohort: '', status: '', biosecurity: '', q: '', page: 1 });
                    }}
                  >
                    Effacer les filtres
                  </Button>
                ) : rights.create ? (
                  <Button onClick={() => setCreating(true)}>
                    <Plus className="h-4 w-4" /> Nouvelle ferme
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <SortTh label="Ferme" sortKey="name" sort={sort} onSort={onSort} className="min-w-52" />
                <SortTh label="Province" sortKey="province" sort={sort} onSort={onSort} />
                <Th className="hidden lg:table-cell">Localité</Th>
                <SortTh label="Exploitant" sortKey="exploitant" sort={sort} onSort={onSort} className="min-w-44" />
                <SortTh label="Statut" sortKey="status" sort={sort} onSort={onSort} />
                <SortTh label="Compte" sortKey="account" sort={sort} onSort={onSort} className="hidden lg:table-cell" />
                {showBiosecurity ? <Th className="hidden lg:table-cell">Biosécurité</Th> : null}
                <Th className="hidden text-center lg:table-cell">GPS</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((f) => (
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
                      <span className="block font-mono text-xs font-semibold text-slate-600">{f.code ?? 'Sans code'}</span>
                      <span className="font-medium text-slate-900 hover:underline">{f.name}</span>
                    </button>
                  </Td>
                  <Td label="Province" className="whitespace-nowrap">
                    {f.province ? `${f.province.code} · ${f.province.name}` : '—'}
                  </Td>
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
                    <StatusBadge tone={f.hasOwnerAccount ? 'ok' : 'neutral'} label={f.hasOwnerAccount ? 'Activé' : 'Non activé'} />
                  </Td>
                  {showBiosecurity ? (
                    <Td label="Biosécurité" className="md:max-lg:hidden">
                      {f.biosecurity?.classification ? (
                        <span title={`Contrôle du ${f.biosecurity.visitDate ?? ''}${f.biosecurity.stale ? ' (ancien)' : ''}`}>
                          <StatusBadge tone={f.biosecurity.classification === 'A' ? 'ok' : 'neutral'} label={`Classe ${f.biosecurity.classification}${f.biosecurity.stale ? ' · ancien' : ''}`} />
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400">Jamais contrôlée</span>
                      )}
                    </Td>
                  ) : null}
                  <Td label="GPS" className="text-center md:max-lg:hidden">
                    {f.gpsProvinceWarning ? (
                      <span title={f.gpsProvinceWarning} aria-label={f.gpsProvinceWarning} className="inline-flex text-amber-700">
                        <MapPin className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="text-slate-300">—</span>
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
              <b className="tabular-nums text-slate-900">{pageRangeLabel(data.total, data.page, data.pageSize)}</b> fermes
              {sort ? <span className="text-slate-500"> · tri appliqué à la page affichée</span> : null}
              {list.isFetching ? <span className="text-slate-500"> · mise à jour…</span> : null}
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

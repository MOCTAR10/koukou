import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Eraser, Settings2, ShieldAlert } from 'lucide-react';
import { api } from '../api/client';
import { ALERT_FAMILIES, type SanitaryAlertPage } from '../api/types-surveillance';
import { PageNotOpen } from '../components/access/PageNotOpen';
import { Button, ErrorNote, Field, inputCls } from '../components/form';
import { LEVEL_LABEL, Note, Pill, levelTone } from '../components/flock/shared';
import { useProvinces } from '../components/registry/queries';
import { AlertDetailPanel } from '../components/surveillance/AlertDetailPanel';
import { AlertStatusPill, PublishedPill } from '../components/surveillance/AlertParts';
import {
  ALERT_PAGE_SIZE,
  EMPTY_ALERT_FILTERS,
  ORIGIN_LABELS,
  alertQuery,
  familyLabel,
  filtersFromParams,
  filtersToParams,
  mortalityVsThreshold,
  periodProblem,
  type AlertFilters,
} from '../components/surveillance/alertRules';
import { SURVEILLANCE_KEYS, useSanitaryList } from '../components/surveillance/queries';
import { useSurveillanceRights } from '../components/surveillance/useSurveillanceRights';
import { Card, DataTable, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr } from '../lib/format';

/**
 * Official sanitary alerts of the programme (POUFA L5, CDC 25-26): the
 * veterinary services qualify and publish them; other profiles granted
 * SANITAIRE read the published ones (the server filters). Not about the
 * active farm: works without one.
 */
export function SurveillancePage() {
  const rights = useSurveillanceRights();
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => filtersFromParams(params), [params]);
  const offset = Math.max(0, Number(params.get('page') ?? '0') || 0) * ALERT_PAGE_SIZE;
  const openId = params.get('alerte');
  const statuses = useSanitaryList('STATUT_ALERTE', rights.view);
  const signs = useSanitaryList('SIGNE_CLINIQUE', rights.view);
  const provinces = useProvinces(rights.view);
  const badPeriod = periodProblem(filters);

  const list = useQuery({
    queryKey: [...SURVEILLANCE_KEYS.alerts, filters, offset],
    queryFn: () => api.get<SanitaryAlertPage>(`/surveillance/alerts?${alertQuery(filters, offset)}`),
    enabled: rights.view && !badPeriod,
    placeholderData: keepPreviousData,
  });

  if (rights.loading) return <Loading />;
  if (!rights.view) return <PageNotOpen />;

  const setFilter = (key: keyof AlertFilters, value: string) => {
    const next = filtersToParams({ ...filters, [key]: value }, params);
    setParams(next, { replace: true });
  };
  const setPage = (page: number) => {
    const next = new URLSearchParams(params);
    if (page > 0) next.set('page', String(page));
    else next.delete('page');
    setParams(next, { replace: true });
  };
  const openAlert = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set('alerte', id);
    else next.delete('alerte');
    setParams(next);
  };

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const page = Math.floor(offset / ALERT_PAGE_SIZE);
  const statusItems = (statuses.data ?? []).filter((s) => !filters.statusFamily || s.family === filters.statusFamily);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Surveillance sanitaire"
        icon={<ShieldAlert />}
        iconTone="red"
        subtitle="Alertes sanitaires officielles du programme : qualification et publication par les services vétérinaires"
        actions={
          rights.settings ? (
            <Link
              to="/app/surveillance/parametres"
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Settings2 className="h-4 w-4" /> Listes et calendriers
            </Link>
          ) : undefined
        }
      />
      {!rights.seesUnpublished ? (
        <Note tone="slate">
          Avant publication, une alerte reste entre la ferme et les services vétérinaires : vous voyez les alertes publiées de votre périmètre.
        </Note>
      ) : null}

      <Card className="p-4 @container">
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          <Field label="Famille de statut">
            <select className={inputCls} value={filters.statusFamily} onChange={(e) => setFilter('statusFamily', e.target.value)}>
              <option value="">Toutes</option>
              {ALERT_FAMILIES.map((f) => (
                <option key={f} value={f}>
                  {familyLabel(f)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <select className={inputCls} value={filters.statusCode} onChange={(e) => setFilter('statusCode', e.target.value)}>
              <option value="">Tous</option>
              {statusItems.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Origine">
            <select className={inputCls} value={filters.origin} onChange={(e) => setFilter('origin', e.target.value)}>
              <option value="">Toutes</option>
              <option value="MORTALITE">{ORIGIN_LABELS.MORTALITE}</option>
              <option value="DECLARATION">{ORIGIN_LABELS.DECLARATION}</option>
            </select>
          </Field>
          <Field label="Province">
            <select className={inputCls} value={filters.provinceCode} onChange={(e) => setFilter('provinceCode', e.target.value)}>
              <option value="">Toutes</option>
              {(provinces.data ?? []).map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          {rights.seesUnpublished ? (
            <Field label="Publication">
              <select className={inputCls} value={filters.published} onChange={(e) => setFilter('published', e.target.value)}>
                <option value="">Publiées ou non</option>
                <option value="false">Non publiées</option>
                <option value="true">Publiées</option>
              </select>
            </Field>
          ) : null}
          <Field label="Jour du fait, du">
            <input className={inputCls} type="date" value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
          </Field>
          <Field label="au">
            <input className={inputCls} type="date" value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
          </Field>
          <div className="flex items-end">
            <Button tone="secondary" onClick={() => setParams(filtersToParams(EMPTY_ALERT_FILTERS, params), { replace: true })}>
              <Eraser className="h-4 w-4" /> Effacer les filtres
            </Button>
          </div>
        </div>
        {badPeriod ? <p className="mt-2 text-sm text-amber-700">{badPeriod}</p> : null}
      </Card>

      <ErrorNote error={list.error} />
      {list.isLoading ? (
        <Loading label="Chargement des alertes…" />
      ) : items.length === 0 ? (
        <EmptyState message="Aucune alerte sanitaire pour ces filtres." icon={<ShieldAlert />} />
      ) : (
        <Card className="overflow-hidden">
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Alerte</Th>
                <Th>Ferme</Th>
                <Th className="hidden lg:table-cell">Bande</Th>
                <Th className="hidden lg:table-cell">Province</Th>
                <Th>Origine</Th>
                <Th>Gravité</Th>
                <Th>Statut</Th>
                <Th> </Th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => {
                const mortality = mortalityVsThreshold(a);
                return (
                  <tr key={a.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => openAlert(a.id)}>
                    <Td>
                      <span className="font-mono text-sm font-semibold">{a.code}</span>
                      <span className="block text-xs text-slate-500">{dateFr(a.factDay)}</span>
                    </Td>
                    <Td label="Ferme">
                      {a.farmCode ? <span className="font-mono text-xs">{a.farmCode}</span> : null}
                      <span className="block">{a.farmName ?? '—'}</span>
                    </Td>
                    <Td label="Bande" className="md:max-lg:hidden">
                      {a.batchCode ? <span className="font-mono text-xs">{a.batchCode}</span> : '—'}
                    </Td>
                    <Td label="Province" className="md:max-lg:hidden">
                      {a.provinceName ?? a.provinceCode ?? '—'}
                    </Td>
                    <Td label="Origine">
                      {ORIGIN_LABELS[a.origin]}
                      {mortality ? <span className="block text-xs text-slate-500">{mortality}</span> : null}
                    </Td>
                    <Td label="Gravité">
                      <Pill tone={levelTone(a.severity)}>{LEVEL_LABEL[a.severity] ?? a.severity}</Pill>
                    </Td>
                    <Td label="Statut">
                      <div className="flex flex-wrap gap-1">
                        <AlertStatusPill alert={a} statuses={statuses.data ?? []} />
                        <PublishedPill alert={a} />
                      </div>
                    </Td>
                    <Td className="row-chevron text-right">
                      <ChevronRight className="inline h-4 w-4 text-slate-400" />
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-sm text-slate-500">
            <span>
              {offset + 1}–{offset + items.length} sur {total}
            </span>
            <div className="flex gap-2">
              <Button tone="secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft className="h-4 w-4" /> Précédentes
              </Button>
              <Button tone="secondary" disabled={offset + items.length >= total} onClick={() => setPage(page + 1)}>
                Suivantes <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {openId ? (
        <AlertDetailPanel alertId={openId} rights={rights} statuses={statuses.data ?? []} signs={signs.data ?? []} onClose={() => openAlert(null)} />
      ) : null}
    </div>
  );
}

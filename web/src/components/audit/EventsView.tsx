import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, Filter, ListOrdered } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import type { AuditEvent, AuditPage } from '../../api/types-admin';
import { dateTimeFr, num } from '../../lib/format';
import { Note, Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls, DateInput } from '../form';
import { Card, DataTable, EmptyState, SkeletonRows, Td, Th } from '../ui';
import {
  ACTION_LABELS,
  AUDIT_ACTIONS,
  AUDIT_PAGE_SIZE,
  EMPTY_EVENT_FILTERS,
  eventFilterError,
  eventsQueryString,
  exportFileName,
  pageCount,
  ROLE_LABELS,
  STATUS_CLASS_LABELS,
  statusTone,
  type EventFilters,
  type StatusClass,
} from './audit';
import { EventDetailPanel } from './EventDetailPanel';

/** Level 1 of the journal: one line per write, sensitive read, export or sign-in, newest first. */
export function EventsView({ onRowChanges }: { onRowChanges: (requestId: string) => void }) {
  const navigate = useNavigate();
  const [draft, setDraft] = useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [filters, setFilters] = useState<EventFilters>(EMPTY_EVENT_FILTERS);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<AuditEvent | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);

  const qs = eventsQueryString(filters, page);
  const events = useQuery({
    queryKey: ['audit-events', qs],
    queryFn: () => api.getFresh<AuditPage<AuditEvent>>(`/audit/events${qs}`),
    placeholderData: keepPreviousData,
  });
  // The export says when it stopped at its row cap (`X-Audit-Truncated`).
  const exportCsv = useMutation({
    mutationFn: async () => {
      const headers = await api.download(`/audit/events/export${eventsQueryString(filters)}`, exportFileName(filters));
      return { truncated: headers.get('X-Audit-Truncated') === 'true' };
    },
  });

  const apply = (next: EventFilters) => {
    const err = eventFilterError(next);
    setFilterError(err);
    if (err) return;
    setDraft(next);
    setFilters(next);
    setPage(1);
  };
  const set = (key: keyof EventFilters) => (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [key]: e.target.value }));

  const data = events.data;
  const rows = data?.items ?? [];
  const pages = data ? pageCount(data.total, data.limit) : 1;

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            apply(draft);
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Du">
              <DateInput className={inputCls} value={draft.from} onChange={set('from')} />
            </Field>
            <Field label="Au (inclus)">
              <DateInput className={inputCls} value={draft.to} onChange={set('to')} />
            </Field>
            <Field label="Action">
              <select className={inputCls} value={draft.action} onChange={set('action')}>
                <option value="">Toutes</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>
                    {ACTION_LABELS[a]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Route contient">
              <input className={inputCls} value={draft.route} maxLength={200} placeholder="/programme/farms" onChange={set('route')} />
            </Field>
            <Field label="Utilisateur (identifiant)" hint="Ou cliquez sur un auteur dans la liste.">
              <input className={`${inputCls} font-mono text-xs`} value={draft.actorUserId} onChange={set('actorUserId')} placeholder="UUID" />
            </Field>
            <Field label="Ferme (identifiant)">
              <input className={`${inputCls} font-mono text-xs`} value={draft.farmId} onChange={set('farmId')} placeholder="UUID" />
            </Field>
            <Field label="Statut">
              <select className={inputCls} value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value as StatusClass | '' }))}>
                <option value="">Tous</option>
                {(Object.keys(STATUS_CLASS_LABELS) as StatusClass[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_CLASS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Requête (identifiant)" hint="Ou ouvrez une action et suivez sa requête.">
              <input className={`${inputCls} font-mono text-xs`} value={draft.requestId} onChange={set('requestId')} placeholder="UUID" />
            </Field>
          </div>
          <ErrorNote error={filterError} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit">
              <Filter className="h-4 w-4" /> Filtrer
            </Button>
            <Button
              tone="secondary"
              onClick={() => apply(EMPTY_EVENT_FILTERS)}
            >
              Effacer
            </Button>
            <Button tone="secondary" busy={exportCsv.isPending} onClick={() => exportCsv.mutate()} className="ml-auto">
              <Download className="h-4 w-4" /> Exporter en CSV
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Dates en UTC. L’export reprend tous les filtres (50 000 lignes au plus, les plus récentes) ; il est lui-même inscrit au journal.
          </p>
          <ErrorNote error={exportCsv.error} />
          {exportCsv.data?.truncated ? (
            <Note tone="amber">L’export a été tronqué à 50 000 lignes (les plus récentes) : resserrez la période pour obtenir le reste.</Note>
          ) : null}
        </form>
      </Card>

      <ErrorNote error={events.error} />

      <Card className="overflow-hidden">
        {events.isLoading ? (
          <SkeletonRows label="Chargement du journal…" />
        ) : !rows.length ? (
          <div className="p-4">
            <EmptyState icon={<ListOrdered />} message="Aucune action ne correspond à ces critères." />
          </div>
        ) : (
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Date</Th>
                <Th>Action</Th>
                <Th>Route</Th>
                <Th>Statut</Th>
                <Th>Auteur</Th>
                <Th className="hidden lg:table-cell">Requête</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setOpen(e)}>
                  <Td>
                    <button
                      type="button"
                      className="text-left"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        setOpen(e);
                      }}
                    >
                      <span className="block whitespace-nowrap font-medium text-slate-900 hover:underline">{dateTimeFr(e.occurredAt)}</span>
                      <span className="block font-mono text-[11px] text-slate-400">n° {e.id}</span>
                    </button>
                  </Td>
                  <Td label="Action">
                    <Pill tone={e.action === 'LOGIN_FAILED' ? 'red' : e.action === 'WRITE' ? 'brand' : 'slate'}>{ACTION_LABELS[e.action] ?? e.action}</Pill>
                  </Td>
                  <Td label="Route">
                    <span className="break-all font-mono text-xs">
                      <span className="font-semibold">{e.method}</span> {e.route}
                    </span>
                  </Td>
                  <Td label="Statut">{e.statusCode !== null ? <Pill tone={statusTone(e.statusCode)}>{String(e.statusCode)}</Pill> : '—'}</Td>
                  <Td label="Auteur">
                    {e.actorUserId ? (
                      <button
                        type="button"
                        title="Filtrer sur cet utilisateur"
                        className="text-left text-xs hover:underline"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          apply({ ...filters, actorUserId: e.actorUserId ?? '' });
                        }}
                      >
                        <span className="block">{e.actorName ?? (e.actorRole ? (ROLE_LABELS[e.actorRole] ?? e.actorRole) : 'Utilisateur')}</span>
                        <span className="block font-mono text-[11px] text-slate-500">
                          {e.actorName && e.actorRole ? `${ROLE_LABELS[e.actorRole] ?? e.actorRole} · ` : ''}
                          {e.actorUserId.slice(0, 8)}…
                        </span>
                      </button>
                    ) : (
                      <span className="text-xs text-slate-500">{e.action === 'SYSTEM' ? 'Serveur' : 'Non connecté'}</span>
                    )}
                  </Td>
                  <Td label="Requête" className="md:max-lg:hidden">
                    {e.requestId ? (
                      <button
                        type="button"
                        title="Filtrer sur cette requête"
                        className="font-mono text-[11px] text-slate-500 hover:underline"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          apply({ ...filters, requestId: e.requestId ?? '' });
                        }}
                      >
                        {e.requestId.slice(0, 8)}…
                      </button>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-500">—</span>
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
              {num(data.total, 0)} action{data.total > 1 ? 's' : ''} · {AUDIT_PAGE_SIZE} par page
              {events.isFetching ? <span className="text-slate-400"> · mise à jour…</span> : null}
            </span>
            {pages > 1 ? (
              <div className="flex items-center gap-2">
                <Button tone="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)} aria-label="Page précédente">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="tabular-nums">
                  Page {num(page, 0)} / {num(pages, 0)}
                </span>
                <Button tone="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)} aria-label="Page suivante">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      {open ? (
        <EventDetailPanel
          event={open}
          onClose={() => setOpen(null)}
          onOpenRowChanges={(rid) => {
            onRowChanges(rid);
            setOpen(null);
            navigate('/app/audit/donnees');
          }}
        />
      ) : null}
    </div>
  );
}

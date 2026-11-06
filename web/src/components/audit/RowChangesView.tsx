import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronLeft, ChevronRight, Database, Filter } from 'lucide-react';
import { api } from '../../api/client';
import type { AuditPage, AuditRowChange } from '../../api/types-admin';
import { dateTimeFr, num } from '../../lib/format';
import { Pill } from '../flock/shared';
import { Button, ErrorNote, Field, inputCls } from '../form';
import { Card, EmptyState, Loading } from '../ui';
import { diffSummary, EMPTY_ROW_FILTERS, OP_LABELS, pageCount, rowChangeFilterError, rowChangesQueryString, type RowChangeFilters } from './audit';
import { DiffView } from './DiffView';

/** Tables the journal follows (every `audit_attach` of the backend migrations), suggested in the filter. */
const KNOWN_TABLES = [
  'farms',
  'farm_employees',
  'users',
  'production_batches',
  'daily_entries',
  'input_lots',
  'health_events',
  'treatment_records',
  'prophylaxis_events',
  'alerts',
  'reference_constants',
  'sales',
  'slaughter_orders',
  'orders',
  'programs',
  'provinces',
  'localites',
  'ref_items',
  'program_parameters',
  'farm_status_history',
  'farm_infrastructures',
  'farm_gps_history',
  'access_profiles',
  'program_memberships',
  'login_challenges',
  'sorties',
  'bande_snapshots',
  'sync_conflicts',
  'sync_clock_samples',
  'input_deliveries',
  'input_delivery_lines',
  'operators',
  'trace_lots',
  'lot_events',
  'sanitary_alerts',
  'sanitary_alert_transitions',
  'health_event_photos',
  'notification_rules',
  'notifications',
  'sanitary_protocols',
  'protocol_steps',
  'report_templates',
  'report_runs',
  'import_jobs',
  'import_source_links',
];

/** Level 2 of the journal: each row before / after, filterable by table, row and request. */
export function RowChangesView({ initialRequestId }: { initialRequestId: string }) {
  const start: RowChangeFilters = { ...EMPTY_ROW_FILTERS, requestId: initialRequestId };
  const [draft, setDraft] = useState<RowChangeFilters>(start);
  const [filters, setFilters] = useState<RowChangeFilters>(start);
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const qs = rowChangesQueryString(filters, page);
  const changes = useQuery({
    queryKey: ['audit-row-changes', qs],
    queryFn: () => api.getFresh<AuditPage<AuditRowChange>>(`/audit/row-changes${qs}`),
    placeholderData: keepPreviousData,
  });
  const apply = (next: RowChangeFilters) => {
    const err = rowChangeFilterError(next);
    setFilterError(err);
    if (err) return;
    setDraft(next);
    setFilters(next);
    setPage(1);
  };
  const set = (key: keyof RowChangeFilters) => (e: React.ChangeEvent<HTMLInputElement>) => setDraft((d) => ({ ...d, [key]: e.target.value }));
  const data = changes.data;
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
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Du">
              <input type="date" className={inputCls} value={draft.from} onChange={set('from')} />
            </Field>
            <Field label="Au (inclus)">
              <input type="date" className={inputCls} value={draft.to} onChange={set('to')} />
            </Field>
            <Field label="Table">
              <input className={`${inputCls} font-mono text-xs`} list="audit-tables" value={draft.table} onChange={set('table')} placeholder="farms" />
              <datalist id="audit-tables">
                {KNOWN_TABLES.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </Field>
            <Field label="Ligne (identifiant)">
              <input className={`${inputCls} font-mono text-xs`} value={draft.rowId} onChange={set('rowId')} />
            </Field>
            <Field label="Requête (identifiant)">
              <input className={`${inputCls} font-mono text-xs`} value={draft.requestId} onChange={set('requestId')} placeholder="UUID" />
            </Field>
          </div>
          <ErrorNote error={filterError} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit">
              <Filter className="h-4 w-4" /> Filtrer
            </Button>
            <Button tone="secondary" onClick={() => apply(EMPTY_ROW_FILTERS)}>
              Effacer
            </Button>
          </div>
          <p className="text-xs text-slate-500">
            Écrit par la base de données elle-même à chaque modification d’une table suivie. Les secrets (mot de passe) ne sont jamais
            copiés : « _redacted_changed » indique seulement qu’ils ont changé.
          </p>
        </form>
      </Card>

      <ErrorNote error={changes.error} />
      {changes.isLoading ? <Loading /> : null}
      {data && !data.items.length ? <EmptyState icon={<Database />} message="Aucune donnée modifiée ne correspond à ces critères." /> : null}

      <div className="space-y-2">
        {data?.items.map((c) => {
          const open = openId === c.id;
          return (
            <Card key={c.id} className="overflow-hidden">
              <button
                type="button"
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left text-sm hover:bg-slate-50"
                aria-expanded={open}
                onClick={() => setOpenId(open ? null : c.id)}
              >
                <Pill tone={c.op === 'I' ? 'emerald' : c.op === 'D' ? 'red' : 'amber'}>{OP_LABELS[c.op] ?? c.op}</Pill>
                <span className="font-mono text-xs font-semibold text-slate-800">{c.tableName}</span>
                {c.rowId ? <span className="break-all font-mono text-[11px] text-slate-500">{c.rowId}</span> : null}
                <span className="text-xs text-slate-500">{diffSummary(c)}</span>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-500">{dateTimeFr(c.at)}</span>
                <ChevronDown className={`h-4 w-4 text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
              </button>
              {open ? (
                <div className="space-y-2 border-t border-slate-100 px-4 py-3">
                  <p className="text-[11px] text-slate-500">
                    Requête <span className="font-mono">{c.requestId ?? '— (écriture hors transaction)'}</span> · auteur{' '}
                    {c.actorName ? <span className="font-medium text-slate-700">{c.actorName} </span> : null}
                    <span className="font-mono">{c.actorUserId ?? '—'}</span> · transaction <span className="font-mono">{c.txid}</span>
                  </p>
                  <DiffView change={c} />
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {data && data.total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
          <span>
            {num(data.total, 0)} ligne{data.total > 1 ? 's' : ''} modifiée{data.total > 1 ? 's' : ''}
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
    </div>
  );
}

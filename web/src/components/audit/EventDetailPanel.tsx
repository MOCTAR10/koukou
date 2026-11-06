import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { api } from '../../api/client';
import type { AuditEvent, AuditPage, AuditRowChange } from '../../api/types-admin';
import { dateTimeFr } from '../../lib/format';
import { Pill } from '../flock/shared';
import { ErrorNote, Modal } from '../form';
import { Loading } from '../ui';
import { ACTION_LABELS, diffSummary, OP_LABELS, ROLE_LABELS, rowChangesQueryString, statusTone, summaryLines, EMPTY_ROW_FILTERS } from './audit';
import { DiffView } from './DiffView';

/** One action: who, what, the request body without secrets, and the rows its request changed. */
export function EventDetailPanel({ event, onClose, onOpenRowChanges }: { event: AuditEvent; onClose: () => void; onOpenRowChanges: (requestId: string) => void }) {
  const rid = event.requestId;
  const changes = useQuery({
    queryKey: ['audit-row-changes', 'request', rid],
    queryFn: () => api.getFresh<AuditPage<AuditRowChange>>(`/audit/row-changes${rowChangesQueryString({ ...EMPTY_ROW_FILTERS, requestId: rid ?? '' }, 1, 20)}`),
    enabled: !!rid,
  });
  const summary = summaryLines(event.summary);
  const params = summaryLines(event.params);

  return (
    <Modal side wide title={`Action n° ${event.id}`} onClose={onClose}>
      <div className="space-y-5 text-sm">
        <dl className="grid grid-cols-[9rem_minmax(0,1fr)] gap-x-3 gap-y-1.5">
          <dt className="text-slate-500">Date (UTC)</dt>
          <dd>
            {dateTimeFr(event.occurredAt)} <span className="font-mono text-[11px] text-slate-400">{event.occurredAt}</span>
          </dd>
          <dt className="text-slate-500">Action</dt>
          <dd>{ACTION_LABELS[event.action] ?? event.action}</dd>
          <dt className="text-slate-500">Requête</dt>
          <dd className="break-all font-mono text-xs">
            <span className="font-semibold">{event.method}</span> {event.route}
          </dd>
          <dt className="text-slate-500">Statut</dt>
          <dd>{event.statusCode !== null ? <Pill tone={statusTone(event.statusCode)}>{String(event.statusCode)}</Pill> : '—'}</dd>
          <dt className="text-slate-500">Auteur</dt>
          <dd>
            {event.actorUserId ? (
              <>
                {event.actorRole ? (ROLE_LABELS[event.actorRole] ?? event.actorRole) : 'Utilisateur'}{' '}
                <span className="break-all font-mono text-[11px] text-slate-500">{event.actorUserId}</span>
              </>
            ) : (
              'Non connecté'
            )}
          </dd>
          {event.farmId ? (
            <>
              <dt className="text-slate-500">Ferme</dt>
              <dd className="break-all font-mono text-xs">{event.farmId}</dd>
            </>
          ) : null}
          <dt className="text-slate-500">Adresse IP</dt>
          <dd className="font-mono text-xs">{event.ip ?? '—'}</dd>
          <dt className="text-slate-500">Appareil</dt>
          <dd className="break-words text-xs text-slate-600">{event.userAgent ?? '—'}</dd>
          {event.offlineOpId ? (
            <>
              <dt className="text-slate-500">Opération hors ligne</dt>
              <dd className="break-all font-mono text-xs">{event.offlineOpId}</dd>
            </>
          ) : null}
          <dt className="text-slate-500">Identifiant de requête</dt>
          <dd className="break-all font-mono text-xs">{rid ?? '—'}</dd>
        </dl>

        {event.errorMessage ? <ErrorNote error={event.errorMessage} /> : null}

        {params.length ? (
          <Section title="Paramètres de la route">
            <KeyValues lines={params} />
          </Section>
        ) : null}
        <Section title="Résumé de la demande" hint="Le corps de la requête, sans les secrets (mots de passe, codes, jetons) ; textes coupés à 500 caractères.">
          {summary.length ? <KeyValues lines={summary} /> : <p className="text-slate-500">Aucun contenu.</p>}
        </Section>

        <Section title="Données modifiées par cette requête">
          {!rid ? (
            <p className="text-slate-500">Pas d’identifiant de requête : aucune ligne rattachée.</p>
          ) : changes.isLoading ? (
            <Loading />
          ) : changes.error ? (
            <ErrorNote error={changes.error} />
          ) : !changes.data?.items.length ? (
            <p className="text-slate-500">Aucune ligne modifiée (consultation, refus, ou écriture hors transaction).</p>
          ) : (
            <div className="space-y-4">
              {changes.data.items.map((c) => (
                <div key={c.id} className="space-y-1.5">
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold text-slate-800">{OP_LABELS[c.op] ?? c.op}</span> · <span className="font-mono">{c.tableName}</span>
                    {c.rowId ? <span className="font-mono text-slate-400"> · {c.rowId}</span> : null} · {diffSummary(c)}
                  </p>
                  <DiffView change={c} />
                </div>
              ))}
              {changes.data.total > changes.data.items.length ? (
                <p className="text-xs text-slate-500">
                  {changes.data.total - changes.data.items.length} autre(s) ligne(s) : ouvrez la liste complète.
                </p>
              ) : null}
              <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline" onClick={() => onOpenRowChanges(rid)}>
                Voir dans « Données modifiées » <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </Section>
      </div>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
      {hint ? <p className="mb-1.5 text-xs text-slate-500">{hint}</p> : <div className="mb-1.5" />}
      {children}
    </section>
  );
}

function KeyValues({ lines }: { lines: Array<{ key: string; value: string }> }) {
  return (
    <dl className="grid grid-cols-[10rem_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
      {lines.map((l) => (
        <div key={l.key} className="contents">
          <dt className="font-mono text-slate-500">{l.key}</dt>
          <dd className="break-all font-mono text-slate-800">{l.value}</dd>
        </div>
      ))}
    </dl>
  );
}

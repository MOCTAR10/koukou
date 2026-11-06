import type { ListHistoryEntry, ProgramListType } from '../../api/types-admin';
import { dateTimeFr } from '../../lib/format';
import { Pill, type Tone } from '../flock/shared';
import { ErrorNote, Modal } from '../form';
import { EmptyState, Loading } from '../ui';
import { listLabel } from './lists';
import { useListHistory } from './queries';

const KIND_LABEL: Record<ListHistoryEntry['kind'], string> = {
  CREATION: 'Ajout',
  MODIFICATION: 'Modification',
  SUPPRESSION: 'Suppression',
};
const KIND_TONE: Record<ListHistoryEntry['kind'], Tone> = { CREATION: 'emerald', MODIFICATION: 'brand', SUPPRESSION: 'red' };

const FIELD_LABEL: Record<string, string> = {
  label: 'Libellé',
  active: 'Actif',
  sort: 'Ordre',
  parentId: 'Parent',
  meta: 'Attributs',
};

/** A value of the journal in French (booleans, empty values, JSON). */
export function historyValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '—';
  if (value === true) return 'oui';
  if (value === false) return 'non';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Who added, renamed, reordered, deactivated or reactivated the items of a
 * list, from the row journal (`GET /programme/lists/:type/history`). Read by
 * the profiles that manage the list.
 */
export function ListHistoryPanel({ listType, onClose }: { listType: ProgramListType; onClose: () => void }) {
  const history = useListHistory(listType);
  const rows = history.data ?? [];
  return (
    <Modal side wide title={`Historique · ${listLabel(listType)}`} onClose={onClose}>
      <div className="space-y-3">
        <ErrorNote error={history.error} />
        {history.isLoading ? <Loading /> : null}
        {history.data && rows.length === 0 ? <EmptyState message="Aucune modification enregistrée dans le journal pour cette liste." /> : null}
        <ol className="space-y-3 border-l-2 border-slate-200 pl-4">
          {rows.map((e) => (
            <li key={e.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone={KIND_TONE[e.kind]}>{KIND_LABEL[e.kind]}</Pill>
                <span className="text-sm font-medium text-slate-900">{e.label ?? e.code ?? 'Élément'}</span>
                {e.code ? <span className="font-mono text-[11px] text-slate-500">{e.code}</span> : null}
              </div>
              {e.changes.length > 0 ? (
                <ul className="text-xs text-slate-600">
                  {e.changes.map((c) => (
                    <li key={c.field}>
                      {FIELD_LABEL[c.field] ?? c.field} :{' '}
                      {e.kind === 'CREATION' ? historyValue(c.after) : `${historyValue(c.before)} → ${historyValue(c.after)}`}
                    </li>
                  ))}
                </ul>
              ) : null}
              <p className="text-[11px] text-slate-400">
                {dateTimeFr(e.at)} · {e.actorName ? `par ${e.actorName}` : e.actorUserId ? `compte ${e.actorUserId.slice(0, 8)}…` : 'par le serveur'}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </Modal>
  );
}

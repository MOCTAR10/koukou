import { dateFr } from '../../lib/format';
import type { VisitView } from '../../api/types-visits';
import { Pill } from '../flock/shared';
import { ErrorNote } from '../form';
import { Loading } from '../ui';
import { useVisit } from './queries';
import { ANSWER_LABEL, CLASS_LABEL, VISIT_TYPE_LABEL, classTone, groupByCategory, scoreLabel } from './visitRules';

function ScoreBadge({ visit }: { visit: Pick<VisitView, 'scorePct' | 'classification'> }) {
  if (visit.scorePct == null) return <span className="text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="tabular-nums">{scoreLabel(visit.scorePct)}</span>
      {visit.classification ? <Pill tone={classTone(visit.classification)}>{CLASS_LABEL[visit.classification]}</Pill> : null}
    </span>
  );
}

export { ScoreBadge };

/** Detail of one visit: facts, observations, visa and the filled grid. */
export function VisitDetail({ farmId, id }: { farmId: string; id: string }) {
  const q = useVisit(farmId, id);
  if (q.isLoading) return <Loading label="Chargement de la visite…" />;
  if (q.error || !q.data) return <ErrorNote error={q.error} />;
  const v = q.data;
  const rows: Array<[string, React.ReactNode]> = [
    ['Type', VISIT_TYPE_LABEL[v.type]],
    ['Jour', dateFr(v.visitDate)],
    ['Agent', v.agent.name],
    ['Bande', v.batchCode ?? 'Toute la ferme'],
    ['Prochaine visite', v.nextVisitDate ? dateFr(v.nextVisitDate) : '—'],
    ['Position', v.latitude != null && v.longitude != null ? `${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}` : '—'],
    ['Score de biosécurité', <ScoreBadge key="s" visit={v} />],
  ];
  const grouped = groupByCategory(v.answers.map((a) => ({ code: a.criterionCode, label: a.label, category: a.category, weight: a.weight })));
  const answerOf = new Map(v.answers.map((a) => [a.criterionCode, a]));
  return (
    <div className="space-y-4">
      <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
        {rows.map(([k, val]) => (
          <div key={k}>
            <dt className="text-xs font-medium text-slate-500">{k}</dt>
            <dd className="text-sm text-slate-800">{val}</dd>
          </div>
        ))}
      </dl>
      {v.visaFrom && v.visaTo ? (
        <p className="rounded-lg bg-brand-50 px-3 py-2 text-sm text-brand-800">
          Visa de l’agent : saisies de la bande vérifiées du {dateFr(v.visaFrom)} au {dateFr(v.visaTo)}.
        </p>
      ) : null}
      {v.observations ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Observations</h4>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{v.observations}</p>
        </div>
      ) : null}
      {v.recommendations ? (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recommandations</h4>
          <p className="whitespace-pre-wrap text-sm text-slate-800">{v.recommendations}</p>
        </div>
      ) : null}
      {grouped.length > 0 ? (
        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grille de biosécurité</h4>
          {grouped.map((g) => (
            <div key={g.category}>
              <p className="text-xs font-semibold text-slate-500">{g.category}</p>
              <ul className="divide-y divide-slate-100">
                {g.items.map((c) => {
                  const a = answerOf.get(c.code)!;
                  return (
                    <li key={c.code} className="flex flex-wrap items-start justify-between gap-2 py-1.5 text-sm">
                      <span className="min-w-0 text-slate-800">
                        {c.label}
                        {a.comment ? <span className="block text-xs text-slate-500">{a.comment}</span> : null}
                      </span>
                      <Pill tone={a.answer === 'CONFORME' ? 'emerald' : a.answer === 'NON_CONFORME' ? 'red' : 'slate'}>{ANSWER_LABEL[a.answer]}</Pill>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

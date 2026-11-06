import type { ReactNode } from 'react';
import { CheckCircle2, Megaphone, PlusCircle, RefreshCw } from 'lucide-react';
import type { RefItem } from '../../api/types-programme';
import type { SanitaryAlert, SanitaryAlertTransition } from '../../api/types-surveillance';
import { dateFr, dateTimeFr, num } from '../../lib/format';
import { LEVEL_LABEL, Pill, levelTone } from '../flock/shared';
import { ORIGIN_LABELS, familyLabel, familyTone, mortalityVsThreshold, statusLabelOf } from './alertRules';
import { signLabels } from './declaration';

/** Status pill: the list label, toned by its family. */
export function AlertStatusPill({ alert, statuses }: { alert: Pick<SanitaryAlert, 'statusCode' | 'statusFamily'>; statuses: RefItem[] }) {
  return <Pill tone={familyTone(alert.statusFamily)}>{statusLabelOf(alert.statusCode, statuses)}</Pill>;
}

export function PublishedPill({ alert }: { alert: Pick<SanitaryAlert, 'published'> }) {
  return alert.published ? <Pill tone="brand">Publiée</Pill> : <Pill>Non publiée</Pill>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-sm font-medium text-slate-800 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

/** What the alert is about (farm, band, facts), as both the farm and the vets read it. */
export function AlertFacts({ alert, statuses, signs }: { alert: SanitaryAlert; statuses: RefItem[]; signs: RefItem[] }) {
  const mortality = mortalityVsThreshold(alert);
  const period = alert.lastFactDay && alert.lastFactDay !== alert.factDay ? `${dateFr(alert.factDay)} au ${dateFr(alert.lastFactDay)}` : dateFr(alert.factDay);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <AlertStatusPill alert={alert} statuses={statuses} />
        <Pill tone={levelTone(alert.severity)}>{LEVEL_LABEL[alert.severity] ?? alert.severity}</Pill>
        <PublishedPill alert={alert} />
        {alert.outcome ? <Pill tone={alert.outcome === 'CONFIRMEE' ? 'red' : 'emerald'}>Issue : {familyLabel(alert.outcome)}</Pill> : null}
      </div>
      <p className="text-sm text-slate-700">{alert.summary}</p>
      <dl className="grid grid-cols-2 gap-3 @container sm:grid-cols-3">
        <Fact label="Ferme">
          {alert.farmCode ? <span className="font-mono">{alert.farmCode}</span> : null} {alert.farmName ?? ''}
        </Fact>
        <Fact label="Bande">{alert.batchCode ? <span className="font-mono">{alert.batchCode}</span> : '—'}</Fact>
        <Fact label="Province">{alert.provinceName ?? alert.provinceCode ?? '—'}</Fact>
        <Fact label="Origine">{ORIGIN_LABELS[alert.origin] ?? alert.origin}</Fact>
        <Fact label="Jour(s) du fait">{period}</Fact>
        {mortality ? <Fact label="Mortalité du jour">{mortality}</Fact> : null}
        {alert.deaths !== null && alert.deaths !== undefined ? (
          <Fact label="Morts / présents">
            {num(alert.deaths, 0)} / {alert.presentStart !== null ? num(alert.presentStart, 0) : '—'}
          </Fact>
        ) : null}
        {alert.publishedAt ? <Fact label="Publiée le">{dateTimeFr(alert.publishedAt)}</Fact> : null}
        {alert.closedAt ? <Fact label="Close le">{dateTimeFr(alert.closedAt)}</Fact> : null}
      </dl>
      {alert.clinicalSigns.length > 0 ? (
        <div>
          <p className="text-xs text-slate-500">Signes cliniques</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {signLabels(alert.clinicalSigns, signs).map((s) => (
              <Pill key={s}>{s}</Pill>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

const KIND_ICON = { CREATION: PlusCircle, STATUT: RefreshCw, PUBLICATION: Megaphone } as const;

/** The alert's history: every move, its author and comment, oldest first. */
export function TransitionTimeline({ transitions, statuses, showAuthors = true }: { transitions: SanitaryAlertTransition[]; statuses: RefItem[]; showAuthors?: boolean }) {
  if (transitions.length === 0) return <p className="text-sm text-slate-500">Aucun historique.</p>;
  return (
    <ol className="space-y-3 border-l border-slate-200 pl-4">
      {transitions.map((t) => {
        const Icon = KIND_ICON[t.kind] ?? CheckCircle2;
        const what =
          t.kind === 'CREATION'
            ? `Ouverte au statut « ${statusLabelOf(t.toStatusCode, statuses)} »`
            : t.kind === 'PUBLICATION'
              ? 'Publiée par les services vétérinaires'
              : `${t.fromStatusCode ? `${statusLabelOf(t.fromStatusCode, statuses)} → ` : ''}${statusLabelOf(t.toStatusCode, statuses)}`;
        return (
          <li key={t.id} className="relative">
            <span className="absolute -left-[1.4rem] top-0.5 rounded-full bg-white text-slate-400">
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-sm font-medium text-slate-800">{what}</p>
            <p className="text-xs text-slate-500">
              {dateTimeFr(t.createdAt)}
              {showAuthors ? ` · ${t.authorName ?? (t.authorId ? 'Utilisateur' : 'Automatique')}` : ''}
            </p>
            {t.comment ? <p className="mt-1 rounded-lg bg-slate-50 px-2.5 py-1.5 text-sm text-slate-700">{t.comment}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

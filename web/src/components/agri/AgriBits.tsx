import { CalendarClock, Droplets, Sprout } from 'lucide-react';
import type { Culture, ParcelleStatus } from '../../api/types-agri';
import { classNames } from '../../lib/format';
import { harvestDateFr, PARCELLE_STATUS_LABELS, waterNeedLabel, type CultureStageInfo } from './agri';

const STATUS_TONES: Record<ParcelleStatus, string> = {
  ACTIVE: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  PREPARATION: 'bg-amber-50 text-amber-700 ring-amber-200',
  JACHERE: 'bg-amber-50 text-amber-700 ring-amber-200',
  CLOTURE: 'bg-slate-100 text-slate-500 ring-slate-200',
};

export function ParcelleStatusBadge({ status }: { status: ParcelleStatus }) {
  return (
    <span
      className={classNames(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        STATUS_TONES[status],
      )}
    >
      {PARCELLE_STATUS_LABELS[status]}
    </span>
  );
}

/** Stage, countdown, progress and estimated harvest of a planted crop. */
export function StageSummary({ stage, culture }: { stage: CultureStageInfo; culture?: Culture | null }) {
  const water = waterNeedLabel(culture ?? null);
  const due = stage.key === 'A_RECOLTER' && stage.harvestDate !== null;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span
          className={classNames(
            'inline-flex items-center gap-1 font-semibold',
            due ? 'text-amber-700' : 'text-slate-800',
          )}
        >
          <Sprout className={classNames('h-3 w-3 shrink-0', due ? 'text-amber-600' : 'text-emerald-600')} />
          {stage.label}
        </span>
        {stage.harvestDate && stage.daysRemaining > 0 ? (
          <span className="text-slate-500">J-{stage.daysRemaining}</span>
        ) : null}
      </div>
      {stage.harvestDate ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-emerald-100">
          <div
            className={classNames('h-full rounded-full', due ? 'bg-amber-500' : 'bg-emerald-500')}
            style={{ width: `${Math.min(100, Math.round(stage.progress * 100))}%` }}
          />
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1">
          <CalendarClock className="h-3 w-3 shrink-0 text-slate-400" />
          {stage.harvestDate ? `Récolte estimée le ${harvestDateFr(stage.harvestDate)}` : 'Pas d’échéance estimée'}
        </span>
        {water ? (
          <span className="inline-flex items-center gap-1 text-slate-400">
            <Droplets className="h-3 w-3" /> {water}
          </span>
        ) : null}
      </div>
    </div>
  );
}

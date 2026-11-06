import { CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { classNames } from '../../lib/format';
import { inlineInputCls, todayIso } from '../form';
import { addDays, spanWindow, type PeriodWindow } from './pnl';

const SPANS = [
  { value: 7, label: '7 jours' },
  { value: 30, label: '30 jours' },
  { value: 90, label: '90 jours' },
  { value: 'all', label: 'Tout' },
] as const;

/** Window controls: span presets, one-day arrows, or an explicit range. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodWindow;
  onChange: (w: PeriodWindow) => void;
}) {
  const today = todayIso();
  const atToday = value.to >= today;
  const isAll = value.span === 'all';

  const shift = (delta: number) => {
    const to = addDays(value.to, delta);
    if (to > today) return;
    onChange({ ...value, to, from: isAll ? value.from : addDays(value.from, delta) });
  };

  const setFrom = (from: string) => {
    if (from) onChange({ span: 'custom', from, to: from > value.to ? from : value.to });
  };
  const setTo = (to: string) => {
    if (to) onChange({ span: 'custom', to, from: !isAll && to < value.from ? to : value.from });
  };

  const arrowCls =
    'rounded-lg border border-slate-300 bg-white p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-40';

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
        {SPANS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={value.span === s.value}
            onClick={() => onChange(spanWindow(s.value, today))}
            className={classNames(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              value.span === s.value ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <CalendarRange className="h-4 w-4 shrink-0 text-brand-600" />
        <button type="button" aria-label="Jour précédent" onClick={() => shift(-1)} className={arrowCls}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        <input
          type="date"
          aria-label="Date de début"
          value={isAll ? '' : value.from}
          max={today}
          onChange={(e) => setFrom(e.target.value)}
          className={classNames(inlineInputCls, 'w-40')}
        />
        <span className="text-sm text-slate-400">au</span>
        <input
          type="date"
          aria-label="Date de fin"
          value={value.to}
          max={today}
          onChange={(e) => setTo(e.target.value)}
          className={classNames(inlineInputCls, 'w-40')}
        />
        <button
          type="button"
          aria-label="Jour suivant"
          disabled={atToday}
          onClick={() => shift(1)}
          className={arrowCls}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

import type { ReactNode } from 'react';
import { fcfa } from '../../lib/format';
import { IconTile } from '../ui';
import { sharePct } from './pnl';

export interface ShareRow {
  key: string;
  label: string;
  meta?: string;
  amountFcfa: number;
}

/** Ranked breakdown: name and amount in ink, one brand-coloured meter per row. */
export function ShareBars({ rows, empty, rowIcon }: { rows: ShareRow[]; empty: string; rowIcon?: ReactNode }) {
  const visible = rows.filter((r) => r.amountFcfa !== 0).sort((a, b) => b.amountFcfa - a.amountFcfa);
  if (visible.length === 0) return <p className="py-2 text-sm text-slate-500">{empty}</p>;
  const total = visible.reduce((acc, r) => acc + r.amountFcfa, 0);
  return (
    <div className="space-y-3">
      {visible.map((r) => {
        const pct = sharePct(r.amountFcfa, total);
        return (
          <div key={r.key} className="flex items-center gap-2.5">
            {rowIcon ? <IconTile icon={rowIcon} size="sm" /> : null}
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 font-medium text-slate-800">
                  {r.label}
                  {r.meta ? <span className="ml-2 text-xs font-normal text-slate-400">{r.meta}</span> : null}
                </span>
                <span className="shrink-0 tabular-nums">
                  <span className="font-semibold text-slate-800">{fcfa(r.amountFcfa)}</span>
                  <span className="ml-2 inline-block w-10 text-right text-xs font-medium text-slate-500">
                    {Math.round(pct)} %
                  </span>
                </span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(2, pct)}%` }} />
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between border-t border-slate-100 pt-2 text-sm">
        <span className="text-slate-500">Total</span>
        <span className="font-bold tabular-nums text-slate-800">{fcfa(total)}</span>
      </div>
    </div>
  );
}

import { useState, type ReactNode } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { classNames } from '../lib/format';
import { Card } from './ui';

/**
 * Collapsible filter card « Filtres (n) »: keeps the figures above the fold.
 * The open/closed state is remembered per `storageKey`; it opens by itself
 * while `forceOpen` is true (e.g. an invalid period to correct).
 */
export function FiltersPanel({
  storageKey,
  count,
  summary,
  forceOpen = false,
  className,
  children,
}: {
  storageKey: string;
  /** Number of active filters, shown in the title. */
  count: number;
  /** Short recap shown beside the title while collapsed. */
  summary?: string;
  forceOpen?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const key = `koukou.filters.${storageKey}`;
  const [stored, setStored] = useState<boolean>(() => {
    try {
      return localStorage.getItem(key) === 'open';
    } catch {
      return false;
    }
  });
  const open = stored || forceOpen;
  const toggle = () => {
    const next = !open;
    setStored(next);
    try {
      localStorage.setItem(key, next ? 'open' : 'closed');
    } catch {
      /* storage unavailable: the state just is not remembered */
    }
  };
  return (
    <Card className={classNames('@container', className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50"
      >
        <SlidersHorizontal className="h-4 w-4 text-slate-500" aria-hidden />
        Filtres ({count})
        {!open && summary ? <span className="truncate text-xs font-normal text-slate-500">{summary}</span> : null}
        <ChevronDown className={classNames('ml-auto h-4 w-4 text-slate-400 transition', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? <div className="border-t border-slate-100 p-4">{children}</div> : null}
    </Card>
  );
}

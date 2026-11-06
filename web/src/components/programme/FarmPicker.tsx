import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import type { Farm } from '../../api/types';
import { classNames } from '../../lib/format';
import { farmOptionLabel, PICKER_SEARCH_FROM, searchFarms } from './farmSearch';

/**
 * Farm switcher of the Shell, with a search once the list is long (an admin
 * or an institution may have 150+ farms). `dark` sits in the sidebar, `light`
 * in the top bar of the icon rail layout.
 */
export function FarmPicker({
  farms,
  farmId,
  onPick,
  label,
  tone,
  className,
}: {
  farms: Farm[];
  farmId: string | null;
  onPick: (id: string) => void;
  label: string;
  tone: 'dark' | 'light';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = farms.find((f) => f.id === farmId) ?? null;
  const withSearch = farms.length >= PICKER_SEARCH_FROM;
  const matches = useMemo(() => searchFarms(farms, query), [farms, query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };
  const pick = (id: string) => {
    onPick(id);
    close();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter' && matches[active]) {
      e.preventDefault();
      pick(matches[active].id);
    }
  };

  const dark = tone === 'dark';
  return (
    <div ref={root} className={classNames('relative', className)} onKeyDown={open ? onKeyDown : undefined}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          setActive(Math.max(0, farms.findIndex((f) => f.id === farmId)));
          setOpen((o) => !o);
        }}
        className={classNames(
          'flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-sm outline-none',
          dark
            ? 'border-white/10 bg-white/5 text-white hover:bg-white/10 focus-visible:border-brand-400'
            : 'border-slate-200 bg-white py-1.5 font-medium text-slate-700 hover:bg-slate-50 focus-visible:border-brand-500',
        )}
      >
        <span className="min-w-0 flex-1 truncate">
          {current ? farmOptionLabel(current) : 'Choisir une ferme'}
          {current && !current.active ? ' (suspendue)' : ''}
        </span>
        <ChevronsUpDown className={classNames('h-4 w-4 shrink-0', dark ? 'text-brand-200' : 'text-slate-400')} />
      </button>
      {open ? (
        <div className="absolute left-0 z-50 mt-1 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-2xl">
          {withSearch ? (
            <div className="relative border-b border-slate-100 p-2">
              <Search className="pointer-events-none absolute left-4 top-4 h-4 w-4 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActive(0);
                }}
                placeholder="Code, nom, exploitant, province…"
                aria-label="Rechercher une ferme"
                aria-controls={listId}
                className="w-full rounded-lg border border-slate-300 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-brand-500"
              />
            </div>
          ) : null}
          <ul id={listId} role="listbox" aria-label={label} className="max-h-80 overflow-y-auto py-1">
            {matches.map((f, i) => {
              const selected = f.id === farmId;
              return (
                <li key={f.id} role="option" aria-selected={selected}>
                  <button
                    type="button"
                    onClick={() => pick(f.id)}
                    onMouseEnter={() => setActive(i)}
                    className={classNames('flex w-full items-start gap-2 px-3 py-2 text-left text-sm', i === active ? 'bg-slate-100' : '')}
                  >
                    <Check className={classNames('mt-0.5 h-4 w-4 shrink-0 text-brand-600', selected ? '' : 'invisible')} />
                    <span className="min-w-0">
                      <span className="block truncate">
                        {f.code ? <span className="mr-1.5 font-mono text-xs font-semibold text-slate-500">{f.code}</span> : null}
                        {f.name}
                      </span>
                      <span className="block truncate text-xs text-slate-500">
                        {[f.provinceName, f.administrativeCity, f.active ? null : 'suspendue'].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
            {matches.length === 0 ? <li className="px-3 py-3 text-sm text-slate-500">Aucune ferme ne correspond.</li> : null}
          </ul>
          {withSearch ? (
            <p className="border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-400">
              {matches.length} ferme{matches.length > 1 ? 's' : ''} sur {farms.length}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

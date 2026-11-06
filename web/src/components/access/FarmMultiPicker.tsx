import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { FarmSearchItem, FarmSearchPage } from '../../api/types-access';
import { classNames } from '../../lib/format';
import { ErrorNote, inputCls } from '../form';
import { Loading } from '../ui';

/** Farm label in the picker and the account panel: `G1-0012 · Ferme Ndong`. */
export function farmLabel(f: { code?: string | null; name: string }): string {
  return f.code ? `${f.code} · ${f.name}` : f.name;
}

/**
 * Farms of a FARMS-scope account, picked one by one from the programme
 * registry (`GET /programme/farms?q=`, searched on the server: 150+ farms).
 * `known` names the farms already chosen (from the farm list) until a search
 * meets them.
 */
export function FarmMultiPicker({
  value,
  onChange,
  known,
  disabled = false,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
  known: ReadonlyMap<string, string>;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [seen, setSeen] = useState<Map<string, string>>(() => new Map());

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);

  const search = useQuery({
    queryKey: ['programme-farms-search', debounced],
    queryFn: () =>
      api.get<FarmSearchPage>(`/programme/farms?pageSize=20${debounced ? `&q=${encodeURIComponent(debounced)}` : ''}`),
    staleTime: 60_000,
  });
  const items: FarmSearchItem[] = search.data?.items ?? [];

  useEffect(() => {
    if (!search.data) return;
    setSeen((prev) => {
      const next = new Map(prev);
      for (const f of search.data.items) next.set(f.id, farmLabel(f));
      return next;
    });
  }, [search.data]);

  const labelOf = (id: string) => seen.get(id) ?? known.get(id) ?? 'Ferme du programme';
  const selected = new Set(value);
  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);

  return (
    <div className="space-y-3">
      {value.length > 0 ? (
        <div>
          <p className="mb-1.5 text-xs font-medium text-slate-600">{value.length} ferme(s) dans le périmètre</p>
          <div className="flex flex-wrap gap-1.5">
            {value.map((id) => (
              <span key={id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand-50 py-0.5 pl-2.5 pr-1 text-xs font-medium text-brand-800 ring-1 ring-brand-200">
                <span className="truncate">{labelOf(id)}</span>
                {disabled ? null : (
                  <button type="button" className="rounded-full p-0.5 hover:bg-brand-100" onClick={() => toggle(id)} aria-label={`Retirer ${labelOf(id)}`}>
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-slate-500">Aucune ferme choisie pour l’instant.</p>
      )}

      {disabled ? null : (
        <>
          <label className="relative block">
            <span className="sr-only">Rechercher une ferme</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className={`${inputCls} pl-9`}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nom, code, exploitant, téléphone…"
              type="search"
            />
          </label>
          <ErrorNote error={search.error} />
          {search.isLoading ? (
            <Loading label="Recherche…" />
          ) : (
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              {items.length === 0 ? (
                <p className="px-3 py-4 text-center text-sm text-slate-500">Aucune ferme trouvée.</p>
              ) : (
                items.map((f) => {
                  const on = selected.has(f.id);
                  return (
                    <label
                      key={f.id}
                      className={classNames(
                        'flex cursor-pointer items-start gap-2.5 border-b border-slate-100 px-3 py-2 last:border-b-0',
                        on ? 'bg-brand-50/60' : 'hover:bg-slate-50',
                      )}
                    >
                      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" checked={on} onChange={() => toggle(f.id)} />
                      <span className="min-w-0">
                        <span className="block text-sm text-slate-800">{farmLabel(f)}</span>
                        <span className="block text-xs text-slate-500">
                          {[f.province?.name, f.exploitantName].filter(Boolean).join(' · ') || '—'}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
              {search.data && search.data.total > items.length ? (
                <p className="px-3 py-2 text-xs text-slate-400">
                  {search.data.total - items.length} autre(s) : précisez la recherche.
                </p>
              ) : null}
            </div>
          )}
        </>
      )}
    </div>
  );
}

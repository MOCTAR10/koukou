import { useMemo, useState } from 'react';
import { CalendarClock, ChevronRight, History, Info, Plus, Search } from 'lucide-react';
import type { ParameterView } from '../../api/types-admin';
import { dateTimeFr } from '../../lib/format';
import { FilterChip } from '../sales/shared';
import { Note, Pill } from '../flock/shared';
import { ErrorNote, Field, inputCls, DateInput } from '../form';
import { Card, DataTable, EmptyState, Loading, Td, Th } from '../ui';
import type { AdminRights } from './adminRights';
import { mayPropose } from './adminRights';
import { ParameterHistoryPanel } from './ParameterHistoryPanel';
import { ParameterValueModal } from './ParameterValueModal';
import {
  formatParameterValue,
  isDefaultSince,
  groupByTheme,
  isProposedVersion,
  matchesSearch,
  ownerLabel,
  rangeLabel,
  THEME_LABELS,
  type ParameterTheme,
  TYPE_LABELS,
} from './parameters';
import { useParameters } from './queries';

/** Stored value equal to the catalog default (numbers, strings and JSON alike). */
function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * The parameter catalog grouped by theme, with the value in force (now or at
 * a chosen date), its history and « Nouvelle valeur » for the owner profile.
 */
export function ParametersView({ rights }: { rights: AdminRights['parameters'] }) {
  const [atDate, setAtDate] = useState('');
  // `?at=` at the end of the chosen day (UTC, like the server's fact dates).
  const at = atDate ? `${atDate}T23:59:59.999Z` : null;
  const params = useParameters(at);
  const [query, setQuery] = useState('');
  const [theme, setTheme] = useState<ParameterTheme | ''>('');
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<ParameterView | null>(null);

  const all = params.data ?? [];
  const groups = useMemo(() => groupByTheme(all.filter((p) => matchesSearch(p, query))), [all, query]);
  const allGroups = useMemo(() => groupByTheme(all), [all]);
  const shown = theme ? groups.filter((g) => g.theme === theme) : groups;
  const historyParam = historyKey ? all.find((p) => p.key === historyKey) ?? null : null;

  return (
    <div className="space-y-4">
      <Note tone="brand" icon={<Info />}>
        Une nouvelle valeur s’applique <b>à partir de sa date d’effet</b> (maintenant ou plus tard, jamais dans le passé) : les faits déjà
        enregistrés gardent la valeur qui était en vigueur à leur date, et chaque version reste dans l’historique. Seul le profil
        responsable d’un paramètre (ou l’administrateur plateforme) peut en proposer une nouvelle valeur.
      </Note>

      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un paramètre (libellé, clé, unité)…"
              aria-label="Rechercher un paramètre"
              className={`${inputCls} pl-9`}
            />
          </div>
          <Field label="Valeurs en vigueur le" hint={atDate ? 'Consultation d’une date : lecture seule.' : 'Vide : maintenant.'}>
            <DateInput className={inputCls} value={atDate} onChange={(e) => setAtDate(e.target.value)} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip label="Tous" count={all.length} active={theme === ''} onClick={() => setTheme('')} />
          {allGroups.map((g) => (
            <FilterChip
              key={g.theme}
              label={THEME_LABELS[g.theme]}
              count={g.items.length}
              active={theme === g.theme}
              onClick={() => setTheme(theme === g.theme ? '' : g.theme)}
            />
          ))}
        </div>
      </Card>

      <ErrorNote error={params.error} />
      {params.isLoading ? <Loading label="Chargement des paramètres…" /> : null}
      {params.data && shown.length === 0 ? <EmptyState message="Aucun paramètre ne correspond à cette recherche." /> : null}

      {shown.map((group) => (
        <Card key={group.theme} className="overflow-hidden">
          <h2 className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-800">{THEME_LABELS[group.theme]}</h2>
          <DataTable>
            <thead className="bg-slate-50">
              <tr>
                <Th>Paramètre</Th>
                <Th>{atDate ? `En vigueur le ${atDate}` : 'Valeur en vigueur'}</Th>
                <Th className="hidden lg:table-cell">Depuis</Th>
                <Th className="hidden lg:table-cell">Type et bornes</Th>
                <Th>Responsable</Th>
                <Th></Th>
              </tr>
            </thead>
            <tbody>
              {group.items.map((p) => {
                const proposed = p.versionId !== null && isProposedVersion(p);
                const canPropose = !atDate && mayPropose(rights, p.ownerProfile);
                return (
                  <tr key={p.key} className="cursor-pointer border-t border-slate-100 align-top hover:bg-slate-50" onClick={() => setHistoryKey(p.key)}>
                    <Td>
                      <button
                        type="button"
                        className="text-left"
                        onClick={(e) => {
                          e.stopPropagation();
                          setHistoryKey(p.key);
                        }}
                      >
                        <span className="block font-medium text-slate-900 hover:underline" title={`Clé technique : ${p.key}`}>{p.label}</span>
                        
                      </button>
                    </Td>
                    <Td label="Valeur">
                      <span className={p.type === 'formula' ? 'block max-w-md break-words font-mono text-xs text-slate-800' : 'font-semibold text-slate-900 tabular-nums'}>
                        {formatParameterValue(p.type, p.value, p.unit)}
                      </span>
                      {p.versionId === null ? (
                        <span className="mt-1 block text-xs text-slate-500">Aucune version à cette date.</span>
                      ) : proposed ? (
                        <span className="mt-1 block">
                          <Pill tone="amber">Proposé, à valider</Pill>
                        </span>
                      ) : null}
                      {p.defaultValue !== undefined && (p.versionId === null || !sameValue(p.value, p.defaultValue)) ? (
                        <span className="mt-1 block text-xs text-slate-500">
                          Par défaut : <span className={p.type === 'formula' ? 'break-words font-mono' : undefined}>{formatParameterValue(p.type, p.defaultValue, p.unit)}</span>
                        </span>
                      ) : null}
                      {p.defaultNote ? <span className="mt-0.5 block text-xs text-amber-700">{p.defaultNote}</span> : null}
                    </Td>
                    <Td label="Depuis" className="md:max-lg:hidden">
                      {p.validFrom ? (isDefaultSince(p.validFrom) ? 'Valeur par défaut' : dateTimeFr(p.validFrom)) : '—'}
                      {p.createdByName ? <span className="block text-xs text-slate-500">par {p.createdByName}</span> : null}
                    </Td>
                    <Td label="Type et bornes" className="md:max-lg:hidden">
                      <span className="block text-xs text-slate-600">
                        {TYPE_LABELS[p.type]}
                        {p.unit && p.type !== 'formula' ? ` · ${p.unit}` : ''}
                      </span>
                      {rangeLabel(p) ? <span className="block text-xs text-slate-500">{rangeLabel(p)}</span> : null}
                    </Td>
                    <Td label="Responsable">
                      <span className="text-xs text-slate-600">{ownerLabel(p.ownerProfile)}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {canPropose ? (
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(p);
                            }}
                          >
                            <Plus className="h-3.5 w-3.5" /> Nouvelle valeur
                          </button>
                        ) : null}
                        <span className="inline-flex items-center gap-1 px-1 text-xs text-slate-500">
                          <History className="h-3.5 w-3.5" />
                          <ChevronRight className="h-4 w-4" />
                        </span>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </Card>
      ))}

      {atDate ? (
        <p className="flex items-center gap-1.5 text-xs text-slate-500">
          <CalendarClock className="h-3.5 w-3.5" /> Valeurs en vigueur à la fin du {atDate} (UTC) : c’est la valeur que les calculs de ce jour-là ont utilisée.
        </p>
      ) : null}

      {historyParam ? (
        <ParameterHistoryPanel
          param={historyParam}
          canPropose={!atDate && mayPropose(rights, historyParam.ownerProfile)}
          onPropose={() => setEditing(historyParam)}
          onClose={() => setHistoryKey(null)}
        />
      ) : null}
      {editing ? <ParameterValueModal param={editing} catalog={all} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

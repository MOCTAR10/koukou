import { useQuery } from '@tanstack/react-query';
import { Info, Target, TrendingUp, Warehouse } from 'lucide-react';
import { api } from '../../api/client';
import type { PilotageObjective } from '../../api/types-pilotage';
import { dateFr } from '../../lib/format';
import { ErrorNote } from '../form';
import { Note, Pill, SectionCard } from '../flock/shared';
import { DataTable, Loading, StatCard, Td, Th } from '../ui';
import { objectiveQueryString, type PilotageFilters } from './filters';
import { countLabel, headsLabel, numLabel, pctLabel, tonnesLabel } from './format';
import { FigureRow, MethodNotes } from './shared';
import { PILOTAGE_REFRESH_MS } from './perimeter';

/**
 * The 100 000 t objective (`GET /pilotage/objective`): what the programme
 * produced against the national objective, its capacity and the 2027-2030
 * projection with each input's source. The caveat always shows: the POUFA
 * farms are only part of the national production.
 */
export function ObjectiveView({ filters }: { filters: PilotageFilters }) {
  const qs = objectiveQueryString(filters);
  const query = useQuery({
    queryKey: ['pilotage-objective', qs],
    queryFn: () => api.get<PilotageObjective>(`/pilotage/objective${qs}`),
    retry: false,
    refetchInterval: PILOTAGE_REFRESH_MS,
  });
  if (query.isLoading) return <Loading label="Calcul de la projection…" />;
  if (query.error || !query.data) return <ErrorNote error={query.error ?? 'Objectif indisponible.'} />;
  const d = query.data;
  const a = d.actual;
  const share = a?.last12MonthsSharePct ?? null;

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{d.caveat}</span>
      </div>
      <p className="text-xs text-slate-500">
        Depuis le début du programme{a ? ` (${dateFr(a.since)})` : ''} : la période choisie ne s’applique pas ici ; les filtres province, cohorte et statut, oui.
      </p>

      {d.suppressed ? (
        <Note tone="slate">Chiffres masqués : ils reposeraient sur trop peu de fermes pour un profil de données agrégées.</Note>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Objectif national" value={tonnesLabel(d.objective.tonnes)} hint={`${d.objective.unit} par an · fixé dans les Paramètres`} icon={<Target className="h-4 w-4" />} />
        <StatCard label="Réalisé depuis le début" value={a ? tonnesLabel(a.tonnes) : '—'} hint={a ? `${headsLabel(a.heads)} sorties vivantes` : undefined} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="12 derniers mois" value={a ? tonnesLabel(a.last12MonthsTonnes) : '—'} hint={`${pctLabel(share, 2)} de l’objectif annuel`} icon={<TrendingUp className="h-4 w-4" />} />
        <StatCard label="Année en cours" value={a ? tonnesLabel(a.yearToDateTonnes) : '—'} icon={<TrendingUp className="h-4 w-4" />} />
      </div>

      {a ? (
        <SectionCard title="Contribution des 12 derniers mois à l’objectif annuel">
          <div className="h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${pctLabel(share, 2)} de l’objectif`}>
            <div className="h-full rounded-full bg-brand-600" style={{ width: `${Math.min(100, Math.max(share ?? 0, share ? 0.5 : 0))}%` }} />
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {tonnesLabel(a.last12MonthsTonnes)} sur {tonnesLabel(d.objective.tonnes)} : {pctLabel(share, 2)}.
          </p>
        </SectionCard>
      ) : null}

      {d.capacity ? (
        <SectionCard title="Capacité" icon={<Warehouse />}>
          <FigureRow label="Fermes actives">{d.capacity.farms}</FigureRow>
          <FigureRow label="Places (capacité du registre, sinon plus grande bande)">{numLabel(d.capacity.places, 0)}</FigureRow>
          <FigureRow label="Fermes sans capacité au registre">{countLabel(d.capacity.farmsWithoutCapacity, 'ferme', 'fermes')}</FigureRow>
        </SectionCard>
      ) : null}

      {d.projection ? (
        <>
          <SectionCard title="Projection 2027 → 2030" subtitle={`Potentiel annuel des fermes actuelles : ${tonnesLabel(d.projection.annualPotentialTonnes)}`} flush>
            <DataTable>
              <thead>
                <tr>
                  <Th>Année</Th>
                  <Th>Production de l’année</Th>
                  <Th>Cumul du programme</Th>
                  <Th>Part de l’objectif annuel</Th>
                </tr>
              </thead>
              <tbody>
                {d.projection.years.map((y) => (
                  <tr key={y.year}>
                    <Td>
                      <span className="font-medium text-slate-800">{y.year}</span>
                    </Td>
                    <Td label="Production de l’année">{tonnesLabel(y.annualTonnes)}</Td>
                    <Td label="Cumul du programme">{tonnesLabel(y.cumulativeTonnes)}</Td>
                    <Td label="Part de l’objectif annuel">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(100, y.objectiveSharePct ?? 0)}%` }} />
                        </div>
                        {pctLabel(y.objectiveSharePct, 2)}
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </SectionCard>

          <SectionCard title="Hypothèses de la projection" subtitle="Observé sur les bandes du programme, ou paramètre du catalogue" flush>
            <DataTable>
              <thead>
                <tr>
                  <Th>Hypothèse</Th>
                  <Th>Valeur</Th>
                  <Th>Source</Th>
                  <Th>Détail</Th>
                </tr>
              </thead>
              <tbody>
                {d.projection.inputs.map((i) => (
                  <tr key={i.key}>
                    <Td>
                      <span className="font-medium text-slate-800">{i.label}</span>
                    </Td>
                    <Td label="Valeur">{numLabel(i.value, 2, i.unit)}</Td>
                    <Td label="Source">
                      <Pill tone={i.source === 'OBSERVE' ? 'emerald' : 'slate'}>{i.source === 'OBSERVE' ? 'Observé' : 'Paramètre'}</Pill>
                    </Td>
                    <Td label="Détail" className="text-xs text-slate-500">
                      {i.detail}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </SectionCard>

          <MethodNotes title="Méthode de la projection" notes={d.projection.method} />
        </>
      ) : null}
    </div>
  );
}

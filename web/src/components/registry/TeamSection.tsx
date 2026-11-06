import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import type { TeamMemberRow } from '../../api/types-programme';
import { Button, ErrorNote } from '../form';
import { Loading } from '../ui';
import { teamAccessState, teamRoleLabel, toggleActiveBody } from './teamRules';

const TONE: Record<'emerald' | 'amber' | 'slate', string> = {
  emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  slate: 'bg-slate-100 text-slate-600 ring-slate-200',
};

/**
 * F13: team accounts created by the exploitant (`GET /programme/farms/:farmId/team`)
 * and the per-farm suspension (`PUT …/team/:employmentId/active`,
 * ADMINISTRATION:ADMINISTRER). No salary nor HR data; see `backend/docs/comptes-equipe.md`.
 */
export function TeamSection({ farmId, canSuspend }: { farmId: string; canSuspend: boolean }) {
  const queryClient = useQueryClient();
  const key = ['programme-farm-team', farmId];
  const team = useQuery({ queryKey: key, queryFn: () => api.get<TeamMemberRow[]>(`/programme/farms/${farmId}/team`), retry: false });
  const toggle = useMutation({
    mutationFn: (m: TeamMemberRow) => api.put(`/programme/farms/${farmId}/team/${m.employmentId}/active`, toggleActiveBody(m)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  if (team.isLoading) return <Loading />;
  if (team.error) return <ErrorNote error={team.error} />;
  const rows = team.data ?? [];
  if (rows.length === 0) return <p className="text-sm text-slate-500">L’exploitant n’a créé aucun compte d’équipe.</p>;
  return (
    <div className="space-y-2">
      <ErrorNote error={toggle.error} />
      <ul className="divide-y divide-slate-100">
        {rows.map((m) => {
          const state = teamAccessState(m);
          return (
            <li key={m.employmentId} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{m.fullName}</p>
                <p className="text-xs text-slate-500">
                  {teamRoleLabel(m.role)}
                  {m.phone ? <> · <span className="font-mono">{m.phone}</span></> : null}
                  {m.role === 'ADMIN' ? ` · ${m.permissions?.length ?? 0} permission(s)` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${TONE[state.tone]}`}>{state.label}</span>
                {canSuspend && m.accountActive ? (
                  <Button tone="secondary" busy={toggle.isPending && toggle.variables?.employmentId === m.employmentId} onClick={() => toggle.mutate(m)}>
                    {m.linkActive ? 'Suspendre' : 'Rétablir'}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

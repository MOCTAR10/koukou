import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Users } from 'lucide-react';
import { api } from '../api/client';
import type { PublicUser } from '../api/types';
import { useFarm } from '../app/FarmContext';
import { Card, EmptyState, PageHeader, StatusBadge, Th, Td } from '../components/ui';

/** One farm employment link (GET /farms/:id/eleveurs), user nested. */
interface TeamMember {
  id: string;
  role: 'ADMIN' | 'ELEVEUR';
  active: boolean;
  jobTitle: string | null;
  user: PublicUser;
}

const inputCls =
  'w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100';

export function TeamPage() {
  const { farmId } = useFarm();
  const queryClient = useQueryClient();

  const team = useQuery({
    queryKey: ['eleveurs', farmId],
    queryFn: () => api.get<TeamMember[]>(`/farms/${farmId}/eleveurs`),
    enabled: !!farmId,
  });

  const addMember = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<PublicUser>(`/farms/${farmId}/eleveurs`, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['eleveurs', farmId] }),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mon équipe"
        subtitle="Comptes Éleveur rattachés à la ferme (saisie terrain, POS, caisse)."
        actions={
          <span className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            <Users className="h-4 w-4" /> {team.data?.length ?? 0} membre(s)
          </span>
        }
      />

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-sky-600" />
          <h2 className="text-sm font-semibold text-slate-700">Ajouter un éleveur</h2>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            addMember.mutate({
              fullName: String(f.get('fullName')),
              phone: String(f.get('phone')),
              code: String(f.get('code')),
              buildingAssignment: (f.get('buildingAssignment') as string) || undefined,
            });
            e.currentTarget.reset();
          }}
        >
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Nom complet *</span>
            <input name="fullName" required className={inputCls} />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Téléphone *</span>
            <input name="phone" required className={inputCls} placeholder="+241…" />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block font-medium text-slate-600">Code secret *</span>
            <input name="code" type="password" required minLength={6} className={inputCls} />
          </label>
          <label className="block text-xs sm:col-span-2">
            <span className="mb-1 block font-medium text-slate-600">Bâtiment assigné</span>
            <input name="buildingAssignment" className={inputCls} placeholder="Bâtiment A…" />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={addMember.isPending}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-60"
            >
              {addMember.isPending ? 'Création…' : 'Ajouter'}
            </button>
          </div>
        </form>
        {addMember.isError ? (
          <p className="mt-3 text-sm text-red-600">{(addMember.error as Error).message}</p>
        ) : null}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Membres</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Nom</Th>
                <Th>Contact</Th>
                <Th>Rôle</Th>
                <Th>Statut</Th>
              </tr>
            </thead>
            <tbody>
              {(team.data ?? []).map((m) => (
                <tr key={m.id} className="border-t border-slate-100">
                  <Td className="font-medium">
                    {m.user.fullName}
                    {m.jobTitle ? <div className="text-xs font-normal text-slate-400">{m.jobTitle}</div> : null}
                  </Td>
                  <Td>
                    <div>{m.user.phone}</div>
                    {m.user.email ? <div className="text-xs text-slate-400">{m.user.email}</div> : null}
                  </Td>
                  <Td><StatusBadge status={m.role} /></Td>
                  <Td><StatusBadge status={m.active ? 'active' : 'inactive'} /></Td>
                </tr>
              ))}
              {!team.data?.length ? (
                <tr>
                  <Td className="py-8 text-center text-slate-400">
                    <EmptyState message="Aucun éleveur dans la ferme." />
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
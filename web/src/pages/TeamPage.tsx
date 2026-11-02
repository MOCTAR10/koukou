import { useQuery } from '@tanstack/react-query';
import { Briefcase, ListTodo, Pencil, UserPlus, Users } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { BuildingOption, FarmMember, PermissionCatalog } from '../api/types-org';
import { useFarm } from '../app/FarmContext';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote } from '../components/form';
import { MemberFormModal } from '../components/org/MemberFormModal';
import { CONTRACT_LABEL, Pill, STAFF_ROLE_LABEL, SuccessNote } from '../components/org/shared';
import { Card, EmptyState, Loading, PageHeader, Td, Th } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

const linkCls =
  'inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50';

export function TeamPage() {
  const { farmId, farm } = useFarm();
  const { user } = useAuth();
  const [form, setForm] = useState<{ member: FarmMember | null } | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const team = useQuery({
    queryKey: ['eleveurs', farmId],
    queryFn: () => api.get<FarmMember[]>(`/farms/${farmId}/eleveurs`),
    enabled: !!farmId,
  });
  const catalog = useQuery({
    queryKey: ['permission-catalog', farmId],
    queryFn: () => api.get<PermissionCatalog>(`/farms/${farmId}/permissions`),
    enabled: !!farmId,
    staleTime: 5 * 60_000,
  });
  const buildings = useQuery({
    queryKey: ['buildings', farmId],
    queryFn: () => api.get<BuildingOption[]>(`/farms/${farmId}/buildings`),
    enabled: !!farmId,
  });

  const members = team.data ?? [];
  const isOwnFarm = farm?.ownerId === user?.id;
  const ownerName = farm?.owner?.fullName ?? (isOwnFarm ? user?.fullName : undefined);
  // The stored session carries the phone although AuthUser doesn't declare it.
  const ownerPhone = farm?.owner?.phone ?? (isOwnFarm ? (user as { phone?: string } | null)?.phone : undefined);

  const open = (member: FarmMember | null) => {
    setSuccess(null);
    setForm({ member });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Équipe"
        subtitle={farm?.name}
        actions={
          <>
            <Link to="/app/tasks" className={linkCls}>
              <ListTodo className="h-4 w-4" /> Tâches de l’équipe
            </Link>
            <Link to="/app/hr" className={linkCls}>
              <Briefcase className="h-4 w-4" /> Dossiers RH
            </Link>
            <Button disabled={!farmId} onClick={() => open(null)}>
              <UserPlus className="h-4 w-4" /> Ajouter un membre
            </Button>
          </>
        }
      />

      {success ? <SuccessNote>{success}</SuccessNote> : null}
      <ErrorNote error={team.error ?? catalog.error ?? buildings.error} />

      {team.isLoading ? (
        <Loading label="Chargement de l’équipe…" />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3">
            <Users className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-700">Membres ({members.length + (ownerName ? 1 : 0)})</h2>
            <span className="text-xs text-slate-400">Propriétaire, administrateurs et éleveurs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <Th>Nom</Th>
                  <Th>Téléphone</Th>
                  <Th>Rôle</Th>
                  <Th>Bâtiment</Th>
                  <Th>Dossier RH</Th>
                  <Th>Statut</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {ownerName ? (
                  <tr className="border-t border-slate-100 bg-emerald-50/40">
                    <Td className="font-medium text-slate-900">{ownerName}</Td>
                    <Td>{ownerPhone ?? '—'}</Td>
                    <Td>
                      <Pill tone="emerald">Propriétaire</Pill>
                    </Td>
                    <Td>—</Td>
                    <Td>—</Td>
                    <Td>
                      <Pill tone="emerald">Actif</Pill>
                    </Td>
                    <Td />
                  </tr>
                ) : null}
                {members.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 align-top">
                    <Td className="font-medium text-slate-900">
                      {m.user.fullName}
                      {m.jobTitle ? <div className="text-xs font-normal text-slate-500">{m.jobTitle}</div> : null}
                    </Td>
                    <Td className="whitespace-nowrap">{m.user.phone}</Td>
                    <Td>
                      <Pill tone={m.role === 'ADMIN' ? 'amber' : 'brand'}>{STAFF_ROLE_LABEL[m.role]}</Pill>
                    </Td>
                    <Td>{m.buildingAssignment ?? '—'}</Td>
                    <Td>
                      <HrSummary member={m} />
                    </Td>
                    <Td>{m.active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="red">Suspendu</Pill>}</Td>
                    <Td className="text-right">
                      <Button tone="secondary" className="!px-2.5 !py-1 !text-xs" onClick={() => open(m)}>
                        <Pencil className="h-3.5 w-3.5" /> Modifier
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {members.length === 0 ? (
            <div className="border-t border-slate-100 p-4">
              <EmptyState message="Aucun membre pour l’instant. Ajoutez un administrateur ou un éleveur pour les saisies de terrain." />
            </div>
          ) : null}
        </Card>
      )}

      {form && farmId ? (
        <MemberFormModal
          farmId={farmId}
          member={form.member}
          catalog={catalog.data}
          buildings={buildings.data ?? []}
          onClose={() => setForm(null)}
          onSaved={(message) => {
            setForm(null);
            setSuccess(message);
          }}
        />
      ) : null}
    </div>
  );
}

function HrSummary({ member: m }: { member: FarmMember }) {
  if (!m.contractType && !m.department && !m.hireDate && m.salaryFcfa == null) {
    return <Pill tone="amber">À compléter</Pill>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {m.contractType ? <Pill tone="brand">{CONTRACT_LABEL[m.contractType]}</Pill> : null}
      {m.department ? <Pill>{m.department}</Pill> : null}
      {m.hireDate ? <Pill>Depuis le {dateFr(m.hireDate)}</Pill> : null}
      {m.salaryFcfa != null ? <Pill>{fcfa(m.salaryFcfa)}</Pill> : null}
    </div>
  );
}

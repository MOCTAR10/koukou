import { useQuery } from '@tanstack/react-query';
import { Briefcase, PencilLine, UserRound, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { FarmMember } from '../api/types-org';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { ReadOnlyNotice } from '../components/access/ReadOnlyNotice';
import { ErrorNote } from '../components/form';
import { CONTRACT_LABEL, Pill, STAFF_ROLE_LABEL } from '../components/org/shared';
import { Card, DataTable, EmptyState, IconTile, Loading, PageHeader, StatCard, Td, Th } from '../components/ui';
import { dateFr, fcfa } from '../lib/format';

export function HrPage() {
  const { farmId, farm } = useFarm();
  const { hasPermission } = useFarmProfile();

  const members = useQuery({
    queryKey: ['eleveurs', farmId],
    queryFn: () => api.get<FarmMember[]>(`/farms/${farmId}/eleveurs`),
    enabled: !!farmId,
  });

  const list = members.data ?? [];
  const activeCount = list.filter((m) => m.active).length;
  const withDossier = list.filter((m) => m.contractType || m.hireDate || m.salaryFcfa != null).length;
  // POUFA lot A droits: the monthly payroll of the active members (also read by the DGE).
  const payroll = list.filter((m) => m.active).reduce((a, m) => a + (m.salaryFcfa ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dossiers RH"
        icon={<Briefcase className="h-6 w-6" />}
        subtitle={farm?.name}
        actions={
          hasPermission('equipe:gerer') ? (
            <Link
              to="/app/team"
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <PencilLine className="h-4 w-4" /> Gérer les dossiers dans Équipe
            </Link>
          ) : undefined
        }
      />

      <ReadOnlyNotice what="dossiers RH et salaires" />
      <ErrorNote error={members.error} />

      {members.isLoading ? (
        <Loading label="Chargement des dossiers…" />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard label="Employés actifs" value={activeCount} icon={<Users className="h-5 w-5" />} />
            <StatCard label="Dossiers renseignés" value={withDossier} tone="good" icon={<Briefcase className="h-5 w-5" />} />
            <StatCard label="Masse salariale mensuelle" value={fcfa(payroll)} hint="Employés actifs" icon={<Briefcase className="h-5 w-5" />} />
          </div>

          <Card className="overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-3">
              <IconTile icon={<UserRound className="h-4 w-4" />} size="sm" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-slate-700">Employés ({list.length})</h2>
                <p className="text-xs text-slate-500">Contrat, poste et rémunération</p>
              </div>
            </div>
            {list.length === 0 ? (
              <div className="p-4">
                <EmptyState message="Aucun employé rattaché à la ferme pour le moment." icon={<Users className="h-6 w-6" />} />
              </div>
            ) : (
              <DataTable>
                  <thead className="bg-slate-50">
                    <tr>
                      <Th>Employé</Th>
                      <Th>Poste</Th>
                      <Th>Contrat</Th>
                      <Th>Embauche</Th>
                      <Th className="hidden lg:table-cell">Fin</Th>
                      <Th className="text-right">Salaire mensuel</Th>
                      <Th className="hidden lg:table-cell">Observations</Th>
                      <Th>Statut</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((m) => (
                      <tr key={m.id} className="border-t border-slate-100 align-top">
                        <Td className="font-medium text-slate-900">
                          <div className="flex items-center gap-2.5">
                            <IconTile icon={<UserRound className="h-4 w-4" />} size="sm" />
                            <div className="min-w-0">
                              {m.user.fullName}
                              <div className="text-xs font-normal text-slate-500">{m.user.phone}</div>
                            </div>
                          </div>
                        </Td>
                        <Td label="Poste">
                          {m.jobTitle?.trim() || STAFF_ROLE_LABEL[m.role]}
                          {m.department ? <div className="text-xs text-slate-500">{m.department}</div> : null}
                        </Td>
                        <Td label="Contrat">{m.contractType ? <Pill tone="brand">{CONTRACT_LABEL[m.contractType]}</Pill> : <span className="text-slate-400">—</span>}</Td>
                        <Td label="Embauche" className="whitespace-nowrap">{dateFr(m.hireDate)}</Td>
                        <Td label="Fin" className="whitespace-nowrap md:max-lg:hidden">{dateFr(m.endDate)}</Td>
                        <Td label="Salaire mensuel" className="whitespace-nowrap text-right tabular-nums">
                          {m.salaryFcfa != null ? fcfa(m.salaryFcfa) : <span className="text-slate-400">Non renseigné</span>}
                        </Td>
                        <Td label="Observations" className="max-w-xs whitespace-pre-line text-xs text-slate-500 md:max-lg:hidden">{m.notes ?? '—'}</Td>
                        <Td label="Statut">{m.active ? <Pill tone="emerald">Actif</Pill> : <Pill tone="red">Inactif</Pill>}</Td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

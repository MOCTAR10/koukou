import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, CircleCheck, ClipboardList, ListTodo, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { api } from '../api/client';
import type { BatchWithMetrics } from '../api/types';
import type { AssignableMember, FarmMember, FarmTask, TaskStatus } from '../api/types-org';
import { useFarm } from '../app/FarmContext';
import { useFarmProfile } from '../app/useFarmProfile';
import { useCanRead } from '../app/useMenuAccess';
import { useAuth } from '../auth/AuthContext';
import { Button, ErrorNote, todayIso } from '../components/form';
import { ConfirmModal, invalidateFarm, TaskStatusBadge } from '../components/org/shared';
import { TaskFormModal } from '../components/org/TaskFormModal';
import { Card, DataTable, EmptyState, IconButton, Loading, PageHeader, Td, Th } from '../components/ui';
import { classNames, dateFr } from '../lib/format';

type Filter = 'OPEN' | 'DONE' | 'ALL';

const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'OPEN', label: 'À traiter' },
  { key: 'DONE', label: 'Terminées' },
  { key: 'ALL', label: 'Toutes' },
];

const NEXT_ACTION: Partial<Record<TaskStatus, { label: string; next: TaskStatus; icon: typeof Check }>> = {
  A_FAIRE: { label: 'Démarrer', next: 'EN_COURS', icon: CircleCheck },
  EN_COURS: { label: 'Terminer', next: 'FAIT', icon: Check },
  FAIT: { label: 'Réouvrir', next: 'A_FAIRE', icon: RotateCcw },
};

const isOpen = (t: FarmTask) => t.status === 'A_FAIRE' || t.status === 'EN_COURS';

function dueLabel(task: FarmTask): { text: string; cls: string } | null {
  if (!isOpen(task)) return null;
  const days = Math.round((Date.parse(task.dueDate) - Date.parse(todayIso())) / 86_400_000);
  if (days < 0) return { text: days < -1 ? `Retard · ${-days} j` : 'Retard · hier', cls: 'font-semibold text-red-600' };
  if (days === 0) return { text: "Aujourd'hui", cls: 'font-medium text-amber-600' };
  if (days === 1) return { text: 'Demain', cls: 'font-medium text-amber-600' };
  if (days <= 7) return { text: `Dans ${days} jours`, cls: 'text-slate-500' };
  return null;
}

export function TasksPage() {
  const { farmId } = useFarm();
  const { user } = useAuth();
  const { hasPermission } = useFarmProfile();
  const canManage = hasPermission('equipe:taches');
  // The team lists are Fermia-only (EQUIPE): an institution reads the tasks without them.
  const canReadTeam = useCanRead()('EQUIPE');
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [form, setForm] = useState<{ task: FarmTask | null } | null>(null);
  const [cancelling, setCancelling] = useState<FarmTask | null>(null);
  const [deleting, setDeleting] = useState<FarmTask | null>(null);

  const tasks = useQuery({
    queryKey: ['tasks', farmId],
    queryFn: () => api.get<FarmTask[]>(`/farms/${farmId}/tasks`),
    enabled: !!farmId,
  });
  const assignable = useQuery({
    queryKey: ['assignable-team', farmId],
    queryFn: () => api.get<AssignableMember[]>(`/farms/${farmId}/team`),
    enabled: !!farmId && canManage && canReadTeam,
  });
  // The full list too: a suspended assignee is no longer in the assignable team.
  const members = useQuery({
    queryKey: ['eleveurs', farmId],
    queryFn: () => api.get<FarmMember[]>(`/farms/${farmId}/eleveurs`),
    enabled: !!farmId && hasPermission('equipe:gerer', 'rh:lire') && canReadTeam,
  });
  const batches = useQuery({
    queryKey: ['batches', farmId],
    queryFn: () => api.get<BatchWithMetrics[]>(`/farms/${farmId}/batches`),
    enabled: !!farmId,
  });

  const setStatus = useMutation({
    mutationFn: ({ task, status }: { task: FarmTask; status: TaskStatus }) =>
      api.patch<FarmTask>(`/farms/${farmId}/tasks/${task.id}`, { status }),
    onSuccess: async () => {
      await invalidateFarm(queryClient, farmId ?? '');
      setCancelling(null);
    },
  });
  const remove = useMutation({
    mutationFn: (task: FarmTask) => api.del(`/farms/${farmId}/tasks/${task.id}`),
    onSuccess: async () => {
      await invalidateFarm(queryClient, farmId ?? '');
      setDeleting(null);
    },
  });

  const list = tasks.data ?? [];
  const counts: Record<Filter, number> = {
    OPEN: list.filter(isOpen).length,
    DONE: list.filter((t) => t.status === 'FAIT').length,
    ALL: list.length,
  };
  const rows = list.filter((t) => (filter === 'OPEN' ? isOpen(t) : filter === 'DONE' ? t.status === 'FAIT' : true));

  const memberName = (id: string | null) => {
    if (!id) return null;
    if (id === user?.id) return user.fullName;
    return members.data?.find((m) => m.userId === id)?.user.fullName ?? assignable.data?.find((m) => m.userId === id)?.fullName ?? null;
  };
  const batchName = (id: string | null) => (id ? (batches.data?.find((b) => b.id === id)?.batchName ?? 'Lot') : null);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tâches"
        icon={<ListTodo className="h-6 w-6" />}
        subtitle={`${counts.OPEN} à traiter · ${counts.DONE} terminée${counts.DONE > 1 ? 's' : ''}`}
        actions={
          canManage ? (
            <Button onClick={() => setForm({ task: null })} disabled={!farmId}>
              <Plus className="h-4 w-4" /> Nouvelle tâche
            </Button>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={classNames(
              'rounded-full px-3 py-1.5 text-sm font-medium ring-1',
              filter === f.key ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50',
            )}
          >
            {f.label} · {counts[f.key]}
          </button>
        ))}
      </div>

      <ErrorNote error={tasks.error ?? (cancelling ? null : setStatus.error)} onRetry={tasks.error ? () => void tasks.refetch() : undefined} />

      {tasks.isLoading ? (
        <Loading label="Chargement des tâches…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" />}
          message={
            filter === 'OPEN'
              ? 'Aucune tâche en attente. Planifiez le travail de votre équipe avec le bouton « Nouvelle tâche ».'
              : 'Aucune tâche ici. Les tâches terminées et annulées apparaîtront ici.'
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable>
              <thead className="bg-slate-50">
                <tr>
                  <Th>Tâche</Th>
                  <Th>Assignée à</Th>
                  <Th className="hidden lg:table-cell">Lot</Th>
                  <Th>Échéance</Th>
                  <Th>Statut</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => {
                  const due = dueLabel(t);
                  // Without equipe:taches the server only lets you move your own task forward.
                  const next = canManage || (t.assigneeId === user?.id && t.status !== 'FAIT') ? NEXT_ACTION[t.status] : undefined;
                  const rowBusy = setStatus.isPending && setStatus.variables?.task.id === t.id && !cancelling;
                  return (
                    <tr key={t.id} className="border-t border-slate-100 align-top">
                      <Td className={classNames('max-w-md', !isOpen(t) && 'opacity-60')}>
                        <div className="font-medium text-slate-900">{t.title}</div>
                        {t.notes ? <div className="mt-0.5 whitespace-pre-line text-xs text-slate-500">{t.notes}</div> : null}
                      </Td>
                      <Td label="Assignée à">{memberName(t.assigneeId) ?? (t.assigneeId ? '—' : <span className="text-slate-400">Tâche libre</span>)}</Td>
                      <Td label="Lot" className="md:max-lg:hidden">{batchName(t.batchId) ?? <span className="text-slate-400">—</span>}</Td>
                      <Td label="Échéance" className="whitespace-nowrap">
                        <div>{dateFr(t.dueDate)}</div>
                        {due ? <div className={classNames('text-xs', due.cls)}>{due.text}</div> : null}
                      </Td>
                      <Td label="Statut">
                        <TaskStatusBadge status={t.status} />
                      </Td>
                      <Td>
                        <div className="flex items-center justify-end gap-1.5">
                          {next ? (
                            <Button
                              tone="secondary"
                              className="whitespace-nowrap !px-2.5 !py-1 !text-xs"
                              busy={rowBusy}
                              onClick={() => setStatus.mutate({ task: t, status: next.next })}
                            >
                              {rowBusy ? null : <next.icon className="h-3.5 w-3.5" />}
                              {next.label}
                            </Button>
                          ) : null}
                          {canManage ? (
                            <IconButton label="Modifier" onClick={() => setForm({ task: t })}>
                              <Pencil className="h-4 w-4" />
                            </IconButton>
                          ) : null}
                          {!canManage ? null : t.status === 'ANNULEE' ? (
                            <IconButton
                              label="Supprimer la tâche"
                              danger
                              onClick={() => {
                                remove.reset();
                                setDeleting(t);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </IconButton>
                          ) : (
                            <IconButton
                              label="Annuler la tâche"
                              danger
                              onClick={() => {
                                setStatus.reset();
                                setCancelling(t);
                              }}
                            >
                              <X className="h-4 w-4" />
                            </IconButton>
                          )}
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
          </DataTable>
        </Card>
      )}

      {form && farmId ? (
        <TaskFormModal
          farmId={farmId}
          task={form.task}
          assignable={assignable.data ?? []}
          members={members.data ?? []}
          batches={batches.data ?? []}
          onClose={() => setForm(null)}
        />
      ) : null}

      {cancelling ? (
        <ConfirmModal
          title="Annuler la tâche"
          message={`La tâche « ${cancelling.title} » sera marquée comme annulée.`}
          confirmLabel="Annuler la tâche"
          busy={setStatus.isPending}
          error={setStatus.error}
          onConfirm={() => setStatus.mutate({ task: cancelling, status: 'ANNULEE' })}
          onCancel={() => setCancelling(null)}
        />
      ) : null}

      {deleting ? (
        <ConfirmModal
          title="Supprimer la tâche"
          message={`La tâche « ${deleting.title} » sera supprimée définitivement.`}
          confirmLabel="Supprimer"
          busy={remove.isPending}
          error={remove.error}
          onConfirm={() => remove.mutate(deleting)}
          onCancel={() => setDeleting(null)}
        />
      ) : null}
    </div>
  );
}

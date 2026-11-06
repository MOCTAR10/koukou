import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Plus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api } from '../../api/client';
import type { BatchWithMetrics } from '../../api/types';
import type { AssignableMember, CreateTaskInput, FarmMember, FarmTask, UpdateTaskInput } from '../../api/types-org';
import { Button, ErrorNote, Field, inputCls, Modal, todayIso, DateInput } from '../form';
import { invalidateFarm } from './shared';

export function TaskFormModal({
  farmId,
  task,
  assignable,
  members,
  batches,
  onClose,
}: {
  farmId: string;
  task: FarmTask | null;
  assignable: AssignableMember[];
  members: FarmMember[];
  batches: BatchWithMetrics[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(task?.title ?? '');
  const [dueDate, setDueDate] = useState(task?.dueDate ?? todayIso());
  const [assigneeId, setAssigneeId] = useState(task?.assigneeId ?? '');
  const [batchId, setBatchId] = useState(task?.batchId ?? '');
  const [notes, setNotes] = useState(task?.notes ?? '');

  // A suspended member or a closed lot stays listed while the task still points at it.
  const suspended =
    task?.assigneeId && !assignable.some((m) => m.userId === task.assigneeId)
      ? members.find((m) => m.userId === task.assigneeId)
      : undefined;
  const lots = batches.filter((b) => (b.quantityAlive > 0 && b.status !== 'CLOTURE') || b.id === task?.batchId);

  const save = useMutation({
    mutationFn: () => {
      const cleanTitle = title.trim();
      const cleanNotes = notes.trim();
      if (task) {
        const body: UpdateTaskInput = { title: cleanTitle, dueDate, notes: cleanNotes || null };
        // Only send a changed link: the server refuses a suspended assignee even if unchanged.
        if (assigneeId !== (task.assigneeId ?? '')) body.assigneeId = assigneeId || null;
        if (batchId !== (task.batchId ?? '')) body.batchId = batchId || null;
        return api.patch<FarmTask>(`/farms/${farmId}/tasks/${task.id}`, body);
      }
      const body: CreateTaskInput = {
        title: cleanTitle,
        dueDate,
        ...(cleanNotes ? { notes: cleanNotes } : {}),
        ...(assigneeId ? { assigneeId } : {}),
        ...(batchId ? { batchId } : {}),
      };
      return api.post<FarmTask>(`/farms/${farmId}/tasks`, body);
    },
    onSuccess: async () => {
      await invalidateFarm(queryClient, farmId);
      onClose();
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) save.mutate();
  };

  return (
    <Modal title={task ? 'Modifier la tâche' : 'Nouvelle tâche'} onClose={() => !save.isPending && onClose()}>
      <form className="space-y-4" onSubmit={submit}>
        <Field label="Titre *">
          <input
            className={inputCls}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Nettoyage des abreuvoirs"
            required
            autoFocus
          />
        </Field>
        <Field label="Échéance *">
          <DateInput className={inputCls} value={dueDate} onChange={(e) => setDueDate(e.target.value)} required />
        </Field>
        <Field
          label="Assigner à"
          hint={assignable.length === 0 ? 'Aucun membre actif : la tâche restera non assignée.' : undefined}
        >
          <select className={inputCls} value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            <option value="">Non assignée (tâche libre)</option>
            {suspended ? <option value={suspended.userId}>{suspended.user.fullName} (suspendu)</option> : null}
            {assignable.map((m) => (
              <option key={m.userId} value={m.userId}>
                {m.fullName}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Lot concerné">
          <select className={inputCls} value={batchId} onChange={(e) => setBatchId(e.target.value)}>
            <option value="">Aucun lot</option>
            {lots.map((b) => (
              <option key={b.id} value={b.id}>
                {b.batchName ?? 'Lot'} · {b.quantityAlive.toLocaleString('fr-FR')} sujets
              </option>
            ))}
          </select>
        </Field>
        <Field label="Remarques">
          <textarea
            className={inputCls}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Détails, consignes de sécurité…"
          />
        </Field>
        <ErrorNote error={save.error} />
        <div className="flex justify-end gap-2">
          <Button tone="secondary" onClick={onClose} disabled={save.isPending}>
            Annuler
          </Button>
          <Button type="submit" busy={save.isPending} disabled={!title.trim() || !dueDate}>
            {save.isPending ? null : task ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {task ? 'Enregistrer' : 'Créer la tâche'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

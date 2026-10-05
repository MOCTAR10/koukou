import React, { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Check,
  CircleCheck,
  ClipboardList,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';

import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { Screen, ScreenHeader } from '@/components/ui/Screen';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';

import { useAuth } from '@/auth/AuthContext';
import { useFarmProfile } from '@/hooks/useFarmProfile';
import { fetchAssignableTeam, fetchBatches, fetchTasks } from '@/api';
import { createTask, updateTask, deleteTask, type TaskStatusValue } from '@/api/mutations';
import { invalidateFarmQueries } from '@/api/invalidate';
import { canManageFarm } from '@/api/roles';
import type { FarmTask, TaskStatus } from '@/api/types';
import { color, palette, radii, spacing } from '@/constants/theme';

const STATUS_LABELS: Record<TaskStatus, string> = {
  A_FAIRE: 'À faire',
  EN_COURS: 'En cours',
  FAIT: 'Fait',
  ANNULEE: 'Annulée',
};

const STATUS_TONES: Record<TaskStatus, 'brand' | 'accent' | 'green' | 'neutral'> = {
  A_FAIRE: 'brand',
  EN_COURS: 'accent',
  FAIT: 'green',
  ANNULEE: 'neutral',
};

/** Date locale (YYYY-MM-DD) : évite le décalage d'un jour de toISOString() (UTC). */
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayStr(): string {
  return toLocalDateString(new Date());
}

/** Échéance vs aujourd'hui (UTC-safe : chaînes YYYY-MM-DD comparées lexicalement). */
function dueLabel(task: FarmTask): { text: string; tone: 'red' | 'amber' | 'neutral' } | null {
  if (task.status === 'FAIT' || task.status === 'ANNULEE') return null;
  const today = todayStr();
  if (task.dueDate < today) {
    const days = Math.round((Date.parse(today) - Date.parse(task.dueDate)) / 86_400_000);
    return { text: days > 1 ? `Retard · ${days} j` : 'Retard · hier', tone: 'red' };
  }
  if (task.dueDate === today) return { text: "Aujourd'hui", tone: 'amber' };
  const days = Math.round((Date.parse(task.dueDate) - Date.parse(today)) / 86_400_000);
  if (days === 1) return { text: 'Demain', tone: 'amber' };
  if (days <= 7) return { text: `Dans ${days} jours`, tone: 'neutral' };
  return null;
}

function dateFr(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return y && m && d ? `${Number(d)}/${Number(m)}/${y}` : iso;
}

// ── Formulaire (création + édition) ──────────────────────────

function TaskFormSheet({
  initial,
  members,
  canManage,
  onClose,
}: {
  initial: FarmTask | null;
  members: { id: string; userId: string; fullName: string }[];
  canManage: boolean;
  onClose: () => void;
}) {
  const { farmId } = useAuth();
  const queryClient = useQueryClient();
  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });

  const [title, setTitle] = useState(initial?.title ?? '');
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [dueDate, setDueDate] = useState<Date>(initial ? new Date(`${initial.dueDate}T12:00:00`) : new Date());
  const [showDate, setShowDate] = useState(false);
  const [assigneeId, setAssigneeId] = useState(initial?.assigneeId ?? '');
  const [batchId, setBatchId] = useState(initial?.batchId ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seuls les lots vivants de la ferme peuvent être ciblés.
  const lots = (batchesQuery.data ?? []).filter((b) => b.quantityAlive > 0 && b.status !== 'CLOTURE');

  const submit = async () => {
    if (!title.trim()) {
      setError('Le titre est requis.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (initial) {
        // Édition : le lot n'est modifiable que par le propriétaire (sinon 403).
        await updateTask(farmId, initial.id, {
          title: title.trim(),
          notes: notes.trim() ? notes.trim() : null,
          dueDate: toLocalDateString(dueDate),
          ...(canManage
            ? { assigneeId: assigneeId || null, batchId: batchId || null }
            : {}),
        });
      } else {
        await createTask(farmId, {
          title: title.trim(),
          notes: notes.trim() ? notes.trim() : undefined,
          dueDate: toLocalDateString(dueDate),
          ...(assigneeId ? { assigneeId } : {}),
          ...(batchId ? { batchId } : {}),
        });
      }
      invalidateFarmQueries(queryClient, { farmId });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’enregistrement.');
      setBusy(false);
    }
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={initial ? 'Modifier la tâche' : 'Nouvelle tâche'}
      subtitle={initial ? initial.title : 'Travail planifié pour un éleveur'}
      icon={<ClipboardList size={22} color={color.brand[600]} />}>
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            TITRE
          </AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex : Nettoyage des abreuvoirs"
            placeholderTextColor={color.ink[300]}
            style={styles.input}
            editable={!busy}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            ÉCHÉANCE
          </AppText>
          <Pressable onPress={() => setShowDate(true)} style={styles.dateBtn} accessibilityRole="button">
            <CalendarDays size={16} color={color.brand[600]} />
            <AppText size="body" weight="semibold" color="text">
              {toLocalDateString(dueDate).split('-').reverse().join('/')}
            </AppText>
          </Pressable>
          {showDate ? (
            <DateTimePicker
              value={dueDate}
              mode="date"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_e: DateTimePickerEvent, d?: Date) => {
                if (Platform.OS === 'android') setShowDate(false);
                if (d) setDueDate(d);
              }}
              locale="fr-FR"
            />
          ) : null}
        </View>

        {canManage ? (
          <>
            <View style={{ gap: spacing.sm }}>
              <AppText size="label" color="muted">
                ASSIGNER À (OPTIONNEL)
              </AppText>
              <View style={styles.rowWrap}>
                {members.map((m) => (
                  <Pressable
                    key={m.userId}
                    onPress={() => {
                      setAssigneeId(assigneeId === m.userId ? '' : m.userId);
                      setError(null);
                    }}
                    accessibilityRole="button">
                    <Chip label={m.fullName} tone="brand" selected={assigneeId === m.userId} />
                  </Pressable>
                ))}
                {members.length === 0 ? (
                  <AppText size="caption" color="muted">
                    Aucun éleveur rattaché — la tâche restera non assignée.
                  </AppText>
                ) : null}
              </View>
            </View>

            <View style={{ gap: spacing.sm }}>
              <AppText size="label" color="muted">
                LOT CONCERNÉ (OPTIONNEL)
              </AppText>
              <View style={styles.rowWrap}>
                {lots.map((b) => (
                  <Pressable
                    key={b.id}
                    onPress={() => {
                      setBatchId(batchId === b.id ? '' : b.id);
                      setError(null);
                    }}
                    accessibilityRole="button">
                    <Chip
                      label={`${b.batchName ?? b.id} · ${b.quantityAlive}`}
                      tone={b.status === 'EN_VENTE' ? 'green' : 'brand'}
                      selected={batchId === b.id}
                    />
                  </Pressable>
                ))}
              </View>
            </View>
          </>
        ) : null}

        <View style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            REMARQUES (OPTIONNEL)
          </AppText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Détails, consignes de sécurité…"
            placeholderTextColor={color.ink[300]}
            style={[styles.input, styles.notesInput]}
            multiline
            textAlignVertical="top"
            editable={!busy}
          />
        </View>

        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}

        <Button
          label={initial ? 'Enregistrer' : 'Créer la tâche'}
          tone="brand"
          loading={busy}
          disabled={busy || !title.trim()}
          onPress={() => void submit()}
        />
      </View>
    </Sheet>
  );
}

// ── Carte tâche ──────────────────────────────────────────────

function TaskCard({
  task,
  assigneeName,
  batchName,
  canManage,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: FarmTask;
  assigneeName: string | null;
  batchName: string | null;
  canManage: boolean;
  onToggle: (next: TaskStatusValue) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === 'FAIT';
  const cancelled = task.status === 'ANNULEE';
  const dimmed = done || cancelled;
  const due = dueLabel(task);

  const nextAction: { label: string; next: TaskStatusValue; icon: typeof Check; tone: 'brand' | 'accent' | 'green' } | null =
    task.status === 'A_FAIRE'
      ? { label: 'Démarrer', next: 'EN_COURS', icon: CircleCheck, tone: 'brand' }
      : task.status === 'EN_COURS'
        ? { label: 'Terminer', next: 'FAIT', icon: Check, tone: 'green' }
        : task.status === 'FAIT' && canManage
          ? { label: 'Réouvrir', next: 'A_FAIRE', icon: RotateCcw, tone: 'brand' }
          : null;

  return (
    <Card style={styles.taskCard}>
      <View style={styles.taskHead}>
        <View style={styles.taskTitleWrap}>
          <AppText
            size="body"
            weight="semibold"
            color="text"
            numberOfLines={2}
            style={dimmed ? styles.dimmed : undefined}>
            {task.title}
          </AppText>
          <AppText size="caption" color="muted" numberOfLines={1}>
            {assigneeName ? `👤 ${assigneeName}` : 'Tâche libre'}
            {batchName ? ` · 🏠 ${batchName}` : ''}
          </AppText>
        </View>
        <Chip label={STATUS_LABELS[task.status]} tone={STATUS_TONES[task.status]} />
      </View>

      <View style={styles.taskFooter}>
        <View style={styles.dueRow}>
          <CalendarDays
            size={13}
            color={due?.tone === 'red' ? palette.red[500] : due?.tone === 'amber' ? palette.amber[500] : color.ink[400]}
          />
          <AppText
            size="caption"
            weight={due?.tone === 'red' ? 'bold' : 'medium'}
            color={due?.tone === 'red' ? 'danger' : due?.tone === 'amber' ? 'warn' : 'muted'}>
            {dateFr(task.dueDate)}
            {due ? ` · ${due.text}` : ''}
          </AppText>
        </View>
        <View style={styles.taskActions}>
          {nextAction ? (
            <Pressable
              onPress={() => onToggle(nextAction.next)}
              style={[styles.actionBtn, { backgroundColor: palette.green[50] }]}
              accessibilityRole="button"
              accessibilityLabel={nextAction.label}>
              <nextAction.icon size={16} color={palette.green[600]} />
              <AppText size="caption" weight="semibold" color="success">
                {nextAction.label}
              </AppText>
            </Pressable>
          ) : null}
          {canManage ? (
            <>
              <Pressable onPress={onEdit} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Modifier">
                <Pencil size={15} color={color.ink[500]} />
              </Pressable>
              {task.status !== 'ANNULEE' ? (
                <Pressable onPress={() => onToggle('ANNULEE')} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Annuler la tâche">
                  <X size={16} color={color.red[500]} />
                </Pressable>
              ) : (
                <Pressable onPress={onDelete} hitSlop={8} style={styles.iconBtn} accessibilityRole="button" accessibilityLabel="Supprimer la tâche">
                  <Trash2 size={15} color={color.red[500]} />
                </Pressable>
              )}
            </>
          ) : null}
        </View>
      </View>
      {task.notes ? (
        <AppText size="caption" color="muted" numberOfLines={3} style={dimmed ? styles.dimmed : undefined}>
          {task.notes}
        </AppText>
      ) : null}
    </Card>
  );
}

// ── Écran principal ──────────────────────────────────────────

type Filter = 'OPEN' | 'MINE_DONE' | 'ALL';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'OPEN', label: 'À traiter' },
  { key: 'MINE_DONE', label: 'Terminées' },
  { key: 'ALL', label: 'Toutes' },
];

export default function TasksScreen() {
  const { farmId, user } = useAuth();
  const profileHook = useFarmProfile();
  const canManage =
    canManageFarm(user.role) ||
    profileHook.isOwner ||
    profileHook.hasPermission('equipe:taches');
  const queryClient = useQueryClient();

  const tasksQuery = useQuery({ queryKey: ['tasks', farmId], queryFn: () => fetchTasks(farmId) });
  const teamQuery = useQuery({
    queryKey: ['assignable-team', farmId],
    queryFn: () => fetchAssignableTeam(farmId),
    enabled: canManage,
  });
  const batchesQuery = useQuery({ queryKey: ['batches', farmId], queryFn: () => fetchBatches(farmId) });

  const [filter, setFilter] = useState<Filter>('OPEN');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<FarmTask | null>(null);

  const members = useMemo(() => teamQuery.data ?? [], [teamQuery.data]);
  const memberNames = useMemo(() => new Map(members.map((m) => [m.userId, m.fullName])), [members]);
  const batchNames = useMemo(
    () => new Map((batchesQuery.data ?? []).map((b) => [b.id, b.batchName ?? 'Lot'])),
    [batchesQuery.data],
  );

  const taskList = useMemo(() => tasksQuery.data ?? [], [tasksQuery.data]);
  const counts = useMemo(
    () => ({
      open: taskList.filter((t) => t.status === 'A_FAIRE' || t.status === 'EN_COURS').length,
      done: taskList.filter((t) => t.status === 'FAIT').length,
      all: taskList.length,
    }),
    [taskList],
  );

  const filtered = useMemo(() => {
    if (filter === 'OPEN') return taskList.filter((t) => t.status === 'A_FAIRE' || t.status === 'EN_COURS');
    if (filter === 'MINE_DONE') return taskList.filter((t) => t.status === 'FAIT');
    return taskList;
  }, [taskList, filter]);

  const toggle = async (task: FarmTask, next: TaskStatusValue) => {
    try {
      await updateTask(farmId, task.id, { status: next });
      invalidateFarmQueries(queryClient, { farmId });
    } catch {
      // Le serveur renvoie un message 403 explicite pour l'éleveur ; on ignore silencieusement.
    }
  };

  const remove = async (task: FarmTask) => {
    try {
      await deleteTask(farmId, task.id);
      invalidateFarmQueries(queryClient, { farmId });
    } catch {
      // 403 éleveur / introuvable : la liste se rafraîchit à l'invalidation.
    }
  };

  return (
    <Screen
      bottomPad={96}
      refreshing={tasksQuery.isFetching}
      onRefresh={() => void tasksQuery.refetch()}
      header={
        <ScreenHeader
          title="Tâches"
          subtitle={
            canManage
              ? `${counts.open} à traiter · ${counts.done} terminée(s)`
              : 'Vos tâches assignées'
          }
          back
          right={
            canManage ? (
              <Pressable onPress={() => setCreateOpen(true)} style={styles.addBtn} accessibilityRole="button">
                <Plus size={22} color={color.surface} />
              </Pressable>
            ) : undefined
          }
        />
      }>
      {tasksQuery.isLoading ? (
        <Spinner label="Chargement des tâches…" />
      ) : (
        <View style={{ gap: spacing.lg }}>
          <View style={styles.rowWrap}>
            {FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => setFilter(f.key)} accessibilityRole="button">
                <Chip
                  label={`${f.label} · ${f.key === 'OPEN' ? counts.open : f.key === 'MINE_DONE' ? counts.done : counts.all}`}
                  tone="neutral"
                  selected={filter === f.key}
                />
              </Pressable>
            ))}
          </View>

          {filtered.length === 0 ? (
            <Card tone="default">
              <EmptyState
                emoji="📋"
                title={filter === 'OPEN' ? 'Aucune tâche en attente' : 'Aucune tâche ici'}
                description={
                  filter === 'OPEN'
                    ? canManage
                      ? 'Planifiez le travail de votre équipe depuis le bouton +.'
                      : 'Rien à faire pour le moment. Belle journée !'
                    : 'Les tâches terminées et annulées apparaîtront ici.'
                }
              />
            </Card>
          ) : (
            filtered.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                assigneeName={t.assigneeId ? memberNames.get(t.assigneeId) ?? null : null}
                batchName={t.batchId ? batchNames.get(t.batchId) ?? null : null}
                canManage={canManage}
                onToggle={(next) => void toggle(t, next)}
                onEdit={() => setEditing(t)}
                onDelete={() => void remove(t)}
              />
            ))
          )}
        </View>
      )}

      {createOpen ? (
        <TaskFormSheet
          initial={null}
          members={members}
          canManage={canManage}
          onClose={() => {
            setCreateOpen(false);
          }}
        />
      ) : null}
      {editing ? (
        <TaskFormSheet
          initial={editing}
          members={members}
          canManage={canManage}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    backgroundColor: color.brand[600],
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  notesInput: {
    height: 90,
    paddingTop: 12,
    paddingBottom: 12,
  },
  dateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    backgroundColor: color.surface,
  },
  taskCard: {
    gap: 8,
  },
  taskHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  taskTitleWrap: {
    flex: 1,
    gap: 2,
  },
  taskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 1,
  },
  taskActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    backgroundColor: color.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dimmed: {
    opacity: 0.55,
  },
});

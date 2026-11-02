import type { AdvisoryAction, FarmTask, FlockHealthRow } from '../../api/types-flock';
import { addLocalDays, daysBetween, localYmd } from './shared';

export type Priority = 'CRITIQUE' | 'IMPORTANT';
export type ActivityKind = 'saisie' | 'tache' | 'alerte';

export interface ActivityAction {
  id: string;
  priority: Priority;
  kind: ActivityKind;
  title: string;
  detail: string;
  badge?: string;
  href: string;
}

export interface JournalEntry {
  id: string;
  at: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  href?: string;
}

export interface JournalGroup {
  key: string;
  label: string;
  entries: JournalEntry[];
  totalEntries: number;
}

const lotHref = (id: string) => `/app/batches?lot=${id}`;

/** Local day of an ISO timestamp (toISOString would shift it to UTC). */
export function dayKey(iso: string): string {
  const dt = new Date(iso);
  return Number.isNaN(dt.getTime()) ? iso.slice(0, 10) : localYmd(dt);
}

export function dayLabel(key: string, today: string): string {
  if (key === today) return "Aujourd'hui";
  if (key === addLocalDays(today, -1)) return 'Hier';
  const label = new Date(`${key}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const activeAlert = (a: AdvisoryAction) => !a.acknowledged && a.level !== 'VERT' && (a.status ?? 'ACTIVE') === 'ACTIVE';

const alertTitle = (a: AdvisoryAction) =>
  a.batchName && !a.title.includes(a.batchName) ? `${a.title} (${a.batchName})` : a.title;

/** What the farmer has to do now: late entries, open tasks, active alerts. */
export function buildActionQueue(input: {
  healthOverview?: FlockHealthRow[];
  tasks?: FarmTask[];
  alerts?: AdvisoryAction[];
}): ActivityAction[] {
  const today = localYmd();
  const actions: ActivityAction[] = [];

  for (const row of input.healthOverview ?? []) {
    const lag = row.lastEntryLagDays ?? 0;
    if (lag <= 0 || lag > 30) continue;
    actions.push({
      id: `entry-${row.batchId}`,
      priority: lag >= 3 ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'saisie',
      title: `Saisie en retard de ${lag} jour${lag > 1 ? 's' : ''}`,
      detail: `${row.batchName ?? 'Lot'} · ${row.liveCount ?? 0} vivants · J${row.ageDays ?? 0}`,
      badge: `J-${lag}`,
      href: lotHref(row.batchId),
    });
  }

  const earliest = addLocalDays(today, -60);
  const latest = addLocalDays(today, 2);
  for (const task of input.tasks ?? []) {
    if (task.status !== 'A_FAIRE' && task.status !== 'EN_COURS') continue;
    const due = task.dueDate.slice(0, 10);
    if (due < earliest || due > latest) continue;
    const overdue = due < today;
    const days = Math.abs(daysBetween(today, due));
    let detail = "Échéance aujourd'hui";
    if (overdue) detail = `Échue depuis ${days} jour${days > 1 ? 's' : ''}`;
    else if (due !== today) detail = `Échéance dans ${days} jour${days > 1 ? 's' : ''}`;
    actions.push({
      id: `task-${task.id}`,
      priority: overdue ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'tache',
      title: task.title,
      detail,
      badge: overdue ? `+${days} j` : due === today ? 'Auj.' : `J+${days}`,
      href: '/app/tasks',
    });
  }

  for (const alert of input.alerts ?? []) {
    if (!activeAlert(alert)) continue;
    actions.push({
      id: `alert-${alert.id}`,
      priority: alert.level === 'ROUGE' ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'alerte',
      title: alertTitle(alert),
      detail: alert.description,
      href: alert.batchId ? lotHref(alert.batchId) : '/app/alerts',
    });
  }

  return actions.sort((a, b) => Number(a.priority === 'IMPORTANT') - Number(b.priority === 'IMPORTANT'));
}

/** Time-stamped log of what happened, grouped by day, most recent first. */
export function buildJournal(input: {
  healthOverview?: FlockHealthRow[];
  tasks?: FarmTask[];
  alerts?: AdvisoryAction[];
  generatedAt?: string;
  sinceDays: number;
}): { groups: JournalGroup[]; truncatedGroups: number } {
  const today = localYmd();
  const cutoff = addLocalDays(today, -(input.sinceDays - 1));
  const entries: JournalEntry[] = [];

  for (const task of input.tasks ?? []) {
    if (task.status !== 'FAIT' || !task.completedAt) continue;
    entries.push({ id: `task-${task.id}`, at: task.completedAt, kind: 'tache', title: task.title, detail: 'Tâche terminée', href: '/app/tasks' });
  }
  for (const alert of input.alerts ?? []) {
    if (alert.level === 'VERT') continue;
    entries.push({
      id: `alert-${alert.id}`,
      at: input.generatedAt ?? new Date().toISOString(),
      kind: 'alerte',
      title: alertTitle(alert),
      detail: alert.description,
      href: alert.batchId ? lotHref(alert.batchId) : undefined,
    });
  }
  for (const row of input.healthOverview ?? []) {
    if (!row.lastEntryDate) continue;
    entries.push({
      id: `entry-${row.batchId}`,
      at: `${row.lastEntryDate.slice(0, 10)}T12:00:00`,
      kind: 'saisie',
      title: row.batchName ?? 'Lot',
      detail: `Saisie enregistrée · ${row.liveCount ?? 0} vivants`,
      href: lotHref(row.batchId),
    });
  }

  const groups = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const key = dayKey(e.at);
    if (key < cutoff) continue;
    groups.set(key, [...(groups.get(key) ?? []), e]);
  }
  const ordered = [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const visible = ordered.slice(0, 5);
  return {
    truncatedGroups: ordered.length - visible.length,
    groups: visible.map(([key, list]) => ({
      key,
      label: dayLabel(key, today),
      entries: [...list].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4),
      totalEntries: list.length,
    })),
  };
}

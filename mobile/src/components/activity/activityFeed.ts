import type { Alert, FarmTask, HealthOverviewRow } from '@/api/types';

export type Priority = 'CRITIQUE' | 'IMPORTANT';

export type ActivityKind = 'saisie' | 'tache' | 'alerte';

export interface ActivityAction {
  id: string;
  priority: Priority;
  kind: ActivityKind;
  title: string;
  detail: string;
  /** Pastille courte à droite (« J-3 », « +2 j »). */
  badge?: string;
  href?: string;
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
  /** Entrées du jour avant plafonnement (pour « voir plus »). */
  totalEntries: number;
}

export interface Journal {
  groups: JournalGroup[];
  /** Groupes écartés car au-delà de `maxGroups`. */
  truncatedGroups: number;
}

const PRIORITY_WEIGHT: Record<Priority, number> = { CRITIQUE: 0, IMPORTANT: 1 };

/** Date du jour au format YYYY-MM-DD (local), alignée sur les `dueDate` serveur. */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Clé de jour locale d'un timestamp ISO (évite le décalage UTC de `toISOString`). */
export function dayKey(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Décale une clé de jour de `delta` jours (delta négatif = passé). */
export function shiftDayKey(key: string, delta: number): string {
  const dt = new Date(`${key}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return key;
  dt.setDate(dt.getDate() + delta);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const d = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Nombre de jours entre deux clés de jour (b - a). */
export function daysBetweenKeys(a: string, b: string): number {
  return Math.round(
    (new Date(`${b}T12:00:00`).getTime() - new Date(`${a}T12:00:00`).getTime()) / 86_400_000,
  );
}

/** « Aujourd'hui » / « Hier » / « samedi 4 octobre ». */
export function dayLabel(key: string, today: string): string {
  const yesterday = new Date(`${today}T12:00:00`);
  yesterday.setDate(yesterday.getDate() - 1);
  const y = yesterday.getFullYear();
  const m = String(yesterday.getMonth() + 1).padStart(2, '0');
  const d = String(yesterday.getDate()).padStart(2, '0');

  if (key === today) return 'Aujourd’hui';
  if (key === `${y}-${m}-${d}`) return 'Hier';
  const dt = new Date(`${key}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return key;
  const label = dt.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** « 14:32 » à partir d'un timestamp ISO. */
export function timeLabel(iso: string): string {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '';
  return `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
}

const OPEN_TASK_STATUSES = new Set<FarmTask['status']>(['A_FAIRE', 'EN_COURS']);

/**
 * File « À traiter » : ce que le fermier doit faire maintenant, trié par
 * priorité. Saisies en retard (lots), tâches ouvertes (échues ou dues), alertes
 * actives. Ne retourne du vide que si tout est à jour.
 */
export interface ActionQueue {
  actions: ActivityAction[];
  /** Nombre total avant plafonnement (pour « voir plus »). */
  total: number;
}

export interface ActionQueueOptions {
  healthOverview?: HealthOverviewRow[];
  tasks?: FarmTask[];
  alerts?: Alert[];
  today?: string;
  /** Tâches dues dans les N prochains jours incluses (défaut 2). */
  horizonDays?: number;
  /** Au-delà, une tâche échue est considérée comme archivée (défaut 60). */
  maxOverdueDays?: number;
  /** Saisie en retard maximale suivie (défaut 30) — au-delà, ignorée. */
  maxStaleDays?: number;
  /** Plafond d'affichage ; 0 = pas de plafond. */
  limit?: number;
}

/**
 * File « À traiter » : ce que le fermier doit faire maintenant, trié par
 * priorité. Saisies en retard (lots), tâches ouvertes (échues ou dues), alertes
 * actives. La fenêtre est bornée dans les deux sens — sans cela la file
 * grossit indéfiniment et noie les urgences réelles.
 */
export function buildActionQueue(input: ActionQueueOptions): ActionQueue {
  const today = input.today ?? todayKey();
  const horizonDays = input.horizonDays ?? 2;
  const maxOverdueDays = input.maxOverdueDays ?? 60;
  const maxStaleDays = input.maxStaleDays ?? 30;
  const actions: ActivityAction[] = [];

  for (const row of input.healthOverview ?? []) {
    const lag = row.lastEntryLagDays ?? 0;
    if (lag <= 0 || lag > maxStaleDays) continue;
    actions.push({
      id: `entry-${row.batchId}`,
      priority: lag >= 3 ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'saisie',
      title: `Saisie J-${lag}`,
      detail: `${row.batchName ?? 'Lot'} · ${row.liveCount ?? 0} vivants · ${row.ageDays ?? 0} j`,
      badge: `J-${lag}`,
      href: `/lot/${row.batchId}`,
    });
  }

  for (const task of input.tasks ?? []) {
    if (!OPEN_TASK_STATUSES.has(task.status)) continue;
    // Fenêtre [aujourd'hui - maxOverdueDays, aujourd'hui + horizonDays].
    const earliest = shiftDayKey(today, -maxOverdueDays);
    const latest = shiftDayKey(today, horizonDays);
    if (task.dueDate < earliest || task.dueDate > latest) continue;
    const overdue = task.dueDate < today;
    // Distance signée : positive dans le passé (retard), dans le futur (anticipation).
    const days = Math.abs(daysBetweenKeys(today, task.dueDate));
    actions.push({
      id: `task-${task.id}`,
      priority: overdue ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'tache',
      title: task.title,
      detail:
        overdue
          ? `Échue depuis ${days} jour${days > 1 ? 's' : ''}`
          : task.dueDate === today
            ? 'Échéance aujourd’hui'
            : `Échéance dans ${days} jour${days > 1 ? 's' : ''}`,
      badge: overdue ? `+${days} j` : task.dueDate === today ? 'Auj.' : `J${days}`,
      href: '/tasks',
    });
  }

  for (const alert of input.alerts ?? []) {
    if (alert.status !== 'ACTIVE') continue;
    if (alert.level === 'VERT') continue;
    actions.push({
      id: `alert-${alert.id}`,
      priority: alert.level === 'ROUGE' ? 'CRITIQUE' : 'IMPORTANT',
      kind: 'alerte',
      title: alert.batchName ? `${alert.kind} — ${alert.batchName}` : alert.kind,
      detail: alert.message,
      href: alert.batchId ? `/lot/${alert.batchId}` : '/',
    });
  }

  const sorted = actions.sort((a, b) => PRIORITY_WEIGHT[a.priority] - PRIORITY_WEIGHT[b.priority]);
  const total = sorted.length;
  const limit = input.limit ?? 0;
  return { actions: limit > 0 ? sorted.slice(0, limit) : sorted, total };
}

export interface JournalOptions {
  healthOverview?: HealthOverviewRow[];
  tasks?: FarmTask[];
  alerts?: Alert[];
  today?: string;
  /** Fenêtre glissante en jours, 0 = tout l'historique (défaut 7). */
  sinceDays?: number;
  /** Entrées affichées par jour (défaut 4). */
  perDayLimit?: number;
  /** Groupes affichés au maximum (défaut 5). */
  maxGroups?: number;
}

/**
 * Journal horodaté : ce qui a réellement été fait. Fusionne les tâches
 * terminées, les alertes ouvertes et les dernières saisies par lot, puis
 * groupe par jour (plus récent d'abord). Borné par `sinceDays`, `maxGroups`
 * et `perDayLimit` — la liste ne peut pas croître indéfiniment.
 */
export function buildJournal(input: JournalOptions): Journal {
  const today = input.today ?? todayKey();
  const sinceDays = input.sinceDays ?? 7;
  const perDayLimit = input.perDayLimit ?? 4;
  const maxGroups = input.maxGroups ?? 5;
  const cutoff = sinceDays > 0 ? shiftDayKey(today, -(sinceDays - 1)) : null;
  const entries: JournalEntry[] = [];

  for (const task of input.tasks ?? []) {
    if (task.status !== 'FAIT' || !task.completedAt) continue;
    entries.push({
      id: `task-${task.id}`,
      at: task.completedAt,
      kind: 'tache',
      title: task.title,
      detail: 'Tâche terminée',
      href: '/tasks',
    });
  }

  for (const alert of input.alerts ?? []) {
    if (alert.level === 'VERT') continue;
    entries.push({
      id: `alert-${alert.id}`,
      at: alert.createdAt,
      kind: 'alerte',
      title: alert.batchName ? `${alert.kind} — ${alert.batchName}` : alert.kind,
      detail: alert.message,
      href: alert.batchId ? `/lot/${alert.batchId}` : undefined,
    });
  }

  for (const row of input.healthOverview ?? []) {
    if (!row.lastEntryDate) continue;
    entries.push({
      id: `entry-${row.batchId}`,
      // `lastEntryDate` est un jour (YYYY-MM-DD) : on l'ancre à 12:00 pour un
      // affichage d'heure stable et un tri cohérent.
      at: `${row.lastEntryDate}T12:00:00`,
      kind: 'saisie',
      title: row.batchName ?? 'Lot',
      detail: `Saisie enregistrée · ${row.liveCount ?? 0} vivants`,
      href: `/lot/${row.batchId}`,
    });
  }

  // Fenêtre glissante : on ignore tout ce qui est plus vieux que la borne.
  const inWindow = cutoff ? entries.filter((e) => dayKey(e.at) >= cutoff) : entries;

  const groups = new Map<string, JournalEntry[]>();
  for (const entry of inWindow) {
    const key = dayKey(entry.at);
    const bucket = groups.get(key);
    if (bucket) bucket.push(entry);
    else groups.set(key, [entry]);
  }

  const ordered = [...groups.entries()].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0));
  const visible = ordered.slice(0, maxGroups);

  return {
    truncatedGroups: ordered.length - visible.length,
    groups: visible.map(([key, groupEntries]) => {
      const sortedEntries = groupEntries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
      return {
        key,
        label: dayLabel(key, today),
        entries: sortedEntries.slice(0, perDayLimit),
        totalEntries: sortedEntries.length,
      };
    }),
  };
}
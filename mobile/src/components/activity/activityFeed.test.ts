import { describe, expect, it } from 'vitest';

import type { Alert, FarmTask, HealthOverviewRow } from '@/api/types';
import {
  buildActionQueue,
  buildJournal,
  dayKey,
  dayLabel,
  daysBetweenKeys,
  shiftDayKey,
  timeLabel,
  todayKey,
} from './activityFeed';

const TODAY = '2026-10-02';

/** Forme RÉELLE d'une ligne `/dashboard` : ni `expectedMortalityPct` ni
 *  `mortalityStatus` (absents du payload serveur). */
function batch(overrides: Partial<HealthOverviewRow> = {}): HealthOverviewRow {
  return {
    batchId: 'b1',
    batchName: 'Poussinerie A',
    status: 'ACTIF',
    ageDays: 21,
    liveCount: 120,
    weekDeaths: 1,
    mortalityPercent: 2.4,
    alertesRouges: 0,
    alertesJaunes: 0,
    lastEntryLagDays: 0,
    lastEntryDate: TODAY,
    breedStatus: null,
    ...overrides,
  } as HealthOverviewRow;
}

function task(overrides: Partial<FarmTask> = {}): FarmTask {
  return {
    id: 't1',
    title: 'Vaccination peste',
    status: 'A_FAIRE',
    dueDate: TODAY,
    completedAt: null,
    ...overrides,
  } as FarmTask;
}

function alert(overrides: Partial<Alert> = {}): Alert {
  return {
    id: 'a1',
    kind: 'MORTALITE',
    level: 'JAUNE',
    message: 'Mortalité en hausse',
    status: 'ACTIVE',
    batchId: 'b1',
    batchName: 'Poussinerie A',
    createdAt: `${TODAY}T08:15:00.000Z`,
    ...overrides,
  } as Alert;
}

describe('date helpers', () => {
  it('formates le jour courant en YYYY-MM-DD', () => {
    expect(todayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  it('ancre un timestamp sur son jour local', () => {
    // Construit en heure locale : le résultat ne doit pas dépendre du fuseau.
    expect(dayKey(new Date(2026, 9, 2, 0, 30).toISOString())).toBe('2026-10-02');
    expect(dayKey(new Date(2026, 9, 2, 14, 30).toISOString())).toBe('2026-10-02');
    expect(dayKey(new Date(2026, 9, 2, 23, 30).toISOString())).toBe('2026-10-02');
  });

  it('retombe sur le jour brut si le timestamp est invalide', () => {
    expect(dayKey('pas-une-date')).toBe('pas-une-date');
  });

  it("nomme aujourd'hui et hier, puis la date longue", () => {
    expect(dayLabel(TODAY, TODAY)).toBe('Aujourd’hui');
    expect(dayLabel('2026-10-01', TODAY)).toBe('Hier');
    expect(dayLabel('2026-09-14', TODAY)).toBe('Lundi 14 septembre');
  });

  it('décale une clé de jour, y compris en arrière', () => {
    expect(shiftDayKey(TODAY, -3)).toBe('2026-09-29');
    expect(shiftDayKey(TODAY, 2)).toBe('2026-10-04');
    expect(shiftDayKey('pas-une-date', 2)).toBe('pas-une-date');
  });

  it('compte les jours entre deux clés', () => {
    expect(daysBetweenKeys('2026-09-30', TODAY)).toBe(2);
    expect(daysBetweenKeys(TODAY, TODAY)).toBe(0);
  });

  it('extrait l’heure locale', () => {
    expect(timeLabel(new Date(2026, 9, 2, 14, 32).toISOString())).toBe('14:32');
    expect(timeLabel('nope')).toBe('');
  });
});

describe('buildActionQueue', () => {
  it('ne remonte rien quand tout est à jour', () => {
    const queue = buildActionQueue({
      healthOverview: [batch()],
      tasks: [task({ status: 'FAIT', completedAt: `${TODAY}T09:00:00.000Z` })],
      alerts: [alert({ status: 'RESOLUE' })],
      today: TODAY,
    });
    expect(queue.actions).toEqual([]);
    expect(queue.total).toBe(0);
  });

  it('remonte une saisie en retard et escalade en critique à J-3', () => {
    const twoDays = buildActionQueue({
      healthOverview: [batch({ lastEntryLagDays: 2 })],
      today: TODAY,
    });
    expect(twoDays.actions[0].priority).toBe('IMPORTANT');
    expect(twoDays.actions[0].badge).toBe('J-2');

    const threeDays = buildActionQueue({
      healthOverview: [batch({ lastEntryLagDays: 3 })],
      today: TODAY,
    });
    expect(threeDays.actions[0].priority).toBe('CRITIQUE');
  });

  it('ignore une saisie du jour', () => {
    expect(buildActionQueue({ healthOverview: [batch({ lastEntryLagDays: 0 })], today: TODAY }).actions).toEqual(
      [],
    );
  });

  it('classe une tâche échue en critique avec le retard', () => {
    const queue = buildActionQueue({ tasks: [task({ dueDate: '2026-09-30' })], today: TODAY });
    expect(queue.actions[0].priority).toBe('CRITIQUE');
    expect(queue.actions[0].badge).toBe('+2 j');
    expect(queue.actions[0].detail).toContain('2 jours');
  });

  it("classe une tâche due aujourd'hui en importante", () => {
    const queue = buildActionQueue({ tasks: [task()], today: TODAY });
    expect(queue.actions[0].priority).toBe('IMPORTANT');
    expect(queue.actions[0].detail).toBe('Échéance aujourd’hui');
  });

  it('ignore une tâche future ou annulée', () => {
    const queue = buildActionQueue({
      tasks: [task({ dueDate: '2026-10-20' }), task({ id: 't2', status: 'ANNULEE' })],
      today: TODAY,
    });
    expect(queue.actions).toEqual([]);
  });

  it('inclut une tâche due dans l’horizon', () => {
    const queue = buildActionQueue({ tasks: [task({ dueDate: '2026-10-04' })], today: TODAY });
    expect(queue.actions).toHaveLength(1);
    expect(queue.actions[0].detail).toBe('Échéance dans 2 jours');
    expect(queue.actions[0].badge).toBe('J2');
  });

  it('ignore une tâche échue au-delà de la fenêtre', () => {
    // Bornée dans les deux sens : une tâche oubliée depuis 6 mois n'est plus une action.
    const queue = buildActionQueue({ tasks: [task({ dueDate: '2026-03-01' })], today: TODAY });
    expect(queue.actions).toEqual([]);
  });

  it('ignore une saisie en retard trop ancienne', () => {
    const queue = buildActionQueue({
      healthOverview: [batch({ lastEntryLagDays: 45 })],
      today: TODAY,
      maxStaleDays: 30,
    });
    expect(queue.actions).toEqual([]);
  });

  it('trie les critiques avant les importantes', () => {
    const queue = buildActionQueue({
      healthOverview: [batch({ lastEntryLagDays: 1 })],
      tasks: [task({ dueDate: '2026-09-28' })],
      alerts: [alert({ level: 'JAUNE' })],
      today: TODAY,
    });
    expect(queue.actions.map((a) => a.priority)).toEqual(['CRITIQUE', 'IMPORTANT', 'IMPORTANT']);
  });

  it('ignore les alertes vertes et les alertes closes', () => {
    const queue = buildActionQueue({
      alerts: [alert({ level: 'VERT' }), alert({ id: 'a2', status: 'ACQUITTEE' })],
      today: TODAY,
    });
    expect(queue.actions).toEqual([]);
  });

  it('plafonne la file affichée mais conserve le total', () => {
    const queue = buildActionQueue({
      tasks: [
        task({ id: 't1', dueDate: '2026-10-01' }),
        task({ id: 't2', dueDate: '2026-10-01' }),
        task({ id: 't3', dueDate: '2026-10-01' }),
      ],
      today: TODAY,
      limit: 2,
    });
    expect(queue.actions).toHaveLength(2);
    expect(queue.total).toBe(3);
  });
});

describe('buildJournal', () => {
  /** Timestamp ISO ancré sur un jour local : indépendant du fuseau du poste. */
  const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

  it('regroupe par jour, du plus récent au plus ancien', () => {
    const journal = buildJournal({
      tasks: [task({ status: 'FAIT', completedAt: at(1, 10) })],
      alerts: [alert({ createdAt: at(2, 8, 15) })],
      today: TODAY,
    });
    expect(journal.groups.map((g) => g.key)).toEqual([TODAY, '2026-10-01']);
    expect(journal.groups[0].label).toBe('Aujourd’hui');
  });

  it('journalise une tâche terminée', () => {
    const journal = buildJournal({
      tasks: [task({ status: 'FAIT', completedAt: at(2, 7) })],
      today: TODAY,
    });
    expect(journal.groups[0].entries[0]).toMatchObject({ kind: 'tache', detail: 'Tâche terminée' });
  });

  it('exclut une tâche terminée sans completedAt', () => {
    const journal = buildJournal({ tasks: [task({ status: 'FAIT', completedAt: null })], today: TODAY });
    expect(journal.groups).toEqual([]);
  });

  it('journalise la dernière saisie d’un lot', () => {
    const journal = buildJournal({
      healthOverview: [batch({ lastEntryDate: TODAY, liveCount: 118 })],
      today: TODAY,
    });
    expect(journal.groups[0].entries[0]).toMatchObject({ kind: 'saisie', detail: expect.stringContaining('118') });
  });

  it('n’émet jamais « undefined » sur une ligne d’overview', () => {
    const journal = buildJournal({ healthOverview: [batch()], today: TODAY });
    const queue = buildActionQueue({
      healthOverview: [batch({ lastEntryLagDays: 4 })],
      today: TODAY,
    });
    const texts = [...journal.groups[0].entries, ...queue.actions].flatMap((e) => [e.title, e.detail]);
    for (const text of texts) expect(text).not.toContain('undefined');
  });

  it('ignore les alertes vertes', () => {
    expect(buildJournal({ alerts: [alert({ level: 'VERT' })], today: TODAY }).groups).toEqual([]);
  });

  it('borne chaque groupe et expose le total caché', () => {
    const journal = buildJournal({
      tasks: [
        task({ id: 't1', status: 'FAIT', completedAt: at(2, 7) }),
        task({ id: 't2', status: 'FAIT', completedAt: at(2, 8) }),
        task({ id: 't3', status: 'FAIT', completedAt: at(2, 9) }),
      ],
      today: TODAY,
      perDayLimit: 2,
    });
    expect(journal.groups).toHaveLength(1);
    expect(journal.groups[0].entries.map((e) => e.title)).toEqual(['Vaccination peste', 'Vaccination peste']);
    expect(journal.groups[0].totalEntries).toBe(3);
  });

  it('oriente chaque groupe du plus récent au plus ancien', () => {
    const journal = buildJournal({
      tasks: [
        task({ id: 't1', status: 'FAIT', completedAt: at(2, 7) }),
        task({ id: 't2', status: 'FAIT', completedAt: at(2, 9) }),
      ],
      today: TODAY,
    });
    expect(journal.groups[0].entries.map((e) => e.at)).toEqual([at(2, 9), at(2, 7)]);
  });

  it('filtre les entrées hors de la fenêtre choisie', () => {
    const journal = buildJournal({
      tasks: [
        task({ id: 't1', status: 'FAIT', completedAt: at(2, 7) }),
        task({ id: 't2', status: 'FAIT', completedAt: at(1, 7) }),
        task({ id: 't3', status: 'FAIT', completedAt: at(1, 9) }),
      ],
      today: TODAY,
      sinceDays: 2,
    });
    // Fenêtre de 2 j = aujourd'hui + hier seulement ; le 30/09 est exclu.
    expect(journal.groups.map((g) => g.key)).toEqual([TODAY, '2026-10-01']);
    expect(journal.groups[1].totalEntries).toBe(2);
  });

  it('élargit la fenêtre à 30 j puis à l’historique', () => {
    const input = {
      tasks: [
        task({ id: 't1', status: 'FAIT', completedAt: at(2, 7) }),
        task({ id: 't2', status: 'FAIT', completedAt: at(1, 7) }),
        task({ id: 't3', status: 'FAIT', completedAt: at(1, 9) }),
      ],
    };
    expect(buildJournal({ ...input, today: TODAY, sinceDays: 7 }).groups).toHaveLength(2);
    expect(buildJournal({ ...input, today: TODAY, sinceDays: 0 }).groups).toHaveLength(2);
  });

  it('plafonne le nombre de jours et signale les groupes écartés', () => {
    const tasks = [30, 28, 25, 22].map((day, i) =>
      task({ id: `t${i}`, status: 'FAIT', completedAt: at(day, 7) }),
    );
    const journal = buildJournal({ tasks, today: TODAY, sinceDays: 0, maxGroups: 2 });
    expect(journal.groups).toHaveLength(2);
    expect(journal.truncatedGroups).toBe(2);
  });
});
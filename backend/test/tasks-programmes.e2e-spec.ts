import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { TaskSyncService } from './../src/modules/tasks/task-sync.service.js';
import { TasksService } from './../src/modules/tasks/tasks.service.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

interface Task {
  id: string;
  batchId: string | null;
  source: string;
  stepId: string | null;
  dueDate: string;
  status: string;
  title: string;
}

/**
 * Tasks generated from the programmes: weighing plan, care calendar, cleaning
 * at closure; completion that records the data on the lot; direct recording
 * that closes the task; one source of truth for the alerts.
 */
describe('Tâches générées par les programmes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let token = '';
  let farmId = '';
  let memberToken = '';
  let weekly = 7;

  const send = (method: 'get' | 'post' | 'patch' | 'delete', url: string, tk = token) =>
    request(server)[method](url).set('Authorization', `Bearer ${tk}`);

  async function createBatch(extra: Record<string, unknown> = {}) {
    const res = await send('post', `/farms/${farmId}/batches`)
      .send({
        batchName: `Lot ${Math.random().toString(36).slice(2, 7)}`,
        integrationDate: day(0),
        quantityAtStart: 100,
        type: 'CHAIR',
        ...extra,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function tasksOf(batchId: string, tk = token): Promise<Task[]> {
    const all = (await send('get', `/farms/${farmId}/tasks`, tk).expect(200))
      .body as Task[];
    return all.filter((t) => t.batchId === batchId);
  }
  const bySource = (tasks: Task[], source: string) =>
    tasks.filter((t) => t.source === source).sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  async function plannedCare(batchId: string, name: string, scheduledDate: string) {
    await send('post', `/farms/${farmId}/vaccine-schedules/manual`)
      .send({ lotIds: [batchId], careType: 'VACCIN', name, scheduledDate })
      .expect(201);
    const events = (
      await send('get', `/farms/${farmId}/batches/${batchId}/prophylaxis`).expect(200)
    ).body as Array<{ id: string; name: string; scheduledDate: string; status: string }>;
    return events.find((e) => e.name === name)!;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    const admin = await createPlatformAdmin(server, ds);
    const farm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Tâches programmes ${Date.now()}`,
    });
    token = farm.ownerToken;
    farmId = farm.farmId;
    const phone = uniquePhone('+2418');
    await send('post', `/farms/${farmId}/eleveurs`)
      .send({ phone, fullName: 'Aide Programmes', code: 'secret456', role: 'ELEVEUR' })
      .expect(201);
    memberToken = await login(server, phone, 'secret456');
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  describe('génération', () => {
    let lot = '';

    it('la pesée suit la fréquence du programme, à J0 + âge (lot ouvert à J+5)', async () => {
      lot = await createBatch({ initialAgeDays: 5 });
      const sheet = (await send('get', `/farms/${farmId}/bandes/${lot}`).expect(200)).body;
      weekly = sheet.weighing.frequencyDays as number;
      const weighings = bySource(await tasksOf(lot), 'PESEE');
      expect(weighings.length).toBeGreaterThan(2);
      // Lot opened today at age 5: J0 = today - 5, the first weighing is the
      // first multiple of the frequency not before the placement.
      const firstAge = Math.ceil(5 / weekly) * weekly;
      expect(weighings[0]).toMatchObject({
        stepId: `J${firstAge}`,
        dueDate: day(firstAge - 5),
        status: 'A_FAIRE',
        batchId: lot,
      });
      expect(weighings[1].stepId).toBe(`J${firstAge + weekly}`);
    });

    it('les soins du calendrier sanitaire deviennent des tâches, J0 + jour de l’étape, sans doublon à la régénération', async () => {
      const protocols = (
        await send('get', `/sanitary/protocols?species=POULET&type=CHAIR&farmId=${farmId}`).expect(200)
      ).body as Array<{ id: string; isDefault: boolean }>;
      const reference = protocols.find((p) => p.isDefault)!;
      const detail = (await send('get', `/sanitary/protocols/${reference.id}?farmId=${farmId}`).expect(200))
        .body as { steps: Array<{ dayFrom: number; active: boolean }> };

      await send('post', `/farms/${farmId}/batches/${lot}/prophylaxis/generate`).send({}).expect(201);
      const events = (
        await send('get', `/farms/${farmId}/batches/${lot}/prophylaxis`).expect(200)
      ).body as Array<{ id: string; scheduledDate: string }>;
      expect(events.length).toBeGreaterThan(0);
      // Steps whose date (J0 = today - 5 + dayFrom) is already past are skipped.
      const expected = detail.steps
        .filter((s) => s.active && s.dayFrom - 5 >= 0)
        .map((s) => day(s.dayFrom - 5))
        .sort();
      expect(events.map((e) => e.scheduledDate).sort()).toEqual(expected);

      const care = bySource(await tasksOf(lot), 'PROGRAMME_VACCIN');
      expect(care.map((t) => t.stepId).sort()).toEqual(events.map((e) => e.id).sort());
      for (const t of care) {
        expect(t.dueDate).toBe(events.find((e) => e.id === t.stepId)!.scheduledDate);
      }

      // Regenerating (and re-reading) never duplicates.
      await send('post', `/farms/${farmId}/batches/${lot}/prophylaxis/generate`).send({}).expect(201);
      await send('get', `/farms/${farmId}/batches/${lot}/prophylaxis`).expect(200);
      expect(bySource(await tasksOf(lot), 'PROGRAMME_VACCIN')).toHaveLength(care.length);
      const dup = await ds.query(
        `SELECT 1 FROM farm_tasks WHERE batch_id = $1 AND step_id IS NOT NULL
          GROUP BY source, step_id HAVING count(*) > 1`,
        [lot],
      );
      expect(dup).toHaveLength(0);
    });

    it('une resynchronisation ne change rien ; déplacer la mise en place reporte seulement les tâches ouvertes', async () => {
      const sync = app.get(TaskSyncService);
      const before = await tasksOf(lot);
      await sync.syncBatch(lot);
      expect(await tasksOf(lot)).toEqual(before);

      // Terminer la première pesée : elle devient de l'historique.
      const [first, second] = bySource(before, 'PESEE');
      await send('post', `/farms/${farmId}/tasks/${first.id}/complete`)
        .send({ avgWeightKg: 0.2, sampleSize: 20, entryDate: day(0) })
        .expect(201);

      await ds.query(
        `UPDATE production_batches SET integration_date = integration_date - 1 WHERE id = $1`,
        [lot],
      );
      await sync.syncBatch(lot);
      const after = await tasksOf(lot);
      const doneNow = after.find((t) => t.id === first.id)!;
      expect(doneNow.status).toBe('FAIT');
      expect(doneNow.dueDate).toBe(first.dueDate);
      const movedSecond = after.find((t) => t.id === second.id)!;
      expect(movedSecond.dueDate).toBe(day(-1 + (Number(second.stepId!.slice(1)) - 5)));
      expect(movedSecond.status).toBe('A_FAIRE');
    });
  });

  describe('terminer une tâche met à jour le lot', () => {
    it('pesée : poids moyen et échantillon requis, la pesée alimente le lot, rejouable hors ligne', async () => {
      const lot = await createBatch();
      const [task] = bySource(await tasksOf(lot), 'PESEE');
      const url = `/farms/${farmId}/tasks/${task.id}/complete`;
      await send('post', url).send({}).expect(400);
      await send('post', url).send({ avgWeightKg: 0.5 }).expect(400); // échantillon manquant

      const done = await send('post', url)
        .send({ avgWeightKg: 0.5, sampleSize: 25, entryDate: day(0), idempotencyKey: 'op-w-1' })
        .expect(201);
      expect(done.body.status).toBe('FAIT');
      expect(done.body.completedAt).toBeTruthy();

      const entries = (
        await send('get', `/farms/${farmId}/batches/${lot}/daily-entries`).expect(200)
      ).body as Array<{ entryDate: string; avgWeightKg: number; sampleSize: number }>;
      expect(entries.find((e) => e.entryDate.slice(0, 10) === day(0))).toMatchObject({
        avgWeightKg: 0.5,
        sampleSize: 25,
      });
      const batch = (await send('get', `/farms/${farmId}/batches/${lot}`).expect(200)).body;
      expect(batch.metrics.lastWeighingAvgWeightKg).toBe(0.5);

      // Replay of the same completion (offline queue): the task, no second error.
      const replay = await send('post', url)
        .send({ avgWeightKg: 0.5, sampleSize: 25, idempotencyKey: 'op-w-1' })
        .expect(201);
      expect(replay.body.id).toBe(task.id);
      // Without key, a finished task is refused.
      await send('post', url).send({ avgWeightKg: 0.5, sampleSize: 25 }).expect(400);
    });

    it('vaccination : mêmes contrôles que la réalisation du soin (effectif ≤ vivants), un éleveur peut la terminer', async () => {
      const lot = await createBatch();
      const care = await plannedCare(lot, `Vaccin tâche ${Date.now()}`, day(1));
      const task = bySource(await tasksOf(lot), 'PROGRAMME_VACCIN').find(
        (t) => t.stepId === care.id,
      )!;
      expect(task).toMatchObject({ dueDate: day(1), status: 'A_FAIRE' });
      const url = `/farms/${farmId}/tasks/${task.id}/complete`;

      // The team sees generated tasks; the form is the care's, so is the validation.
      expect((await tasksOf(lot, memberToken)).map((t) => t.id)).toContain(task.id);
      await send('post', url, memberToken).send({}).expect(400); // nombre d'animaux requis
      await send('post', url, memberToken).send({ animalCount: 500 }).expect(400); // > 100 vivants
      expect((await tasksOf(lot)).find((t) => t.id === task.id)!.status).toBe('A_FAIRE');

      const done = await send('post', url, memberToken)
        .send({ animalCount: 100, route: 'Eau de boisson', idempotencyKey: 'op-v-1' })
        .expect(201);
      expect(done.body.status).toBe('FAIT');
      const events = (
        await send('get', `/farms/${farmId}/batches/${lot}/prophylaxis`).expect(200)
      ).body as Array<{ id: string; status: string; animalCount: number; route: string }>;
      expect(events.find((e) => e.id === care.id)).toMatchObject({
        status: 'FAIT',
        animalCount: 100,
        route: 'Eau de boisson',
      });
      // Offline replay.
      await send('post', url, memberToken)
        .send({ animalCount: 100, idempotencyKey: 'op-v-1' })
        .expect(201);
    });
  });

  describe('enregistrement direct', () => {
    it('réaliser le soin ferme la tâche de vaccination', async () => {
      const lot = await createBatch();
      const care = await plannedCare(lot, `Soin direct ${Date.now()}`, day(2));
      await send('post', `/farms/${farmId}/batches/${lot}/prophylaxis/${care.id}/complete`)
        .send({ animalCount: 90 })
        .expect(201);
      const task = bySource(await tasksOf(lot), 'PROGRAMME_VACCIN').find(
        (t) => t.stepId === care.id,
      )!;
      expect(task.status).toBe('FAIT');
    });

    it('reporter le soin décale la tâche ouverte ; annuler le soin annule la tâche', async () => {
      const lot = await createBatch();
      const care = await plannedCare(lot, `Soin reporté ${Date.now()}`, day(2));
      const find = async () =>
        bySource(await tasksOf(lot), 'PROGRAMME_VACCIN').find((t) => t.stepId === care.id)!;
      await send('patch', `/farms/${farmId}/batches/${lot}/prophylaxis/${care.id}`)
        .send({ scheduledDate: day(5) })
        .expect(200);
      expect(await find()).toMatchObject({ dueDate: day(5), status: 'A_FAIRE' });
      await send('post', `/farms/${farmId}/batches/${lot}/prophylaxis/${care.id}/cancel`)
        .send({ reason: 'Test' })
        .expect(201);
      expect((await find()).status).toBe('ANNULEE');
    });

    it('enregistrer la pesée dans la saisie du jour ferme la tâche de pesée due, pas les suivantes', async () => {
      // Lot placed 14 days ago: J7 is past (never generated), J14 is due today, J21 in a week.
      const lot = await createBatch({ integrationDate: day(-14) });
      const before = bySource(await tasksOf(lot), 'PESEE');
      if (weekly !== 7) return; // the dates below assume the default frequency
      expect(before.map((t) => t.stepId).slice(0, 2)).toEqual(['J14', 'J21']);
      await send('post', `/farms/${farmId}/batches/${lot}/daily-entries`)
        .send({ entryDate: day(0), avgWeightKg: 0.7, sampleSize: 30 })
        .expect(201);
      const after = bySource(await tasksOf(lot), 'PESEE');
      expect(after[0]).toMatchObject({ stepId: 'J14', status: 'FAIT' });
      expect(after[1]).toMatchObject({ stepId: 'J21', status: 'A_FAIRE' });
    });
  });

  describe('règles de la liste', () => {
    it('une tâche générée ne se supprime pas, ne se date pas à la main, ne se termine pas sans données', async () => {
      const lot = await createBatch();
      const [task] = bySource(await tasksOf(lot), 'PESEE');
      const url = `/farms/${farmId}/tasks/${task.id}`;
      await send('delete', url).expect(400);
      await send('patch', url).send({ dueDate: day(30) }).expect(400);
      await send('patch', url).send({ status: 'FAIT' }).expect(400);
      // Skipping a weighing is allowed (cancelled), and stays cancelled at the next sync.
      await send('patch', url).send({ status: 'ANNULEE' }).expect(200);
      await app.get(TaskSyncService).syncBatch(lot);
      expect((await tasksOf(lot)).find((t) => t.id === task.id)!.status).toBe('ANNULEE');
    });
  });

  describe('alertes : une seule source de vérité', () => {
    it('un soin en retard lève l’alerte PROPHYLAXIE seule : sa tâche n’ajoute ni alerte TACHE ni notification', async () => {
      const lot = await createBatch({ integrationDate: day(-20) });
      const care = await plannedCare(lot, `Soin en retard ${Date.now()}`, day(-5));
      const task = bySource(await tasksOf(lot), 'PROGRAMME_VACCIN').find(
        (t) => t.stepId === care.id,
      )!;
      expect(task.dueDate).toBe(day(-5)); // overdue, still listed for the team
      await app.get(TasksService).sweepOverdue();
      const alerts = (await send('get', `/farms/${farmId}/alerts`).expect(200)).body as Array<{
        kind: string;
        status: string;
        batchId: string | null;
      }>;
      const active = alerts.filter((a) => a.status === 'ACTIVE');
      expect(active.filter((a) => a.kind === 'PROPHYLAXIE' && a.batchId === lot)).toHaveLength(1);
      expect(active.filter((a) => a.kind === 'TACHE')).toHaveLength(0);
      const [row] = await ds.query(`SELECT overdue_notified_at AS n FROM farm_tasks WHERE id = $1`, [
        task.id,
      ]);
      expect(row.n).toBeNull();
    });
  });

  describe('clôture du lot', () => {
    it('annule les tâches ouvertes, garde les terminées et crée le nettoyage (une seule fois)', async () => {
      const lot = await createBatch();
      const care = await plannedCare(lot, `Soin clôture ${Date.now()}`, day(3));
      const open = await tasksOf(lot);
      const [firstWeighing] = bySource(open, 'PESEE');
      await send('post', `/farms/${farmId}/tasks/${firstWeighing.id}/complete`)
        .send({ avgWeightKg: 0.3, sampleSize: 20, entryDate: day(0) })
        .expect(201);

      await send('post', `/farms/${farmId}/batches/${lot}/cloture`).send({}).expect(201);
      await send('post', `/farms/${farmId}/batches/${lot}/cloture`).send({}).expect(201);

      const after = await tasksOf(lot);
      expect(after.find((t) => t.id === firstWeighing.id)!.status).toBe('FAIT');
      const stillOpen = after.filter(
        (t) => t.source !== 'VIDE_SANITAIRE' && ['A_FAIRE', 'EN_COURS'].includes(t.status),
      );
      expect(stillOpen).toHaveLength(0);
      expect(after.find((t) => t.stepId === care.id)!.status).toBe('ANNULEE');
      const cleaning = after.filter((t) => t.source === 'VIDE_SANITAIRE');
      expect(cleaning).toHaveLength(1);
      expect(cleaning[0]).toMatchObject({ stepId: 'VS', status: 'A_FAIRE' });
      expect(cleaning[0].dueDate > day(0)).toBe(true);

      // The cleaning is a plain task: it goes through the overdue sweep, and "Terminer" closes it.
      await send('post', `/farms/${farmId}/tasks/${cleaning[0].id}/complete`).send({}).expect(201);
      expect((await tasksOf(lot)).find((t) => t.source === 'VIDE_SANITAIRE')!.status).toBe('FAIT');
    });
  });
});

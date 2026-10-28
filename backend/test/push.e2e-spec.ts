import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  PushMessage,
  PushService,
} from './../src/modules/push/push.service.js';
import { TasksService } from './../src/modules/tasks/tasks.service.js';

function day(offsetDays = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

describe('Notifications push serveur (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let push: PushService;
  let token: string;
  let eleveurToken: string;
  let farmId: string;
  let eleveurId: string;
  const stamp = Date.now();
  const ownerDevice = `ExponentPushToken[owner-${stamp}]`;
  const eleveurDevice = `ExponentPushToken[eleveur-${stamp}]`;
  let sent: PushMessage[] = [];

  async function drain(): Promise<PushMessage[]> {
    await push.flush();
    const out = sent;
    sent = [];
    return out;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();
    push = app.get(PushService);
    push.deliver = (messages) => {
      sent.push(...messages);
      return Promise.resolve();
    };

    const phone = `+24175${stamp}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Push', code: 'secret123' })
      .expect(201);
    token = (
      await request(server)
        .post('/auth/login')
        .send({ phone, code: 'secret123' })
        .expect(201)
    ).body.accessToken;

    farmId = (
      await request(server)
        .post('/farms')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: `Ferme Push ${stamp}`,
          administrativeCity: 'Libreville',
          capacityPerBuilding: 1000,
        })
        .expect(201)
    ).body.id;

    const eleveurPhone = `+24176${stamp}`;
    eleveurId = (
      await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          phone: eleveurPhone,
          fullName: 'Éleveur Push',
          code: 'secret456',
        })
        .expect(201)
    ).body.user.id;
    eleveurToken = (
      await request(server)
        .post('/auth/login')
        .send({ phone: eleveurPhone, code: 'secret456' })
        .expect(201)
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('enregistrement : jeton invalide refusé, jetons Expo acceptés', async () => {
    await request(server)
      .post('/push/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: 'pas-un-jeton' })
      .expect(400);
    await request(server)
      .post('/push/devices')
      .send({ token: ownerDevice })
      .expect(401);
    await request(server)
      .post('/push/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: ownerDevice, platform: 'android' })
      .expect(204);
    // Idempotent.
    await request(server)
      .post('/push/devices')
      .set('Authorization', `Bearer ${token}`)
      .send({ token: ownerDevice, platform: 'android' })
      .expect(204);
    await request(server)
      .post('/push/devices')
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({ token: eleveurDevice, platform: 'android' })
      .expect(204);
  });

  it('tâche assignée : seul l’éleveur est notifié, route /tasks', async () => {
    await drain();
    await request(server)
      .post(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Vider les abreuvoirs',
        dueDate: day(2),
        assigneeId: eleveurId,
      })
      .expect(201);
    const msgs = await drain();
    expect(msgs).toHaveLength(1);
    expect(msgs[0].to).toBe(eleveurDevice);
    expect(msgs[0].title).toBe('Nouvelle tâche');
    expect(msgs[0].body).toContain('Vider les abreuvoirs');
    expect(msgs[0].data).toEqual({ route: '/tasks', farmId });
    expect(msgs[0].channelId).toBe('alertes');
  });

  it('tâche en retard : éleveur notifié une seule fois, alerte rouge au propriétaire', async () => {
    await drain();
    const created = await request(server)
      .post(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Peser le lot', dueDate: day(-1), assigneeId: eleveurId })
      .expect(201);
    const msgs = await drain();
    const toEleveur = msgs.filter((m) => m.to === eleveurDevice);
    expect(toEleveur.map((m) => m.title).sort()).toEqual([
      'Nouvelle tâche',
      'Tâche en retard',
    ]);
    const toOwner = msgs.filter((m) => m.to === ownerDevice);
    expect(toOwner).toHaveLength(1);
    expect(toOwner[0].title).toContain('Alerte');
    expect(toOwner[0].body).toContain('Peser le lot');
    expect(toOwner[0].data.route).toBe('/(tabs)/alerts');

    // The sweep and the list don't repeat it; the alert is already red.
    await app.get(TasksService).sweepOverdue();
    await request(server)
      .get(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(await drain()).toEqual([]);

    // Moving the due date re-arms the overdue push.
    await request(server)
      .patch(`/farms/${farmId}/tasks/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ dueDate: day(-2) })
      .expect(200);
    const again = await drain();
    expect(again.filter((m) => m.to === eleveurDevice)).toHaveLength(1);
    expect(again.filter((m) => m.to === ownerDevice)).toEqual([]);
  });

  it('désinscription : plus aucun envoi vers ce téléphone', async () => {
    await request(server)
      .delete(`/push/devices/${encodeURIComponent(eleveurDevice)}`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .expect(204);
    await drain();
    await request(server)
      .post(`/farms/${farmId}/tasks`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Ramasser les oeufs',
        dueDate: day(3),
        assigneeId: eleveurId,
      })
      .expect(201);
    expect(await drain()).toEqual([]);
  });

  it('Expo DeviceNotRegistered : le jeton est supprimé', async () => {
    const dead = `ExponentPushToken[dead-${stamp}]`;
    await request(server)
      .post('/push/devices')
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({ token: dead })
      .expect(204);

    const realFetch = globalThis.fetch;
    const realDisabled = process.env.PUSH_DISABLED;
    const calls: string[] = [];
    globalThis.fetch = ((input: RequestInfo | URL) => {
      calls.push(String(input));
      return Promise.resolve(
        new Response(
          JSON.stringify({
            data: [
              {
                status: 'error',
                message: 'not registered',
                details: { error: 'DeviceNotRegistered' },
              },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        ),
      );
    }) as typeof fetch;
    process.env.PUSH_DISABLED = 'false';
    const captured = push.deliver;
    push.deliver = PushService.prototype['postToExpo'].bind(push);
    try {
      await push.sendToUsers(farmId, [eleveurId], {
        title: 't',
        body: 'b',
        route: '/tasks',
      });
    } finally {
      push.deliver = captured;
      globalThis.fetch = realFetch;
      process.env.PUSH_DISABLED = realDisabled;
    }
    expect(calls).toEqual(['https://exp.host/--/api/v2/push/send']);
    const rows = await app
      .get(DataSource)
      .query('SELECT 1 FROM push_devices WHERE token = $1', [dead]);
    expect(rows).toHaveLength(0);
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import { VisitRemindersService } from './../src/modules/visits/visit-reminders.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

function inDays(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Next-visit reminders: the agent who planned a visit hears about it
 * VISITE_RAPPEL_J days before and on the day, and when it is overdue; a newer
 * visit on the farm closes the plan; the sweep never duplicates.
 */
describe('Rappel de la prochaine visite (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let reminders: VisitRemindersService;
  let notify: NotifyService;
  let adminToken: string;
  let agentToken: string;
  let otherAgentToken: string;
  let dgeToken: string;
  const farms: Record<'soon' | 'today' | 'late' | 'far', string> = {
    soon: '',
    today: '',
    late: '',
    far: '',
  };
  const visits: Record<string, string> = {};

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { farmIds?: string[] } = {},
  ): Promise<string> {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Rappel ${profileCode}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, phone, res.body.loginCode);
  }

  const inbox = async (token: string) =>
    (
      (await get('/notifications?limit=200', token).expect(200)).body as {
        items: { event: string; subjectId: string | null }[];
      }
    ).items;

  async function sweepAll() {
    const events = await reminders.sweep();
    await notify.flush();
    return events;
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
    reminders = app.get(VisitRemindersService);
    notify = app.get(NotifyService);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    for (const k of Object.keys(farms) as (keyof typeof farms)[]) {
      farms[k] = (
        await createProgrammeFarm(server, adminToken, {
          provinceCode: 'G1',
          exploitantName: `Rappel ${k}`,
        })
      ).farmId;
    }
    agentToken = await institution('AGENT_TECHNIQUE', {
      farmIds: Object.values(farms),
    });
    otherAgentToken = await institution('AGENT_TECHNIQUE', {
      farmIds: Object.values(farms),
    });
    dgeToken = await institution('DGE');

    const plan = async (
      k: keyof typeof farms,
      visitDate: string,
      next: string,
    ) => {
      const res = await post(
        `/farms/${farms[k]}/visits`,
        { visitDate, type: 'TECHNIQUE', nextVisitDate: next },
        agentToken,
      ).expect(201);
      visits[k] = res.body.id;
    };
    await plan('soon', inDays(-10), inDays(1));
    await plan('today', inDays(-10), inDays(0));
    await plan('late', inDays(-10), inDays(-3));
    await plan('far', inDays(-1), inDays(20));
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('reminds the planning agent before, on the day and when overdue, not for far dates', async () => {
    const events = await sweepAll();
    const ids = Object.values(visits);
    const mine = events.filter((e) => ids.includes(e.visitId));
    expect(mine.map((e) => [e.visitId, e.stage]).sort()).toEqual(
      [
        [visits.soon, 'AVANT'],
        [visits.today, 'JOUR'],
        [visits.late, 'RETARD'],
      ].sort(),
    );
    const box = await inbox(agentToken);
    const of = (id: string) => box.filter((n) => n.subjectId === id);
    expect(of(visits.soon).map((n) => n.event)).toEqual(['VISIT_REMINDER']);
    expect(of(visits.today).map((n) => n.event)).toEqual(['VISIT_REMINDER']);
    expect(of(visits.late).map((n) => n.event)).toEqual(['VISIT_OVERDUE']);
    expect(of(visits.far)).toHaveLength(0);
    // Only the agent who planned them, not the other agent of the same scope.
    const other = await inbox(otherAgentToken);
    expect(other.filter((n) => ids.includes(n.subjectId ?? ''))).toHaveLength(0);
  });

  it('is idempotent: a second sweep creates nothing', async () => {
    const count = async (): Promise<number> =>
      (
        await ds.query(
          `SELECT COUNT(*)::int AS n FROM notifications WHERE subject_id = ANY($1)`,
          [Object.values(visits)],
        )
      )[0].n;
    const before = await count();
    expect(before).toBeGreaterThan(0);
    await sweepAll();
    expect(await count()).toBe(before);
  });

  it('lists the overdue plans for the DGE, and a newer visit closes them', async () => {
    const list = async (): Promise<string[]> =>
      (
        (
          await get(
            `/programme/visits?retard=true&farmId=${farms.late}`,
            dgeToken,
          ).expect(200)
        ).body as { items: { id: string }[] }
      ).items.map((v) => v.id);
    expect(await list()).toEqual([visits.late]);

    await post(
      `/farms/${farms.late}/visits`,
      { visitDate: inDays(0), type: 'TECHNIQUE' },
      agentToken,
    ).expect(201);
    expect(await list()).toEqual([]);

    const count = async (): Promise<number> =>
      (
        await ds.query(
          `SELECT COUNT(*)::int AS n FROM notifications WHERE farm_id = $1`,
          [farms.late],
        )
      )[0].n;
    const before = await count();
    const events = await sweepAll();
    expect(events.some((e) => e.farmId === farms.late)).toBe(false);
    expect(await count()).toBe(before);
  });

  it('has default rules the administration can edit, VISIT_AGENT only for visit events', async () => {
    const rules = (await get('/programme/notification-rules', adminToken).expect(200))
      .body as { code: string; audience: string }[];
    expect(rules.find((r) => r.code === 'AGENT_VISITE_RAPPEL')?.audience).toBe(
      'VISIT_AGENT',
    );
    expect(rules.find((r) => r.code === 'AGENT_VISITE_RETARD')?.audience).toBe(
      'VISIT_AGENT',
    );
    await post(
      '/programme/notification-rules',
      {
        code: `BAD_${Date.now()}`,
        label: 'Mauvaise regle',
        event: 'WEIGHING_LATE',
        audience: 'VISIT_AGENT',
        channels: ['IN_APP'],
      },
      adminToken,
    ).expect(400);
  });
});

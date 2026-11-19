// Jury lot 5: a technical agent of the programme (institution account) enters
// the day's data and reports a health problem ON BEHALF of a farmer during a
// visit. The right lives in the access matrix (TECHNIQUE:CREER -> `saisie:creer`,
// SANITAIRE:CREER -> `sanitaire:signaler`), the admin can switch it off per
// profile, and every such row is marked `enteredOnBehalf` by the server.
//
// Matrices are per PROFILE and shared by every spec: the "admin removes the
// right" scenario edits a dedicated custom profile created by this spec (a
// fresh code per run), never AGENT_TECHNIQUE, so nothing can leak into another
// spec running on the same database. The default grant of AGENT_TECHNIQUE is
// only READ here.
process.env.INSTITUTION_OTP = 'off';

import { lvDate } from './helpers/libreville-day.js';
import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

const day = (offset: number) =>
  lvDate(new Date(Date.now() + offset * 86_400_000));

describe('Saisie pour le compte de la ferme — jury lot 5 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmId: string;
  let otherFarmId: string;
  let ownerId: string;
  let ownerToken: string;
  let batchId: string;
  let otherBatchId: string;
  let agentToken: string;
  let notify: NotifyService;
  const agentName = `Agent Délégué ${randomBytes(4).toString('hex')}`;

  const digits = String(Date.now()).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const entries = (farm = farmId, batch = batchId) =>
    `/farms/${farm}/batches/${batch}/daily-entries`;
  const events = (farm = farmId, batch = batchId) =>
    `/farms/${farm}/batches/${batch}/health-events`;

  /** The DELEGATED_ENTRY notifications of a user, after the pending ones landed. */
  async function delegatedNotes(token: string) {
    await notify.flush();
    const box = (await get('/notifications?limit=200', token).expect(200)).body as {
      items: Array<{
        event: string;
        subjectId: string | null;
        title: string;
        body: string;
        route: string;
      }>;
    };
    return box.items.filter((n) => n.event === 'DELEGATED_ENTRY');
  }

  async function membership(
    profileCode: string,
    farmIds: string[],
    fullName = `Agent ${tag}`,
  ): Promise<string> {
    const phone = uniquePhone();
    const res = await request(server)
      .post('/programme/access/memberships')
      .set(auth(adminToken))
      .send({ fullName, phone, profileCode, ...(farmIds.length ? { farmIds } : {}) })
      .expect(201);
    return login(server, phone, res.body.loginCode as string);
  }

  async function openBatch(farm: string, token: string): Promise<string> {
    const res = await post(
      `/farms/${farm}/batches`,
      {
        batchName: `Bande Délégation ${digits}`,
        integrationDate: day(-3),
        quantityAtStart: 200,
        type: 'CHAIR',
      },
      token,
    ).expect(201);
    return res.body.id as string;
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
    notify = app.get(NotifyService);
    adminToken = (await createPlatformAdmin(server, ds)).token;

    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Délégation ${tag}`,
      exploitantName: 'Exploitant Délégation',
    });
    farmId = farm.farmId;
    ownerId = farm.ownerId;
    ownerToken = farm.ownerToken;
    const other = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Délégation Autre ${tag}`,
      exploitantName: 'Exploitant Délégation 2',
    });
    otherFarmId = other.farmId;
    batchId = await openBatch(farmId, ownerToken);
    otherBatchId = await openBatch(otherFarmId, other.ownerToken);

    agentToken = await membership('AGENT_TECHNIQUE', [farmId], agentName);
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  it('AGENT_TECHNIQUE holds TECHNIQUE:CREER and SANITAIRE:CREER by default, nobody else gained them', async () => {
    const profiles = (await get('/programme/access/profiles', adminToken).expect(200))
      .body as Array<{ code: string; matrix: Record<string, string[]> }>;
    const agent = profiles.find((p) => p.code === 'AGENT_TECHNIQUE')!;
    expect(agent.matrix.TECHNIQUE).toEqual(expect.arrayContaining(['CREER']));
    expect(agent.matrix.SANITAIRE).toEqual(expect.arrayContaining(['CREER']));
    // The single signal the clients test.
    const me = await get(`/farms/${farmId}/me`, agentToken).expect(200);
    expect(me.body.permissions).toEqual(
      expect.arrayContaining(['saisie:creer', 'sanitaire:signaler']),
    );
    for (const code of ['DGE', 'BCEG', 'MAEDR', 'ANINF', 'ADMIN']) {
      const p = profiles.find((x) => x.code === code)!;
      expect(p.matrix.TECHNIQUE ?? []).not.toContain('CREER');
    }
  });

  it('the agent creates the day’s entry of an in-scope farm: flagged, with author name and profile', async () => {
    const res = await post(
      entries(),
      { entryDate: day(0), deaths: 1, waterL: 40 },
      agentToken,
    ).expect(201);
    expect(res.body).toMatchObject({
      enteredOnBehalf: true,
      enteredByName: agentName,
      enteredByProfile: 'Agent technique',
    });

    const list = await get(entries(), ownerToken).expect(200);
    const row = (list.body as Array<Record<string, unknown>>).find(
      (e) => e.entryDate === day(0),
    )!;
    expect(row).toMatchObject({
      enteredOnBehalf: true,
      enteredByName: agentName,
      enteredByProfile: 'Agent technique',
    });
  });

  it('the owner is told once of the agent’s entry; the agent is not; a replay adds nothing', async () => {
    const entryId = (
      (await get(entries(), ownerToken).expect(200)).body as Array<{
        id: string;
        entryDate: string;
      }>
    ).find((e) => e.entryDate === day(0))!.id;

    const mine = await delegatedNotes(ownerToken);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      subjectId: entryId,
      title: 'Saisie pour votre compte',
      route: `/batches/${batchId}`,
    });
    const [y, m, d] = day(0).split('-');
    expect(mine[0].body).toBe(
      `${agentName} (Agent technique) a saisi les données du ${d}/${m}/${y} pour la bande Bande Délégation ${digits}.`,
    );
    expect(await delegatedNotes(agentToken)).toHaveLength(0);

    // The same day posted again (offline replay): the row exists, no new notification.
    await post(entries(), { entryDate: day(0), deaths: 1, waterL: 40 }, agentToken).expect(201);
    expect(await delegatedNotes(ownerToken)).toHaveLength(1);
  });

  it('the owner’s own entry is not flagged; the agent completing it keeps the farm author', async () => {
    const own = await post(
      entries(),
      { entryDate: day(-1), deaths: 0, waterL: 25 },
      ownerToken,
    ).expect(201);
    expect(own.body).toMatchObject({
      enteredOnBehalf: false,
      enteredByName: null,
      enteredByProfile: null,
    });

    // Rule: flag and author belong to the row's creator. An institution
    // completing the farm's entry changes neither.
    await post(entries(), { entryDate: day(-1), waterL: 30 }, agentToken).expect(201);
    const list = (await get(entries(), ownerToken).expect(200)).body as Array<
      Record<string, unknown>
    >;
    const row = list.find((e) => e.entryDate === day(-1))!;
    expect(row).toMatchObject({
      enteredOnBehalf: false,
      enteredByName: null,
      createdById: ownerId,
    });
    // Neither the owner's own entry nor the agent completing it notifies.
    const subjects = (await delegatedNotes(ownerToken)).map((n) => n.subjectId);
    expect(subjects).not.toContain(own.body.id);
    expect(subjects).toHaveLength(1);
  });

  it('the client cannot set the flag, the server does', async () => {
    const res = await post(
      entries(),
      { entryDate: day(-2), deaths: 0, enteredOnBehalf: true },
      ownerToken,
    ).expect(201);
    expect(res.body.enteredOnBehalf).toBe(false);
  });

  it('refuses a farm out of scope, deleting, sorties and opening a band', async () => {
    const out = await post(
      entries(otherFarmId, otherBatchId),
      { entryDate: day(0), deaths: 0 },
      agentToken,
    );
    expect([403, 404]).toContain(out.status);

    // No delete route exists for a daily entry (and TECHNIQUE:MODIFIER is not held).
    const list = (await get(entries(), ownerToken).expect(200)).body as Array<{ id: string }>;
    const del = await request(server)
      .delete(`${entries()}/${list[0].id}`)
      .set(auth(agentToken));
    expect([403, 404, 405]).toContain(del.status);

    // Other writes opened by the same domain stay closed.
    const sortie = await post(`/farms/${farmId}/bandes/${batchId}/sorties`, {}, agentToken).expect(403);
    expect(String(sortie.body.message)).toMatch(/consultation seule/);
    // SANITAIRE:CREER only declares: recording a treatment needs SANITAIRE:MODIFIER.
    await post(`/farms/${farmId}/batches/${batchId}/treatments`, {}, agentToken).expect(403);
    await post(
      `/farms/${farmId}/batches`,
      { batchName: 'Interdite', integrationDate: day(0), quantityAtStart: 10, type: 'CHAIR' },
      agentToken,
    ).expect(403);
  });

  it('the agent declares a health problem for the farm (photo included), the owner sees the mark', async () => {
    const created = await post(
      events(),
      {
        kind: 'SYMPTOME',
        occurredAt: day(0),
        severity: 'JAUNE',
        title: 'Diarrhée constatée pendant la visite',
        description: 'Déclaré par l’agent pour le compte de l’éleveur.',
      },
      agentToken,
    ).expect(201);
    expect(created.body).toMatchObject({
      enteredOnBehalf: true,
      enteredByName: agentName,
      enteredByProfile: 'Agent technique',
    });
    const eventId = created.body.id as string;

    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      randomBytes(32),
    ]);
    await request(server)
      .post(`${events()}/${eventId}/photos`)
      .set(auth(agentToken))
      .attach('file', png, { filename: 'visite.png', contentType: 'image/png' })
      .expect(201);

    const own = await post(
      events(),
      { kind: 'SYMPTOME', occurredAt: day(0), severity: 'VERT', title: 'Déclaration de l’éleveur' },
      ownerToken,
    ).expect(201);
    expect(own.body).toMatchObject({ enteredOnBehalf: false, enteredByName: null });

    const list = (await get(events(), ownerToken).expect(200)).body as Array<
      Record<string, unknown>
    >;
    expect(list.find((e) => e.id === eventId)).toMatchObject({
      enteredOnBehalf: true,
      enteredByName: agentName,
      photos: [expect.objectContaining({ mimeType: 'image/png' })],
    });
    expect(list.find((e) => e.id === own.body.id)).toMatchObject({ enteredOnBehalf: false });

    // The owner is told once of the agent's declaration (not of his own);
    // the agent hears nothing.
    const notes = await delegatedNotes(ownerToken);
    const declared = notes.filter((n) => n.subjectId === eventId);
    expect(declared).toHaveLength(1);
    expect(declared[0].body).toBe(
      `${agentName} (Agent technique) a signalé un problème de santé sur la bande Bande Délégation ${digits}.`,
    );
    expect(declared[0].route).toBe(`/farms/${farmId}/batches/${batchId}/health-events`);
    expect(notes.map((n) => n.subjectId)).not.toContain(own.body.id);
    expect(notes).toHaveLength(2);
    expect(await delegatedNotes(agentToken)).toHaveLength(0);

    // The agent keeps its review rights unchanged: it reads, never deletes or resolves.
    await get(events(), agentToken).expect(200);
    await request(server).delete(`${events()}/${eventId}`).set(auth(agentToken)).expect(403);
    await request(server)
      .patch(`${events()}/${eventId}/resolve`)
      .set(auth(agentToken))
      .expect(403);
  });

  it('a profile without SANITAIRE:CREER declares nothing', async () => {
    const dge = await membership('DGE', []);
    await post(events(), { kind: 'SYMPTOME', occurredAt: day(0), severity: 'VERT', title: 'x' }, dge).expect(403);
  });

  it('after the admin removes TECHNIQUE:CREER the agent is refused; restoring it reopens the entry', async () => {
    // Dedicated profile: matrices are shared per profile, never edit a system one here.
    const code = `DELEG${digits}`;
    const base = {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER', 'CREER'],
      SANITAIRE: ['CONSULTER', 'CREER'],
      DECLARATIONS: ['CONSULTER'],
    };
    const created = await request(server)
      .post('/programme/access/profiles')
      .set(auth(adminToken))
      .send({ code, label: `Délégation ${code}`, scopeKind: 'FARMS', matrix: base })
      .expect(201);
    const token = await membership(code, [farmId], `Agent perso ${tag}`);
    const setMatrix = (matrix: object) =>
      request(server)
        .patch(`/programme/access/profiles/${created.body.id}`)
        .set(auth(adminToken))
        .send({ matrix });

    const first = await post(entries(), { entryDate: day(-3), deaths: 0 }, token).expect(201);
    expect(first.body).toMatchObject({
      enteredOnBehalf: true,
      enteredByProfile: `Délégation ${code}`,
    });

    await setMatrix({ ...base, TECHNIQUE: ['CONSULTER'] }).expect(200);
    await post(entries(), { entryDate: day(-3), deaths: 0 }, token).expect(403);
    const me = await get(`/farms/${farmId}/me`, token).expect(200);
    expect(me.body.permissions).not.toContain('saisie:creer');
    // The declaration right is a separate cell and stays.
    expect(me.body.permissions).toContain('sanitaire:signaler');

    await setMatrix({ ...base, SANITAIRE: ['CONSULTER'] }).expect(200);
    await post(events(), { kind: 'SYMPTOME', occurredAt: day(0), severity: 'VERT', title: 'x' }, token).expect(403);

    await setMatrix(base).expect(200);
    await post(entries(), { entryDate: day(-3), deaths: 0 }, token).expect(201);
  });
});

// Recette ANINF A21: reading the sanitary declarations is a matrix right
// (DECLARATIONS:CONSULTER), not a profile code. The admin removes it from the
// AGENT_TECHNIQUE profile or gives it to another one; SANITAIRE:CONSULTER
// alone never opens a declaration.
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Droit « Déclarations sanitaires (lecture) » (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmId: string;
  let otherFarmId: string;
  let batchId: string;

  const digits = String(Date.now()).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const events = () => `/farms/${farmId}/batches/${batchId}/health-events`;

  async function institution(
    profileCode: string,
    farmIds: string[],
  ): Promise<string> {
    const p = uniquePhone();
    const res = await request(server)
      .post('/programme/access/memberships')
      .set(auth(adminToken))
      .send({ fullName: `Decl ${profileCode} ${digits}`, phone: p, profileCode, farmIds })
      .expect(201);
    return login(server, p, res.body.loginCode as string);
  }

  async function profileId(code: string): Promise<string> {
    const res = await get('/programme/access/profiles', adminToken).expect(200);
    return (res.body as Array<{ id: string; code: string }>).find(
      (p) => p.code === code,
    )!.id;
  }

  const setMatrix = (id: string, matrix: object) =>
    request(server)
      .patch(`/programme/access/profiles/${id}`)
      .set(auth(adminToken))
      .send({ matrix });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;

    const owner = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Decl ${tag}`,
      exploitantName: 'Exploitant Decl',
    });
    farmId = owner.farmId;
    otherFarmId = (
      await createProgrammeFarm(server, adminToken, {
        name: `Ferme Decl Autre ${tag}`,
        exploitantName: 'Exploitant Decl 2',
      })
    ).farmId;
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth(owner.ownerToken))
      .send({
        batchName: `Bande Decl ${digits}`,
        integrationDate: new Date(Date.now() - 86_400_000)
          .toISOString()
          .slice(0, 10),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    batchId = batch.body.id;
  }, 180_000);

  afterAll(async () => {
    await app.close();
  });

  it('the agent technique reads the declarations of its farm by default, not another farm', async () => {
    const agent = await institution('AGENT_TECHNIQUE', [farmId]);
    await get(events(), agent).expect(200);
    const other = await institution('AGENT_TECHNIQUE', [otherFarmId]);
    await get(events(), other).expect(403);
  });

  it('removing the right from AGENT_TECHNIQUE closes the reading, restoring it reopens it', async () => {
    const agent = await institution('AGENT_TECHNIQUE', [farmId]);
    const id = await profileId('AGENT_TECHNIQUE');
    const before = (
      await get('/programme/access/profiles', adminToken).expect(200)
    ).body.find((p: { id: string }) => p.id === id).matrix;
    try {
      const { DECLARATIONS: _removed, ...without } = before;
      await setMatrix(id, without).expect(200);
      // SANITAIRE:CONSULTER is still held: the route opens, the declarations do not.
      expect(without.SANITAIRE).toEqual(['CONSULTER']);
      await get(events(), agent).expect(403);
    } finally {
      await setMatrix(id, before).expect(200);
    }
    await get(events(), agent).expect(200);
  });

  it('SANITAIRE:CONSULTER alone reads no declaration; DECLARATIONS:CONSULTER does, within the perimeter', async () => {
    const code = `DECL${digits}`;
    const created = await request(server)
      .post('/programme/access/profiles')
      .set(auth(adminToken))
      .send({
        code,
        label: `Lecture ${code}`,
        scopeKind: 'FARMS',
        matrix: { REGISTRE: ['CONSULTER'], SANITAIRE: ['CONSULTER'] },
      })
      .expect(201);
    const inPerimeter = await institution(code, [farmId]);
    const outside = await institution(code, [otherFarmId]);
    await get(events(), inPerimeter).expect(403);

    await setMatrix(created.body.id, {
      REGISTRE: ['CONSULTER'],
      DECLARATIONS: ['CONSULTER'],
    }).expect(200);
    // The right alone is enough: no SANITAIRE grant needed.
    await get(events(), inPerimeter).expect(200);
    await get(events(), outside).expect(403);

    // Read-only: no write action on this domain.
    await setMatrix(created.body.id, {
      DECLARATIONS: ['CONSULTER', 'VALIDER'],
    }).expect(400);
  });
});

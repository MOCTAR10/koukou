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

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * POUFA visites techniques et biosécurité (CDC n° 27, n° 45, §3.2): the grid
 * is an admin-managed list, the class thresholds are catalog parameters, the
 * agent records the visit (idempotent), rights follow the matrix, third-party
 * reads are journaled, visits appear in the band history.
 */
describe('POUFA — visites techniques et biosécurité (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerA: string;
  let ownerB: string;
  let farmA: string;
  let farmB: string;
  let agentToken: string;
  let dgeToken: string;
  let vetToken: string;
  let bcegToken: string;
  let bandId: string;
  let visitId: string;
  const digits = String(Date.now()).slice(-7);
  const key = `visit-${digits}-${Math.random().toString(36).slice(2, 8)}`;

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ): Promise<string> {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Visites ${profileCode}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, phone, res.body.loginCode);
  }

  const userIdOf = (token: string) =>
    String(
      JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'))
        .sub,
    );

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
    ds = app.get(DataSource);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    const a = await createProgrammeFarm(server, adminToken, {
      provinceCode: 'G1',
      exploitantName: 'Visites A',
    });
    farmA = a.farmId;
    ownerA = a.ownerToken;
    const b = await createProgrammeFarm(server, adminToken, {
      provinceCode: 'G2',
      exploitantName: 'Visites B',
    });
    farmB = b.farmId;
    ownerB = b.ownerToken;
    agentToken = await institution('AGENT_TECHNIQUE', { farmIds: [farmA] });
    dgeToken = await institution('DGE');
    vetToken = await institution('VETERINAIRE');
    bcegToken = await institution('BCEG');
    const band = await post(
      `/farms/${farmA}/batches`,
      {
        batchName: `Bande visites ${digits}`,
        integrationDate: daysAgo(10),
        quantityAtStart: 300,
        type: 'CHAIR',
      },
      ownerA,
    ).expect(201);
    bandId = band.body.id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('the grid and its thresholds are configuration', () => {
    it('seeds a default grid readable by the farm, with weights', async () => {
      const res = await get(`/farms/${farmA}/visits/grid`, ownerA).expect(200);
      expect(res.body.criteria.length).toBeGreaterThanOrEqual(10);
      expect(res.body.criteria[0]).toEqual(
        expect.objectContaining({
          code: expect.any(String),
          label: expect.any(String),
          weight: expect.any(Number),
        }),
      );
      expect(res.body.thresholds).toEqual({ a: 80, b: 60 });
    });

    it('lets the veterinary services (not the DGE) add a criterion with a bounded weight', async () => {
      const code = `CRIT_${digits}`;
      await post(
        '/surveillance/lists/CRITERE_BIOSECURITE',
        { code, label: 'Critère e2e', meta: { weight: 11 } },
        vetToken,
      ).expect(400);
      await post(
        '/surveillance/lists/CRITERE_BIOSECURITE',
        { code, label: 'Critère e2e', meta: { weight: 3, category: 'Test' } },
        dgeToken,
      ).expect(403);
      await post(
        '/surveillance/lists/CRITERE_BIOSECURITE',
        { code, label: 'Critère e2e', meta: { weight: 3, category: 'Test' } },
        vetToken,
      ).expect(201);
      const res = await get(`/farms/${farmA}/visits/grid`, ownerA).expect(200);
      expect(
        res.body.criteria.find((c: { code: string }) => c.code === code),
      ).toMatchObject({ weight: 3, category: 'Test' });
      // Deactivated: out of the grid, still accepted on an old offline visit.
      await request(server)
        .patch(`/surveillance/lists/CRITERE_BIOSECURITE/${code}`)
        .set(auth(vetToken))
        .send({ active: false })
        .expect(200);
      const after = await get(`/farms/${farmA}/visits/grid`, ownerA).expect(200);
      expect(
        after.body.criteria.some((c: { code: string }) => c.code === code),
      ).toBe(false);
    });
  });

  describe('recording a visit', () => {
    const body = () => ({
      visitDate: daysAgo(1),
      type: 'BIOSECURITE',
      batchId: bandId,
      observations: 'Pédiluve à sec, reste correct.',
      recommendations: 'Renouveler le désinfectant chaque jour.',
      latitude: 0.39,
      longitude: 9.45,
      nextVisitDate: daysAgo(-20),
      visaFrom: daysAgo(8),
      visaTo: daysAgo(2),
      idempotencyKey: key,
      answers: [
        { criterionCode: 'PEDILUVE', answer: 'NON_CONFORME' }, // weight 3
        { criterionCode: 'CLOTURE_ENTREE', answer: 'CONFORME' }, // 2
        { criterionCode: 'REGISTRE_VISITEURS', answer: 'CONFORME' }, // 1
        { criterionCode: 'LAVAGE_MAINS', answer: 'NA', comment: 'Pas d’eau' },
      ],
    });

    it('computes the score and class from the weights and the thresholds, and replays idempotently', async () => {
      const res = await post(`/farms/${farmA}/visits`, body(), agentToken).expect(
        201,
      );
      visitId = res.body.id;
      // (2 + 1) / (3 + 2 + 1) = 50 %: class C under 60 %.
      expect(res.body).toMatchObject({
        scorePct: 50,
        classification: 'C',
        thresholds: { a: 80, b: 60 },
        visaFrom: daysAgo(8),
        visaTo: daysAgo(2),
        batchId: bandId,
        type: 'BIOSECURITE',
      });
      expect(res.body.agent.name).toContain('AGENT_TECHNIQUE');
      expect(res.body.answers).toHaveLength(4);
      expect(res.body.answers.find((a: { criterionCode: string }) => a.criterionCode === 'PEDILUVE')).toMatchObject({
        weight: 3,
        answer: 'NON_CONFORME',
      });
      const replay = await post(`/farms/${farmA}/visits`, body(), agentToken).expect(
        201,
      );
      expect(replay.body.id).toBe(visitId);
      const count = await ds.query(
        `SELECT COUNT(*)::int AS n FROM farm_visits WHERE farm_id = $1 AND idempotency_key = $2`,
        [farmA, key],
      );
      expect(count[0].n).toBe(1);
    });

    it('refuses inconsistent visits (French reasons)', async () => {
      const bad = (over: object) => ({ ...body(), idempotencyKey: undefined, ...over });
      const cases: Array<[object, RegExp]> = [
        [{ visaTo: undefined }, /début et la fin/],
        [{ batchId: undefined }, /choisissez la bande/],
        [{ visaTo: daysAgo(-3) }, /postérieures à la visite/],
        [{ visaFrom: daysAgo(30) }, /avant l’ouverture/],
        [{ nextVisitDate: daysAgo(5) }, /prochaine visite/],
        [{ visitDate: daysAgo(-9) }, /futur/],
        [{ latitude: undefined }, /vont ensemble/],
        [
          { answers: [{ criterionCode: 'INCONNU', answer: 'CONFORME' }] },
          /inconnu/,
        ],
        [
          {
            answers: [
              { criterionCode: 'PEDILUVE', answer: 'CONFORME' },
              { criterionCode: 'PEDILUVE', answer: 'NON_CONFORME' },
            ],
          },
          /deux fois/,
        ],
        [{ answers: [] }, /au moins un critère/],
      ];
      for (const [over, message] of cases) {
        const res = await post(`/farms/${farmA}/visits`, bad(over), agentToken).expect(400);
        expect(String(res.body.message)).toMatch(message);
      }
      // A band of another farm is not found.
      const other = await post(
        `/farms/${farmA}/visits`,
        bad({ batchId: '11111111-1111-4111-8111-111111111111' }),
        agentToken,
      ).expect(400);
      expect(String(other.body.message)).toMatch(/Bande introuvable/);
    });

    it('moves the class with the catalog thresholds', async () => {
      await post(
        '/programme/parameters/BIOSECURITE_SEUIL_B_PCT',
        { value: 40, reason: 'Test e2e des seuils' },
        vetToken,
      ).expect(201);
      // Thresholds apply from now on: a new visit today is judged with them.
      const res = await post(
        `/farms/${farmA}/visits`,
        {
          visitDate: daysAgo(0),
          type: 'BIOSECURITE',
          answers: [
            { criterionCode: 'PEDILUVE', answer: 'NON_CONFORME' },
            { criterionCode: 'CLOTURE_ENTREE', answer: 'CONFORME' },
            { criterionCode: 'REGISTRE_VISITEURS', answer: 'CONFORME' },
          ],
        },
        agentToken,
      ).expect(201);
      expect(res.body.scorePct).toBe(50);
      expect(res.body.thresholds.b).toBe(40);
      expect(res.body.classification).toBe('B');
      // Back to the proposed value: the parameter outlives this spec.
      await post(
        '/programme/parameters/BIOSECURITE_SEUIL_B_PCT',
        { value: 60, reason: 'Retour à la valeur proposée (e2e)' },
        vetToken,
      ).expect(201);
    });
  });

  describe('rights follow the matrix', () => {
    it('lets the agent write on its farm only', async () => {
      await post(
        `/farms/${farmB}/visits`,
        { visitDate: daysAgo(0), type: 'TECHNIQUE' },
        agentToken,
      ).expect(403);
    });

    it('refuses the owner, the DGE and the veterinary services to write', async () => {
      const visit = { visitDate: daysAgo(0), type: 'TECHNIQUE' };
      await post(`/farms/${farmA}/visits`, visit, ownerA).expect(403);
      await post(`/farms/${farmA}/visits`, visit, dgeToken).expect(403);
      await post(`/farms/${farmA}/visits`, visit, vetToken).expect(403);
    });

    it('lets the owner, the DGE, the vets and the agent read; not another farm, not the BCEG', async () => {
      for (const token of [ownerA, dgeToken, vetToken, agentToken]) {
        const list = await get(`/farms/${farmA}/visits`, token).expect(200);
        expect(list.body.some((v: { id: string }) => v.id === visitId)).toBe(true);
        const one = await get(`/farms/${farmA}/visits/${visitId}`, token).expect(200);
        expect(one.body.answers.length).toBe(4);
      }
      await get(`/farms/${farmA}/visits`, ownerB).expect(403);
      await get(`/farms/${farmA}/visits`, bcegToken).expect(403);
    });

    it('journals the third-party reads and the writes', async () => {
      const since = new Date(Date.now() - 1000);
      await get(`/farms/${farmA}/visits`, dgeToken).expect(200);
      await get(`/farms/${farmA}/visits`, ownerA).expect(200);
      const reads = await ds.query(
        `SELECT actor_user_id FROM audit_events
          WHERE action = 'READ_SENSITIVE' AND route = '/farms/:farmId/visits'
            AND occurred_at >= $1`,
        [since],
      );
      const actors = reads.map((r: { actor_user_id: string }) => r.actor_user_id);
      expect(actors).toContain(userIdOf(dgeToken));
      expect(actors).not.toContain(userIdOf(ownerA));
      const writes = await ds.query(
        `SELECT 1 FROM audit_events
          WHERE method = 'POST' AND route = '/farms/:farmId/visits' AND status_code = 201
            AND actor_user_id = $1`,
        [userIdOf(agentToken)],
      );
      expect(writes.length).toBeGreaterThan(0);
      const rows = await ds.query(
        `SELECT 1 FROM audit_row_changes WHERE table_name = 'farm_visits' AND op = 'I'
            AND after ->> 'id' = $1`,
        [visitId],
      );
      expect(rows).toHaveLength(1);
    });
  });

  describe('photos of a visit', () => {
    const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = () => Buffer.concat([PNG, Buffer.from(String(Math.random()))]);
    const upload = (token: string, bytes: Buffer, type = 'image/png') =>
      request(server)
        .post(`/farms/${farmA}/visits/${visitId}/photos`)
        .set(auth(token))
        .attach('file', bytes, { filename: 'p.png', contentType: type });
    let photoId: string;

    it('lets the recording agent attach a photo, idempotently, checking the bytes', async () => {
      const bytes = png();
      const up = await upload(agentToken, bytes).expect(201);
      photoId = up.body.id;
      expect(up.body).toMatchObject({ mimeType: 'image/png', sizeBytes: bytes.length });
      const again = await upload(agentToken, bytes).expect(201);
      expect(again.body.id).toBe(photoId);
      const fake = await upload(agentToken, Buffer.from('not an image at all')).expect(400);
      expect(fake.body.message).toContain('PNG');
      await upload(agentToken, png(), 'application/pdf').expect(400);
      const one = await get(`/farms/${farmA}/visits/${visitId}`, ownerA).expect(200);
      expect(one.body.photos).toHaveLength(1);
    });

    it('caps the number of photos', async () => {
      for (let i = 0; i < 7; i++) await upload(agentToken, png()).expect(201);
      await upload(agentToken, png()).expect(400);
    });

    it('refuses writing to anyone but the recording agent', async () => {
      await upload(ownerA, png()).expect(403);
      await upload(dgeToken, png()).expect(403);
      await upload(vetToken, png()).expect(403);
    });

    it('serves the photo to the readers of the visit only, and journals third-party reads', async () => {
      const since = new Date(Date.now() - 1000);
      const url = `/farms/${farmA}/visits/${visitId}/photos/${photoId}`;
      for (const token of [ownerA, dgeToken, vetToken, agentToken]) {
        const res = await get(url, token).buffer(true).expect(200);
        expect(res.headers['content-type']).toContain('image/png');
      }
      await get(url, ownerB).expect(403);
      await get(url, bcegToken).expect(403);
      const reads = await ds.query(
        `SELECT actor_user_id FROM audit_events
          WHERE action = 'READ_SENSITIVE' AND route = '/farms/:farmId/visits/:id/photos/:photoId'
            AND occurred_at >= $1`,
        [since],
      );
      const actors = reads.map((r: { actor_user_id: string }) => r.actor_user_id);
      expect(actors).toContain(userIdOf(dgeToken));
      expect(actors).not.toContain(userIdOf(ownerA));
    });
  });

  describe('programme view', () => {
    it('lists the visits of the scope with province and class filters', async () => {
      const all = await get('/programme/visits?pageSize=200', dgeToken).expect(200);
      expect(all.body.items.some((v: { id: string }) => v.id === visitId)).toBe(true);
      const g1 = await get('/programme/visits?province=G1&classification=C&pageSize=200', dgeToken).expect(200);
      expect(g1.body.items.every((v: { classification: string }) => v.classification === 'C')).toBe(true);
      expect(g1.body.items.some((v: { id: string }) => v.id === visitId)).toBe(true);
      const g2 = await get('/programme/visits?province=G2&pageSize=200', dgeToken).expect(200);
      expect(g2.body.items.some((v: { id: string }) => v.id === visitId)).toBe(false);
      // The agent only sees its farm; farm owners have no programme view.
      const mine = await get('/programme/visits?pageSize=200', agentToken).expect(200);
      expect(mine.body.items.every((v: { farmId: string }) => v.farmId === farmA)).toBe(true);
      await get('/programme/visits', ownerA).expect(403);
    });
  });

  describe('T2 history', () => {
    it('shows the visits and controls in the band history, with the visa', async () => {
      const lots = await get(`/farms/${farmA}/trace/lots?batchId=${bandId}`, ownerA).expect(200);
      const lotId = (lots.body.lots ?? lots.body)[0].id as string;
      const hist = await get(`/farms/${farmA}/trace/lots/${lotId}`, ownerA).expect(200);
      const visite = hist.body.rearing.filter((r: { kind: string }) => r.kind === 'VISITE');
      expect(visite.length).toBeGreaterThanOrEqual(1);
      const control = visite.find((r: { details: { visitId: string } }) => r.details.visitId === visitId);
      expect(control.label).toContain('Contrôle de biosécurité');
      expect(control.label).toContain('classe C');
      expect(control.label).toContain('visées');
      // No agent name in the history.
      expect(JSON.stringify(control)).not.toContain('AGENT_TECHNIQUE');
      // An institution that reads neither TECHNIQUE nor SANITAIRE sees none.
      const hidden = await get(`/farms/${farmA}/trace/lots/${lotId}`, bcegToken);
      if (hidden.status === 200) {
        expect(hidden.body.rearing.some((r: { kind: string }) => r.kind === 'VISITE')).toBe(false);
      }
    });
  });
});

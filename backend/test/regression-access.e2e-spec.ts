// Regression: access control and data isolation (cross-farm IDOR, read-only
// institutions and their scope, matrix-driven refusals, buyers, GET routes
// that write, malformed input).
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource, In } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  AlertKind,
  AlertStatus,
} from './../src/common/enums/alert-level.enum.js';
import { Alert } from './../src/modules/alerts/entities/alert.entity.js';
import { AccessProfile } from './../src/modules/access/entities/access-profile.entity.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

describe('Regression — accès et isolation des données (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;

  let farmA: string;
  let farmB: string;
  let ownerA: string;
  let ownerB: string;
  let batchA: string;
  let batchB: string;
  let buildingB: string;
  let taskB: string;
  let productB: string;
  let employmentB: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);
  const UNKNOWN = '00000000-0000-4000-8000-000000000000';

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const send = (
    method: 'post' | 'put' | 'patch' | 'delete',
    url: string,
    body: object | undefined,
    token: string,
  ) => {
    const r = request(server)[method](url).set(auth(token));
    return body === undefined ? r : r.send(body);
  };
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function newBatch(token: string, farmId: string, name: string) {
    const res = await send(
      'post',
      `/farms/${farmId}/batches`,
      {
        batchName: name,
        integrationDate: yesterday,
        quantityAtStart: 100,
        type: 'CHAIR',
      },
      token,
    ).expect(201);
    return res.body.id as string;
  }

  async function createProfile(
    code: string,
    scopeKind: 'ALL' | 'PROVINCES' | 'FARMS',
    matrix: object,
  ): Promise<string> {
    const res = await send(
      'post',
      '/programme/access/profiles',
      { code, label: `Profil ${code}`, scopeKind, matrix },
      adminToken,
    ).expect(201);
    return res.body.id as string;
  }

  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ): Promise<string> {
    const phone = uniquePhone();
    const res = await send(
      'post',
      '/programme/access/memberships',
      { fullName: `Regression ${profileCode}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, phone, res.body.loginCode as string);
  }

  const activeAlerts = (farmId: string, kind: AlertKind) =>
    ds.getRepository(Alert).count({
      where: {
        farmId,
        kind,
        status: In([AlertStatus.ACTIVE, AlertStatus.ACQUITTEE]),
      },
    });

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
      name: `Ferme Regr A ${tag}`,
      provinceCode: 'G1',
    });
    const b = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Regr B ${tag}`,
      provinceCode: 'G2',
    });
    farmA = a.farmId;
    ownerA = a.ownerToken;
    farmB = b.farmId;
    ownerB = b.ownerToken;

    batchA = await newBatch(ownerA, farmA, `Bande A ${tag}`);
    batchB = await newBatch(ownerB, farmB, `Bande B ${tag}`);
    buildingB = (
      await send(
        'post',
        `/farms/${farmB}/buildings`,
        { name: `Bat B ${tag}`, buildingAreaM2: 30, capacity: 1000 },
        ownerB,
      ).expect(201)
    ).body.id;
    taskB = (
      await send(
        'post',
        `/farms/${farmB}/tasks`,
        { title: `Tache B ${tag}`, dueDate: tomorrow },
        ownerB,
      ).expect(201)
    ).body.id;
    productB = (
      await send(
        'post',
        `/farms/${farmB}/feed-products`,
        { name: `Provende B ${tag}` },
        ownerB,
      ).expect(201)
    ).body.id;
    employmentB = (
      await send(
        'post',
        `/farms/${farmB}/eleveurs`,
        {
          phone: uniquePhone(),
          fullName: 'Eleveur B',
          code: 'secret789',
          role: 'ELEVEUR',
          jobTitle: 'Éleveur',
        },
        ownerB,
      ).expect(201)
    ).body.employment.id;
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  describe('IDOR entre fermes (propriétaire de A contre B)', () => {
    it('chemin /farms/B/… : lecture et écriture refusées (403), rien ne change chez B', async () => {
      const probes: Array<
        [
          'get' | 'patch' | 'delete' | 'post',
          string,
          object | undefined,
        ]
      > = [
        ['get', `/farms/${farmB}/batches`, undefined],
        ['get', `/farms/${farmB}/batches/${batchB}`, undefined],
        ['patch', `/farms/${farmB}/batches/${batchB}`, { batchName: 'PIRATE' }],
        ['post', `/farms/${farmB}/batches/${batchB}/cloture`, {}],
        [
          'post',
          `/farms/${farmB}/batches/${batchB}/daily-entries`,
          { entryDate: today, deaths: 5 },
        ],
        ['get', `/farms/${farmB}/batches/${batchB}/daily-entries`, undefined],
        ['get', `/farms/${farmB}/batches/${batchB}/prophylaxis`, undefined],
        ['get', `/farms/${farmB}/batches/${batchB}/health-events`, undefined],
        ['get', `/farms/${farmB}/dashboard`, undefined],
        ['get', `/farms/${farmB}/buildings/${buildingB}`, undefined],
        ['patch', `/farms/${farmB}/buildings/${buildingB}`, { name: 'PIRATE' }],
        ['delete', `/farms/${farmB}/buildings/${buildingB}`, undefined],
        ['get', `/farms/${farmB}/tasks/${taskB}`, undefined],
        ['patch', `/farms/${farmB}/tasks/${taskB}`, { title: 'PIRATE' }],
        ['delete', `/farms/${farmB}/tasks/${taskB}`, undefined],
        ['patch', `/farms/${farmB}/feed-products/${productB}`, { name: 'PIRATE' }],
        ['delete', `/farms/${farmB}/feed-products/${productB}`, undefined],
        ['get', `/farms/${farmB}/feed-stock`, undefined],
        ['get', `/farms/${farmB}/slaughter-orders`, undefined],
        ['get', `/farms/${farmB}/market/orders`, undefined],
        ['get', `/farms/${farmB}/visits`, undefined],
        [
          'patch',
          `/farms/${farmB}/eleveurs/${employmentB}`,
          { jobTitle: 'PIRATE' },
        ],
      ];
      for (const [method, url, body] of probes) {
        const res = await send(method, url, body, ownerA);
        if (res.status !== 403) {
          throw new Error(
            `${method.toUpperCase()} ${url} : attendu 403, reçu ${res.status}`,
          );
        }
      }
      // Nothing moved on farm B.
      expect(
        (await get(`/farms/${farmB}/batches/${batchB}`, ownerB).expect(200))
          .body.batchName,
      ).toBe(`Bande B ${tag}`);
      expect(
        (await get(`/farms/${farmB}/buildings/${buildingB}`, ownerB).expect(200))
          .body.name,
      ).toBe(`Bat B ${tag}`);
      expect(
        (await get(`/farms/${farmB}/tasks/${taskB}`, ownerB).expect(200)).body
          .title,
      ).toBe(`Tache B ${tag}`);
      const products = await get(`/farms/${farmB}/feed-products`, ownerB).expect(
        200,
      );
      expect(
        products.body.find((p: { id: string }) => p.id === productB).name,
      ).toBe(`Provende B ${tag}`);
      const rows: Array<{ n: number }> = await ds.query(
        `SELECT COUNT(*)::int AS n FROM daily_entries WHERE batch_id = $1`,
        [batchB],
      );
      expect(rows[0].n).toBe(0);
    });

    it('ressource de B appelée sous /farms/A/… : jamais servie ni modifiée', async () => {
      const probes: Array<
        ['get' | 'patch' | 'delete' | 'post', string, object | undefined]
      > = [
        ['get', `/farms/${farmA}/batches/${batchB}`, undefined],
        ['patch', `/farms/${farmA}/batches/${batchB}`, { batchName: 'PIRATE' }],
        ['get', `/farms/${farmA}/batches/${batchB}/curve`, undefined],
        ['get', `/farms/${farmA}/batches/${batchB}/pondage`, undefined],
        ['get', `/farms/${farmA}/batches/${batchB}/daily-entries`, undefined],
        [
          'post',
          `/farms/${farmA}/batches/${batchB}/daily-entries`,
          { entryDate: today, deaths: 5 },
        ],
        ['get', `/farms/${farmA}/batches/${batchB}/prophylaxis`, undefined],
        ['get', `/farms/${farmA}/batches/${batchB}/treatments`, undefined],
        ['get', `/farms/${farmA}/batches/${batchB}/health-events`, undefined],
        ['get', `/farms/${farmA}/batches/${batchB}/passeport`, undefined],
        ['get', `/farms/${farmA}/buildings/${buildingB}`, undefined],
        ['patch', `/farms/${farmA}/buildings/${buildingB}`, { name: 'PIRATE' }],
        ['delete', `/farms/${farmA}/buildings/${buildingB}`, undefined],
        ['get', `/farms/${farmA}/tasks/${taskB}`, undefined],
        ['patch', `/farms/${farmA}/tasks/${taskB}`, { title: 'PIRATE' }],
        ['delete', `/farms/${farmA}/tasks/${taskB}`, undefined],
        ['patch', `/farms/${farmA}/feed-products/${productB}`, { name: 'PIRATE' }],
        ['delete', `/farms/${farmA}/feed-products/${productB}`, undefined],
        [
          'patch',
          `/farms/${farmA}/eleveurs/${employmentB}`,
          { jobTitle: 'PIRATE' },
        ],
        ['get', `/farms/${farmA}/slaughter-orders/${batchB}`, undefined],
        ['get', `/farms/${farmA}/visits/${batchB}`, undefined],
      ];
      for (const [method, url, body] of probes) {
        const res = await send(method, url, body, ownerA);
        // Not found (or refused): never a success and never a server error.
        if (![400, 403, 404].includes(res.status)) {
          throw new Error(
            `${method.toUpperCase()} ${url} : attendu 400/403/404, reçu ${res.status}`,
          );
        }
      }
      expect(
        (await get(`/farms/${farmB}/batches/${batchB}`, ownerB).expect(200))
          .body.batchName,
      ).toBe(`Bande B ${tag}`);
      await get(`/farms/${farmB}/buildings/${buildingB}`, ownerB).expect(200);
      await get(`/farms/${farmB}/tasks/${taskB}`, ownerB).expect(200);
      const rows: Array<{ n: number }> = await ds.query(
        `SELECT COUNT(*)::int AS n FROM daily_entries WHERE batch_id = $1`,
        [batchB],
      );
      expect(rows[0].n).toBe(0);
    });

    it('identifiants de B glissés dans le corps d’une requête sur A : refusés', async () => {
      await send(
        'post',
        `/farms/${farmA}/tasks`,
        { title: 'Tâche piégée', dueDate: tomorrow, batchId: batchB },
        ownerA,
      ).expect(400);
      await send(
        'post',
        `/farms/${farmA}/batches/${batchA}/daily-entries`,
        { entryDate: today, deaths: 1, inputLotId: UNKNOWN },
        ownerA,
      ).expect((res) => {
        if (![400, 404].includes(res.status)) {
          throw new Error(`inputLotId étranger : reçu ${res.status}`);
        }
      });
      // A body farmId is ignored (whitelist): the batch lands on the path farm.
      const created = await send(
        'post',
        `/farms/${farmA}/batches`,
        {
          batchName: `Piège farmId ${tag}`,
          integrationDate: yesterday,
          quantityAtStart: 10,
          type: 'CHAIR',
          farmId: farmB,
        },
        ownerA,
      );
      if (created.status === 201) {
        expect(created.body.farmId).toBe(farmA);
      }
      const onB = await get(`/farms/${farmB}/batches`, ownerB).expect(200);
      expect(
        onB.body.some(
          (x: { batchName: string }) => x.batchName === `Piège farmId ${tag}`,
        ),
      ).toBe(false);
    });

    it('un éleveur ne voit ni ne modifie les tâches des autres', async () => {
      const phone = uniquePhone();
      await send(
        'post',
        `/farms/${farmA}/eleveurs`,
        {
          phone,
          fullName: 'Eleveur A',
          code: 'secret789',
          role: 'ELEVEUR',
          jobTitle: 'Éleveur',
        },
        ownerA,
      ).expect(201);
      const eleveur = await login(server, phone, 'secret789');
      const task = (
        await send(
          'post',
          `/farms/${farmA}/tasks`,
          { title: `Tache A ${tag}`, dueDate: tomorrow },
          ownerA,
        ).expect(201)
      ).body.id as string;
      await get(`/farms/${farmA}/tasks/${task}`, eleveur).expect(403);
      await send(
        'patch',
        `/farms/${farmA}/tasks/${task}`,
        { status: 'FAIT' },
        eleveur,
      ).expect(403);
      await send('delete', `/farms/${farmA}/tasks/${task}`, undefined, eleveur)
        .expect(403);
      const list = await get(`/farms/${farmA}/tasks`, eleveur).expect(200);
      expect(list.body).toEqual([]);
      // …and he reaches nothing on the other farm.
      await get(`/farms/${farmB}/batches`, eleveur).expect(403);
    });
  });

  describe('administrateur de ferme : pas d’auto-élévation', () => {
    it('ne modifie ni ses droits ni son rôle, ni ceux d’une autre ferme', async () => {
      const phone = uniquePhone();
      const created = await send(
        'post',
        `/farms/${farmA}/eleveurs`,
        {
          phone,
          fullName: 'Admin A',
          code: 'secret456',
          role: 'ADMIN',
          jobTitle: 'Comptable',
        },
        ownerA,
      ).expect(201);
      const employmentId = created.body.employment.id as string;
      await send(
        'patch',
        `/farms/${farmA}/eleveurs/${employmentId}`,
        { permissions: ['equipe:gerer', 'equipe:taches'] },
        ownerA,
      ).expect(200);
      const adminMember = await login(server, phone, 'secret456');

      for (const body of [
        { permissions: ['equipe:gerer', 'equipe:taches', 'caisse:ouvrir'] },
        { role: 'ELEVEUR' },
        { jobTitle: 'Directeur' },
        { active: false },
      ]) {
        await send(
          'patch',
          `/farms/${farmA}/eleveurs/${employmentId}`,
          body,
          adminMember,
        ).expect(403);
      }
      await send(
        'patch',
        `/farms/${farmB}/eleveurs/${employmentB}`,
        { jobTitle: 'PIRATE' },
        adminMember,
      ).expect(403);
      const me = await get(`/farms/${farmA}/me`, adminMember).expect(200);
      expect(me.body.permissions).not.toContain('caisse:ouvrir');
    });
  });

  describe('institutions : lecture seule, périmètre, matrice', () => {
    let readerToken: string;
    let provinceToken: string;
    let matrixProfileId: string;
    let matrixToken: string;
    const reader = `RR${tag}`;
    const provProfile = `RP${tag}`;
    const matrixCode = `RM${tag}`;
    const readMatrix = {
      REGISTRE: ['CONSULTER'],
      TECHNIQUE: ['CONSULTER'],
      SANITAIRE: ['CONSULTER'],
      INTRANTS: ['CONSULTER'],
    };

    beforeAll(async () => {
      await createProfile(reader, 'FARMS', readMatrix);
      readerToken = await institution(reader, { farmIds: [farmA] });
      await createProfile(provProfile, 'PROVINCES', readMatrix);
      provinceToken = await institution(provProfile, { provinceCodes: ['G1'] });
      matrixProfileId = await createProfile(matrixCode, 'ALL', {
        REGISTRE: ['CONSULTER'],
        TECHNIQUE: ['CONSULTER'],
      });
      matrixToken = await institution(matrixCode);
    }, 60_000);

    it('lit sa ferme, mais ni les écritures ni une ferme hors périmètre', async () => {
      await get(`/farms/${farmA}/batches`, readerToken).expect(200);
      await get(`/farms/${farmA}/batches/${batchA}`, readerToken).expect(200);
      await get(`/farms/${farmB}/batches`, readerToken).expect(403);
      await get(`/farms/${farmB}/batches/${batchB}`, readerToken).expect(403);
      await get(`/farms/${farmB}/dashboard`, readerToken).expect(403);

      const writes: Array<
        ['post' | 'patch' | 'delete', string, object | undefined]
      > = [
        ['patch', `/farms/${farmA}/batches/${batchA}`, { batchName: 'PIRATE' }],
        ['post', `/farms/${farmA}/batches/${batchA}/cloture`, {}],
        [
          'post',
          `/farms/${farmA}/batches/${batchA}/daily-entries`,
          { entryDate: today, deaths: 1 },
        ],
        [
          'post',
          `/farms/${farmA}/tasks`,
          { title: 'Tâche institution', dueDate: tomorrow },
        ],
        ['post', `/farms/${farmA}/buildings`, { name: 'Bat institution' }],
        ['post', `/farms/${farmA}/feed-products`, { name: 'Provende inst.' }],
        ['post', `/farms/${farmA}/batches`, {
          batchName: 'Bande institution',
          integrationDate: yesterday,
          quantityAtStart: 10,
          type: 'CHAIR',
        }],
        ['post', `/farms/${farmA}/eleveurs`, {
          phone: uniquePhone(),
          fullName: 'Intrus',
          code: 'secret789',
          role: 'ELEVEUR',
        }],
      ];
      for (const [method, url, body] of writes) {
        const res = await send(method, url, body, readerToken);
        if (res.status !== 403) {
          throw new Error(
            `${method.toUpperCase()} ${url} : attendu 403, reçu ${res.status}`,
          );
        }
      }
      expect(
        (await get(`/farms/${farmA}/batches/${batchA}`, ownerA).expect(200))
          .body.batchName,
      ).toBe(`Bande A ${tag}`);
    });

    it('un périmètre provincial ne voit que sa province', async () => {
      await get(`/farms/${farmA}/batches`, provinceToken).expect(200);
      await get(`/farms/${farmB}/batches`, provinceToken).expect(403);
      await send(
        'patch',
        `/farms/${farmA}/batches/${batchA}`,
        { batchName: 'PIRATE' },
        provinceToken,
      ).expect(403);
      const list = await get(
        `/programme/farms?pageSize=200&q=${tag}`,
        provinceToken,
      ).expect(200);
      const ids = list.body.items.map((f: { id: string }) => f.id);
      expect(ids).toContain(farmA);
      expect(ids).not.toContain(farmB);
    });

    it('retirer un droit de la matrice ferme la route aussitôt (pas de contournement)', async () => {
      await get(`/farms/${farmA}/batches`, matrixToken).expect(200);
      await get(`/farms/${farmA}/buildings`, matrixToken).expect(200);

      await send(
        'patch',
        `/programme/access/profiles/${matrixProfileId}`,
        { matrix: { REGISTRE: ['CONSULTER'] } },
        adminToken,
      ).expect(200);
      // Same token, no re-login: the matrix is read on every request.
      await get(`/farms/${farmA}/batches`, matrixToken).expect(403);
      await get(`/farms/${farmA}/dashboard`, matrixToken).expect(403);
      await get(`/farms/${farmA}/buildings`, matrixToken).expect(200);

      await send(
        'patch',
        `/programme/access/profiles/${matrixProfileId}`,
        { matrix: { TECHNIQUE: ['CONSULTER'] } },
        adminToken,
      ).expect(200);
      await get(`/farms/${farmA}/batches`, matrixToken).expect(200);
      await get(`/farms/${farmA}/buildings`, matrixToken).expect(403);
    });

    it('seul l’administrateur plateforme édite la matrice et les comptes', async () => {
      const buyer = await registerBuyer(server);
      const tokens = [ownerA, buyer.token, readerToken, provinceToken];
      for (const token of tokens) {
        await get('/programme/access/profiles', token).expect(403);
        await get('/programme/access/memberships', token).expect(403);
        await send(
          'patch',
          `/programme/access/profiles/${matrixProfileId}`,
          { matrix: { ADMINISTRATION: ['CONSULTER', 'ADMINISTRER'] } },
          token,
        ).expect(403);
        await send(
          'post',
          '/programme/access/profiles',
          {
            code: `Z${tag}`,
            label: 'Z',
            scopeKind: 'ALL',
            matrix: { REGISTRE: ['CONSULTER'] },
          },
          token,
        ).expect(403);
        await send(
          'patch',
          `/programme/access/memberships/${UNKNOWN}`,
          { profileCode: 'DGE', farmIds: [farmA] },
          token,
        ).expect(403);
        await send(
          'post',
          `/programme/access/memberships/${UNKNOWN}/login-code`,
          {},
          token,
        ).expect(403);
      }
      // The refused edit left the matrix as the admin set it.
      const mine = await ds
        .getRepository(AccessProfile)
        .findOneByOrFail({ code: matrixCode });
      expect(Object.keys(mine.matrix)).toEqual(['TECHNIQUE']);
    });

    it('lecture seule réelle : le tableau de bord et les listes ne produisent aucune écriture', async () => {
      await sleep(1500);
      await ds.getRepository(Alert).delete({ farmId: farmA });
      const dash = await get(`/farms/${farmA}/dashboard`, readerToken);
      expect(dash.status).toBe(200);
      await get(`/farms/${farmA}/tasks`, readerToken).expect(200);
      await get(
        `/farms/${farmA}/batches/${batchA}/prophylaxis`,
        readerToken,
      ).expect(200);
      expect(await activeAlerts(farmA, AlertKind.SAISIE_MANQUEE)).toBe(0);
      expect(await activeAlerts(farmA, AlertKind.STOCK_OEUF)).toBe(0);
      // The owner's own reading still maintains the alerts.
      await get(`/farms/${farmA}/dashboard`, ownerA).expect(200);
      expect(await activeAlerts(farmA, AlertKind.SAISIE_MANQUEE)).toBe(1);
    });
  });

  describe('acheteurs Market', () => {
    it('sont refusés partout sauf sur leurs propres commandes', async () => {
      const buyer = await registerBuyer(server);
      const other = await registerBuyer(server);
      for (const url of [
        `/farms/${farmA}/batches`,
        `/farms/${farmA}/batches/${batchA}`,
        `/farms/${farmA}/dashboard`,
        `/farms/${farmA}/tasks`,
        `/farms/${farmA}/feed-stock`,
        `/farms/${farmA}/market/orders`,
        `/farms/${farmA}/eleveurs`,
        '/programme/farms',
        '/programme/access/profiles',
        '/programme/access/me',
      ]) {
        const res = await get(url, buyer.token);
        if (res.status !== 403) {
          throw new Error(`GET ${url} par un acheteur : reçu ${res.status}`);
        }
      }
      await send(
        'post',
        `/farms/${farmA}/batches`,
        {
          batchName: 'Bande acheteur',
          integrationDate: yesterday,
          quantityAtStart: 10,
          type: 'CHAIR',
        },
        buyer.token,
      ).expect(403);
      await send('post', '/programme/farms', {}, buyer.token).expect(403);

      // Orders are private to their buyer.
      expect((await get('/market/orders', buyer.token).expect(200)).body).toEqual(
        [],
      );
      await get(`/market/orders/${UNKNOWN}`, other.token).expect(404);
      await send(
        'post',
        `/market/orders/${UNKNOWN}/cancel`,
        undefined,
        other.token,
      ).expect(404);
      await send(
        'post',
        `/market/orders/${UNKNOWN}/withdraw`,
        undefined,
        other.token,
      ).expect(404);
      // A farm user does not see buyers' orders through the buyer routes.
      expect((await get('/market/orders', ownerA).expect(200)).body).toEqual([]);
      await get(`/market/orders/${UNKNOWN}`, ownerA).expect(404);
    });
  });

  describe('alertes : pas de doublon sous concurrence', () => {
    it('plusieurs tableaux de bord simultanés ne créent qu’une alerte SAISIE_MANQUEE', async () => {
      await sleep(500);
      await ds.getRepository(Alert).delete({ farmId: farmB });
      const responses = await Promise.all(
        Array.from({ length: 8 }, () =>
          get(`/farms/${farmB}/dashboard`, ownerB),
        ),
      );
      for (const res of responses) expect(res.status).toBe(200);
      expect(await activeAlerts(farmB, AlertKind.SAISIE_MANQUEE)).toBe(1);
    }, 60_000);
  });

  describe('entrées malformées : 400, jamais 500', () => {
    it('identifiants non UUID', async () => {
      for (const url of [
        '/farms/pas-un-uuid/batches',
        '/farms/pas-un-uuid/dashboard',
        `/farms/${farmA}/batches/pas-un-uuid`,
        `/farms/${farmA}/batches/pas-un-uuid/daily-entries`,
        `/farms/${farmA}/buildings/pas-un-uuid`,
        `/farms/${farmA}/tasks/pas-un-uuid`,
        '/market/orders/pas-un-uuid',
      ]) {
        const res = await get(url, ownerA);
        if (![400, 404].includes(res.status)) {
          throw new Error(`GET ${url} : attendu 400/404, reçu ${res.status}`);
        }
      }
    });

    it('dates, heures et paramètres invalides du tableau de bord', async () => {
      for (const q of [
        'date=abc',
        'date=2026-13-45',
        'date=2026-02-31',
        'date=0000-00-00',
        `date=${today}&time=25:99`,
        `date=${today}&time=abc`,
      ]) {
        await get(`/farms/${farmA}/dashboard?${q}`, ownerA).expect(400);
      }
      const asOf = await get(`/farms/${farmA}/batches?asOf=garbage`, ownerA);
      expect(asOf.status).toBeLessThan(500);
    });

    it('corps vide, types faux, énumérations et nombres démesurés', async () => {
      const bodies: Array<object | undefined> = [
        undefined,
        {},
        { batchName: 'x', integrationDate: 'pas-une-date', quantityAtStart: 5, type: 'CHAIR' },
        { batchName: 'x', integrationDate: yesterday, quantityAtStart: 5, type: 'NOPE' },
        { batchName: 'x', integrationDate: yesterday, quantityAtStart: 1e21, type: 'CHAIR' },
        { batchName: 'x', integrationDate: yesterday, quantityAtStart: -3, type: 'CHAIR' },
        { batchName: 'x', integrationDate: yesterday, quantityAtStart: 'beaucoup', type: 'CHAIR' },
      ];
      for (const body of bodies) {
        const res = await send('post', `/farms/${farmA}/batches`, body, ownerA);
        if (res.status !== 400) {
          throw new Error(
            `POST batches ${JSON.stringify(body)} : attendu 400, reçu ${res.status}`,
          );
        }
      }
      const entries: Array<object | undefined> = [
        undefined,
        {},
        { entryDate: 'pas-une-date' },
        { entryDate: '2026-13-45' },
        { entryDate: today, deaths: 1e21 },
        { entryDate: today, deaths: -1 },
        { entryDate: today, deaths: 'x' },
        { entryDate: today, feedUnit: 'TONNE' },
        { entryDate: today, inputLotId: 'pas-un-uuid' },
      ];
      for (const body of entries) {
        const res = await send(
          'post',
          `/farms/${farmA}/batches/${batchA}/daily-entries`,
          body,
          ownerA,
        );
        if (res.status !== 400) {
          throw new Error(
            `POST daily-entries ${JSON.stringify(body)} : attendu 400, reçu ${res.status}`,
          );
        }
      }
      await send('post', `/farms/${farmA}/tasks`, { title: 'x', dueDate: 'demain' }, ownerA)
        .expect(400);
      await send('post', `/farms/${farmA}/tasks`, undefined, ownerA).expect(400);
      await send('post', `/farms/${farmA}/buildings`, { name: 'x', capacity: 1e21 }, ownerA)
        .expect(400);
    });
  });
});

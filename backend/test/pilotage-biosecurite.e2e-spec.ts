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
 * Classement de biosécurité dans le pilotage : classe du DERNIER contrôle de
 * chaque ferme, fermes jamais contrôlées à part, contrôle ancien, agrégats
 * masqués sous k pour le MAEDR, droits de la matrice, registre filtrable.
 */
describe('Pilotage — classement de biosécurité (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let farmA: string;
  let farmB: string;
  let farmC: string;
  let agentToken: string;
  let dgeToken: string;
  let maedrToken: string;
  let registryOnlyToken: string;
  const digits = String(Date.now()).slice(-7);

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
      { fullName: `Bio ${profileCode}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, phone, res.body.loginCode);
  }

  const allOk = [
    { criterionCode: 'PEDILUVE', answer: 'CONFORME' },
    { criterionCode: 'CLOTURE_ENTREE', answer: 'CONFORME' },
    { criterionCode: 'REGISTRE_VISITEURS', answer: 'CONFORME' },
  ];
  const pediluveKo = [
    { criterionCode: 'PEDILUVE', answer: 'NON_CONFORME' },
    { criterionCode: 'CLOTURE_ENTREE', answer: 'CONFORME' },
    { criterionCode: 'REGISTRE_VISITEURS', answer: 'CONFORME' },
  ];
  const visit = (farmId: string, visitDate: string, answers: object[]) =>
    post(
      `/farms/${farmId}/visits`,
      { visitDate, type: 'BIOSECURITE', answers },
      agentToken,
    ).expect(201);

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
    farmA = (
      await createProgrammeFarm(server, adminToken, { provinceCode: 'G1' })
    ).farmId;
    farmB = (
      await createProgrammeFarm(server, adminToken, { provinceCode: 'G1' })
    ).farmId;
    farmC = (
      await createProgrammeFarm(server, adminToken, { provinceCode: 'G2' })
    ).farmId;
    agentToken = await institution('AGENT_TECHNIQUE', {
      farmIds: [farmA, farmB, farmC],
    });
    dgeToken = await institution('DGE');
    maedrToken = await institution('MAEDR');
    const regCode = `REG_ONLY_${digits}`;
    await post(
      '/programme/access/profiles',
      {
        code: regCode,
        label: `Registre seul ${digits}`,
        scopeKind: 'ALL',
        matrix: { REGISTRE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    registryOnlyToken = await institution(regCode);

    // Farm A: an old A, then a recent C (the latest counts). Farm B: an A
    // older than the « ancien » threshold. Farm C: never controlled.
    await visit(farmA, daysAgo(40), allOk);
    await visit(farmA, daysAgo(2), pediluveKo);
    await visit(farmB, daysAgo(500), allOk);
  }, 180_000);

  afterAll(async () => {
    await app?.close();
  });

  it('classe chaque ferme sur son dernier contrôle, compte les non contrôlées et les contrôles anciens', async () => {
    const res = await get('/pilotage/dashboard', dgeToken).expect(200);
    const b = res.body.biosecurity;
    expect(b.staleAfterDays).toBe(365);
    expect(b.total).toMatchObject({
      farms: 3,
      controlled: 2,
      neverControlled: 1,
      classA: 1,
      classB: 0,
      classC: 1,
      stale: 1,
      averageScorePct: 75,
    });
    const g1 = b.provinces.find((p: { code: string }) => p.code === 'G1');
    expect(g1.figures).toMatchObject({ farms: 2, classA: 1, classC: 1 });
    const g2 = b.provinces.find((p: { code: string }) => p.code === 'G2');
    expect(g2.figures).toMatchObject({
      farms: 1,
      neverControlled: 1,
      controlled: 0,
    });
  });

  it('masque les agrégats du MAEDR sous k fermes', async () => {
    const res = await get('/pilotage/dashboard', maedrToken).expect(200);
    expect(res.body.biosecurity.suppressed).toBe(true);
    expect(res.body.biosecurity.total).toBeNull();
    expect(
      res.body.biosecurity.provinces.every(
        (p: { figures: unknown }) => p.figures === null,
      ),
    ).toBe(true);
  });

  it('colore la carte et l’export par ferme avec la classe, pas pour le MAEDR', async () => {
    const map = await get('/pilotage/map', dgeToken).expect(200);
    const pt = map.body.points.find(
      (p: { farmId: string }) => p.farmId === farmA,
    );
    if (pt) {
      expect(pt.biosecurity).toMatchObject({
        classification: 'C',
        stale: false,
      });
      expect(pt.colours.biosecurity).toBe('ROUGE');
    }
    expect(map.body.legend.biosecurity.staleAfterDays).toBe(365);
    const csv = await get('/pilotage/exports/farms.csv', dgeToken).expect(200);
    expect(csv.text).toContain('Biosécurité : classe du dernier contrôle');
    expect(csv.text).toContain('Non contrôlée');
    const prov = await get('/pilotage/exports/provinces.csv', dgeToken).expect(
      200,
    );
    expect(prov.text).toContain('Biosécurité : classe A');
    await get('/pilotage/exports/farms.csv', maedrToken).expect(403);
  });

  it('ajoute les colonnes à la synthèse DGE selon TECHNIQUE', async () => {
    const res = await get('/programme/economie/synthese', dgeToken).expect(200);
    expect(res.body.columns.biosecurity).toBe(true);
    const a = res.body.farms.find(
      (f: { farmId: string }) => f.farmId === farmA,
    );
    expect(a).toMatchObject({ bioClass: 'C', bioScorePct: 50 });
    const c = res.body.farms.find(
      (f: { farmId: string }) => f.farmId === farmC,
    );
    expect(c.bioClass).toBe('Non contrôlée');
    expect(res.body.total).toMatchObject({ bioA: 1, bioC: 1, bioNever: 1 });
  });

  it('filtre le registre par classe pour qui consulte TECHNIQUE, refuse sinon', async () => {
    const c = await get('/programme/farms?biosecurity=C', adminToken).expect(
      200,
    );
    expect(c.body.items.map((f: { id: string }) => f.id)).toEqual([farmA]);
    expect(c.body.items[0].biosecurity).toMatchObject({
      classification: 'C',
      scorePct: 50,
    });
    const none = await get(
      '/programme/farms?biosecurity=NONE',
      adminToken,
    ).expect(200);
    expect(none.body.items.map((f: { id: string }) => f.id)).toEqual([farmC]);
    await get('/programme/farms?biosecurity=Z', adminToken).expect(400);
    await get('/programme/farms?biosecurity=C', registryOnlyToken).expect(403);
    const plain = await get('/programme/farms', registryOnlyToken).expect(200);
    expect(
      plain.body.items.every(
        (f: { biosecurity: unknown }) => f.biosecurity === null,
      ),
    ).toBe(true);
  });
});

import { createHash, randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type ReportReadyEvent,
} from './../src/common/utils/event-bus.js';
import { ReportsService } from './../src/modules/reporting/reports.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
} from './helpers/programme-farm.js';

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Binary body of a supertest response (PDF). */
const binary = (
  res: request.Response,
  cb: (e: Error | null, b: Buffer) => void,
) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Pilotage POUFA — tableaux de bord, carte, objectif, rapports (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerA: { token: string; id: string };
  let ownerB: { token: string; id: string };
  let farmA: string;
  let farmB: string;
  let bandA1: string;
  let bandB1: string;
  let bandC: string;

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  let seq = 10;
  const phone = () => `+2416${seq++}${digits}`;
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const agentProfile = `PILOT${digits}`;
  const provProfile = `PPROV${digits}`;

  const accounts: Record<string, { token: string; userId: string }> = {};
  const events: ReportReadyEvent[] = [];
  const onReport = (e: ReportReadyEvent) => events.push(e);

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ) {
    const p = phone();
    const res = await post(
      '/programme/access/memberships',
      {
        fullName: `Pilotage ${profileCode} ${digits}`,
        phone: p,
        profileCode,
        ...scope,
      },
      adminToken,
    ).expect(201);
    return {
      token: await login(server, p, res.body.loginCode as string),
      userId: res.body.user.id as string,
    };
  }

  async function setMinGroup(value: number) {
    await post(
      '/programme/parameters/PILOTAGE_GROUPE_MIN_FERMES',
      { value, reason: `Essai e2e pilotage ${digits}` },
      adminToken,
    ).expect(201);
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
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;

    const a = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Pilotage Nord ${tag}`,
      provinceCode: 'G1',
      extra: {
        gps: { latitude: 0.4, longitude: 9.45 },
        cohort: 'COHORTE_1',
        statusCode: 'OPERATIONNELLE',
      },
    });
    farmA = a.farmId;
    ownerA = { token: a.ownerToken, id: a.ownerId };
    const b = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Pilotage Sud ${tag}`,
      provinceCode: 'G1',
      extra: { cohort: 'COHORTE_2' },
    });
    farmB = b.farmId;
    ownerB = { token: b.ownerToken, id: b.ownerId };

    const open = async (
      farm: string,
      token: string,
      integrationDate: string,
      quantityAtStart: number,
    ) =>
      (
        await post(
          `/farms/${farm}/batches`,
          {
            batchName: `Bande pilotage ${digits}`,
            type: 'CHAIR',
            integrationDate,
            quantityAtStart,
          },
          token,
        ).expect(201)
      ).body.id as string;
    const entry = (farm: string, band: string, token: string, body: object) =>
      post(`/farms/${farm}/batches/${band}/daily-entries`, body, token).expect(
        201,
      );

    bandA1 = await open(farmA, ownerA.token, day(-14), 1000);
    await entry(farmA, bandA1, ownerA.token, {
      entryDate: day(-13),
      deaths: 10,
      feedQuantity: 50,
      feedUnit: 'KG',
    });
    await entry(farmA, bandA1, ownerA.token, {
      entryDate: day(-7),
      deaths: 5,
      feedQuantity: 300,
      feedUnit: 'KG',
      avgWeightKg: 0.3,
      sampleSize: 30,
    });
    await entry(farmA, bandA1, ownerA.token, {
      entryDate: day(-2),
      deaths: 5,
      feedQuantity: 400,
      feedUnit: 'KG',
    });
    await post(
      `/farms/${farmA}/bandes/${bandA1}/sorties`,
      {
        sortieDate: day(-1),
        count: 100,
        weightKg: 150,
        reasonCode: 'VENTE_VIF',
        unitPriceFcfa: 2500,
      },
      ownerA.token,
    ).expect(201);

    bandB1 = await open(farmB, ownerB.token, day(-5), 500);
    await entry(farmB, bandB1, ownerB.token, { entryDate: day(-4), deaths: 2 });

    bandC = await open(farmA, ownerA.token, day(-3), 100);
    await entry(farmA, bandC, ownerA.token, { entryDate: day(-2), deaths: 1 });
    await post(
      `/farms/${farmA}/batches/${bandC}/cloture`,
      {},
      ownerA.token,
    ).expect(201);
    await get(`/farms/${farmA}/bandes/${bandC}/snapshots`, ownerA.token).expect(
      200,
    );

    await post(
      '/programme/access/profiles',
      {
        code: agentProfile,
        label: `Agent pilotage ${digits}`,
        scopeKind: 'FARMS',
        matrix: { PILOTAGE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    await post(
      '/programme/access/profiles',
      {
        code: provProfile,
        label: `Pilotage provincial ${digits}`,
        scopeKind: 'PROVINCES',
        matrix: { PILOTAGE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    accounts.agent = await institution(agentProfile, {
      farmIds: [farmA, farmB],
    });
    accounts.province = await institution(provProfile, {
      provinceCodes: ['G1'],
    });
    accounts.maedr = await institution('MAEDR');
    accounts.dge = await institution('DGE');
    koukouBus.on(KOUKOU_EVENTS.REPORT_READY, onReport);
  }, 180_000);

  afterAll(async () => {
    koukouBus.off(KOUKOU_EVENTS.REPORT_READY, onReport);
    // The parameter is versioned: put the proposed default back in force.
    await setMinGroup(5);
    await app.close();
  });

  describe('tableau de bord', () => {
    it('agrège les fermes du périmètre (agent FARMS)', async () => {
      const res = await get('/pilotage/dashboard', accounts.agent.token).expect(
        200,
      );
      const d = res.body;
      expect(d.scope).toMatchObject({ kind: 'FARMS', aggregateOnly: false });
      expect(d.totals.suppressed).toBe(false);
      const m = d.totals.metrics;
      expect(m).toMatchObject({
        farms: 2,
        bands: 3,
        deaths: 23,
        mortalityPct: 1.4,
        // A1: 1000 − 20 − 100; B1: 500 − 2; band C closed today is out.
        headcount: 1378,
        activeBands: 2,
        placedHeads: 1600,
      });
      // Measured weight of the sortie (150 kg), not 100 × 300 g.
      expect(m.produced).toMatchObject({ heads: 100, kg: 150 });
      expect(m.sold).toMatchObject({
        liveHeads: 100,
        avgPricePerHeadFcfa: 2500,
      });
      expect(m.completeness).toMatchObject({ daysEntered: 5, daysElapsed: 22 });
      expect(m.completeness.pct).toBeCloseTo(22.7, 1);
      expect(d.farms.total).toBe(2);
      expect(d.publishedAlerts).toEqual({ available: false, count: 0 });
      expect(d.inputs).toMatchObject({ available: false, figures: null });
      expect(d.provinces.map((p: { code: string }) => p.code)).toEqual(['G1']);
      expect(d.series.length).toBeGreaterThanOrEqual(2);
    });

    it('filtre par cohorte et par statut', async () => {
      const c1 = await get(
        '/pilotage/dashboard?cohort=COHORTE_1',
        accounts.agent.token,
      ).expect(200);
      expect(c1.body.totals.metrics.farms).toBe(1);
      expect(c1.body.totals.metrics.bands).toBe(2);
      const op = await get(
        '/pilotage/dashboard?status=OPERATIONNELLE',
        accounts.agent.token,
      ).expect(200);
      expect(op.body.farms.total).toBe(1);
    });

    it('refuse une période ou une province invalide', async () => {
      await get(
        `/pilotage/dashboard?from=${day(0)}&to=${day(-3)}`,
        accounts.agent.token,
      ).expect(400);
      await get('/pilotage/dashboard?province=ZZ', accounts.agent.token).expect(
        400,
      );
    });

    it('cantonne un profil provincial à ses provinces', async () => {
      await get(
        '/pilotage/dashboard?province=G2',
        accounts.province.token,
      ).expect(403);
      const res = await get(
        '/pilotage/dashboard?province=G1',
        accounts.province.token,
      ).expect(200);
      expect(res.body.scope.kind).toBe('PROVINCES');
      expect(res.body.totals.metrics.farms).toBeGreaterThanOrEqual(2);
    });

    it('le MAEDR ne lit que des agrégats', async () => {
      const res = await get('/pilotage/dashboard', accounts.maedr.token).expect(
        200,
      );
      expect(res.body.scope).toMatchObject({
        kind: 'AGGREGATE',
        aggregateOnly: true,
      });
      expect(res.body.scope.note).toContain('Données agrégées');
      expect(JSON.stringify(res.body)).not.toContain(farmA);
    });

    it('le DGE lit tout le programme', async () => {
      const res = await get('/pilotage/dashboard', accounts.dge.token).expect(
        200,
      );
      expect(res.body.scope).toMatchObject({
        kind: 'ALL',
        aggregateOnly: false,
      });
      expect(res.body.totals.metrics.farms).toBeGreaterThanOrEqual(2);
    });

    it('un exploitant n’a pas accès au pilotage', async () => {
      await get('/pilotage/dashboard', ownerA.token).expect(403);
      await get('/pilotage/map', ownerA.token).expect(403);
      await get('/pilotage/objective', ownerA.token).expect(403);
    });
  });

  describe('carte', () => {
    it('donne les points GPS colorés et les regroupements', async () => {
      const res = await get('/pilotage/map', accounts.agent.token).expect(200);
      const point = res.body.points.find(
        (p: { farmId: string }) => p.farmId === farmA,
      );
      expect(point).toMatchObject({
        latitude: 0.4,
        longitude: 9.45,
        provinceCode: 'G1',
      });
      expect(['VERT', 'JAUNE', 'ROUGE']).toContain(point.colours.alert);
      expect(point.colours.completeness).toBe('ROUGE');
      expect(res.body.farmsWithoutGps).toBeGreaterThanOrEqual(1);
      expect(res.body.legend.mortality).toMatchObject({ jaune: 3, rouge: 6 });
      const g1 = res.body.clusters.find(
        (c: { code: string }) => c.code === 'G1',
      );
      expect(g1).toMatchObject({ farms: 2, farmsWithGps: 1 });
    });

    it('ne donne au MAEDR que les provinces', async () => {
      const res = await get('/pilotage/map', accounts.maedr.token).expect(200);
      expect(res.body.points).toEqual([]);
      expect(Array.isArray(res.body.clusters)).toBe(true);
    });
  });

  describe('objectif 100 000 t', () => {
    it('donne la contribution, la méthode et la projection', async () => {
      const res = await get('/pilotage/objective', accounts.agent.token).expect(
        200,
      );
      const o = res.body;
      expect(o.objective).toMatchObject({ tonnes: 100_000 });
      expect(o.caveat).toContain("pas l'atteinte de l'objectif");
      expect(o.actual).toMatchObject({ heads: 100 });
      expect(o.actual.tonnes).toBeCloseTo(0.15, 3);
      expect(o.capacity).toMatchObject({ farms: 2, places: 4000 });
      // 4000 × 80 % × 6 × 95 % × 2,2 kg / 1000.
      expect(o.projection.annualPotentialTonnes).toBeCloseTo(40.1, 1);
      const years = o.projection.years.map((y: { year: number }) => y.year);
      expect(years[0]).toBe(2027);
      expect(years).toContain(2030);
      expect(o.projection.method.length).toBeGreaterThan(3);
      const keys = o.projection.inputs.map((i: { key: string }) => i.key);
      expect(keys).toContain('PROJECTION_BANDES_PAR_AN');
    });
  });

  describe('comparaison de la bande au programme', () => {
    const url = () => `/farms/${farmA}/bandes/${bandA1}/comparison`;

    it('donne la bande par semaine d’âge', async () => {
      const res = await get(url(), ownerA.token).expect(200);
      const c = res.body;
      expect(c).toMatchObject({ batchId: bandA1, currentWeek: 2 });
      expect(c.weeks).toHaveLength(3);
      expect(c.weeks[0].band.mortalityPct).toBe(1);
      expect(c.weeks[1].band.mortalityPct).toBe(2);
      expect(c.weeks[1].band.gmqG).toBeGreaterThan(30);
      expect(c.weeks[1].band.fcr).toBeCloseTo(1.4, 1);
      for (const w of c.weeks) {
        if (w.suppressed) expect(w.programme).toBeNull();
      }
      expect(c.method.length).toBeGreaterThan(0);
    });

    it('reste dans le périmètre de la ferme', async () => {
      await get(url(), ownerB.token).expect(403);
      await get(url(), accounts.maedr.token).expect(403);
      await get(url(), accounts.agent.token).expect(200);
    });
  });

  describe('exports', () => {
    it('exporte les fermes en CSV et le journalise', async () => {
      const res = await get(
        '/pilotage/exports/farms.csv',
        accounts.agent.token,
      ).expect(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text).toContain('Code ferme');
      expect(res.text).toContain(`Ferme Pilotage Nord ${tag}`);
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM audit_events
          WHERE actor_user_id = $1 AND action = 'EXPORT'
            AND route LIKE '%exports/farms.csv%'`,
        [accounts.agent.userId],
      );
      expect(n).toBeGreaterThanOrEqual(1);
    });

    it('exporte les bandes du périmètre', async () => {
      const res = await get(
        '/pilotage/exports/bandes.csv',
        accounts.agent.token,
      ).expect(200);
      expect(res.text.split('\r\n').length).toBe(4); // header + 3 bands
    });

    it('refuse les lignes par ferme au MAEDR', async () => {
      await get('/pilotage/exports/farms.csv', accounts.maedr.token).expect(
        403,
      );
      await get('/pilotage/exports/bandes.csv', accounts.maedr.token).expect(
        403,
      );
      const res = await get(
        '/pilotage/exports/provinces.csv',
        accounts.maedr.token,
      ).expect(200);
      expect(res.text).toContain('Masqué (petit groupe)');
    });
  });

  describe('masquage des petits groupes', () => {
    beforeAll(() => setMinGroup(1000));

    it('masque les agrégats du MAEDR sous le seuil', async () => {
      const res = await get('/pilotage/dashboard', accounts.maedr.token).expect(
        200,
      );
      expect(res.body.scope.minGroupSize).toBe(1000);
      expect(res.body.totals).toMatchObject({
        suppressed: true,
        metrics: null,
      });
      // A province is shown only when none of its farms brings any figure.
      for (const p of res.body.provinces) {
        if (p.suppressed) expect(p.metrics).toBeNull();
        else expect(p.metrics).toMatchObject({ bands: 0, bandsOpened: 0 });
      }
      const g1 = res.body.provinces.find(
        (p: { code: string }) => p.code === 'G1',
      );
      expect(g1).toMatchObject({ suppressed: true, metrics: null });
      const objective = await get(
        '/pilotage/objective',
        accounts.maedr.token,
      ).expect(200);
      expect(objective.body.suppressed).toBe(true);
      expect(objective.body.actual).toBeNull();
    });

    it('ne masque pas les données d’un périmètre de fermes', async () => {
      const res = await get('/pilotage/dashboard', accounts.agent.token).expect(
        200,
      );
      expect(res.body.totals.suppressed).toBe(false);
    });

    it('masque la moyenne du programme dans la comparaison', async () => {
      const res = await get(
        `/farms/${farmA}/bandes/${bandA1}/comparison`,
        ownerA.token,
      ).expect(200);
      expect(res.body.minGroupSize).toBe(1000);
      for (const w of res.body.weeks) {
        expect(w).toMatchObject({ suppressed: true, programme: null });
        expect(w.band).not.toBeNull();
      }
    });

    afterAll(() => setMinGroup(5));
  });

  describe('rapports PDF', () => {
    beforeAll(async () => {
      await app.get(ReportsService).sweep();
    }, 120_000);

    it('produit le rapport de fin de bande et l’annonce aux destinataires', async () => {
      const event = events.find((e) => e.batchId === bandC);
      expect(event).toBeDefined();
      expect(event).toMatchObject({
        templateCode: 'FIN_DE_BANDE',
        level: 'BANDE',
        farmId: farmA,
      });
      expect(event!.recipientUserIds).toEqual(
        expect.arrayContaining([ownerA.id, accounts.agent.userId]),
      );
      expect(event!.recipientUserIds).not.toContain(accounts.maedr.userId);
      expect(event!.downloadPath).toBe(
        `/pilotage/reports/runs/${event!.runId}/pdf`,
      );
    });

    it('l’exploitant télécharge son rapport, empreinte vérifiable', async () => {
      const event = events.find((e) => e.batchId === bandC)!;
      const list = await get(
        '/pilotage/reports/runs?level=BANDE',
        ownerA.token,
      ).expect(200);
      const run = list.body.find((r: { id: string }) => r.id === event.runId);
      expect(run).toMatchObject({
        farmId: farmA,
        sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(run.pdf).toBeUndefined();
      const pdf = await get(event.downloadPath, ownerA.token)
        .buffer(true)
        .parse(binary)
        .expect(200);
      const body = pdf.body as Buffer;
      expect(body.subarray(0, 4).toString()).toBe('%PDF');
      expect(pdf.headers['x-report-sha256']).toBe(run.sha256);
      expect(createHash('sha256').update(body).digest('hex')).toBe(run.sha256);
      await get(`/pilotage/reports/runs/${event.runId}`, ownerB.token).expect(
        404,
      );
      await get(event.downloadPath, ownerB.token).expect(404);
    });

    it('le MAEDR ne voit aucun rapport nommant des fermes', async () => {
      const res = await get(
        '/pilotage/reports/runs',
        accounts.maedr.token,
      ).expect(200);
      for (const r of res.body) {
        expect(r.level).not.toBe('BANDE');
        expect(r.hasFarmRows).toBe(false);
      }
      const event = events.find((e) => e.batchId === bandC)!;
      await get(event.downloadPath, accounts.maedr.token).expect(404);
    });

    it('le profil provincial voit le rapport hebdomadaire de sa province', async () => {
      const res = await get(
        '/pilotage/reports/runs?template=HEBDOMADAIRE',
        accounts.province.token,
      ).expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const [{ id: g1 }] = await ds.query(
        `SELECT id FROM provinces WHERE code = 'G1'`,
      );
      for (const r of res.body) expect(r.provinceId).toBe(g1);
    });

    it('un rapport produit est immuable', async () => {
      const event = events.find((e) => e.batchId === bandC)!;
      await expect(
        ds.query(`UPDATE report_runs SET title = 'x' WHERE id = $1`, [
          event.runId,
        ]),
      ).rejects.toThrow(/ni modifié ni supprimé/);
    });

    it('production manuelle d’une période close seulement', async () => {
      const lastMonth = new Date();
      lastMonth.setUTCDate(1);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      const res = await post(
        '/pilotage/reports/templates/MENSUEL_NATIONAL/runs',
        { periodStart: lastMonth.toISOString().slice(0, 10) },
        adminToken,
      ).expect(201);
      expect(res.body.run).toMatchObject({
        templateCode: 'MENSUEL_NATIONAL',
        level: 'NATIONAL',
      });
      await post(
        '/pilotage/reports/templates/MENSUEL_NATIONAL/runs',
        { periodStart: day(0) },
        adminToken,
      ).expect(400);
    });

    it('modèles : lecture, paramétrage réservé à l’administration', async () => {
      const list = await get(
        '/pilotage/reports/templates',
        accounts.dge.token,
      ).expect(200);
      expect(list.body.map((t: { code: string }) => t.code)).toEqual(
        expect.arrayContaining([
          'FIN_DE_BANDE',
          'HEBDOMADAIRE',
          'MENSUEL_NATIONAL',
        ]),
      );
      await request(server)
        .patch('/pilotage/reports/templates/HEBDOMADAIRE')
        .set(auth(accounts.dge.token))
        .send({ label: 'Essai' })
        .expect(403);
      await request(server)
        .patch('/pilotage/reports/templates/HEBDOMADAIRE')
        .set(auth(adminToken))
        .send({ sections: ['OBJECTIF_INCONNU'] })
        .expect(400);
      await get('/pilotage/reports/templates', ownerA.token).expect(403);
    });
  });
});

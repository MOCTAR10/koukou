import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import { ReportsService } from './../src/modules/reporting/reports.service.js';
import { SanitaryAlertsService } from './../src/modules/surveillance/sanitary-alerts.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
} from './helpers/programme-farm.js';

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/**
 * POUFA lot A, pilot: reliable steering (published alerts only, programme
 * perimeter, formulas on the aggregates) and reports actually sent
 * (REPORT_READY, default recipients, templates, batchId filter).
 */
describe('Pilotage POUFA — lot A : pilotage fiable et rapports envoyés (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let notify: NotifyService;
  let alerts: SanitaryAlertsService;
  let adminToken: string;
  let owner: { token: string; id: string };
  let farm: string;
  let chair: string;
  let layers: string;
  let closedBand: string;

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  let seq = 10;
  const phone = () => `+2417${seq++}${digits}`;
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const viewerProfile = `PLOTA${digits}`;
  const templateCode = `ESSAI_${tag}`;

  const accounts: Record<string, { token: string; userId: string }> = {};

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await alerts.flush();
      await notify.flush();
    }
  }

  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ) {
    const p = phone();
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Lot A ${profileCode} ${digits}`, phone: p, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return {
      token: await login(server, p, res.body.loginCode as string),
      userId: res.body.user.id as string,
    };
  }

  const inbox = async (token: string) =>
    (await get('/notifications?limit=200', token).expect(200)).body as {
      items: Array<{ event: string; subjectId: string | null; route: string; title: string }>;
    };

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
    alerts = app.get(SanitaryAlertsService);
    adminToken = (await createPlatformAdmin(server, ds)).token;

    const f = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Lot A Pilote ${tag}`,
      // G7 (Ogooué-Lolo): no other spec counts published alerts there, and the
      // alert this spec publishes stays in the test database.
      provinceCode: 'G7',
      extra: { gps: { latitude: -1.13, longitude: 12.47 } },
    });
    farm = f.farmId;
    owner = { token: f.ownerToken, id: f.ownerId };

    const open = async (body: object) =>
      (
        await post(
          `/farms/${farm}/batches`,
          { batchName: `Bande lot A ${digits}`, integrationDate: day(-10), ...body },
          owner.token,
        ).expect(201)
      ).body.id as string;
    const entry = (band: string, body: object) =>
      post(`/farms/${farm}/batches/${band}/daily-entries`, body, owner.token).expect(201);

    chair = await open({ type: 'CHAIR', quantityAtStart: 1000 });
    await entry(chair, { entryDate: day(-9), deaths: 10, feedQuantity: 40, feedUnit: 'KG' });
    await entry(chair, { entryDate: day(-3), deaths: 10, feedQuantity: 200, feedUnit: 'KG', avgWeightKg: 0.25, sampleSize: 30 });
    // Out of the programme: a laying flock with heavy losses.
    layers = await open({ type: 'PONDEUSE', quantityAtStart: 200 });
    await entry(layers, { entryDate: day(-9), deaths: 50 });

    closedBand = await open({ type: 'CHAIR', quantityAtStart: 100, integrationDate: day(-4) });
    await entry(closedBand, { entryDate: day(-3), deaths: 1 });
    await post(`/farms/${farm}/batches/${closedBand}/cloture`, {}, owner.token).expect(201);
    await get(`/farms/${farm}/bandes/${closedBand}/snapshots`, owner.token).expect(200);

    // Advisory alerts on the programme band: a conduct one, a sanitary-looking one.
    await ds.query(
      `INSERT INTO alerts (farm_id, batch_id, kind, level, status, message)
       VALUES ($1, $2, 'EAU', 'JAUNE', 'ACTIVE', 'Eau : essai lot A'),
              ($1, $2, 'ALIMENT', 'ROUGE', 'ACTIVE', 'Aliment : essai lot A'),
              ($1, $2, 'MORTALITE', 'ROUGE', 'ACTIVE', 'Mortalité : essai lot A'),
              ($1, $3, 'EAU', 'ROUGE', 'ACTIVE', 'Eau : bande hors programme')`,
      [farm, chair, layers],
    );

    await post(
      '/programme/access/profiles',
      {
        code: viewerProfile,
        label: `Pilotage lot A ${digits}`,
        scopeKind: 'FARMS',
        matrix: { PILOTAGE: ['CONSULTER'], TECHNIQUE: ['CONSULTER'] },
      },
      adminToken,
    ).expect(201);
    accounts.viewer = await institution(viewerProfile, { farmIds: [farm] });
    accounts.agent = await institution('AGENT_TECHNIQUE', { farmIds: [farm] });
    accounts.dge = await institution('DGE');
    accounts.vet = await institution('VETERINAIRE');
  }, 180_000);

  afterAll(async () => {
    await settle();
    await app.close();
  });

  describe('F2 — périmètre du programme', () => {
    it('le pilotage ne compte que les bandes de poulet de chair', async () => {
      const res = await get('/pilotage/dashboard', accounts.viewer.token).expect(200);
      const m = res.body.totals.metrics;
      // Chair band + the band closed today; the layers are out.
      expect(m.bands).toBe(2);
      expect(m.deaths).toBe(21);
      expect(m.placedHeads).toBe(1100);
      expect(res.body.perimeter.eligibleBandTypes).toEqual([{ species: 'POULET', type: 'CHAIR' }]);
      const csv = await get('/pilotage/exports/bandes.csv', accounts.viewer.token).expect(200);
      expect(csv.text.split('\r\n').length).toBe(3); // header + 2 broiler bands
    });

    it('la ferme lit le périmètre ; la bande de pondeuses est hors programme', async () => {
      const p = await get(`/farms/${farm}/programme-perimeter`, owner.token).expect(200);
      expect(p.body.eligibleBandTypes).toEqual([{ species: 'POULET', type: 'CHAIR' }]);
      expect(p.body.note).toContain('hors programme');
      const c = await get(`/farms/${farm}/bandes/${layers}/comparison`, owner.token).expect(200);
      expect(c.body.programmeEligible).toBe(false);
      const ok = await get(`/farms/${farm}/bandes/${chair}/comparison`, owner.token).expect(200);
      expect(ok.body.programmeEligible).toBe(true);
    });

    it('le paramètre est contrôlé (DGE, liste de types connus)', async () => {
      const bad = await post(
        '/programme/parameters/BANDE_TYPES_ELIGIBLES',
        { value: [{ species: 'LAPIN', type: 'CHAIR' }], reason: `Essai lot A ${digits}` },
        adminToken,
      ).expect(400);
      expect(bad.body.message).toContain('Espèce inconnue');
      const sanitary = await post(
        '/programme/parameters/PILOTAGE_ALERTES_CONDUITE_TYPES',
        { value: ['EAU', 'MALADIE'], reason: `Essai lot A ${digits}` },
        adminToken,
      ).expect(400);
      expect(sanitary.body.message).toContain('alertes de conduite');
    });
  });

  describe('F1 — seules les alertes sanitaires publiées', () => {
    let publishedBefore = 0;
    it('les alertes de conduite sont à part et ne colorent pas la ferme', async () => {
      const d = await get('/pilotage/dashboard', accounts.viewer.token).expect(200);
      const a = d.body.totals.metrics.alerts;
      const kinds: string[] = d.body.perimeter.conductAlerts.kinds;
      expect(kinds).not.toContain('MORTALITE');
      // Same rule in SQL (the alert engine also raised its own alerts from the
      // entries): conduct kinds only, programme bands only. The inserted
      // MORTALITE (sanitary kind) and the layers' red EAU never count.
      const [expected] = await ds.query(
        `SELECT COUNT(*)::int AS active,
                COUNT(*) FILTER (WHERE a.level = 'ROUGE')::int AS red,
                COUNT(*) FILTER (WHERE a.batch_id = $3)::int AS layers
           FROM alerts a LEFT JOIN production_batches b ON b.id = a.batch_id
          WHERE a.farm_id = $1 AND a.status = 'ACTIVE' AND a.level <> 'VERT'
            AND a.kind::text = ANY($2::text[])
            AND (b.id IS NULL OR (b.species = 'POULET' AND b.type = 'CHAIR'))`,
        [farm, kinds, layers],
      );
      expect(expected.layers).toBe(0);
      expect(expected.active).toBeGreaterThanOrEqual(2); // at least the inserted EAU and ALIMENT
      expect(expected.red).toBeGreaterThanOrEqual(1); // a red conduct alert, yet the farm stays green
      expect(a.conduct).toMatchObject({ activeNow: expected.active, activeRedNow: expected.red });
      // Province alerts published by earlier runs may remain: a baseline.
      publishedBefore = a.published;
      const map = await get('/pilotage/map', accounts.viewer.token).expect(200);
      const point = map.body.points.find((p: { farmId: string }) => p.farmId === farm);
      expect(point.colours.alert).toBe('VERT');
      expect(point.alerts.conduct.activeNow).toBe(expected.active);
      expect(map.body.legend.alert.description).toContain('alerte sanitaire publiée');
      expect(map.body.legend.alert.conduct).toContain('ne colorent jamais');
    });

    it('une alerte publiée par les vétérinaires met la ferme en rouge', async () => {
      await post(
        `/farms/${farm}/batches/${chair}/health-events`,
        {
          kind: 'MALADIE',
          occurredAt: day(0),
          severity: 'ROUGE',
          title: `Suspicion lot A ${tag}`,
          quantity: 5,
          suspicion: true,
          idempotencyKey: `lota-${stamp}`,
        },
        owner.token,
      ).expect(201);
      await settle();
      const list = await get(`/farms/${farm}/sanitary-alerts`, owner.token).expect(200);
      const alertId = list.body.items[0].id as string;
      const move = (body: object) =>
        post(`/surveillance/alerts/${alertId}/transitions`, body, accounts.vet.token);
      await move({ statusCode: 'EN_ANALYSE', comment: 'Prélèvements' }).expect(201);
      await move({ statusCode: 'CONFIRMEE', comment: 'Laboratoire positif' }).expect(201);
      await post(`/surveillance/alerts/${alertId}/publish`, { comment: 'Publication' }, accounts.vet.token).expect(201);
      await settle();
      const map = await get('/pilotage/map', accounts.viewer.token).expect(200);
      const point = map.body.points.find((p: { farmId: string }) => p.farmId === farm);
      expect(point.alerts.published).toBe(1);
      expect(point.colours.alert).toBe('ROUGE');
      const d = await get('/pilotage/dashboard', accounts.viewer.token).expect(200);
      expect(d.body.publishedAlerts.count).toBe(publishedBefore + 1);
      expect(d.body.totals.metrics.alerts.published).toBe(publishedBefore + 1);
    });
  });

  describe('n° 44 — formules sur les agrégats', () => {
    afterAll(async () => {
      await post(
        '/programme/parameters/FORMULE_MORTALITE_PERIODE_PCT',
        { value: 'morts_periode / effectif_expose * 100', reason: `Retour à la formule proposée ${digits}` },
        adminToken,
      ).expect(201);
    });

    it('la mortalité du pilotage suit FORMULE_MORTALITE_PERIODE_PCT', async () => {
      const before = await get('/pilotage/dashboard', accounts.viewer.token).expect(200);
      const m = before.body.totals.metrics;
      expect(m.mortalityPct).toBeCloseTo((m.deaths / 1100) * 100, 1);
      await post(
        '/programme/parameters/FORMULE_MORTALITE_PERIODE_PCT',
        { value: 'morts_periode / effectif_expose * 1000', reason: `Essai lot A ${digits}` },
        adminToken,
      ).expect(201);
      const after = await get('/pilotage/dashboard', accounts.viewer.token).expect(200);
      expect(after.body.totals.metrics.mortalityPct).toBeCloseTo((m.deaths / 1100) * 1000, 0);
      expect(after.body.perimeter.mortalityFormula.expression).toContain('* 1000');
      // A band's own indicators never show the steering's period formula.
      const ind = await get(`/farms/${farm}/bandes/${chair}/indicators`, owner.token).expect(200);
      expect(ind.body.indicators.map((i: { key: string }) => i.key)).not.toContain('mortalite_periode_pct');
    });
  });

  describe('rapports envoyés', () => {
    beforeAll(async () => {
      await app.get(ReportsService).sweep();
      await settle();
    }, 120_000);

    it('le rapport de fin de bande est notifié à l’exploitant et à l’agent technique', async () => {
      const mine = await inbox(owner.token);
      const item = mine.items.find(
        (i) => i.event === 'REPORT_READY' && i.route === `/batches/${closedBand}`,
      );
      expect(item).toBeDefined();
      expect(item!.title).toBe('Rapport disponible');
      const agent = await inbox(accounts.agent.token);
      expect(
        agent.items.some((i) => i.event === 'REPORT_READY' && i.route === `/batches/${closedBand}`),
      ).toBe(true);
    });

    it('filtre batchId ; l’agent technique lit le rapport de sa bande par TECHNIQUE', async () => {
      const runs = await get(`/pilotage/reports/runs?batchId=${closedBand}`, owner.token).expect(200);
      expect(runs.body.length).toBeGreaterThanOrEqual(1);
      for (const r of runs.body) expect(r.batchId).toBe(closedBand);
      const agentRuns = await get('/pilotage/reports/runs', accounts.agent.token).expect(200);
      expect(agentRuns.body.length).toBeGreaterThanOrEqual(1);
      for (const r of agentRuns.body) {
        expect(r.level).toBe('BANDE');
        expect(r.farmId).toBe(farm);
      }
      const run = runs.body[0];
      expect(run.recipients.map((r: { userId: string }) => r.userId)).toEqual(
        expect.arrayContaining([owner.id, accounts.agent.userId]),
      );
      await get(`/pilotage/reports/runs/${run.id}/pdf`, accounts.agent.token).expect(200);
      // TECHNIQUE alone does not open the steering itself.
      await get('/pilotage/dashboard', accounts.agent.token).expect(403);
      await get('/pilotage/reports/runs?batchId=pas-un-uuid', owner.token).expect(400);
    });

    it('le rapport hebdomadaire va aussi à la DGE, avec la section intrants', async () => {
      const templates = await get('/pilotage/reports/templates', accounts.dge.token).expect(200);
      const weekly = templates.body.find((t: { code: string }) => t.code === 'HEBDOMADAIRE');
      expect(weekly.audience.scopeKinds).toContain('ALL');
      expect(weekly.sections.map((s: { code: string }) => s.code)).toContain('INTRANTS');
      // A past week of its own (a run is produced once per week and province).
      const week = day(-7 * (60 + (stamp % 300)));
      const res = await post(
        '/pilotage/reports/templates/HEBDOMADAIRE/runs',
        { periodStart: week, provinceCode: 'G1' },
        adminToken,
      ).expect(201);
      if (res.body.created) {
        expect(res.body.run.recipients.map((r: { userId: string }) => r.userId)).toContain(
          accounts.dge.userId,
        );
      }
      await settle();
      const dge = await inbox(accounts.dge.token);
      expect(
        dge.items.some((i) => i.event === 'REPORT_READY' && i.subjectId === res.body.run.id),
      ).toBe(res.body.created as boolean);
    });

    it('la règle REPORT_READY est administrable', async () => {
      const rules = await get('/programme/notification-rules', adminToken).expect(200);
      const rule = rules.body.find((r: { code: string }) => r.code === 'RAPPORT_DISPONIBLE');
      expect(rule).toMatchObject({
        event: 'REPORT_READY',
        audience: 'REPORT_RECIPIENTS',
        channels: ['IN_APP', 'PUSH'],
        active: true,
      });
      const events = await get('/programme/notification-rules/events', adminToken).expect(200);
      expect(events.body.map((e: { event: string }) => e.event)).toContain('REPORT_READY');
      await post(
        '/programme/notification-rules',
        {
          code: `RAPPORT_ERR_${tag}`,
          label: 'Mauvais destinataire',
          event: 'WEIGHING_LATE',
          audience: 'REPORT_RECIPIENTS',
          channels: ['IN_APP'],
        },
        adminToken,
      ).expect(400);
    });
  });

  describe('modèles de rapport : création et duplication', () => {
    it('crée un modèle, le duplique, refuse un code pris', async () => {
      const created = await post(
        '/pilotage/reports/templates',
        {
          code: templateCode,
          label: `Rapport mensuel des intrants ${tag}`,
          level: 'NATIONAL',
          periodicity: 'MENSUEL',
          sections: ['SYNTHESE', 'INTRANTS'],
          audience: { scopeKinds: ['ALL'] },
        },
        adminToken,
      ).expect(201);
      expect(created.body).toMatchObject({ code: templateCode, active: true, level: 'NATIONAL' });
      await post(
        '/pilotage/reports/templates',
        { code: templateCode, label: 'x', level: 'NATIONAL', periodicity: 'MENSUEL', sections: ['SYNTHESE'] },
        adminToken,
      ).expect(409);
      await post(
        '/pilotage/reports/templates',
        { code: `${templateCode}_B`, label: 'x', level: 'BANDE', periodicity: 'MENSUEL', sections: ['BILAN'] },
        adminToken,
      ).expect(400);
      const copy = await post(
        `/pilotage/reports/templates/${templateCode}/duplicate`,
        { code: `${templateCode}_C` },
        adminToken,
      ).expect(201);
      expect(copy.body).toMatchObject({
        code: `${templateCode}_C`,
        active: false,
        label: `Copie de Rapport mensuel des intrants ${tag}`,
      });
      expect(copy.body.sections.map((s: { code: string }) => s.code)).toEqual(['SYNTHESE', 'INTRANTS']);
      // Without PILOTAGE:ADMINISTRER, no template is created.
      await post(
        '/pilotage/reports/templates',
        { code: `${templateCode}_D`, label: 'x', level: 'NATIONAL', periodicity: 'MENSUEL', sections: ['SYNTHESE'] },
        accounts.dge.token,
      ).expect(403);
      // The new template produces a run with the inputs section.
      const lastMonth = new Date();
      lastMonth.setUTCDate(1);
      lastMonth.setUTCMonth(lastMonth.getUTCMonth() - 1);
      const run = await post(
        `/pilotage/reports/templates/${templateCode}/runs`,
        { periodStart: lastMonth.toISOString().slice(0, 10) },
        adminToken,
      ).expect(201);
      expect(run.body.run.templateCode).toBe(templateCode);
      // Keep later sweeps of the shared test DB light.
      await request(server)
        .patch(`/pilotage/reports/templates/${templateCode}`)
        .set(auth(adminToken))
        .send({ active: false })
        .expect(200);
    });
  });
});

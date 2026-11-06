import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { DeclarativeStockService } from './../src/modules/supply/declarative-stock.service.js';
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

interface Line {
  id: string;
  intrantCode: string;
  intrantFamily: string;
  quantity: number;
  receivedQuantity: number | null;
  farmerCostFcfa: number | null;
  subsidyFcfa: number | null;
  inputLotId: string | null;
}

/**
 * POUFA L4 « Intrants »: the DGE records a delivery, the farmer confirms
 * what he received (lots, FEFO, expenses after subsidy), declarative stock
 * and its « stock négatif » alert.
 */
describe('POUFA — intrants : livraisons et stock déclaratif (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerA: string;
  let ownerB: string;
  let farmA: string;
  let farmACode: string;
  let farmB: string;
  let dgeToken: string;
  let provincialToken: string;
  let agentToken: string;
  let memberToken: string; // ADMIN member with stock:gerer
  let eleveurToken: string; // ELEVEUR member (no stock:gerer)
  let d1: string;
  let d1Code: string;
  let bandId: string;
  const digits = String(Date.now()).slice(-7);
  const confirmKey = `confirm-${digits}-${Math.random().toString(36).slice(2, 8)}`;

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const put = (url: string, body: object, token: string) =>
    request(server).put(url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ): Promise<string> {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Agent ${profileCode}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, phone, res.body.loginCode);
  }

  async function member(role: 'ADMIN' | 'ELEVEUR', permissions?: string[]) {
    const phone = uniquePhone('+2418');
    await post(
      `/farms/${farmA}/eleveurs`,
      {
        phone,
        fullName: `Membre ${role}`,
        code: 'secret456',
        role,
        ...(permissions ? { permissions } : {}),
      },
      ownerA,
    ).expect(201);
    return login(server, phone, 'secret456');
  }

  const deliveryBody = (farmId: string, extra: object = {}) => ({
    farmId,
    source: 'ETAT_SMAG',
    shippedAt: daysAgo(6),
    lines: [
      {
        intrantCode: 'ALIMENT_DEMARRAGE',
        unitCode: 'SAC',
        quantity: 10,
        bagSizeKg: 50,
        feedPhase: 'DEMARRAGE',
        subsidized: true,
        subsidyRate: 70,
        unitValueFcfa: 15_000,
      },
      {
        intrantCode: 'POUSSINS',
        unitCode: 'TETE',
        quantity: 500,
        subsidized: true,
        subsidyRate: 50,
        unitValueFcfa: 600,
      },
      {
        intrantCode: 'VACCIN',
        unitCode: 'DOSE',
        quantity: 1000,
        unitValueFcfa: 50,
      },
    ],
    ...extra,
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
      provinceCode: 'G1',
      exploitantName: 'Intrants A',
    });
    farmA = a.farmId;
    farmACode = a.farmCode;
    ownerA = a.ownerToken;
    const b = await createProgrammeFarm(server, adminToken, {
      provinceCode: 'G2',
      exploitantName: 'Intrants B',
    });
    farmB = b.farmId;
    ownerB = b.ownerToken;

    const provincialProfile = `INTR${digits}`;
    await post(
      '/programme/access/profiles',
      {
        code: provincialProfile,
        label: `Intrants provinciaux ${digits}`,
        scopeKind: 'PROVINCES',
        matrix: { INTRANTS: ['CONSULTER', 'CREER'] },
      },
      adminToken,
    ).expect(201);
    dgeToken = await institution('DGE');
    provincialToken = await institution(provincialProfile, {
      provinceCodes: ['G1'],
    });
    agentToken = await institution('AGENT_TECHNIQUE', { farmIds: [farmA] });
    memberToken = await member('ADMIN', ['stock:gerer']);
    eleveurToken = await member('ELEVEUR');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  it('gives the DGE profile INTRANTS:CREER', async () => {
    const res = await get('/programme/access/profiles', adminToken).expect(200);
    const dge = res.body.find((p: { code: string }) => p.code === 'DGE');
    expect(dge.matrix.INTRANTS).toEqual(
      expect.arrayContaining(['CONSULTER', 'CREER']),
    );
  });

  describe('recording', () => {
    it('refuses inconsistent lines (French reasons)', async () => {
      const line = (over: object) => ({
        ...deliveryBody(farmA),
        lines: [
          { intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: 10, ...over },
        ],
      });
      const cases: Array<[object, RegExp]> = [
        [line({ intrantCode: 'INCONNU' }), /intrant inconnu/],
        [line({ unitCode: 'INCONNUE' }), /unité inconnue/],
        [line({ unitCode: 'KG' }), /par tête/],
        [line({ quantity: 10.5 }), /entier/],
        [line({ subsidized: true }), /taux de subvention/],
        [line({ subsidyRate: 20 }), /subventionné/],
        [
          line({ intrantCode: 'ALIMENT_DEMARRAGE', unitCode: 'SAC' }),
          /phase de l'aliment/,
        ],
        [
          line({
            intrantCode: 'ALIMENT_DEMARRAGE',
            unitCode: 'DOSE',
            feedPhase: 'DEMARRAGE',
          }),
          /en masse/,
        ],
        [{ ...line({}), source: 'AUTRE' }, /fournisseur/],
        [{ ...line({}), shippedAt: daysAgo(-5) }, /futur/],
        [{ ...line({}), lines: [] }, /au moins une ligne/],
      ];
      for (const [body, message] of cases) {
        const res = await post('/programme/input-deliveries', body, adminToken);
        expect(res.status, JSON.stringify(res.body)).toBe(400);
        expect(JSON.stringify(res.body.message)).toMatch(message);
      }
    });

    it('is the DGE’s: farmers, members and read-only profiles cannot record', async () => {
      for (const token of [ownerA, memberToken, agentToken]) {
        await post(
          '/programme/input-deliveries',
          deliveryBody(farmA),
          token,
        ).expect(403);
      }
    });

    it('stays within the recorder’s scope', async () => {
      await post(
        '/programme/input-deliveries',
        deliveryBody(farmB),
        provincialToken,
      ).expect(403);
      const res = await post(
        '/programme/input-deliveries',
        deliveryBody(farmA, { notes: 'Livraison provinciale' }),
        provincialToken,
      ).expect(201);
      expect(res.body.code).toMatch(new RegExp(`^${farmACode}-L\\d{2,}$`));
      expect(res.body.status).toBe('EXPEDIEE');
    });

    it('records a State delivery with its lines, values and subsidy', async () => {
      const res = await post(
        '/programme/input-deliveries',
        deliveryBody(farmA),
        dgeToken,
      ).expect(201);
      d1 = res.body.id;
      d1Code = res.body.code;
      expect(res.body).toMatchObject({
        status: 'EXPEDIEE',
        source: 'ETAT_SMAG',
        farm: { id: farmA, code: farmACode, provinceCode: 'G1' },
        band: null,
        totals: {
          shippedValueFcfa: 150_000 + 300_000 + 50_000,
          farmerCostFcfa: null,
        },
      });
      expect(res.body.lines.map((l: Line) => l.intrantFamily)).toEqual([
        'ALIMENT',
        'POUSSIN',
        'VACCIN',
      ]);
      expect(res.body.lines[0]).toMatchObject({
        intrantLabel: 'Aliment démarrage',
        unitLabel: 'Sac',
        bagSizeKg: 50,
        feedPhase: 'DEMARRAGE',
        subsidyRate: 70,
      });
    });
  });

  describe('lists', () => {
    it('filters the DGE list by province, status and farm, in scope', async () => {
      const dge = await get(
        `/programme/input-deliveries?province=G1&status=EXPEDIEE&farmId=${farmA}`,
        dgeToken,
      ).expect(200);
      expect(dge.body.items.map((d: { id: string }) => d.id)).toContain(d1);
      const g2 = await get(
        `/programme/input-deliveries?province=G2&farmId=${farmA}`,
        dgeToken,
      ).expect(200);
      expect(g2.body.total).toBe(0);
      const period = await get(
        `/programme/input-deliveries?farmId=${farmA}&from=${daysAgo(3)}`,
        dgeToken,
      ).expect(200);
      expect(period.body.total).toBe(0);

      const provincial = await get(
        '/programme/input-deliveries?pageSize=200',
        provincialToken,
      ).expect(200);
      expect(
        provincial.body.items.every(
          (d: { farm: { provinceCode: string } }) =>
            d.farm.provinceCode === 'G1',
        ),
      ).toBe(true);
      const agent = await get('/programme/input-deliveries', agentToken).expect(
        200,
      );
      expect(
        agent.body.items.every(
          (d: { farm: { id: string } }) => d.farm.id === farmA,
        ),
      ).toBe(true);
      await get('/programme/input-deliveries', ownerA).expect(403);
    });

    it('shows a delivery to its farm and to the scope only', async () => {
      const farm = await get(`/farms/${farmA}/input-deliveries`, ownerA).expect(
        200,
      );
      expect(farm.body.map((d: { id: string }) => d.id)).toContain(d1);
      await get(`/farms/${farmA}/input-deliveries/${d1}`, eleveurToken).expect(
        200,
      );
      await get(`/farms/${farmA}/input-deliveries/${d1}`, agentToken).expect(
        200,
      );
      await get(`/farms/${farmA}/input-deliveries`, ownerB).expect(403);
      await get(`/farms/${farmB}/input-deliveries/${d1}`, ownerB).expect(404);
      await get(`/programme/input-deliveries/${d1}`, provincialToken).expect(
        200,
      );
    });
  });

  describe('confirmation by the farmer', () => {
    it('belongs to the farm: institutions, the platform admin and members without stock:gerer are refused', async () => {
      const url = `/farms/${farmA}/input-deliveries/${d1}/confirm`;
      for (const token of [dgeToken, adminToken, eleveurToken, agentToken]) {
        await post(url, {}, token).expect(403);
      }
    });

    it('needs a reason for every discrepancy', async () => {
      const view = await get(
        `/farms/${farmA}/input-deliveries/${d1}`,
        ownerA,
      ).expect(200);
      const feedLine = view.body.lines[0] as Line;
      const res = await post(
        `/farms/${farmA}/input-deliveries/${d1}/confirm`,
        { lines: [{ lineId: feedLine.id, receivedQuantity: 9 }] },
        memberToken,
      ).expect(400);
      expect(res.body.message).toMatch(/motif de l'écart/);
      await post(
        `/farms/${farmA}/input-deliveries/${d1}/confirm`,
        { receivedDate: daysAgo(7) },
        memberToken,
      ).expect(400);
    });

    it('creates the farm’s lots, expenses after subsidy and a band hint, in one go', async () => {
      const view = await get(
        `/farms/${farmA}/input-deliveries/${d1}`,
        ownerA,
      ).expect(200);
      const [feedLine, chickLine] = view.body.lines as Line[];
      const res = await post(
        `/farms/${farmA}/input-deliveries/${d1}/confirm`,
        {
          receivedDate: daysAgo(5),
          idempotencyKey: confirmKey,
          lines: [
            {
              lineId: feedLine.id,
              receivedQuantity: 9,
              discrepancyReason: 'Un sac déchiré',
              supplierLotNumber: 'SMAG-2026-11',
              expirationDate: daysAgo(-60),
            },
            {
              lineId: chickLine.id,
              receivedQuantity: 495,
              discrepancyReason: 'Morts pendant le transport',
            },
          ],
        },
        memberToken,
      ).expect(201);
      expect(res.body).toMatchObject({
        status: 'CONFIRMEE',
        receivedDate: daysAgo(5),
        hasDiscrepancy: true,
        replay: false,
        totals: {
          farmerCostFcfa: 40_500 + 148_500 + 50_000,
          subsidyFcfa: 94_500 + 148_500,
        },
        openBandHint: {
          quantityAtStart: 495,
          integrationDate: daysAgo(5),
          chickCostBooked: true,
          deliveryId: d1,
        },
      });
      const lines = res.body.lines as Line[];
      expect(
        lines.map((l) => [l.receivedQuantity, l.farmerCostFcfa, l.subsidyFcfa]),
      ).toEqual([
        [9, 40_500, 94_500],
        [495, 148_500, 148_500],
        [1000, 50_000, 0],
      ]);
      expect(lines.every((l) => l.inputLotId)).toBe(true);

      const lots = await get(`/farms/${farmA}/inputs`, ownerA).expect(200);
      const feedLot = lots.body.find(
        (l: { id: string }) => l.id === lines[0].inputLotId,
      );
      expect(feedLot).toMatchObject({
        kind: 'ALIMENT',
        feedPhase: 'DEMARRAGE',
        quantity: 450,
        unit: 'KG',
        supplier: 'État / SMAG',
        supplierLotNumber: 'SMAG-2026-11',
        receivedDate: daysAgo(5),
      });
      const vaccineLot = lots.body.find(
        (l: { id: string }) => l.id === lines[2].inputLotId,
      );
      expect(vaccineLot).toMatchObject({
        kind: 'MEDICAMENT',
        entryType: 'MEDICAMENT',
        quantity: 1000,
        supplierLotNumber: d1Code,
      });

      const expenses = await get(`/farms/${farmA}/expenses`, ownerA).expect(
        200,
      );
      const items = (expenses.body.items ?? expenses.body) as Array<{
        inputLotId: string | null;
        amountFcfa: number;
      }>;
      const amountOf = (lotId: string | null) =>
        items.filter((e) => e.inputLotId === lotId).map((e) => e.amountFcfa);
      expect(amountOf(lines[0].inputLotId)).toEqual([40_500]);
      expect(amountOf(lines[1].inputLotId)).toEqual([148_500]);
      expect(amountOf(lines[2].inputLotId)).toEqual([50_000]);

      const stock = await get(`/farms/${farmA}/feed-stock`, ownerA).expect(200);
      expect(JSON.stringify(stock.body)).toContain('"availableKg":450');
    });

    it('replays the same offline confirmation without a second lot', async () => {
      const before = await ds.query(
        `SELECT COUNT(*)::int AS n FROM input_lots WHERE farm_id = $1`,
        [farmA],
      );
      const res = await post(
        `/farms/${farmA}/input-deliveries/${d1}/confirm`,
        { idempotencyKey: confirmKey, lines: [] },
        ownerA,
      ).expect(201);
      expect(res.body.replay).toBe(true);
      expect(res.body.status).toBe('CONFIRMEE');
      const after = await ds.query(
        `SELECT COUNT(*)::int AS n FROM input_lots WHERE farm_id = $1`,
        [farmA],
      );
      expect(after[0].n).toBe(before[0].n);
      await post(
        `/farms/${farmA}/input-deliveries/${d1}/confirm`,
        {},
        ownerA,
      ).expect(409);
      await post(
        `/programme/input-deliveries/${d1}/cancel`,
        { reason: 'Trop tard' },
        dgeToken,
      ).expect(409);
    });

    it('journals the delivery rows', async () => {
      const rows = await ds.query(
        `SELECT op FROM audit_row_changes WHERE table_name = 'input_deliveries' AND row_id = $1 ORDER BY id`,
        [d1],
      );
      expect(rows.map((r: { op: string }) => r.op)).toEqual(['I', 'U']);
    });
  });

  describe('band and declarative stock', () => {
    it('attaches the band opened from the hint, with its lots and expenses', async () => {
      const band = await post(
        `/farms/${farmA}/batches`,
        {
          batchName: `Bande intrants ${digits}`,
          integrationDate: daysAgo(5),
          quantityAtStart: 495,
          type: 'CHAIR',
        },
        ownerA,
      ).expect(201);
      bandId = band.body.id;
      const res = await put(
        `/farms/${farmA}/input-deliveries/${d1}/band`,
        { bandId },
        memberToken,
      ).expect(200);
      expect(res.body.band.id).toBe(bandId);
      const lotIds = (res.body.lines as Line[]).map((l) => l.inputLotId);
      const lots = await ds.query(
        `SELECT DISTINCT batch_id FROM input_lots WHERE id = ANY($1)`,
        [lotIds],
      );
      expect(lots).toEqual([{ batch_id: bandId }]);
      const expenses = await ds.query(
        `SELECT DISTINCT batch_id FROM expenses WHERE input_lot_id = ANY($1)`,
        [lotIds],
      );
      expect(expenses).toEqual([{ batch_id: bandId }]);

      const other = await post(
        `/farms/${farmA}/batches`,
        {
          batchName: `Autre bande ${digits}`,
          integrationDate: daysAgo(5),
          quantityAtStart: 10,
          type: 'CHAIR',
        },
        ownerA,
      ).expect(201);
      await put(
        `/farms/${farmA}/input-deliveries/${d1}/band`,
        { bandId: other.body.id },
        ownerA,
      ).expect(409);
      await put(
        `/farms/${farmA}/input-deliveries/${d1}/band`,
        { bandId },
        eleveurToken,
      ).expect(403);
    });

    it('counts received minus used per intrant', async () => {
      const res = await get(`/farms/${farmA}/declarative-stock`, ownerA).expect(
        200,
      );
      const row = (key: string) =>
        res.body.rows.find((r: { key: string }) => r.key === key);
      expect(row('ALIMENT_DEMARRAGE')).toMatchObject({
        unitCode: 'KG',
        shipped: 500,
        received: 450,
        used: 0,
        stock: 450,
        physicalStock: 450,
      });
      // Chicks placed in the two bands opened since the delivery.
      expect(row('POUSSINS')).toMatchObject({
        received: 495,
        consumed: 505,
        stock: -10,
        negative: true,
      });
      expect(row('VACCIN|DOSE')).toMatchObject({ received: 1000, stock: 1000 });
    });

    it('lets the declarative stock go negative while the physical stock stays at zero', async () => {
      const entry = (day: number, kg: number) =>
        post(
          `/farms/${farmA}/batches/${bandId}/daily-entries`,
          {
            entryDate: daysAgo(day),
            feedQuantity: kg,
            feedUnit: 'KG',
            feedType: 'DEMARRAGE',
          },
          ownerA,
        ).expect(201);
      await entry(4, 400);
      await entry(3, 50);
      // No feed of the phase left: recorded with no lot (Fermia never
      // blocks it), so only the declarative stock goes below zero.
      await entry(2, 80);

      const res = await get(`/farms/${farmA}/declarative-stock`, ownerA).expect(
        200,
      );
      const feed = res.body.rows.find(
        (r: { key: string }) => r.key === 'ALIMENT_DEMARRAGE',
      );
      expect(feed).toMatchObject({
        received: 450,
        consumed: 530,
        stock: -80,
        physicalStock: 0,
        negative: true,
      });
      expect(res.body.negative).toBe(true);
      const stock = await get(`/farms/${farmA}/feed-stock`, ownerA).expect(200);
      expect(JSON.stringify(stock.body)).not.toMatch(/"availableKg":-/);

      const alerts = await get(
        `/farms/${farmA}/alerts?status=ACTIVE`,
        ownerA,
      ).expect(200);
      const alert = alerts.body.find(
        (a: { kind: string }) => a.kind === 'STOCK_NEGATIF',
      );
      expect(alert).toBeDefined();
      expect(alert.level).toBe('JAUNE');
      expect(alert.message).toMatch(/Aliment démarrage/);
    });

    it('clears the alert once a new delivery is confirmed', async () => {
      const created = await post(
        '/programme/input-deliveries',
        {
          farmId: farmA,
          bandId,
          source: 'AUTRE',
          supplierName: 'Provenderie Akanda',
          shippedAt: daysAgo(1),
          lines: [
            {
              intrantCode: 'ALIMENT_DEMARRAGE',
              unitCode: 'KG',
              quantity: 100,
              feedPhase: 'DEMARRAGE',
              unitValueFcfa: 300,
            },
            { intrantCode: 'POUSSINS', unitCode: 'TETE', quantity: 10 },
          ],
        },
        dgeToken,
      ).expect(201);
      const res = await post(
        `/farms/${farmA}/input-deliveries/${created.body.id}/confirm`,
        {},
        ownerA,
      ).expect(201);
      expect(res.body.openBandHint).toBeNull();
      expect(res.body.lines[0]).toMatchObject({
        farmerCostFcfa: 30_000,
        subsidyFcfa: 0,
      });

      const stock = await get(
        `/farms/${farmA}/declarative-stock`,
        ownerA,
      ).expect(200);
      expect(stock.body.negative).toBe(false);
      const alerts = await get(
        `/farms/${farmA}/alerts?status=ACTIVE`,
        ownerA,
      ).expect(200);
      expect(
        alerts.body.some((a: { kind: string }) => a.kind === 'STOCK_NEGATIF'),
      ).toBe(false);
    });
  });

  describe('cancellation', () => {
    it('withdraws a delivery before confirmation only, within scope', async () => {
      const created = await post(
        '/programme/input-deliveries',
        deliveryBody(farmA),
        provincialToken,
      ).expect(201);
      const id = created.body.id;
      const b = await post(
        '/programme/input-deliveries',
        deliveryBody(farmB),
        dgeToken,
      ).expect(201);
      await post(
        `/programme/input-deliveries/${b.body.id}/cancel`,
        { reason: 'Erreur' },
        provincialToken,
      ).expect(403);
      await post(
        `/programme/input-deliveries/${id}/cancel`,
        {},
        provincialToken,
      ).expect(400);
      await post(
        `/programme/input-deliveries/${id}/cancel`,
        { reason: 'Doublon' },
        ownerA,
      ).expect(403);
      const res = await post(
        `/programme/input-deliveries/${id}/cancel`,
        { reason: 'Saisie en double' },
        provincialToken,
      ).expect(201);
      expect(res.body).toMatchObject({
        status: 'ANNULEE',
        cancelReason: 'Saisie en double',
      });
      await post(
        `/farms/${farmA}/input-deliveries/${id}/confirm`,
        {},
        ownerA,
      ).expect(409);
    });

    it('exposes per-farm figures for the dashboards', async () => {
      const [summary] = await app
        .get(DeclarativeStockService)
        .farmSummaries([farmA]);
      expect(summary.farmId).toBe(farmA);
      // d1 + the second delivery confirmed; the provincial ones pending or cancelled.
      expect(summary.deliveries).toMatchObject({
        confirmed: 2,
        withDiscrepancy: 1,
        pending: 1,
        cancelled: 1,
      });
      const feed = summary.intrants.find(
        (i) => i.intrantCode === 'ALIMENT_DEMARRAGE',
      );
      expect(feed).toMatchObject({
        shipped: 600,
        received: 550,
        stock: 20,
        pending: 500,
      });
    });
  });
});

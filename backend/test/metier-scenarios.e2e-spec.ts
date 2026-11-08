import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import { SanitaryAlertsService } from './../src/modules/surveillance/sanitary-alerts.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

/** Rows of a `;`-separated export, keyed by header. */
function csvRows(text: string): Record<string, string>[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((l) => l.length > 0);
  const split = (l: string) =>
    l.split(';').map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"'));
  const head = split(lines[0]);
  return lines.slice(1).map((l) => {
    const cells = split(l);
    return Object.fromEntries(head.map((h, i) => [h, cells[i]]));
  });
}

/** Piecewise-linear broiler weight (kg) by age in days: the weighings below. */
const WEIGHT_POINTS: [number, number][] = [
  [0, 0.045],
  [7, 0.18],
  [14, 0.45],
  [21, 0.9],
  [28, 1.45],
  [35, 1.95],
  [42, 2.4],
];
function weightAt(offset: number): number {
  for (let i = 1; i < WEIGHT_POINTS.length; i++) {
    const [d0, w0] = WEIGHT_POINTS[i - 1];
    const [d1, w1] = WEIGHT_POINTS[i];
    if (offset <= d1) return w0 + ((w1 - w0) * (offset - d0)) / (d1 - d0);
  }
  return WEIGHT_POINTS[WEIGHT_POINTS.length - 1][1];
}

/**
 * Métier scenarios: whole business cycles a farmer, a veterinarian, the DGE
 * and the jury would run, checking that the SAME figure comes out of every
 * screen and endpoint. Expected values are computed by hand in the comments.
 */
describe('Scénarios métier de bout en bout (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let notify: NotifyService;
  let sanitaryAlerts: SanitaryAlertsService;
  const memberships: string[] = [];

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const agentProfile = `METIER${digits}`;

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);
  const del = (url: string, token: string) =>
    request(server).delete(url).set(auth(token));

  /** An institutional account on a profile, with its scope. */
  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ) {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Métier ${profileCode} ${tag}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    memberships.push(res.body.id as string);
    return {
      token: await login(server, phone, res.body.loginCode as string),
      userId: res.body.user.id as string,
    };
  }

  /** Read-only steering account limited to the given farms. */
  const agentFor = (farmIds: string[]) =>
    institution(agentProfile, { farmIds });

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await sanitaryAlerts.flush();
      await notify.flush();
    }
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
    sanitaryAlerts = app.get(SanitaryAlertsService);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    await post(
      '/programme/access/profiles',
      {
        code: agentProfile,
        label: `Agent métier ${digits}`,
        scopeKind: 'FARMS',
        matrix: {
          PILOTAGE: ['CONSULTER'],
          TECHNIQUE: ['CONSULTER'],
          ECONOMIQUE: ['CONSULTER'],
        },
      },
      adminToken,
    ).expect(201);
  }, 120_000);

  afterAll(async () => {
    // Later runs on the same DB must not notify these accounts again.
    for (const id of memberships) {
      await patch(
        `/programme/access/memberships/${id}`,
        { active: false },
        adminToken,
      );
    }
    await settle();
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. Cycle chair complet
  // ──────────────────────────────────────────────────────────────────────
  describe('1. Cycle chair complet (1000 poussins, 42 jours, ventes, abattage, clôture)', () => {
    /*
     * Hand-computed expectations.
     * Deaths: days 1-7 3/day (21), 8-14 2/day (14), 15-28 1/day (14), day 35 4
     *   => 53 deaths: mortality 5.3 %, viability 94.7 %.
     * Feed (kg/day): 20 (d1-7), 50, 90, 130, 160, 180 => 7 × 630 = 4410 kg.
     * Weighings (kg): d7 0.18, d14 0.45, d21 0.90, d28 1.45, d35 1.95, d42 2.40.
     * Exits: S1 300 birds 585 kg (d35), S2 400 birds 960 kg (d42),
     *   S3 abattoir 247 birds 592.8 kg (d42) => 947 birds, 2137.8 kg, 0 left.
     * Official live weight produced = 2137.8 + 0 − 1000 × 0.045 = 2092.8 kg
     *   => IC = 4410 / 2092.8 = 2.1072; GMQ = (2400 − 45) / 42 = 56.07 g/j.
     * Costs: chicks 1000 × 500 = 500 000; feed 100 bags × 20 000 = 2 000 000;
     *   veterinary 30 000; transport 20 000 => 2 550 000 FCFA.
     * Revenue: S1 585 kg × 1800 = 1 053 000; S2 960 kg × 1800 = 1 728 000
     *   => 2 781 000; margin 231 000 (8.31 %). Feed left: 5000 − 4410 = 590 kg.
     */
    const PLACED = 1000;
    const DEATHS = 53;
    const FEED_KG = 4410;
    const REVENUE = 2_781_000;
    const COSTS = 2_550_000;
    const SOLD_KG = 585 + 960;
    const EXIT_KG = 585 + 960 + 592.8;
    const deathsAt = (o: number) =>
      o <= 7 ? 3 : o <= 14 ? 2 : o <= 28 ? 1 : o === 35 ? 4 : 0;
    const feedAt = (o: number) =>
      o <= 7 ? 20 : o <= 14 ? 50 : o <= 21 ? 90 : o <= 28 ? 130 : o <= 35 ? 160 : 180;
    const WEIGHINGS: Record<number, number> = {
      7: 0.18,
      14: 0.45,
      21: 0.9,
      28: 1.45,
      35: 1.95,
      42: 2.4,
    };

    let token: string;
    let farmId: string;
    let batchId: string;
    let batchCode: string;
    let breedId: string;
    let agentToken: string;
    let lot: any;
    let official: any;
    let snapshot: any;

    // Independent oracle of the lot-level FCR (dead birds' growth counted).
    const growthOfDead = Array.from({ length: 42 }, (_, i) => i + 1).reduce(
      (s, o) => s + deathsAt(o) * (weightAt(o) - 0.045),
      0,
    );
    const biomassLot =
      300 * (1.95 - 0.045) + 647 * (2.4 - 0.045) + growthOfDead;
    const fcrLot = FEED_KG / biomassLot;
    const ipeLot = (2.4 * 94.7 * 100) / (42 * fcrLot);
    const fcrOfficial = FEED_KG / 2092.8;

    const indicator = (list: any[], key: string): number | null =>
      list.find((i) => i.key === key)?.value ?? null;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Cycle ${tag}`,
      });
      farmId = farm.farmId;
      token = farm.ownerToken;
      agentToken = (await agentFor([farmId])).token;
      breedId = (await get('/breeds', token).expect(200)).body.find(
        (b: { name: string }) => b.name === 'Ross 308',
      ).id;
      const building = await post(
        `/farms/${farmId}/buildings`,
        { name: 'Poulailler 1', buildingAreaM2: 200, capacity: 2000 },
        token,
      ).expect(201);
      // Cash box for the transport paid in cash.
      await post(
        `/farms/${farmId}/caisse/open`,
        { openingBalanceFcfa: 100_000 },
        token,
      ).expect(201);
      const created = await post(
        `/farms/${farmId}/batches`,
        {
          batchName: `Chair cycle ${tag}`,
          type: 'CHAIR',
          integrationDate: day(-42),
          quantityAtStart: PLACED,
          breedId,
          buildingId: building.body.id,
          chickUnitPriceFcfa: 500,
          couvoirSupplier: 'Couvoir Test',
          chickLotNumber: `CL-${digits}`,
          hatchDate: day(-42),
        },
        token,
      ).expect(201);
      batchId = created.body.id;
      batchCode = created.body.code;

      // 100 bags of 50 kg at 20 000 FCFA the bag, attributed to the band.
      await post(
        `/farms/${farmId}/inputs`,
        {
          kind: 'ALIMENT',
          foodType: 'DEMARRAGE',
          productName: 'Provende chair',
          supplier: 'CEAG',
          supplierLotNumber: `PR-${digits}`,
          numberOfBags: 100,
          bagSizeKg: 50,
          unitPriceFcfa: 20_000,
          batchId,
        },
        token,
      ).expect(201);

      for (let o = 1; o <= 42; o++) {
        await post(
          `/farms/${farmId}/batches/${batchId}/daily-entries`,
          {
            entryDate: day(o - 42),
            deaths: deathsAt(o),
            feedQuantity: feedAt(o),
            feedUnit: 'KG',
            feedType: 'DEMARRAGE',
            waterL: feedAt(o) * 2,
            ...(WEIGHINGS[o] ? { avgWeightKg: WEIGHINGS[o], sampleSize: 30 } : {}),
          },
          token,
        ).expect(201);
      }

      // Programme vaccines (the vets' calendar), recorded as already done
      // since the band is opened in the past, then one antibiotic course.
      const protocols = await get(
        '/sanitary/protocols?species=POULET&type=CHAIR',
        token,
      ).expect(200);
      const reference = protocols.body.find(
        (p: { isDefault: boolean; farmId: string | null }) =>
          p.isDefault && p.farmId === null,
      );
      const detail = await get(`/sanitary/protocols/${reference.id}`, token).expect(
        200,
      );
      for (const step of detail.body.steps.filter((s: any) => s.active)) {
        await post(
          `/farms/${farmId}/batches/${batchId}/treatments`,
          {
            careType: step.careType,
            protocolStepId: step.id,
            administeredAt: day(-42 + step.dayFrom),
            reason: 'Calendrier sanitaire de référence',
            animalCount: PLACED,
          },
          token,
        ).expect(201);
      }
      await post(
        `/farms/${farmId}/batches/${batchId}/treatments`,
        {
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline 20 %',
          dosage: '1 g/L',
          route: 'Eau de boisson',
          administeredAt: day(-35),
          endDate: day(-33),
          withdrawalDays: 5,
          reason: 'Coryza',
          animalCount: 200,
        },
        token,
      ).expect(201);

      await post(
        `/farms/${farmId}/expenses`,
        { category: 'VETERINAIRE', amountFcfa: 30_000, label: 'Visite vétérinaire', batchId },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        {
          category: 'TRANSPORT',
          amountFcfa: 20_000,
          label: 'Transport poussins',
          batchId,
          paidByCaisse: true,
        },
        token,
      ).expect(201);

      const sortie = (body: object) =>
        post(`/farms/${farmId}/bandes/${batchId}/sorties`, body, token).expect(201);
      await sortie({
        sortieDate: day(-7),
        count: 300,
        weightKg: 585,
        reasonCode: 'VENTE_VIF',
        recipientName: 'Marché de Nkembo',
        unitPriceFcfa: 1800,
        priceUnit: 'KG',
      });
      await sortie({
        sortieDate: day(0),
        count: 400,
        weightKg: 960,
        reasonCode: 'VENTE_VIF',
        recipientName: 'Restaurant Le Port',
        unitPriceFcfa: 1800,
        priceUnit: 'KG',
      });
      await sortie({
        sortieDate: day(0),
        count: 247,
        weightKg: 592.8,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      });
      // The last birds left: closed automatically; closing again is a no-op.
      await post(`/farms/${farmId}/batches/${batchId}/cloture`, {}, token).expect(
        201,
      );

      lot = (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200))
        .body;
      official = (
        await get(`/farms/${farmId}/bandes/${batchId}/indicators`, token).expect(200)
      ).body;
      const snaps = (
        await get(`/farms/${farmId}/bandes/${batchId}/snapshots`, token).expect(200)
      ).body;
      snapshot = snaps[snaps.length - 1];
    }, 600_000);

    it('fiche du lot : effectif, mortalité, viabilité, aliment, poids', () => {
      expect(lot.status).toBe('CLOTURE');
      expect(lot.quantityAlive).toBe(0);
      const m = lot.metrics;
      expect(m.totalDeaths).toBe(DEATHS);
      expect(m.mortalityPercent).toBeCloseTo(5.3, 6);
      expect(m.viabilityPercent).toBeCloseTo(94.7, 6);
      expect(m.liveCount).toBe(0);
      expect(m.totalFeedKg).toBe(FEED_KG);
      expect(m.ageDays).toBe(42);
      expect(m.lastWeighingAvgWeightKg).toBe(2.4);
      expect(m.lastWeighingAgeDays).toBe(42);
      expect(m.gmqGramsPerDay).toBeCloseTo((2400 - 45) / 42, 4);
      expect(m.fcr).toBeCloseTo(fcrLot, 4);
      expect(m.ipe).toBeCloseTo(ipeLot, 3);
    });

    it('IPE = (poids kg × viabilité % × 100) / (âge × IC)', () => {
      const m = lot.metrics;
      expect((m.lastWeighingAvgWeightKg * m.viabilityPercent * 100) / (m.lastWeighingAgeDays * m.fcr)).toBeCloseTo(m.ipe, 6);
    });

    it('indicateurs officiels (formules du programme) = valeurs calculées à la main', () => {
      const v = official.variables;
      expect(v).toMatchObject({
        mis_en_place: PLACED,
        morts_cumules: DEATHS,
        presents: 0,
        sortis_tetes: 947,
        aliment_kg: FEED_KG,
        poids_moyen_g: 2400,
        poids_initial_g: 45,
        jours_elevage: 42,
        ca_fcfa: REVENUE,
        charges_fcfa: COSTS,
      });
      expect(v.poids_sortis_kg).toBeCloseTo(EXIT_KG, 3);
      const ind = official.indicators;
      expect(indicator(ind, 'taux_mortalite')).toBeCloseTo(5.3, 6);
      expect(indicator(ind, 'viabilite')).toBeCloseTo(94.7, 6);
      expect(indicator(ind, 'poids_vif_produit_kg')).toBeCloseTo(2092.8, 3);
      expect(indicator(ind, 'gmq_g_j')).toBeCloseTo(56.0714, 3);
      expect(indicator(ind, 'ic')).toBeCloseTo(fcrOfficial, 4);
      expect(indicator(ind, 'cout_production_kg')).toBeCloseTo(COSTS / 2092.8, 2);
      expect(indicator(ind, 'cout_production_tete')).toBeCloseTo(COSTS / 947, 2);
      expect(indicator(ind, 'marge_fcfa')).toBe(REVENUE - COSTS);
      expect(indicator(ind, 'taux_marge')).toBeCloseTo(((REVENUE - COSTS) / REVENUE) * 100, 4);
      expect(indicator(ind, 'taux_occupation')).toBeCloseTo((PLACED / 2000) * 100, 4);
    });

    it('mortalité, viabilité, GMQ et poids : fiche du lot = indicateurs officiels', () => {
      const m = lot.metrics;
      const ind = official.indicators;
      expect(indicator(ind, 'taux_mortalite')).toBeCloseTo(m.mortalityPercent, 6);
      expect(indicator(ind, 'viabilite')).toBeCloseTo(m.viabilityPercent, 6);
      expect(indicator(ind, 'gmq_g_j')).toBeCloseTo(m.gmqGramsPerDay, 6);
      expect(official.variables.poids_moyen_g / 1000).toBeCloseTo(
        m.lastWeighingAvgWeightKg,
        6,
      );
      expect(official.variables.aliment_kg).toBe(m.totalFeedKg);
    });

    it('IC : fiche du lot (biomasse incluant la croissance des morts) vs IC officiel', () => {
      // Both are documented; they only differ by the growth of the dead birds.
      const gap = Math.abs(lot.metrics.fcr - indicator(official.indicators, 'ic')!);
      expect(gap).toBeGreaterThan(0);
      expect(gap / indicator(official.indicators, 'ic')!).toBeLessThan(0.03);
    });

    it.todo(
      'IC : la fiche du lot (aliment / biomasse y compris la croissance des sujets morts, ex. 2,08) et l’IC officiel du bilan (aliment / poids vif produit, ex. 2,11) divergent de ~1,3 % dès qu’il y a de la mortalité — à trancher avec la DGE (une seule définition affichée)',
    );

    it('bilan figé (snapshot v1) = indicateurs officiels du jour de clôture', () => {
      expect(snapshot.version).toBe(1);
      expect(snapshot.asOf).toBe(day(0));
      expect(snapshot.durationDays).toBe(42);
      expect(snapshot.revenueFcfa).toBe(REVENUE);
      expect(snapshot.chargesFcfa).toBe(COSTS);
      expect(snapshot.marginFcfa).toBe(REVENUE - COSTS);
      for (const key of ['taux_mortalite', 'viabilite', 'gmq_g_j', 'ic', 'cout_production_kg', 'marge_fcfa']) {
        expect(indicator(snapshot.indicators, key)).toBeCloseTo(
          indicator(official.indicators, key)!,
          6,
        );
      }
      expect(snapshot.variables.morts_cumules).toBe(DEATHS);
      expect(snapshot.variables.aliment_kg).toBe(FEED_KG);
    });

    it('historique des bandes : le résumé d’une bande close reprend le bilan', async () => {
      const list = await get(`/farms/${farmId}/bandes?status=CLOTURE`, token).expect(200);
      const band = list.body.find((b: { id: string }) => b.id === batchId);
      expect(band.summary).toMatchObject({
        source: 'BILAN',
        snapshotVersion: 1,
        revenueFcfa: REVENUE,
        chargesFcfa: COSTS,
        marginFcfa: REVENUE - COSTS,
      });
      expect(indicator(band.summary.indicators, 'ic')).toBeCloseTo(fcrOfficial, 4);
      expect(indicator(band.summary.indicators, 'taux_mortalite')).toBeCloseTo(5.3, 6);
    });

    it('projection jour par jour = fiche du lot', async () => {
      const rows = (
        await get(`/farms/${farmId}/bandes/${batchId}/daily-stats`, token).expect(200)
      ).body;
      const last = rows[rows.length - 1];
      expect(last).toMatchObject({
        present: 0,
        deathsCumulative: DEATHS,
        removalsCumulative: 947,
      });
      expect(last.feedCumulativeKg).toBeCloseTo(FEED_KG, 3);
      expect(last.lastWeightG).toBeCloseTo(2400, 3);
    });

    it('tableau de bord de la ferme : cheptel, mortalité, palmarès = fiche du lot', async () => {
      const dash = (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body;
      expect(dash.liveStock).toBe(0);
      expect(dash.batches).toMatchObject({ total: 1, cloture: 1 });
      expect(dash.mortalityPercent).toBeCloseTo(5.3, 2);
      expect(dash.viabilityPercent).toBeCloseTo(94.7, 2);
      const row = dash.leaderboard.find((r: { batchId: string }) => r.batchId === batchId);
      expect(row.fcr).toBeCloseTo(lot.metrics.fcr, 6);
      expect(row.gmqGramsPerDay).toBeCloseTo(lot.metrics.gmqGramsPerDay, 6);
      expect(row.ipe).toBeCloseTo(lot.metrics.ipe, 6);
      expect(row.mortalityPercent).toBeCloseTo(5.3, 2);
      // 590 kg left / 180 kg a day over the last three days = 3.3 days.
      expect(dash.feedAutonomyDays).toBeCloseTo(3.3, 1);
    });

    it('stock d’aliment : 5000 reçus − 4410 consommés = 590 kg', async () => {
      const stock = (await get(`/farms/${farmId}/feed-stock`, token).expect(200)).body;
      const type = stock.byType[0];
      expect(type.receivedKg).toBe(5000);
      expect(type.usedKg).toBe(FEED_KG);
      expect(type.availableKg).toBe(590);
      expect(stock.lots[0].availableKg).toBe(590);
    });

    it('courbe d’élevage : aliment cumulé et mortalité hebdomadaires = totaux du lot', async () => {
      const curve = (await get(`/farms/${farmId}/batches/${batchId}/curve`, token).expect(200)).body;
      const feed = curve.weekly.reduce((s: number, w: any) => s + w.feedKg, 0);
      const deaths = curve.weekly.reduce((s: number, w: any) => s + w.deaths, 0);
      expect(feed).toBeCloseTo(FEED_KG, 3);
      expect(deaths).toBe(DEATHS);
    });

    it('rentabilité du lot = ventes − coûts attribués, identique au bilan', async () => {
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(REVENUE);
      expect(pnl.expensesFcfa).toBe(COSTS);
      expect(pnl.netFcfa).toBe(REVENUE - COSTS);
      expect(pnl.marginPct).toBeCloseTo(((REVENUE - COSTS) / REVENUE) * 100, 4);
      expect(pnl.kgSold).toBe(SOLD_KG);
      expect(pnl.birdsSold).toBe(700);
      expect(pnl.breakdown.byExpenseCategory).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ category: 'ACHAT_POUSSINS', amountFcfa: 500_000 }),
          expect.objectContaining({ category: 'ALIMENTS', amountFcfa: 2_000_000 }),
          expect.objectContaining({ category: 'VETERINAIRE', amountFcfa: 30_000 }),
          expect.objectContaining({ category: 'TRANSPORT', amountFcfa: 20_000 }),
        ]),
      );
      // The gross enrichment must be the real cost of the bags, not kg × bag price.
      expect(pnl.enrichment.chickCostFcfa).toBe(500_000);
      expect(pnl.enrichment.feedLotsCostFcfa).toBe(2_000_000);
      expect(official.variables.ca_fcfa).toBe(pnl.revenueFcfa);
      expect(official.variables.charges_fcfa).toBe(pnl.expensesFcfa);
    });

    it('coût de production officiel (charges / poids vif produit) = 1218,46 sur la fiche et la liste, distinct du coût par kg vendu', async () => {
      // 2 550 000 / 2 092,8 kg produits (bilan figé), pas / 1 545 kg vendus.
      expect(lot.coutProductionKg).toBe(1218.46);
      expect(lot.coutProductionKg).toBeCloseTo(COSTS / 2092.8, 2);
      expect(lot.coutProductionSource).toBe('BILAN');
      expect(lot.coutProductionReason).toBeNull();
      const list = (await get(`/farms/${farmId}/batches?withCost=true`, token).expect(200)).body;
      const row = list.find((b: { id: string }) => b.id === batchId);
      expect(row.coutProductionKg).toBe(1218.46);
      // Without the opt-in the list stays cost-free (constant query count).
      const plain = (await get(`/farms/${farmId}/batches`, token).expect(200)).body;
      expect(plain.find((b: { id: string }) => b.id === batchId)).not.toHaveProperty('coutProductionKg');
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.costPerKgFcfa).toBeCloseTo(COSTS / SOLD_KG, 1);
      expect(pnl.costPerKgFcfa).not.toBe(lot.coutProductionKg);
      // Same value as the frozen bilan indicator.
      expect(lot.coutProductionKg).toBeCloseTo(indicator(snapshot.indicators, 'cout_production_kg')!, 2);
    });

    it('traitements : calendrier de référence enregistré + antibiotique, délai d’attente écoulé', async () => {
      const treatments = (await get(`/farms/${farmId}/batches/${batchId}/treatments`, token).expect(200)).body;
      const antibiotic = treatments.find((t: any) => t.careType === 'ANTIBIOTIQUE');
      // Withdrawal runs from the END of the course (day -33 + 5 days).
      expect(antibiotic.withdrawalEndDate.slice(0, 10)).toBe(day(-28));
      expect(treatments.length).toBeGreaterThan(1);
      const vaccines = treatments.filter((t: any) => t.careType === 'VACCIN');
      expect(vaccines.length).toBeGreaterThan(0);
      expect(vaccines.every((t: any) => t.animalCount === PLACED)).toBe(true);
      const calendar = (await get(`/farms/${farmId}/batches/${batchId}/prophylaxis`, token).expect(200)).body;
      expect(calendar.filter((e: any) => e.status === 'EN_RETARD')).toEqual([]);
    });

    it('souche : cibles de poids et d’IC appliquées à la semaine d’âge', async () => {
      const standards = (await get(`/breeds/${breedId}/standards`, token).expect(200)).body.standards;
      const dash = (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body;
      const row = dash.healthOverview.find((r: { batchId: string }) => r.batchId === batchId);
      const week = Math.floor(42 / 7) + 1;
      const target = standards.find((s: { week: number }) => s.week === week);
      expect(row.breedStatus.week).toBe(week);
      expect(row.breedStatus.targetAvgWeightKg).toBe(target.targetAvgWeightKg);
      expect(row.breedStatus.targetFcr).toBe(target.targetFcr);
      expect(row.breedStatus.actualAvgWeightKg).toBe(2.4);
      expect(row.breedStatus.avgWeightDeviationPct).toBeCloseTo(
        ((2.4 - target.targetAvgWeightKg) / target.targetAvgWeightKg) * 100,
        1,
      );
    });

    it.todo(
      'Souche : la semaine de référence est floor(âge/7)+1, donc une pesée à J7, J14… J42 (jour exact de pesée hebdomadaire) est comparée à la cible de la semaine SUIVANTE (J42 → semaine 7 = 2,58 kg au lieu de 2,14 kg pour la semaine 6 ; pondeuse de 22 semaines → cible de la semaine 23). À valider avec les vétérinaires / le guide de la souche',
    );

    it('pilotage : le même lot dans le tableau de bord national (périmètre de la ferme)', async () => {
      const dash = (
        await get(`/pilotage/dashboard?from=${day(-45)}&to=${day(0)}`, agentToken).expect(200)
      ).body;
      const m = dash.totals.metrics;
      expect(m).toMatchObject({
        farms: 1,
        bands: 1,
        activeBands: 0,
        headcount: 0,
        placedHeads: PLACED,
        deaths: DEATHS,
      });
      expect(m.mortalityPct).toBeCloseTo(5.3, 1);
      expect(m.produced.heads).toBe(947);
      expect(m.produced.kg).toBeCloseTo(EXIT_KG, 1);
      expect(m.sold.liveHeads).toBe(700);
      expect(m.sold.revenueFcfa).toBe(REVENUE);
    });

    it('exports du pilotage : la ligne de la bande reprend les mêmes totaux', async () => {
      const csv = await get(`/pilotage/exports/bandes.csv?from=${day(-45)}&to=${day(0)}`, agentToken).expect(200);
      const rows = csvRows(csv.text);
      const row = rows.find((r) => r['Code bande'] === batchCode);
      expect(row).toBeTruthy();
      expect(Number(row!['Mis en place'])).toBe(PLACED);
      expect(Number(row!['Présents'])).toBe(0);
      expect(Number(row!['Morts cumulés'])).toBe(DEATHS);
      expect(Number(row!['Sortis vivants cumulés'])).toBe(947);
      expect(Number(row!['Aliment cumulé (kg)'])).toBeCloseTo(FEED_KG, 1);
    });

    it('bande close : l’âge et la fiche ne continuent pas de courir après la clôture', async () => {
      const created = await post(
        `/farms/${farmId}/batches`,
        {
          batchName: `Chair close ${tag}`,
          type: 'CHAIR',
          integrationDate: day(-30),
          quantityAtStart: 100,
        },
        token,
      ).expect(201);
      const id = created.body.id as string;
      await post(
        `/farms/${farmId}/batches/${id}/daily-entries`,
        { entryDate: day(-29), deaths: 1, avgWeightKg: 0.2, sampleSize: 10 },
        token,
      ).expect(201);
      await post(`/farms/${farmId}/batches/${id}/cloture`, {}, token).expect(201);
      await get(`/farms/${farmId}/bandes/${id}/snapshots`, token).expect(200);
      // The band ended 10 days ago: 20 days of rearing.
      await ds.query(
        `UPDATE production_batches SET closed_at = now() - make_interval(days => 10) WHERE id = $1`,
        [id],
      );
      const sheet = (await get(`/farms/${farmId}/bandes/${id}`, token).expect(200)).body;
      const detail = (await get(`/farms/${farmId}/batches/${id}`, token).expect(200)).body;
      expect(sheet.ageDays).toBe(20);
      expect(detail.metrics.ageDays).toBe(sheet.ageDays);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Cycle pondeuses
  // ──────────────────────────────────────────────────────────────────────
  describe('2. Cycle pondeuses (500 poules, ponte, classes, alvéoles, ventes, transferts, réforme)', () => {
    /*
     * 500 ISA Brown placed 28 days ago at 126 days of age (18 weeks).
     * Eggs/day: d1-7 50, d8-14 150, d15-21 300, d22-28 380 => 6160 collected.
     * Classes/day: 1 cracked + 1 small (d1-7); 2 cracked + 3 small + 1 double
     *   yolk + 1 dirty after => 49 cracked, 70 small, 21 double, 21 dirty =
     *   161 out => 5999 sellable eggs = 199 alvéoles + 29 eggs.
     * Deaths: 1 on days 5, 10, 15, 20 => 496 hens.
     * Lay rate (8 recorded days d21-d28): 2960 eggs / (496 × 8) = 74.6 %.
     * Sales: 150 alvéoles at the farm + 30 transferred to a shop (10 sold)
     *   => 5999 − 4500 − 900 = 599 eggs = 19 alvéoles left.
     */
    let token: string;
    let farmId: string;
    let batchId: string;
    let boutiqueId: string;
    let farmPosId: string;
    let isaId: string;

    const eggsAt = (o: number) => (o <= 7 ? 50 : o <= 14 ? 150 : o <= 21 ? 300 : 380);
    const classes = (o: number) =>
      o <= 7
        ? { eggsCracked: 1, eggsSmall: 1, eggsDoubleYolk: 0, eggsDirty: 0 }
        : { eggsCracked: 2, eggsSmall: 3, eggsDoubleYolk: 1, eggsDirty: 1 };
    const outOf = (o: number) => (o <= 7 ? 2 : 7);

    const lot = async () =>
      (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body;
    const dashboard = async () =>
      (await get(`/farms/${farmId}/dashboard`, token).expect(200)).body;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Pondeuses ${tag}`,
      });
      farmId = farm.farmId;
      token = farm.ownerToken;
      isaId = (await get('/breeds', token).expect(200)).body.find(
        (b: { name: string }) => b.name === 'ISA Brown',
      ).id;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 0 }, token).expect(201);
      const pos = await get(`/farms/${farmId}/points-of-sale`, token).expect(200);
      farmPosId = pos.body.find((p: { kind: string }) => p.kind === 'FERME').id;
      boutiqueId = (
        await post(
          `/farms/${farmId}/points-of-sale`,
          { kind: 'BOUTIQUE', name: 'Boutique Œufs', city: 'Libreville' },
          token,
        ).expect(201)
      ).body.id;
      batchId = (
        await post(
          `/farms/${farmId}/batches`,
          {
            batchName: `Pondeuses ${tag}`,
            type: 'PONDEUSE',
            integrationDate: day(-28),
            initialAgeDays: 126,
            quantityAtStart: 500,
            breedId: isaId,
          },
          token,
        ).expect(201)
      ).body.id;
      for (let o = 1; o <= 28; o++) {
        await post(
          `/farms/${farmId}/batches/${batchId}/daily-entries`,
          {
            entryDate: day(o - 28),
            deaths: o % 5 === 0 && o <= 20 ? 1 : 0,
            eggsCollected: eggsAt(o),
            eggsSellable: eggsAt(o) - outOf(o),
            ...classes(o),
          },
          token,
        ).expect(201);
      }
    }, 300_000);

    it('classes d’œufs : totaux, vendable = collecté − non commercialisable', async () => {
      const m = (await lot()).metrics;
      expect(m.totalDeaths).toBe(4);
      expect(m.liveCount).toBe(496);
      expect(m.eggsCollectedTotal).toBe(6160);
      expect(m.eggBreakdown).toEqual({
        collected: 6160,
        sellable: 5999,
        cracked: 49,
        small: 70,
        doubleYolk: 21,
        dirty: 21,
      });
      expect(m.eggStockAvailableEggs).toBe(5999);
      expect(m.eggStockAvailableAlveoles).toBe(199);
      const pondage = (await get(`/farms/${farmId}/batches/${batchId}/pondage`, token).expect(200)).body;
      expect(pondage.totals).toMatchObject({ collected: 6160, sellable: 5999, cracked: 49, small: 70 });
      expect(pondage.eggsPerHen).toBeCloseTo(12.32, 2);
      expect(pondage.sellableRatioPercent).toBeCloseTo((5999 / 6160) * 100, 1);
      expect(pondage.weekly.reduce((s: number, w: any) => s + w.collected, 0)).toBe(6160);
    });

    it.todo(
      'Pondage : `totals.sellable` additionne la valeur SAISIE (eggsSellable) alors que le stock d’œufs (fiche, tableau de bord, vente) utilise collecté − fêlés − petits − double jaune − sales ; une saisie 80 collectés / 60 vendables / 5 fêlés / 5 petits (acceptée par la validation) donne 60 d’un côté et 70 de l’autre. Les classes double jaune et sales ne sont pas exposées dans `totals`',
    );

    it('taux de ponte : fiche du lot = pondage = tableau de bord, calculé sur les poules présentes', async () => {
      const expected = (2960 / (496 * 8)) * 100;
      const m = (await lot()).metrics;
      expect(m.layRatePercent).toBeCloseTo(expected, 6);
      const pondage = (await get(`/farms/${farmId}/batches/${batchId}/pondage`, token).expect(200)).body;
      expect(pondage.layRatePercent).toBeCloseTo(expected, 1);
      const row = (await dashboard()).healthOverview.find(
        (r: { batchId: string }) => r.batchId === batchId,
      );
      expect(row.breedStatus.actualLayRatePercent).toBeCloseTo(expected, 6);
      const board = (await dashboard()).leaderboard.find(
        (r: { batchId: string }) => r.batchId === batchId,
      );
      expect(board.layRatePercent).toBeCloseTo(expected, 6);
    });

    it('tableau de bord : taux de ponte de la ferme par espèce (poules-jours) = 74,6 %', async () => {
      const expected = (2960 / (496 * 8)) * 100;
      const dash = await dashboard();
      expect(dash.farmIndicators.windowDays).toBe(7);
      const poulet = dash.farmIndicators.layingBySpecies.find(
        (g: { species: string }) => g.species === 'POULET',
      );
      expect(poulet).toMatchObject({ eggs: 2960, henDays: 496 * 8, lots: 1 });
      expect(poulet.layRatePercent).toBeCloseTo(expected, 1);
      expect(poulet.layRatePercent).toBeCloseTo(74.6, 1);
      // No feed typed on the layer lot: nothing to divide.
      expect(dash.farmIndicators.feedPerBirdDayKg).toBeNull();
      // Seeded thresholds, same shape the mobile used to hard-code.
      expect(dash.thresholds).toMatchObject({
        fcrAbsoluteWarn: 2.2,
        fcrDeviationWarnPct: 10,
        fcrDeviationGoodPct: 5,
        layRateDeviationWarnPct: 10,
        waterDropWarnPct: 10,
        waterDropCriticalPct: 25,
      });
    });

    it('taux de ponte vs courbe de la souche (ISA Brown) à la semaine d’âge', async () => {
      const standards = (await get(`/breeds/${isaId}/standards`, token).expect(200)).body.standards;
      // Age on the last entry: 126 + 28 = 154 days.
      const week = Math.floor(154 / 7) + 1;
      const target = standards
        .filter((s: { week: number }) => s.week <= week)
        .pop();
      const row = (await dashboard()).healthOverview.find(
        (r: { batchId: string }) => r.batchId === batchId,
      );
      expect(row.breedStatus.targetLayRatePercent).toBe(target.targetLayRatePercent);
      const actual = (2960 / (496 * 8)) * 100;
      expect(row.breedStatus.layRateDeviationPct).toBeCloseTo(
        ((actual - target.targetLayRatePercent) / target.targetLayRatePercent) * 100,
        1,
      );
    });

    it('vente d’alvéoles à la ferme, transfert en boutique, vente en boutique : stock cohérent partout', async () => {
      await post(
        `/farms/${farmId}/sales`,
        {
          customerName: 'Grossiste Œufs',
          items: [
            { productType: 'OEUFS', quantity: 150, unit: 'ALVEOLES', unitPriceFcfa: 2500, batchId },
          ],
          payments: [{ method: 'CASH', amountFcfa: 375_000 }],
        },
        token,
      ).expect(201);
      const transfer = await post(
        `/farms/${farmId}/stock-transfers`,
        { productType: 'OEUFS', batchId, pointOfSaleId: boutiqueId, quantity: 30 },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/sales`,
        {
          pointOfSaleId: boutiqueId,
          items: [
            {
              productType: 'OEUFS',
              quantity: 10,
              unit: 'ALVEOLES',
              unitPriceFcfa: 2800,
              batchId,
              stockTransferId: transfer.body.id,
            },
          ],
          payments: [{ method: 'CASH', amountFcfa: 28_000 }],
        },
        token,
      ).expect(201);

      // 5999 − 150 × 30 (farm) − 30 × 30 (shop: 10 sold + 20 still there) = 599.
      const m = (await lot()).metrics;
      expect(m.eggStockAvailableEggs).toBe(599);
      expect(m.eggStockAvailableAlveoles).toBe(19);
      const egg = (await dashboard()).eggStock;
      expect(egg).toMatchObject({ availableEggs: 599, availableAlveoles: 19, soldAlveoles: 160 });
      const sales = (await get(`/farms/${farmId}/sales`, token).expect(200)).body;
      const list = Array.isArray(sales) ? sales : sales.items;
      expect(list.length).toBe(2);
      const transfers = (await get(`/farms/${farmId}/stock-transfers?productType=OEUFS`, token).expect(200)).body;
      expect(transfers.find((t: { id: string }) => t.id === transfer.body.id)).toMatchObject({
        quantity: 30,
        quantitySold: 10,
      });
    });

    it('on ne vend ni ne transfère plus d’alvéoles que le stock (19)', async () => {
      const over = await post(
        `/farms/${farmId}/sales`,
        {
          items: [{ productType: 'OEUFS', quantity: 20, unit: 'ALVEOLES', unitPriceFcfa: 2500, batchId }],
          payments: [{ method: 'CASH', amountFcfa: 50_000 }],
        },
        token,
      ).expect(400);
      expect(String(over.body.message)).toMatch(/stock|insuffisant|disponible/i);
      await post(
        `/farms/${farmId}/stock-transfers`,
        { productType: 'OEUFS', batchId, pointOfSaleId: boutiqueId, quantity: 20 },
        token,
      ).expect(400);
      expect((await lot()).metrics.eggStockAvailableAlveoles).toBe(19);
    });

    it('chiffre d’affaires des œufs : rentabilité du lot, caisse et compte 7012 concordent', async () => {
      // 150 × 2500 + 10 × 2800 = 403 000.
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(403_000);
      expect(pnl.eggsSold).toBe(160);
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(403_000);
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      const acc = (code: string) => balance.accounts.find((a: any) => a.code === code);
      expect(-acc('7012').soldeFcfa).toBe(403_000);
      expect(farmPosId).toBeTruthy();
    });

    it('réforme : les poules sortent du cheptel sans fausser le taux de ponte de la semaine passée', async () => {
      const before = (await lot()).metrics.layRatePercent;
      await post(
        `/farms/${farmId}/bandes/${batchId}/sorties`,
        {
          sortieDate: day(0),
          count: 100,
          weightKg: 160,
          reasonCode: 'REFORME',
          recipientName: 'Boucherie du Port',
        },
        token,
      ).expect(201);
      const after = await lot();
      expect(after.quantityAlive).toBe(396);
      expect(after.metrics.liveCount).toBe(396);
      // Production did not change: neither does the rate of the recorded days
      // (the 100 hens were present on every one of them).
      // The 100 hens left on the last laying day: only that day counts 396 hens.
      expect(after.metrics.layRatePercent).toBeCloseTo((2960 / (496 * 7 + 396)) * 100, 6);
      expect(after.metrics.layRatePercent).toBeLessThan(before! + 3);
      const dash = await dashboard();
      expect(dash.liveStock).toBe(396);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Sanitaire
  // ──────────────────────────────────────────────────────────────────────
  describe('3. Sanitaire (calendrier, retard, délai d’attente, suspicion → DGE, vide sanitaire)', () => {
    let token: string;
    let farmId: string;
    let farmCode: string;
    let steps: Array<{ id: string; dayFrom: number; name: string }>;

    const open = async (name: string, extra: object = {}) =>
      (
        await post(
          `/farms/${farmId}/batches`,
          {
            batchName: `${name} ${tag}`,
            type: 'CHAIR',
            integrationDate: day(0),
            quantityAtStart: 300,
            ...extra,
          },
          token,
        ).expect(201)
      ).body.id as string;
    const calendar = async (id: string) =>
      (await get(`/farms/${farmId}/batches/${id}/prophylaxis`, token).expect(200)).body as Array<{
        id: string;
        name: string;
        status: string;
        scheduledDate: string;
        protocolStepId: string | null;
      }>;
    const metrics = async (id: string) =>
      (await get(`/farms/${farmId}/batches/${id}`, token).expect(200)).body.metrics;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Sanitaire ${tag}`,
        provinceCode: 'G5',
      });
      farmId = farm.farmId;
      farmCode = farm.farmCode;
      token = farm.ownerToken;
      const protocols = await get('/sanitary/protocols?species=POULET&type=CHAIR', token).expect(200);
      const reference = protocols.body.find(
        (p: { isDefault: boolean; farmId: string | null }) => p.isDefault && p.farmId === null,
      );
      const detail = await get(`/sanitary/protocols/${reference.id}`, token).expect(200);
      steps = detail.body.steps.filter((s: { active: boolean }) => s.active);
      expect(steps.length).toBeGreaterThan(1);
    }, 120_000);

    it('le calendrier de référence est daté J0 + jour de l’étape (bande posée à J0)', async () => {
      const id = await open('Bande J0');
      const cares = await calendar(id);
      expect(cares).toHaveLength(steps.length);
      for (const step of steps) {
        const care = cares.find((c) => c.protocolStepId === step.id);
        expect(care).toBeTruthy();
        expect(care!.scheduledDate.slice(0, 10)).toBe(day(step.dayFrom));
        expect(care!.status).toBe('PLANIFIE');
      }
    });

    it('bande ouverte à J+10 : J0 est reculé de 10 jours, les étapes déjà passées ne sont pas planifiées', async () => {
      const id = await open('Bande J+10', { initialAgeDays: 10, quantityAlive: 300 });
      const cares = await calendar(id);
      const due = steps.filter((s) => s.dayFrom >= 10);
      expect(cares.map((c) => c.protocolStepId).sort()).toEqual(due.map((s) => s.id).sort());
      for (const step of due) {
        expect(
          cares.find((c) => c.protocolStepId === step.id)!.scheduledDate.slice(0, 10),
        ).toBe(day(-10 + step.dayFrom));
      }
    });

    it('vaccin en retard → alerte PROPHYLAXIE rouge, vente suspendue, levée à la réalisation', async () => {
      const id = await open('Bande retard');
      const cares = await calendar(id);
      await patch(
        `/farms/${farmId}/batches/${id}/prophylaxis/${cares[0].id}`,
        { scheduledDate: day(-5) },
        token,
      ).expect(200);
      const late = (await calendar(id)).filter((c) => c.status === 'EN_RETARD');
      expect(late.length).toBeGreaterThan(0);
      const alerts = (await get(`/farms/${farmId}/alerts`, token).expect(200)).body;
      const prophylaxis = alerts.find(
        (a: any) => a.kind === 'PROPHYLAXIE' && a.batchId === id && a.status === 'ACTIVE',
      );
      expect(prophylaxis.level).toBe('ROUGE');
      const blocked = await metrics(id);
      expect(blocked.readyForSale).toBe(false);
      expect(blocked.readyReason).toBe('SANITARY');

      for (const care of late) {
        await post(
          `/farms/${farmId}/batches/${id}/prophylaxis/${care.id}/complete`,
          { animalCount: 300, notes: 'Vaccin réalisé' },
          token,
        ).expect(201);
      }
      const after = (await get(`/farms/${farmId}/alerts`, token).expect(200)).body;
      expect(
        after.some((a: any) => a.kind === 'PROPHYLAXIE' && a.batchId === id && a.status === 'ACTIVE'),
      ).toBe(false);
      expect((await metrics(id)).readyReason).not.toBe('SANITARY');
      // Completion cannot exceed the headcount (300 birds).
      const fresh = await calendar(id);
      const next = fresh.find((c) => c.status === 'PLANIFIE')!;
      await post(
        `/farms/${farmId}/batches/${id}/prophylaxis/${next.id}/complete`,
        { animalCount: 301 },
        token,
      ).expect(400);
    });

    it('traitement antibiotique : délai d’attente compté depuis la fin du traitement, commercialisation suspendue', async () => {
      const id = await open('Bande traitement');
      const treatment = await post(
        `/farms/${farmId}/batches/${id}/treatments`,
        {
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline 20 %',
          administeredAt: day(0),
          endDate: day(2),
          withdrawalDays: 10,
          reason: 'Coryza',
          animalCount: 300,
        },
        token,
      ).expect(201);
      expect(treatment.body.withdrawalEndDate.slice(0, 10)).toBe(day(12));
      const alerts = (await get(`/farms/${farmId}/alerts`, token).expect(200)).body;
      expect(
        alerts.some((a: any) => a.kind === 'DELAI_ATTENTE' && a.batchId === id && a.status === 'ACTIVE'),
      ).toBe(true);
      expect((await metrics(id)).readyReason).toBe('SANITARY');
    });

    describe('suspicion déclarée → vétérinaire → publication → DGE', () => {
      let batchId: string;
      let eventId: string;
      let alertId: string;
      let vet: { token: string };
      let dge: { token: string };

      const inbox = async (t: string) =>
        (await get('/notifications?limit=200', t).expect(200)).body.items as Array<{
          event: string;
          subjectId: string | null;
        }>;

      beforeAll(async () => {
        batchId = await open('Bande suspicion', { integrationDate: day(-5) });
        vet = await institution('VETERINAIRE');
        dge = await institution('DGE');
      }, 120_000);

      it('la déclaration ouvre une alerte « nouvelle », visible du vétérinaire, pas de la DGE', async () => {
        const declared = await post(
          `/farms/${farmId}/batches/${batchId}/health-events`,
          {
            kind: 'MALADIE',
            occurredAt: day(0),
            severity: 'ROUGE',
            title: `Suspicion Newcastle ${tag}`,
            quantity: 12,
            clinicalSigns: ['DIARRHEE', 'ABATTEMENT'],
            suspicion: true,
          },
          token,
        ).expect(201);
        eventId = declared.body.id;
        await settle();
        const own = (await get(`/farms/${farmId}/sanitary-alerts`, token).expect(200)).body.items.filter(
          (a: { healthEventId: string }) => a.healthEventId === eventId,
        );
        expect(own).toHaveLength(1);
        expect(own[0]).toMatchObject({ statusFamily: 'NOUVELLE', farmCode, published: false });
        alertId = own[0].id;
        const seen = await get(`/surveillance/alerts?farmId=${farmId}`, vet.token).expect(200);
        expect(seen.body.items.map((a: { id: string }) => a.id)).toContain(alertId);
        // The DGE reads neither the alert nor a notification before publication.
        await get('/surveillance/alerts', dge.token).expect(403);
        const before = await inbox(dge.token);
        expect(before.some((n) => n.subjectId === alertId || n.subjectId === eventId)).toBe(false);
      });

      it('qualification puis publication par le vétérinaire : la DGE la voit, le pilotage la compte', async () => {
        const pilotage = async () =>
          (await get(`/pilotage/dashboard?from=${day(-1)}&to=${day(0)}`, dge.token).expect(200)).body
            .publishedAlerts.count as number;
        const countBefore = await pilotage();
        const move = (body: object) =>
          post(`/surveillance/alerts/${alertId}/transitions`, body, vet.token);
        await move({ statusCode: 'EN_ANALYSE', comment: 'Prélèvements envoyés' }).expect(201);
        await move({ statusCode: 'CONFIRMEE', comment: 'Laboratoire positif' }).expect(201);
        // The administration reads but never decides.
        await post(`/surveillance/alerts/${alertId}/publish`, {}, adminToken).expect(403);
        await post(`/surveillance/alerts/${alertId}/publish`, { comment: 'Publication officielle' }, vet.token).expect(201);
        await settle();
        expect(
          (await inbox(dge.token)).filter((n) => n.subjectId === alertId).map((n) => n.event),
        ).toEqual(['SANITARY_ALERT_PUBLISHED']);
        expect(await pilotage()).toBe(countBefore + 1);
      });
    });

    it('vide sanitaire entre deux lots d’un même bâtiment : < 14 j rouge, < 21 j jaune, ensuite rien', async () => {
      const newBuilding = async (name: string) =>
        (
          await post(
            `/farms/${farmId}/buildings`,
            { name: `${name} ${tag}`, buildingAreaM2: 100, capacity: 3000 },
            token,
          ).expect(201)
        ).body.id as string;
      const lotIn = async (buildingId: string, name: string, integrationDate: string) =>
        (
          await post(
            `/farms/${farmId}/batches`,
            {
              batchName: `${name} ${tag}`,
              type: 'CHAIR',
              integrationDate,
              quantityAtStart: 300,
              buildingId,
            },
            token,
          ).expect(201)
        ).body.id as string;
      const endedDaysAgo = async (batchId: string, days: number) => {
        await post(`/farms/${farmId}/batches/${batchId}/cloture`, {}, token).expect(201);
        await ds.query(
          `UPDATE production_batches SET closed_at = now() - make_interval(days => $2) WHERE id = $1`,
          [batchId, days],
        );
      };
      const verdict = async (buildingId: string) =>
        ds.query(
          `SELECT level, context FROM alerts
            WHERE farm_id = $1 AND building_id = $2 AND kind = 'VIDE_SANITAIRE'
              AND status IN ('ACTIVE','ACQUITTEE')`,
          [farmId, buildingId],
        );

      const red = await newBuilding('Bat rouge');
      await endedDaysAgo(await lotIn(red, 'R1', day(-80)), 30);
      await lotIn(red, 'R2', day(-20));
      const redAlert = await verdict(red);
      expect(redAlert).toHaveLength(1);
      expect(redAlert[0].level).toBe('ROUGE');
      expect(redAlert[0].context.gapDays).toBe(10);

      const yellow = await newBuilding('Bat jaune');
      await endedDaysAgo(await lotIn(yellow, 'J1', day(-80)), 40);
      await lotIn(yellow, 'J2', day(-23));
      const yellowAlert = await verdict(yellow);
      expect(yellowAlert).toHaveLength(1);
      expect(yellowAlert[0].level).toBe('JAUNE');
      expect(yellowAlert[0].context.gapDays).toBe(17);

      const ok = await newBuilding('Bat vert');
      await endedDaysAgo(await lotIn(ok, 'V1', day(-90)), 50);
      await lotIn(ok, 'V2', day(-25));
      expect(await verdict(ok)).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Finance
  // ──────────────────────────────────────────────────────────────────────
  describe('4. Finance (ventes, dépenses, caisse, rentabilité, SYSCOHADA)', () => {
    /*
     * 500 chicks at 400 = 200 000 (credit 401); feed 20 bags × 15 000 =
     * 300 000; transport 25 000 paid from the cash box; veterinary 40 000.
     * Sale 1: 100 birds × 3 500 = 350 000, 200 000 cash then 100 000 later
     * (50 000 outstanding). Sale 2: 80 kg (40 birds) × 2 000 = 160 000 cash.
     * Cash box: 100 000 opening + 200 000 + 100 000 + 160 000 + 10 000 in
     * − 25 000 − 5 000 out = 540 000.
     * Revenue 510 000, costs 565 000, net −55 000 (−10.78 %), 80 kg sold =>
     * 7 062.5 FCFA/kg.
     */
    let token: string;
    let farmId: string;
    let batchId: string;
    let sale1: string;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Finance ${tag}`,
      });
      farmId = farm.farmId;
      token = farm.ownerToken;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 100_000 }, token).expect(201);
      batchId = (
        await post(
          `/farms/${farmId}/batches`,
          {
            batchName: `Finance ${tag}`,
            type: 'CHAIR',
            integrationDate: day(-10),
            quantityAtStart: 500,
            chickUnitPriceFcfa: 400,
          },
          token,
        ).expect(201)
      ).body.id;
      await post(
        `/farms/${farmId}/inputs`,
        {
          kind: 'ALIMENT',
          foodType: 'DEMARRAGE',
          productName: 'Provende',
          supplier: 'CEAG',
          supplierLotNumber: `FIN-${digits}`,
          numberOfBags: 20,
          bagSizeKg: 50,
          unitPriceFcfa: 15_000,
          batchId,
        },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'TRANSPORT', amountFcfa: 25_000, label: 'Transport', batchId, paidByCaisse: true },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'VETERINAIRE', amountFcfa: 40_000, label: 'Vétérinaire', batchId },
        token,
      ).expect(201);
      const s1 = await post(
        `/farms/${farmId}/sales`,
        {
          customerName: 'Client Marché',
          items: [{ productType: 'POULET_PIECE', quantity: 100, unitPriceFcfa: 3500, batchId }],
          payments: [{ method: 'CASH', amountFcfa: 200_000 }],
        },
        token,
      ).expect(201);
      sale1 = s1.body.sale?.id ?? s1.body.id;
      await post(`/farms/${farmId}/sales/${sale1}/payments`, { method: 'CASH', amountFcfa: 100_000 }, token).expect(201);
      await post(
        `/farms/${farmId}/sales`,
        {
          customerName: 'Restaurant',
          items: [
            { productType: 'POULET_KG', quantity: 80, unit: 'KG', pieceCount: 40, unitPriceFcfa: 2000, batchId },
          ],
          payments: [{ method: 'CASH', amountFcfa: 160_000 }],
        },
        token,
      ).expect(201);
      await post(`/farms/${farmId}/caisse/movements`, { type: 'IN', amountFcfa: 10_000, reason: 'Apport exploitant' }, token).expect(201);
      await post(`/farms/${farmId}/caisse/movements`, { type: 'OUT', amountFcfa: 5_000, reason: 'Petites dépenses' }, token).expect(201);
    }, 180_000);

    it('caisse : solde attendu = fonds + encaissements − décaissements', async () => {
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      const sum = (type: string) =>
        cash.movements
          .filter((m: any) => m.type === type)
          .reduce((s: number, m: any) => s + m.amountFcfa, 0);
      expect(sum('IN')).toBe(470_000);
      expect(sum('OUT')).toBe(30_000);
      expect(cash.expectedBalanceFcfa).toBe(540_000);
      expect(cash.expectedBalanceFcfa).toBe(100_000 + sum('IN') - sum('OUT'));
    });

    it('rentabilité du lot = somme de ses ventes − ses coûts attribués', async () => {
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(510_000);
      expect(pnl.expensesFcfa).toBe(565_000);
      expect(pnl.netFcfa).toBe(-55_000);
      expect(pnl.marginPct).toBeCloseTo((-55_000 / 510_000) * 100, 4);
      expect(pnl.kgSold).toBe(80);
      expect(pnl.birdsSold).toBe(140);
      expect(pnl.costPerKgFcfa).toBe(7062.5);
      expect(pnl.enrichment.feedLotsCostFcfa).toBe(300_000);
      const official = (await get(`/farms/${farmId}/bandes/${batchId}/indicators`, token).expect(200)).body;
      expect(official.variables.ca_fcfa).toBe(510_000);
      expect(official.variables.charges_fcfa).toBe(565_000);
      expect(official.indicators.find((i: any) => i.key === 'marge_fcfa').value).toBe(-55_000);
      expect((await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body.quantityAlive).toBe(360);
    });

    it('vue d’ensemble : ventes, encaissé, reste à recouvrer, dépenses', async () => {
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.sales).toMatchObject({ count: 2, totalFcfa: 510_000 });
      expect(overview.collectedFcfa).toBe(460_000);
      expect(overview.outstandingFcfa).toBe(50_000);
      expect(overview.expenses.totalFcfa).toBe(565_000);
      expect(overview.netFcfa).toBe(-55_000);
      const sale = (await get(`/farms/${farmId}/sales/${sale1}`, token).expect(200)).body;
      expect(JSON.stringify(sale)).toContain('350000');
    });

    it('SYSCOHADA : écritures équilibrées, compte de résultat = ventes − charges, caisse 571 = caisse', async () => {
      const journal = (await get(`/farms/${farmId}/accounting/journal`, token).expect(200)).body;
      expect(journal.totals.debit).toBe(journal.totals.credit);
      expect(journal.totals.debit).toBeGreaterThan(0);
      for (const entry of journal.entries) {
        const debit = entry.lines.reduce((s: number, l: any) => s + l.debitFcfa, 0);
        const credit = entry.lines.reduce((s: number, l: any) => s + l.creditFcfa, 0);
        expect(debit).toBe(credit);
      }
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      expect(balance.totals.totalDebit).toBe(balance.totals.totalCredit);
      const acc = (code: string) => balance.accounts.find((a: any) => a.code === code);
      expect(acc('571').soldeFcfa).toBe(540_000);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.totalProduits).toBe(510_000);
      expect(result.totalCharges).toBe(565_000);
      expect(result.resultatFcfa).toBe(-55_000);
      const bilan = (await get(`/farms/${farmId}/accounting/bilan`, token).expect(200)).body;
      expect(bilan.ecartFcfa).toBe(0);
    });

    it('clôture de caisse au solde attendu : aucun écart', async () => {
      const closed = await post(`/farms/${farmId}/caisse/close`, { declaredBalanceFcfa: 540_000 }, token).expect(201);
      expect(JSON.stringify(closed.body)).toContain('540000');
      const sessions = (await get(`/farms/${farmId}/caisse/sessions`, token).expect(200)).body;
      const list = Array.isArray(sessions) ? sessions : sessions.items;
      expect(list[0].status).toBe('CLOSED');
      // A cash difference would post to 658/758: none here.
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      expect(balance.accounts.find((a: any) => a.code === '658')?.soldeFcfa ?? 0).toBe(0);
      expect(balance.accounts.find((a: any) => a.code === '758')?.soldeFcfa ?? 0).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Market
  // ──────────────────────────────────────────────────────────────────────
  describe('5. Market (annonce, commande, acompte, livraison, stock, traçabilité, annulation)', () => {
    let token: string;
    let farmId: string;
    let batchId: string;
    let batchCode: string;
    let listingId: string;
    let buyerToken: string;
    let orderRequestId: string;
    let orderId: string;

    const available = async () =>
      (await request(server).get(`/market/listings/${listingId}`).expect(200)).body;
    const alive = async () =>
      (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body.quantityAlive as number;
    const ask = (quantity = 10) =>
      post('/market/orders', { listingId, quantity, fulfilment: 'PICKUP' }, buyerToken);
    const accept = (id: string) =>
      post(`/farms/${farmId}/market/orders/${id}/accept`, {}, token);

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Market ${tag}`,
        extra: { statusCode: 'OPERATIONNELLE' },
      });
      farmId = farm.farmId;
      token = farm.ownerToken;
      await ds.getRepository(Farm).update({ id: farmId }, { isVerified: true });
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 100_000 }, token).expect(201);
      const created = await post(
        `/farms/${farmId}/batches`,
        {
          batchName: `Market ${tag}`,
          type: 'CHAIR',
          integrationDate: day(-45),
          quantityAtStart: 100,
        },
        token,
      ).expect(201);
      batchId = created.body.id;
      batchCode = created.body.code;
      const listing = await post(
        `/farms/${farmId}/market/listings`,
        {
          kind: 'PRE',
          product: 'BIRDS',
          batchId,
          unitPriceFcfa: 3000,
          quantityPublished: 50,
          readyDate: day(14),
          depositPct: 30,
          deliveryAvailable: true,
          deliveryFeeFcfa: 2000,
        },
        token,
      ).expect(201);
      listingId = listing.body.id;
      await post(`/farms/${farmId}/market/listings/${listingId}/publish`, {}, token).expect(201);
      buyerToken = (await registerBuyer(server, { fullName: `Acheteur ${tag}` })).token;
    }, 120_000);

    it('commande de 10 poulets : prix figé, stock réservé sans toucher à l’effectif du lot', async () => {
      expect((await available()).availableQuantity).toBe(50);
      const asked = await ask().expect(201);
      orderRequestId = asked.body.id;
      const accepted = await accept(orderRequestId).expect(201);
      orderId = accepted.body.orderId;
      expect(accepted.body.status).toBe('AWAITING_DEPOSIT');
      const order = (await get(`/farms/${farmId}/orders/${orderId}`, token).expect(200)).body;
      expect(order.totalAmountFcfa).toBe(30_000);
      expect(order.depositFcfa).toBe(0);
      expect((await available()).availableQuantity).toBe(40);
      expect(await alive()).toBe(100);
    });

    it('acompte de 30 % (9 000), puis livraison avec le solde : stock, caisse et ventes concordent', async () => {
      await post(`/farms/${farmId}/orders/${orderId}/deposit`, { amountFcfa: 9_000 }, token).expect(201);
      const confirmed = (await get(`/market/orders/${orderRequestId}`, buyerToken).expect(200)).body;
      expect(confirmed.status).toBe('CONFIRMED');
      expect(confirmed.depositPaidFcfa).toBe(9_000);
      await post(`/farms/${farmId}/orders/${orderId}/livrer`, { payment: { amountFcfa: 21_000 } }, token).expect(201);
      expect((await get(`/market/orders/${orderRequestId}`, buyerToken).expect(200)).body.status).toBe('DELIVERED');
      // 10 birds left the band once, the listing keeps the 40 unsold.
      expect(await alive()).toBe(90);
      expect((await available()).availableQuantity).toBe(40);
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(130_000);
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(30_000);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.totalProduits).toBe(30_000);
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      expect(balance.totals.totalDebit).toBe(balance.totals.totalCredit);
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.sales.totalFcfa).toBe(30_000);
      expect(overview.outstandingFcfa).toBe(0);
    });

    it('traçabilité : l’annonce porte le lot QR, sa page publique est celle de la bande', async () => {
      const listing = await available();
      expect(listing.traceLot).toBeTruthy();
      expect(listing.traceLot.code).toContain(batchCode);
      const url = new URL(listing.traceLot.url);
      const page = await request(server)
        .get(`/public/lots/${url.pathname.split('/').pop()}${url.search}`)
        .expect(200);
      expect(page.body.code).toBe(listing.traceLot.code);
      expect(JSON.stringify(page.body)).not.toContain(farmId);
      expect(JSON.stringify(page.body)).not.toContain(batchId);
    });

    it('annulation par la ferme : les oiseaux reviennent à l’annonce une seule fois', async () => {
      const asked = await ask().expect(201);
      const accepted = await accept(asked.body.id).expect(201);
      expect((await available()).availableQuantity).toBe(30);
      await del(`/farms/${farmId}/orders/${accepted.body.orderId}`, token).expect(200);
      expect((await available()).availableQuantity).toBe(40);
      // A second cancel must not give the birds back twice.
      await del(`/farms/${farmId}/orders/${accepted.body.orderId}`, token);
      expect((await available()).availableQuantity).toBe(40);
      expect(await alive()).toBe(90);
      expect((await get(`/market/orders/${asked.body.id}`, buyerToken).expect(200)).body.status).toBe('CANCELLED');
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. Programme / DGE
  // ──────────────────────────────────────────────────────────────────────
  describe('6. Programme / DGE (indicateurs nationaux = somme des fermes)', () => {
    /*
     * F1 (G1): A1 1000 chicks, 15 deaths, 200 sold (300 kg) => 785;
     *          layers 300 (out of the programme perimeter).
     * F2 (G1): B1 500 chicks, 7 deaths => 493.
     * F3 (G2): C1 800 chicks, 4 deaths, 100 slaughtered (150 kg) => 696;
     *          C0 100 chicks, 1 death, 99 given (99 kg) => closed.
     * Totals: 3 farms, 4 bands (3 active), 1974 present, 27 deaths,
     * 2400 placed, 399 exits / 549 kg.
     */
    let farms: Array<{ id: string; token: string }>;
    let agentToken: string;
    const period = () => `from=${day(-29)}&to=${day(0)}`;

    beforeAll(async () => {
      const f1 = await createProgrammeFarm(server, adminToken, { name: `Prog F1 ${tag}`, provinceCode: 'G1' });
      const f2 = await createProgrammeFarm(server, adminToken, { name: `Prog F2 ${tag}`, provinceCode: 'G1' });
      const f3 = await createProgrammeFarm(server, adminToken, { name: `Prog F3 ${tag}`, provinceCode: 'G2' });
      farms = [
        { id: f1.farmId, token: f1.ownerToken },
        { id: f2.farmId, token: f2.ownerToken },
        { id: f3.farmId, token: f3.ownerToken },
      ];
      const open = async (f: { id: string; token: string }, type: string, openedDaysAgo: number, qty: number) =>
        (
          await post(
            `/farms/${f.id}/batches`,
            {
              batchName: `Prog ${type} ${tag}`,
              type,
              integrationDate: day(-openedDaysAgo),
              quantityAtStart: qty,
            },
            f.token,
          ).expect(201)
        ).body.id as string;
      const deaths = (f: { id: string; token: string }, band: string, date: string, n: number) =>
        post(`/farms/${f.id}/batches/${band}/daily-entries`, { entryDate: date, deaths: n }, f.token).expect(201);
      const sortie = (f: { id: string; token: string }, band: string, body: object) =>
        post(`/farms/${f.id}/bandes/${band}/sorties`, body, f.token).expect(201);

      const a1 = await open(farms[0], 'CHAIR', 20, 1000);
      await deaths(farms[0], a1, day(-10), 5);
      await deaths(farms[0], a1, day(-5), 10);
      await sortie(farms[0], a1, {
        sortieDate: day(-2),
        count: 200,
        weightKg: 300,
        reasonCode: 'VENTE_VIF',
        recipientName: 'Marché',
        unitPriceFcfa: 2500,
      });
      const a2 = await open(farms[0], 'PONDEUSE', 15, 300);
      await deaths(farms[0], a2, day(-3), 3);
      const b1 = await open(farms[1], 'CHAIR', 10, 500);
      await deaths(farms[1], b1, day(-3), 7);
      const c1 = await open(farms[2], 'CHAIR', 12, 800);
      await deaths(farms[2], c1, day(-6), 4);
      await sortie(farms[2], c1, {
        sortieDate: day(-1),
        count: 100,
        weightKg: 150,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      });
      const c0 = await open(farms[2], 'CHAIR', 9, 100);
      await deaths(farms[2], c0, day(-8), 1);
      await sortie(farms[2], c0, {
        sortieDate: day(-1),
        count: 99,
        weightKg: 99,
        reasonCode: 'DON',
        recipientName: 'Orphelinat',
      });
      agentToken = (await agentFor(farms.map((f) => f.id))).token;
    }, 300_000);

    it('le périmètre = la somme des fermes : fermes, bandes, effectif, morts, mis en place, sorties', async () => {
      const d = (await get(`/pilotage/dashboard?${period()}`, agentToken).expect(200)).body;
      const m = d.totals.metrics;
      expect(m).toMatchObject({
        farms: 3,
        bands: 4,
        activeBands: 3,
        headcount: 785 + 493 + 696,
        deaths: 27,
        placedHeads: 2400,
      });
      expect(m.produced.heads).toBe(399);
      expect(m.produced.kg).toBeCloseTo(549, 1);
      expect(m.mortalityPct).toBeCloseTo(1.1, 1);
      expect(d.farms.total).toBe(3);
      expect(d.provinces.find((p: any) => p.code === 'G1').metrics).toMatchObject({
        farms: 2,
        headcount: 785 + 493,
        deaths: 22,
        placedHeads: 1500,
      });
      expect(d.provinces.find((p: any) => p.code === 'G2').metrics).toMatchObject({
        farms: 1,
        headcount: 696,
        deaths: 5,
        placedHeads: 900,
      });
    });

    it('effectif national = somme des effectifs des fermes (bandes de chair en cours)', async () => {
      let present = 0;
      for (const f of farms) {
        const bands = (await get(`/farms/${f.id}/batches`, f.token).expect(200)).body as any[];
        present += bands
          .filter((b) => b.type === 'CHAIR' && b.status !== 'CLOTURE')
          .reduce((s, b) => s + b.quantityAlive, 0);
      }
      expect(present).toBe(1974);
      const d = (await get(`/pilotage/dashboard?${period()}`, agentToken).expect(200)).body;
      expect(d.totals.metrics.headcount).toBe(present);
      // The layer band of F1 is in the farm's own dashboard, not in the programme.
      expect((await get(`/farms/${farms[0].id}/dashboard`, farms[0].token).expect(200)).body.liveStock).toBe(785 + 297);
    });

    it('exports par ferme et par bande : mêmes totaux que le tableau de bord', async () => {
      const farmRows = csvRows(
        (await get(`/pilotage/exports/farms.csv?${period()}`, agentToken).expect(200)).text,
      );
      expect(farmRows).toHaveLength(3);
      const bandRows = csvRows(
        (await get(`/pilotage/exports/bandes.csv?${period()}`, agentToken).expect(200)).text,
      );
      expect(bandRows).toHaveLength(4);
      const sum = (key: string) => bandRows.reduce((s, r) => s + Number(r[key]), 0);
      expect(sum('Mis en place')).toBe(2400);
      expect(sum('Présents')).toBe(1974);
      expect(sum('Morts cumulés')).toBe(27);
      expect(sum('Sortis vivants cumulés')).toBe(399);
    });

    it('DGE : le national est la somme de ses provinces, pour chaque indicateur additif', async () => {
      const dge = await institution('DGE');
      const d = (await get(`/pilotage/dashboard?${period()}`, dge.token).expect(200)).body;
      expect(d.totals.suppressed).toBe(false);
      const total = d.totals.metrics;
      const visible = d.provinces.filter((p: any) => !p.suppressed);
      expect(visible.length).toBeGreaterThanOrEqual(2);
      for (const key of ['farms', 'bands', 'activeBands', 'headcount', 'deaths', 'placedHeads', 'bandsOpened']) {
        expect(visible.reduce((s: number, p: any) => s + p.metrics[key], 0)).toBe(total[key]);
      }
      expect(visible.reduce((s: number, p: any) => s + p.metrics.produced.heads, 0)).toBe(total.produced.heads);
      expect(d.farms.total).toBeGreaterThanOrEqual(3);
      expect(total.headcount).toBeGreaterThanOrEqual(1974);
      expect(total.deaths).toBeGreaterThanOrEqual(27);
    });
  });
});

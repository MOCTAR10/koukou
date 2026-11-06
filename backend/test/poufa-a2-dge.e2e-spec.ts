// POUFA lot A2 dge: the programme synthesis gains the SYSCOHADA books, the
// Market activity, and the completeness and volumes produced, computed with
// the `FORMULE_*` in force like the steering's aggregates (CDC §7.3).
process.env.INSTITUTION_OTP = 'off';

import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

interface Row {
  farmId?: string;
  salesFcfa: number | null;
  marginFcfa: number | null;
  accountingChargesFcfa: number | null;
  accountingProductsFcfa: number | null;
  accountingResultFcfa: number | null;
  treasuryFcfa: number | null;
  receivablesFcfa: number | null;
  marketRequests: number | null;
  marketAccepted: number | null;
  marketDelivered: number | null;
  marketSalesFcfa: number | null;
  marketBirds: number | null;
  marketCarcasses: number | null;
  completenessPct: number | null;
  producedHeads: number | null;
  producedKg: number | null;
}

describe('POUFA lot A2 dge — synthèse : comptabilité, Market, complétude et volumes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let buyerToken: string;
  const tokens: Record<string, string> = {};

  const digits = String(Date.now()).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');
  const from = day(-10);
  const to = day(0);
  const period = `from=${from}&to=${to}`;

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  async function institution(
    profileCode: string,
    scope: { farmIds?: string[] } = {},
  ): Promise<string> {
    const p = uniquePhone();
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Lot A2 ${profileCode} ${digits}`, phone: p, profileCode, ...scope },
      adminToken,
    ).expect(201);
    return login(server, p, res.body.loginCode as string);
  }

  const synthesis = async (token: string) =>
    (await get(`/programme/economie/synthese?${period}`, token).expect(200))
      .body as {
      columns: Record<string, boolean>;
      farms: Row[];
      total: Row;
    };
  const rowOf = async (token: string) =>
    (await synthesis(token)).farms.find((f) => f.farmId === farmId)!;

  const setFormula = (key: string, value: string, reason: string) =>
    post(
      `/programme/parameters/${key}`,
      { value, reason: `${reason} ${digits}` },
      adminToken,
    ).expect(201);

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

    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Synthese ${tag}`,
      // Market listings are only shown for OPERATIONNELLE farms.
      extra: { statusCode: 'OPERATIONNELLE' },
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    await ds.getRepository(Farm).update({ id: farmId }, { isVerified: true });
    await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 50000 }, ownerToken).expect(201);

    // A programme band with a chick price (a class 6 expense), two daily
    // entries out of the elapsed days, then a weighed live sale.
    const band = await post(
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande synthese ${digits}`,
        integrationDate: day(-6),
        quantityAtStart: 300,
        type: 'CHAIR',
        chickUnitPriceFcfa: 400,
      },
      ownerToken,
    ).expect(201);
    const bandId = band.body.id as string;
    for (const d of [-5, -3]) {
      await post(
        `/farms/${farmId}/batches/${bandId}/daily-entries`,
        { entryDate: day(d), deaths: 1, feedQuantity: 20, feedUnit: 'KG' },
        ownerToken,
      ).expect(201);
    }
    await post(
      `/farms/${farmId}/bandes/${bandId}/sorties`,
      {
        sortieDate: day(-1),
        count: 20,
        weightKg: 44,
        reasonCode: 'VENTE_VIF',
        recipientName: 'Marché de Nkembo',
        unitPriceFcfa: 2500,
      },
      ownerToken,
    ).expect(201);

    // A Market request, accepted and delivered.
    const listing = await post(
      `/farms/${farmId}/market/listings`,
      {
        kind: 'PRE',
        product: 'BIRDS',
        batchId: bandId,
        unitPriceFcfa: 3000,
        quantityPublished: 50,
        readyDate: day(14),
      },
      ownerToken,
    ).expect(201);
    await post(`/farms/${farmId}/market/listings/${listing.body.id}/publish`, {}, ownerToken).expect(201);
    buyerToken = (await registerBuyer(server, { fullName: `Acheteur ${tag}` })).token;
    const ask = await post(
      '/market/orders',
      { listingId: listing.body.id, quantity: 10, fulfilment: 'PICKUP' },
      buyerToken,
    ).expect(201);
    const accepted = await post(`/farms/${farmId}/market/orders/${ask.body.id}/accept`, {}, ownerToken).expect(201);
    await post(
      `/farms/${farmId}/orders/${accepted.body.orderId}/livrer`,
      { payment: { amountFcfa: 30000 } },
      ownerToken,
    ).expect(201);

    tokens.DGE = await institution('DGE');
    // One farm in scope, programme reads only: the synthesis total is the
    // farm, and the steering dashboard of the same scope must agree with it.
    const profile = `SYNT${digits}`;
    await post(
      '/programme/access/profiles',
      {
        code: profile,
        label: `Synthèse ${profile}`,
        scopeKind: 'FARMS',
        matrix: {
          REGISTRE: ['CONSULTER'],
          TECHNIQUE: ['CONSULTER'],
          ECONOMIQUE: ['CONSULTER'],
          PILOTAGE: ['CONSULTER'],
        },
      },
      adminToken,
    ).expect(201);
    tokens.ONE = await institution(profile, { farmIds: [farmId] });
  }, 240_000);

  afterAll(async () => {
    await app.close();
  });

  it('gives the DGE the SYSCOHADA, Market and production columns', async () => {
    const s = await synthesis(tokens.DGE);
    expect(s.columns).toMatchObject({ accounting: true, market: true, production: true });
    const row = s.farms.find((f) => f.farmId === farmId)!;
    expect(row).toMatchObject({
      marketRequests: 1,
      marketAccepted: 1,
      marketDelivered: 1,
      marketSalesFcfa: 30000,
      marketBirds: 10,
      marketCarcasses: 0,
    });
    // The books are the farm's own compte de résultat for the period.
    const cr = await get(
      `/farms/${farmId}/accounting/compte-resultat?${period}`,
      ownerToken,
    ).expect(200);
    expect(row.accountingChargesFcfa).toBe(cr.body.totalCharges);
    expect(row.accountingProductsFcfa).toBe(cr.body.totalProduits);
    expect(row.accountingResultFcfa).toBe(cr.body.resultatFcfa);
    expect(row.accountingChargesFcfa).toBeGreaterThanOrEqual(300 * 400);
    expect(typeof row.treasuryFcfa).toBe('number');
    expect(typeof row.receivablesFcfa).toBe('number');
    // At least the 20 live birds of the weighed sortie (plus the Market ones).
    expect(row.producedHeads).toBeGreaterThanOrEqual(20);
    expect(row.producedKg).toBeGreaterThanOrEqual(44);
    expect(row.completenessPct).toBeGreaterThan(0);
    expect(row.completenessPct).toBeLessThan(100);

    const csv = await get(`/programme/economie/synthese/export?format=csv&${period}`, tokens.DGE).expect(200);
    for (const header of [
      'Résultat SYSCOHADA (FCFA)',
      'Ventes Market livrées (FCFA)',
      'Complétude des saisies (%)',
      'Volumes produits (kg vif)',
    ]) {
      expect(csv.text).toContain(header);
    }
  });

  it('nulls the groups a profile is not granted, agrees with the steering', async () => {
    const s = await synthesis(tokens.ONE);
    expect(s.columns).toMatchObject({
      sales: true,
      accounting: false,
      market: false,
      production: true,
    });
    expect(s.farms.map((f) => f.farmId)).toEqual([farmId]);
    expect(s.total.accountingResultFcfa).toBeNull();
    expect(s.total.marketSalesFcfa).toBeNull();
    const csv = await get(`/programme/economie/synthese/export?format=csv&${period}`, tokens.ONE).expect(200);
    expect(csv.text).not.toContain('Résultat SYSCOHADA');

    const d = await get(`/pilotage/dashboard?${period}`, tokens.ONE).expect(200);
    const m = d.body.totals.metrics;
    expect(s.total.completenessPct).toBe(m.completeness.pct);
    expect(s.total.producedHeads).toBe(m.produced.heads);
    expect(s.total.producedKg).toBe(m.produced.kg);
  });

  describe('formulas in force (CDC §7.3)', () => {
    afterAll(async () => {
      await setFormula('FORMULE_COMPLETUDE_PCT', 'jours_saisis / jours_ecoules * 100', 'Retour à la formule proposée');
      await setFormula('FORMULE_VOLUME_PRODUIT_KG', 'poids_sortis_periode_kg', 'Retour à la formule proposée');
      await setFormula('FORMULE_MARGE_FCFA', 'ca_fcfa - charges_fcfa', 'Retour à la formule proposée');
    });

    it('follows a changed completeness, volume and margin formula, everywhere', async () => {
      const before = await rowOf(tokens.ONE);
      await setFormula('FORMULE_COMPLETUDE_PCT', 'jours_saisis / jours_ecoules * 10', 'Essai lot A2');
      await setFormula('FORMULE_VOLUME_PRODUIT_KG', 'poids_sortis_periode_kg * 0.5', 'Essai lot A2');
      await setFormula('FORMULE_MARGE_FCFA', 'ca_fcfa - charges_fcfa - 1000', 'Essai lot A2');
      const after = await rowOf(tokens.ONE);
      expect(after.completenessPct).toBeCloseTo(before.completenessPct! / 10, 1);
      expect(Math.abs(after.producedKg! - before.producedKg! / 2)).toBeLessThanOrEqual(0.06);
      expect(after.marginFcfa).toBe(before.marginFcfa! - 1000);

      const d = await get(`/pilotage/dashboard?${period}`, tokens.ONE).expect(200);
      expect(d.body.totals.metrics.completeness.pct).toBe(after.completenessPct);
      expect(d.body.totals.metrics.produced.kg).toBe(after.producedKg);
      expect(d.body.perimeter.completenessFormula.expression).toContain('* 10');
      expect(d.body.perimeter.producedFormulas.kg.parameterKey).toBe('FORMULE_VOLUME_PRODUIT_KG');

      // A formula on a variable the engine does not know is refused.
      await post(
        '/programme/parameters/FORMULE_COMPLETUDE_PCT',
        { value: 'jours_inconnus / jours_ecoules', reason: `Essai invalide ${digits}` },
        adminToken,
      ).expect(400);
    });
  });
});

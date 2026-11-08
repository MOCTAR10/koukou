import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { WeighingsService } from './../src/modules/bandes/weighings.service.js';
import { readXlsx } from './../src/common/utils/spreadsheet.js';
import { todayLocal } from './../src/common/utils/date.utils.js';
import { addDays } from './../src/modules/finance/credit.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
} from './../src/common/utils/event-bus.js';
import { parseCsv } from './../src/modules/programme/farms/csv.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
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

/** Compares two exported cells whatever the decimal mark of the CSV. */
function sameCell(csvCell: string | undefined, xlsxCell: string | undefined) {
  const a = (csvCell ?? '').trim();
  const b = (xlsxCell ?? '').trim();
  if (a === b) return true;
  const na = Number(a.replace(',', '.'));
  const nb = Number(b.replace(',', '.'));
  return a !== '' && b !== '' && Number.isFinite(na) && Number.isFinite(nb)
    ? Math.abs(na - nb) < 0.0051
    : false;
}

/**
 * Second wave of métier scenarios (the first one is `metier-scenarios`):
 * feed supply, slaughter, B2B customers, visits, tasks, payroll, exports and
 * the registry. Every expected value is computed by hand in the comments.
 */
describe('Scénarios métier 2 : intrants, abattage, clients, visites, tâches, RH, exports, registre (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  const memberships: string[] = [];

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);
  const patch = (url: string, body: object, token: string) =>
    request(server).patch(url).set(auth(token)).send(body);
  const del = (url: string, token: string) =>
    request(server).delete(url).set(auth(token));
  /** A binary download (PDF, xlsx): the body comes back as a Buffer. */
  const binary = (url: string, token: string) =>
    request(server)
      .get(url)
      .set(auth(token))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  /** An institutional account on a profile, with its scope. */
  async function institution(
    profileCode: string,
    scope: { provinceCodes?: string[]; farmIds?: string[] } = {},
  ) {
    const phone = uniquePhone('+2417');
    const res = await post(
      '/programme/access/memberships',
      { fullName: `Métier2 ${profileCode} ${tag}`, phone, profileCode, ...scope },
      adminToken,
    ).expect(201);
    memberships.push(res.body.id as string);
    return {
      token: await login(server, phone, res.body.loginCode as string),
      userId: res.body.user.id as string,
    };
  }

  async function cohort(code: string) {
    await post(
      '/programme/lists/COHORTE',
      { code, label: `Cohorte ${code}` },
      adminToken,
    ).expect(201);
    return code;
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
    adminToken = (await createPlatformAdmin(server, ds)).token;
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
    await app.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // 1. Intrants / provende
  // ──────────────────────────────────────────────────────────────────────
  describe('1. Provende : achats, livraison POUFA, consommation, pertes, vente, transfert, valorisation', () => {
    /*
     * Phase DEMARRAGE
     *   Lot A (achat, J-10): 15 sacs de 50 kg à 18 000 = 750 kg, 270 000 F
     *     => 360 F/kg.
     *   Lot C (livraison POUFA confirmée, J-7): 10 sacs, valeur 15 000/sac,
     *     subvention 70 % => exploitant 4 500/sac = 45 000 F pour 500 kg
     *     => 90 F/kg.
     *   Consommation (premier entré, premier sorti : lot A) 6 jours × 100 kg
     *     (J-6 … J-1) = 600 kg.
     *   Perte : 2 sacs humides sur A = 100 kg. Vente caisse : 1 sac de A = 50 kg.
     *   => A : 750 − 600 − 100 − 50 = 0 kg.
     *   Transfert boutique : 5 sacs de C = 250 kg => C : 500 − 250 = 250 kg.
     * Phase CROISSANCE
     *   Lot B (achat, J-5) : 10 sacs à 17 000 = 500 kg, 170 000 F (340 F/kg).
     * Stock : DEMARRAGE 250 kg, CROISSANCE 500 kg => 750 kg dans la ferme.
     * Autonomie DEMARRAGE = 250 / 100 (moyenne des jours saisis) = 2,5 j
     *   < 3 j (seuil critique) => alerte ROUGE, réappro suggéré
     *   (7 − 2,5) × 100 = 450 kg = 9 sacs.
     * Valeur du stock : C 250 × 90 = 22 500 ; B 170 000 ; A 0 => 192 500.
     * Stock valorisé au J-4 (bilan arrêté à cette date) :
     *   A 270 000 × (750 − 300) / 750 = 162 000 ; C 45 000 (le transfert est
     *   postérieur) ; B 170 000 => 377 000. Avant J-10 : 0.
     */
    let token: string;
    let farmId: string;
    let farmCode: string;
    let lotA: string;
    let lotB: string;
    let lotC: string;
    let deliveryId: string;
    let boutiqueId: string;

    const feedStock = async () =>
      (await get(`/farms/${farmId}/feed-stock`, token).expect(200)).body;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Provende ${tag}`,
        provinceCode: 'G1',
      });
      farmId = farm.farmId;
      farmCode = farm.farmCode;
      token = farm.ownerToken;
      await post(
        `/farms/${farmId}/caisse/open`,
        { openingBalanceFcfa: 50_000 },
        token,
      ).expect(201);
      const band = await post(
        `/farms/${farmId}/batches`,
        {
          batchName: `Provende ${tag}`,
          type: 'CHAIR',
          integrationDate: day(-10),
          quantityAtStart: 500,
        },
        token,
      ).expect(201);
      const batchId = band.body.id as string;
      boutiqueId = (
        await post(
          `/farms/${farmId}/points-of-sale`,
          { kind: 'BOUTIQUE', name: 'Boutique provende', city: 'Libreville' },
          token,
        ).expect(201)
      ).body.id;

      const buy = (over: object) =>
        post(
          `/farms/${farmId}/inputs`,
          {
            kind: 'ALIMENT',
            supplier: 'CEAG',
            bagSizeKg: 50,
            ...over,
          },
          token,
        ).expect(201);
      lotA = (
        await buy({
          foodType: 'DEMARRAGE',
          productName: 'Démarrage A',
          supplierLotNumber: `A-${digits}`,
          numberOfBags: 15,
          unitPriceFcfa: 18_000,
          receivedDate: day(-10),
        })
      ).body.id;
      lotB = (
        await buy({
          foodType: 'CROISSANCE',
          productName: 'Croissance B',
          supplierLotNumber: `B-${digits}`,
          numberOfBags: 10,
          unitPriceFcfa: 17_000,
          receivedDate: day(-5),
        })
      ).body.id;

      // The State delivers 10 bags (value 15 000, 70 % subsidized); the farm
      // confirms the full quantity.
      const delivery = await post(
        '/programme/input-deliveries',
        {
          farmId,
          source: 'ETAT_SMAG',
          shippedAt: day(-8),
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
          ],
        },
        adminToken,
      ).expect(201);
      deliveryId = delivery.body.id;
      // A second delivery is announced then cancelled: no stock.
      const ghost = await post(
        '/programme/input-deliveries',
        {
          farmId,
          source: 'ETAT_SMAG',
          shippedAt: day(-8),
          lines: [
            {
              intrantCode: 'ALIMENT_DEMARRAGE',
              unitCode: 'SAC',
              quantity: 99,
              bagSizeKg: 50,
              feedPhase: 'DEMARRAGE',
            },
          ],
        },
        adminToken,
      ).expect(201);
      await post(
        `/programme/input-deliveries/${ghost.body.id}/cancel`,
        { reason: 'Erreur de saisie' },
        adminToken,
      ).expect(201);
      const confirmed = await post(
        `/farms/${farmId}/input-deliveries/${deliveryId}/confirm`,
        { receivedDate: day(-7) },
        token,
      ).expect(201);
      lotC = confirmed.body.lines[0].inputLotId;

      for (let o = 6; o >= 1; o--) {
        await post(
          `/farms/${farmId}/batches/${batchId}/daily-entries`,
          {
            entryDate: day(-o),
            feedQuantity: 100,
            feedUnit: 'KG',
            feedType: 'DEMARRAGE',
          },
          token,
        ).expect(201);
      }
      await post(
        `/farms/${farmId}/feed-stock/losses`,
        { inputLotId: lotA, quantity: 2, unit: 'SAC', reason: 'HUMIDITE', occurredAt: day(-3) },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/sales`,
        {
          items: [
            {
              productType: 'PROVENDE',
              quantity: 1,
              unit: 'SAC',
              unitPriceFcfa: 22_000,
              inputLotId: lotA,
            },
          ],
          payments: [{ method: 'CASH', amountFcfa: 22_000 }],
        },
        token,
      ).expect(201);
      await get(`/farms/${farmId}/points-of-sale`, token).expect(200); // creates the FERME point
      await post(
        `/farms/${farmId}/stock-transfers`,
        {
          productType: 'PROVENDE',
          inputLotId: lotC,
          pointOfSaleId: boutiqueId,
          quantity: 5,
          unit: 'SAC',
        },
        token,
      ).expect(201);
    }, 300_000);

    it('achats : chaque réception crée sa charge 6011 (720 000 − subvention) et son lot', async () => {
      expect(deliveryId).toBeTruthy();
      const lots = (await get(`/farms/${farmId}/inputs`, token).expect(200)).body;
      const q = (id: string) => lots.find((l: any) => l.id === id);
      expect(q(lotB).quantity).toBe(500);
      expect(q(lotC)).toMatchObject({ feedPhase: 'DEMARRAGE', supplier: 'État / SMAG' });
      const expenses = (await get(`/farms/${farmId}/expenses`, token).expect(200)).body;
      const list = (expenses.items ?? expenses) as any[];
      const feed = list.filter((e) => e.category === 'ALIMENTS');
      // 270 000 (A) + 170 000 (B) + 45 000 (C, after subsidy).
      expect(feed.reduce((s, e) => s + e.amountFcfa, 0)).toBe(485_000);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.charges.find((c: any) => c.code === '6011').soldeFcfa).toBe(485_000);
    });

    it('stock par phase = entrées − consommation − pertes − ventes − transferts', async () => {
      const stock = await feedStock();
      const demarrage = stock.byType.find((t: any) => t.feedPhase === 'DEMARRAGE');
      // Received is net of the 250 kg transferred to the shop (lot quantity).
      expect(demarrage).toMatchObject({
        receivedKg: 1000,
        usedKg: 600,
        lostKg: 100,
        soldKg: 50,
        availableKg: 250,
        autonomyDays: 2.5,
        status: 'ROUGE',
      });
      // Independent ledger: 750 + 500 bought/received, minus every outflow.
      expect(750 + 500 - 250 - 600 - 100 - 50).toBe(demarrage.availableKg);
      const croissance = stock.byType.find((t: any) => t.feedPhase === 'CROISSANCE');
      expect(croissance).toMatchObject({ receivedKg: 500, availableKg: 500, autonomyDays: null });
      const byLot = (id: string) => stock.lots.find((l: any) => l.id === id);
      expect(byLot(lotA)).toMatchObject({ usedKg: 600, lostKg: 100, soldKg: 50, availableKg: 0 });
      expect(byLot(lotC)).toMatchObject({ receivedKg: 250, availableKg: 250 });
      expect(byLot(lotB).availableKg).toBe(500);
      // The per-lot figures add up to the per-phase ones.
      const sum = (k: string) =>
        stock.lots
          .filter((l: any) => l.id !== lotB)
          .reduce((s: number, l: any) => s + l[k], 0);
      expect(sum('availableKg')).toBe(250);
    });

    it('alerte autonomie : ROUGE sous 3 jours, réapprovisionnement 450 kg (9 sacs)', async () => {
      await feedStock();
      const alerts = (await get(`/farms/${farmId}/alerts`, token).expect(200)).body as any[];
      const alert = alerts.find((a) => a.kind === 'ALIMENT' && a.status === 'ACTIVE');
      expect(alert.level).toBe('ROUGE');
      expect(alert.message).toContain('Stock de provende critique');
      expect(alert.recommendation).toContain('450 kg');
      expect(alert.recommendation).toContain('9 sacs');
    });

    it('journal des mouvements : consommations, perte et vente valorisées au prix du lot', async () => {
      const moves = (await get(`/farms/${farmId}/feed-stock/movements`, token).expect(200)).body as any[];
      const of = (type: string) => moves.filter((m) => m.type === type);
      expect(of('CONSOMMATION').reduce((s, m) => s + m.quantityKg, 0)).toBe(600);
      expect(of('CONSOMMATION').reduce((s, m) => s + m.valueFcfa, 0)).toBe(600 * 360);
      expect(of('PERTE')).toHaveLength(1);
      expect(of('PERTE')[0]).toMatchObject({ quantityKg: 100, valueFcfa: 36_000, reason: 'HUMIDITE' });
      expect(of('VENTE')[0]).toMatchObject({ quantityKg: 50, valueFcfa: 18_000 });
    });

    it('livraison POUFA : stock déclaratif = stock physique du lot livré, aide de l’État hors charges', async () => {
      const decl = (await get(`/farms/${farmId}/declarative-stock`, token).expect(200)).body;
      const row = decl.rows.find((r: any) => r.key === 'ALIMENT_DEMARRAGE');
      // The shop transfer counts as an outflow of the delivered lot.
      expect(row).toMatchObject({
        shipped: 500,
        received: 500,
        consumed: 0,
        sold: 250,
        stock: 250,
        physicalStock: 250,
        negative: false,
      });
      const stock = await feedStock();
      expect(row.physicalStock).toBe(stock.lots.find((l: any) => l.id === lotC).availableKg);
      const view = (await get(`/farms/${farmId}/input-deliveries/${deliveryId}`, token).expect(200)).body;
      expect(view.totals).toMatchObject({ farmerCostFcfa: 45_000, subsidyFcfa: 105_000 });
      expect(view.code).toMatch(new RegExp(`^${farmCode}-L\\d{2,}$`));
    });

    it('valorisation du stock (comptable) = quantités restantes × prix du lot', async () => {
      const value = (await get(`/farms/${farmId}/accounting/stock`, token).expect(200)).body;
      expect(value.totalValueFcfa).toBe(22_500 + 170_000);
      const bilan = (await get(`/farms/${farmId}/accounting/bilan`, token).expect(200)).body;
      expect(bilan.variationStockFcfa).toBe(192_500);
    });

    it('stock à une date passée (bilan arrêté) : reçus, consommations et pertes antérieurs seulement', async () => {
      const past = (await get(`/farms/${farmId}/accounting/bilan?to=${day(-4)}`, token).expect(200)).body;
      expect(past.variationStockFcfa).toBe(377_000);
      const before = (await get(`/farms/${farmId}/accounting/bilan?to=${day(-11)}`, token).expect(200)).body;
      expect(before.variationStockFcfa).toBe(0);
    });

    it('programme : la synthèse du DGE lit le même stock que la ferme', async () => {
      const s = (await get('/programme/economie/synthese', adminToken).expect(200)).body;
      const row = s.farms.find((f: any) => f.farmId === farmId);
      expect(row.feedStockKg).toBe(750);
      expect(row.code).toBe(farmCode);
    });

    it('refus : perte au-delà du stock du lot', async () => {
      const res = await post(
        `/farms/${farmId}/feed-stock/losses`,
        { inputLotId: lotA, quantity: 1, unit: 'SAC', reason: 'RONGEURS' },
        token,
      ).expect(400);
      expect(String(res.body.message)).toMatch(/supérieure au stock/);
    });

    it.todo(
      'CMUP : le stock est valorisé au coût du lot (premier entré, premier sorti), jamais au coût moyen pondéré. Deux lots de la même phase à 360 F/kg et 90 F/kg donnent 8 F/kg de consommation selon le lot tiré ; à valider avec la DGE (CMUP ou FIFO imposé ?)',
    );
    it.todo(
      'journal des mouvements (feed-stock/movements) : les transferts vers boutique (250 kg ici) n’y figurent pas, alors qu’ils sortent le stock ; reçu − mouvements ≠ disponible sans eux',
    );
    it.todo(
      'rentabilité d’une bande : la provende prise dans un lot de ferme (sans batchId) et consommée par la bande n’apparaît pas dans ses charges (600 kg consommés ici = 216 000 F absents du compte de résultat de la bande) ; seule l’imputation à l’achat existe',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 2. Abattage
  // ──────────────────────────────────────────────────────────────────────
  describe('2. Abattage : ordres interne/externe, rendement carcasse, stock de carcasses, réservations', () => {
    /*
     * Bande de 200 poussins ouverte aujourd'hui, 10 morts => 190 vivants.
     * O1 interne abattu : 100 oiseaux, 220 kg vifs, carcasses 154 kg
     *   => rendement 154 / 220 = 70,00 % ; vivants 90 ; pool de carcasses 100.
     * O2 externe vivant : 40 oiseaux, 100 kg vifs, carcasses 72 kg au
     *   traitement => 72,00 % ; vivants 50 ; pas de pool.
     * Commande client de 45 poulets vivants (4 000 F) => 45 réservés :
     *   O3 de 10 oiseaux refusé (reste 5), de 5 accepté ; O4 de 1 refusé.
     *   O3 traité => vivants 45 ; la commande est livrée (180 000 F) => 0.
     * 200 = 10 morts + 100 + 40 + 5 + 45.
     * Ventes de carcasses (pool O1) : 60 kg pour 40 carcasses à 2 500 F
     *   = 150 000 ; 10 pièces à 4 000 = 40 000 ; pool 100 − 50 = 50.
     * Chiffre d'affaires de la bande : 190 000 + 180 000 = 370 000.
     */
    let token: string;
    let farmId: string;
    let batchId: string;
    let o1: string;
    let o2: string;
    let o3: string;
    let reservedOrder: string;

    const order = async (id: string) =>
      (await get(`/farms/${farmId}/slaughter-orders/${id}`, token).expect(200)).body;
    const alive = async () =>
      (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body.quantityAlive;
    const slaughter = (body: object) =>
      post(`/farms/${farmId}/slaughter-orders`, {
        batchId,
        plannedDate: day(0),
        ...body,
      }, token);

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Abattage ${tag}`,
      });
      farmId = farm.farmId;
      token = farm.ownerToken;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 0 }, token).expect(201);
      batchId = (
        await post(
          `/farms/${farmId}/batches`,
          {
            batchName: `Abattage ${tag}`,
            type: 'CHAIR',
            integrationDate: day(0),
            quantityAtStart: 200,
          },
          token,
        ).expect(201)
      ).body.id;
      await post(
        `/farms/${farmId}/batches/${batchId}/daily-entries`,
        { entryDate: day(0), deaths: 10 },
        token,
      ).expect(201);
    }, 120_000);

    it('ordre interne abattu : rendement 70 %, effectif décrémenté au traitement, pool de carcasses', async () => {
      const created = await slaughter({
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        birdCount: 100,
        totalWeightKg: 220,
        carcassWeightKg: 154,
      }).expect(201);
      o1 = created.body.id;
      expect(created.body).toMatchObject({ status: 'DRAFT', rendementPercent: 70 });
      expect(created.body.referenceNumber).toBeTruthy();
      // The carcass cannot weigh more than the live birds.
      const bad = await patch(
        `/farms/${farmId}/slaughter-orders/${o1}`,
        { carcassWeightKg: 300 },
        token,
      ).expect(400);
      expect(String(bad.body.message)).toMatch(/dépasse le poids vif/);
      expect(await alive()).toBe(190);
      const sent = await post(`/farms/${farmId}/slaughter-orders/${o1}/send`, {}, token).expect(201);
      expect(sent.body.status).toBe('SENT');
      expect(sent.body.internalBatchCode).toBeTruthy();
      // Sent birds still count as alive until the processing.
      expect(await alive()).toBe(190);
      const done = await post(`/farms/${farmId}/slaughter-orders/${o1}/process`, {}, token).expect(201);
      expect(done.body).toMatchObject({ status: 'PROCESSED', carcassesAvailable: 100, rendementPercent: 70 });
      expect(await alive()).toBe(90);
    });

    it('ordre externe vivant : le poids carcasse reçu à l’abattoir fixe le rendement (72 %), pas de pool', async () => {
      const created = await slaughter({
        slaughterType: 'VIVANT',
        destination: 'EXTERNE',
        birdCount: 40,
        totalWeightKg: 100,
      }).expect(201);
      o2 = created.body.id;
      expect(created.body.rendementPercent).toBeNull();
      await post(`/farms/${farmId}/slaughter-orders/${o2}/send`, { abattoirLotCode: `ABT-${digits}` }, token).expect(201);
      const done = await post(
        `/farms/${farmId}/slaughter-orders/${o2}/process`,
        { carcassWeightKg: 72 },
        token,
      ).expect(201);
      expect(done.body).toMatchObject({ status: 'PROCESSED', rendementPercent: 72, abattoirLotCode: `ABT-${digits}` });
      expect(done.body.carcassesAvailable).toBe(0);
      expect(await alive()).toBe(50);
      // A processed order is frozen (only the abattoir lot code stays editable).
      await patch(`/farms/${farmId}/slaughter-orders/${o2}`, { birdCount: 41 }, token).expect(400);
    });

    it('les carcasses d’un ordre vivant ne se vendent pas ; celles de l’ordre abattu oui, au kilo et à la pièce', async () => {
      const sellCarcass = (item: object, source: string, expected: number) =>
        post(
          `/farms/${farmId}/sales`,
          {
            items: [{ batchId, sourceSlaughterOrderId: source, ...item }],
            payments: [{ method: 'CASH', amountFcfa: expected }],
          },
          token,
        );
      const live = await sellCarcass(
        { productType: 'ABATTU_PIECE', quantity: 1, unit: 'PIECE', unitPriceFcfa: 4000 },
        o2,
        4000,
      ).expect(400);
      expect(String(live.body.message)).toMatch(/vivant/);
      await sellCarcass(
        { productType: 'ABATTU_KG', quantity: 60, unit: 'KG', pieceCount: 40, unitPriceFcfa: 2500 },
        o1,
        150_000,
      ).expect(201);
      expect((await order(o1)).carcassesAvailable).toBe(60);
      await sellCarcass(
        { productType: 'ABATTU_PIECE', quantity: 10, unit: 'PIECE', unitPriceFcfa: 4000 },
        o1,
        40_000,
      ).expect(201);
      expect((await order(o1)).carcassesAvailable).toBe(50);
      const over = await sellCarcass(
        { productType: 'ABATTU_PIECE', quantity: 51, unit: 'PIECE', unitPriceFcfa: 4000 },
        o1,
        204_000,
      ).expect(400);
      expect(String(over.body.message)).toMatch(/Carcasses insuffisantes/);
      // Carcass sales never touch the live flock.
      expect(await alive()).toBe(50);
    });

    it('réservations : les poulets promis à une commande ne peuvent pas partir à l’abattoir', async () => {
      const res = await post(
        `/farms/${farmId}/orders`,
        {
          canal: 'FERME',
          customerName: 'Restaurant réservé',
          customerPhone: `+24177${digits}`,
          items: [
            { productType: 'POULET_PIECE', quantity: 45, unit: 'PIECE', unitPriceFcfa: 4000, batchId },
          ],
        },
        token,
      ).expect(201);
      reservedOrder = res.body.id;
      // Reserved, not delivered: the flock is unchanged.
      expect(await alive()).toBe(50);
      o3 = (await slaughter({ slaughterType: 'VIVANT', destination: 'EXTERNE', birdCount: 10 }).expect(201)).body.id;
      const refused = await post(`/farms/${farmId}/slaughter-orders/${o3}/send`, {}, token).expect(400);
      expect(String(refused.body.message)).toMatch(/réservés par des commandes/);
      await patch(`/farms/${farmId}/slaughter-orders/${o3}`, { birdCount: 5 }, token).expect(200);
      await post(`/farms/${farmId}/slaughter-orders/${o3}/send`, {}, token).expect(201);
      // 50 alive − 45 reserved − 5 at the abattoir = 0 free.
      const o4 = (await slaughter({ slaughterType: 'VIVANT', destination: 'EXTERNE', birdCount: 1 }).expect(201)).body.id;
      await post(`/farms/${farmId}/slaughter-orders/${o4}/send`, {}, token).expect(400);
      await post(`/farms/${farmId}/slaughter-orders/${o3}/process`, {}, token).expect(201);
      expect(await alive()).toBe(45);
    });

    it('livraison de la commande : 45 poulets sortent, caisse = ventes, la bande est vidée', async () => {
      await post(
        `/farms/${farmId}/orders/${reservedOrder}/livrer`,
        { payment: { amountFcfa: 180_000 } },
        token,
      ).expect(201);
      expect(await alive()).toBe(0);
      const batch = (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body;
      // 10 deaths + 100 + 40 + 5 slaughtered + 45 delivered = 200 placed.
      expect(batch.quantityAtStart - 10 - 100 - 40 - 5 - 45).toBe(batch.quantityAlive);
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(370_000);
    });

    it('chiffre d’affaires de la bande = ventes de carcasses + commande, identique au compte de résultat', async () => {
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(370_000);
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.sales.totalFcfa).toBe(370_000);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.totalProduits).toBe(370_000);
      const sales = (await get(`/farms/${farmId}/sales`, token).expect(200)).body;
      const list = (sales.items ?? sales) as any[];
      expect(list.reduce((s, x) => s + x.totalAmountFcfa, 0)).toBe(370_000);
    });

    it('documents : bordereau d’abattage et passeport sanitaire en PDF', async () => {
      const slip = await binary(`/farms/${farmId}/slaughter-orders/${o1}/bordereau`, token).expect(200);
      expect(slip.headers['content-type']).toContain('application/pdf');
      expect((slip.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const passport = await binary(`/farms/${farmId}/batches/${batchId}/passeport`, token).expect(200);
      expect((passport.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
    });

    it.todo(
      'rentabilité du lot : kgSold ne compte que POULET_KG et birdsSold que POULET_PIECE/POULET_KG ; les ventes ABATTU_KG / ABATTU_PIECE (60 kg, 50 carcasses ici) ne sont comptées ni en kilos ni en têtes alors que leur chiffre d’affaires l’est (coût au kilo null, 45 têtes au lieu de 95) ; à valider : kilos vifs et kilos carcasse dans un même coût au kilo ?',
    );
    it.todo(
      'le pool de carcasses suit des têtes, pas des kilos : le poids carcasse de l’ordre (154 kg) n’est pas décompté des ventes au kilo (60 kg), le stock de carcasses en kg n’existe pas',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 3. Clients et commandes B2B
  // ──────────────────────────────────────────────────────────────────────
  describe('3. Clients B2B : commandes, acompte, livraison, solde, encaissement', () => {
    /*
     * 500 poussins. Client 1 (restaurant) :
     *   C1 : 20 poulets × 4 000 = 80 000, acompte 30 000 à la commande ;
     *   C2 : 10 poulets × 4 000 = 40 000, sans acompte.
     *   Avant livraison rien n'est dû (le chiffre d'affaires est reconnu à la
     *   livraison) : facturé 0, encaissé 0.
     *   C1 livrée avec 20 000 encaissés : facturé 80 000, payé 50 000.
     *   C2 livrée sans encaissement : facturé 120 000, payé 50 000, dû 70 000.
     *   Encaissement de 45 000 sur la fiche : la vente la plus ancienne
     *   d'abord (C1 : 30 000 → soldée, puis 15 000 sur C2) => payé 95 000,
     *   dû 25 000. Un encaissement de 30 000 dépasse le dû : refusé.
     * Client 2 : C3 10 poulets × 4 000 = 40 000 livrés et payés.
     * Caisse : 30 000 + 20 000 + 45 000 + 40 000 = 135 000.
     * Ventes 160 000, encaissé 135 000, créances 25 000. Poulets : 500 − 40 = 460.
     */
    let token: string;
    let farmId: string;
    let batchId: string;
    let cust1: string;
    let cust2: string;
    const orders: Record<string, any> = {};

    const makeCustomer = async (fullName: string, phone: string) =>
      (await post(`/farms/${farmId}/customers`, { fullName, phone }, token).expect(201)).body.id as string;
    const newOrder = (customerId: string, pieces: number, deposit?: number) =>
      post(
        `/farms/${farmId}/orders`,
        {
          canal: 'FERME',
          customerId,
          items: [
            { productType: 'POULET_PIECE', quantity: pieces, unit: 'PIECE', unitPriceFcfa: 4000, batchId },
          ],
          ...(deposit ? { deposit: { amountFcfa: deposit } } : {}),
        },
        token,
      ).expect(201);
    const balance = async (id: string) =>
      (await get(`/farms/${farmId}/customers/${id}/balance`, token).expect(200)).body;
    const alive = async () =>
      (await get(`/farms/${farmId}/batches/${batchId}`, token).expect(200)).body.quantityAlive;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, { name: `Ferme B2B ${tag}` });
      farmId = farm.farmId;
      token = farm.ownerToken;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 0 }, token).expect(201);
      batchId = (
        await post(
          `/farms/${farmId}/batches`,
          { batchName: `B2B ${tag}`, type: 'CHAIR', integrationDate: day(-10), quantityAtStart: 500 },
          token,
        ).expect(201)
      ).body.id;
      cust1 = await makeCustomer(`Restaurant Palmier ${tag}`, `+24166${digits}`);
      cust2 = await makeCustomer(`Traiteur Océan ${tag}`, `+24165${digits}`);
      orders.c1 = (await newOrder(cust1, 20, 30_000)).body;
      orders.c2 = (await newOrder(cust1, 10)).body;
      orders.c3 = (await newOrder(cust2, 10)).body;
    }, 120_000);

    it('avant livraison : commande confirmée par l’acompte, rien n’est facturé ni dû, poulets seulement réservés', async () => {
      expect(orders.c1).toMatchObject({ status: 'CONFIRMED', totalAmountFcfa: 80_000, depositFcfa: 30_000 });
      expect(orders.c2).toMatchObject({ status: 'PENDING', totalAmountFcfa: 40_000, depositFcfa: 0 });
      expect(await balance(cust1)).toMatchObject({ totalInvoicedFcfa: 0, paidFcfa: 0, outstandingFcfa: 0 });
      expect(await alive()).toBe(500);
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(30_000);
    });

    it('numérotation : références uniques et horodatées (VTE-/CMD-)', async () => {
      const refs = [orders.c1, orders.c2, orders.c3].map((o) => o.referenceNumber as string);
      expect(new Set(refs).size).toBe(3);
      for (const r of refs) expect(r).toMatch(/^CMD-\d{8}-\d{6}$/);
      const view = (await get(`/farms/${farmId}/orders/${orders.c1.id}`, token).expect(200)).body;
      expect(view.sale.referenceNumber).toMatch(/^VTE-\d{8}-\d{6}$/);
    });

    it('livraisons : facturé = livré, payé = acompte + solde, reste dû = différence', async () => {
      await post(`/farms/${farmId}/orders/${orders.c1.id}/livrer`, { payment: { amountFcfa: 20_000 } }, token).expect(201);
      expect(await balance(cust1)).toMatchObject({ totalInvoicedFcfa: 80_000, paidFcfa: 50_000, outstandingFcfa: 30_000 });
      await post(`/farms/${farmId}/orders/${orders.c2.id}/livrer`, {}, token).expect(201);
      expect(await balance(cust1)).toMatchObject({ totalInvoicedFcfa: 120_000, paidFcfa: 50_000, outstandingFcfa: 70_000 });
      await post(`/farms/${farmId}/orders/${orders.c3.id}/livrer`, { payment: { amountFcfa: 40_000 } }, token).expect(201);
      expect(await balance(cust2)).toMatchObject({ totalInvoicedFcfa: 40_000, paidFcfa: 40_000, outstandingFcfa: 0 });
      expect(await alive()).toBe(460);
      const c1 = (await get(`/farms/${farmId}/orders/${orders.c1.id}`, token).expect(200)).body;
      expect(c1.status).toBe('LIVRE');
      expect(c1.depositFcfa).toBe(50_000);
    });

    it('encaissement sur la fiche client : vente la plus ancienne d’abord, jamais plus que le dû', async () => {
      const paid = await post(`/farms/${farmId}/customers/${cust1}/payments`, { amountFcfa: 45_000 }, token).expect(201);
      expect(paid.body.payments.map((p: any) => p.amountFcfa)).toEqual([30_000, 15_000]);
      expect(paid.body.balance).toMatchObject({ totalInvoicedFcfa: 120_000, paidFcfa: 95_000, outstandingFcfa: 25_000 });
      const over = await post(`/farms/${farmId}/customers/${cust1}/payments`, { amountFcfa: 30_000 }, token).expect(400);
      expect(String(over.body.message)).toMatch(/dépasse le solde dû/);
      const sales = (await get(`/farms/${farmId}/customers/${cust1}/history`, token).expect(200)).body as any[];
      expect(sales.map((s) => s.status).sort()).toEqual(['OUTSTANDING', 'SETTLED']);
    });

    it('relevé client = somme de ses opérations ; synthèse de la ferme = somme des clients', async () => {
      const history = (await get(`/farms/${farmId}/customers/${cust1}/history`, token).expect(200)).body as any[];
      const invoiced = history.reduce((s, x) => s + x.totalAmountFcfa, 0);
      const paid = history.reduce(
        (s, x) =>
          s + x.payments.filter((p: any) => p.status === 'CONFIRMED').reduce((t: number, p: any) => t + p.amountFcfa, 0),
        0,
      );
      const b = await balance(cust1);
      expect(invoiced).toBe(b.totalInvoicedFcfa);
      expect(paid).toBe(b.paidFcfa);
      expect(invoiced - paid).toBe(b.outstandingFcfa);
      const summary = (await get(`/farms/${farmId}/customers/summary`, token).expect(200)).body;
      expect(summary).toMatchObject({
        total: 2,
        debtors: 1,
        totalInvoicedFcfa: 160_000,
        paidFcfa: 135_000,
        totalOutstandingFcfa: 25_000,
      });
      const list = (await get(`/farms/${farmId}/customers`, token).expect(200)).body as any[];
      const sum = (k: string) => list.reduce((s, c) => s + (c.balance?.[k] ?? 0), 0);
      expect(sum('outstandingFcfa')).toBe(summary.totalOutstandingFcfa);
    });

    it('caisse, rentabilité, comptabilité et synthèse du programme donnent les mêmes montants', async () => {
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(135_000);
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.sales.totalFcfa).toBe(160_000);
      expect(overview.collectedFcfa).toBe(135_000);
      expect(overview.outstandingFcfa).toBe(25_000);
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${batchId}`, token).expect(200)).body;
      expect(pnl.revenueFcfa).toBe(160_000);
      expect(pnl.birdsSold).toBe(40);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.totalProduits).toBe(160_000);
      const synth = (await get('/programme/economie/synthese', adminToken).expect(200)).body;
      const row = synth.farms.find((f: any) => f.farmId === farmId);
      expect(row.salesFcfa).toBe(160_000);
      expect(row.collectedFcfa).toBe(135_000);
      expect(row.receivablesFcfa).toBe(25_000);
    });

    it('annuler une commande non livrée rembourse l’acompte et libère les poulets réservés', async () => {
      const o = (await newOrder(cust2, 5, 10_000)).body;
      expect((await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body.expectedBalanceFcfa).toBe(145_000);
      await del(`/farms/${farmId}/orders/${o.id}`, token).expect(200);
      expect((await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body.expectedBalanceFcfa).toBe(135_000);
      expect(await alive()).toBe(460);
      expect((await balance(cust2)).totalInvoicedFcfa).toBe(40_000);
    });

    it.todo(
      'numérotation des factures : VTE-AAAAMMJJ-XXXXXX et CMD-… sont aléatoires (6 chiffres tirés au hasard, 5 essais) ; elles sont uniques mais pas continues ni chronologiques ; à valider avec la DGI / le plan SYSCOHADA si une facture normalisée à numérotation séquentielle est exigée',
    );

    describe('Plafond de crédit et délai de paiement', () => {
      /*
       * Client A : plafond 100 000 F, délai 10 jours.
       *   V1 : 20 poulets × 3 000 = 60 000 à crédit, datée J-15 (Libreville) => dû 60 000, échue depuis J-5.
       *   V2 : 60 000 à crédit => 60 000 + 60 000 = 120 000 > 100 000 : refusée (409).
       *   V3 : 60 000 payés comptant => jamais bloquée.
       *   Commande 50 000 sans acompte => 110 000 : refusée ; avec 20 000 d'acompte => 80 000 : acceptée.
       *   Dépassement : refusé (403) sans le droit, accepté avec « vente:depasser-credit » et tracé au journal.
       * Défaut de ferme (plafond 10 000, délai 5 jours) pour un client B sans réglage propre.
       */
      let ownerToken: string;
      let creditFarm: string;
      let creditBatch: string;
      let custA: string;
      let custB: string;
      let plainAdmin: string;
      let creditAdmin: string;

      const credit = (customerId: string, amount: number, extra: object = {}) =>
        post(
          `/farms/${creditFarm}/sales`,
          {
            customerId,
            items: [
              {
                productType: 'POULET_PIECE',
                quantity: amount / 3000,
                unit: 'PIECE',
                unitPriceFcfa: 3000,
                batchId: creditBatch,
              },
            ],
            ...extra,
          },
          ownerToken,
        );
      const customerView = async (id: string) =>
        ((await get(`/farms/${creditFarm}/customers`, ownerToken).expect(200)).body as any[]).find(
          (c) => c.id === id,
        );
      const overdueAlerts = async () =>
        ((await get(`/farms/${creditFarm}/alerts`, ownerToken).expect(200)).body as any[]).filter(
          (a) => a.kind === 'CREANCE_RETARD' && a.status === 'ACTIVE',
        );
      const member = async (name: string, permissions: string[]) => {
        const phone = uniquePhone();
        await post(
          `/farms/${creditFarm}/eleveurs`,
          { phone, fullName: `${name} ${tag}`, code: 'secret456', role: 'ADMIN', jobTitle: 'Gestionnaire', permissions },
          ownerToken,
        ).expect(201);
        return login(server, phone, 'secret456');
      };

      beforeAll(async () => {
        const farm = await createProgrammeFarm(server, adminToken, { name: `Ferme Credit ${tag}` });
        creditFarm = farm.farmId;
        ownerToken = farm.ownerToken;
        await post(`/farms/${creditFarm}/caisse/open`, { openingBalanceFcfa: 0 }, ownerToken).expect(201);
        creditBatch = (
          await post(
            `/farms/${creditFarm}/batches`,
            { batchName: `Crédit ${tag}`, type: 'CHAIR', integrationDate: day(-40), quantityAtStart: 300 },
            ownerToken,
          ).expect(201)
        ).body.id;
        custA = (
          await post(
            `/farms/${creditFarm}/customers`,
            { fullName: `Client A ${tag}`, phone: `+24166${digits}`, creditLimitFcfa: 100_000, paymentTermDays: 10 },
            ownerToken,
          ).expect(201)
        ).body.id;
        custB = (
          await post(`/farms/${creditFarm}/customers`, { fullName: `Client B ${tag}`, phone: `+24165${digits}` }, ownerToken).expect(201)
        ).body.id;
        plainAdmin = await member('Vendeur', ['vente:creer', 'vente:commande']);
        creditAdmin = await member('Responsable', ['vente:creer', 'vente:commande', 'vente:depasser-credit']);
      }, 120_000);

      it('sous le plafond la vente à crédit passe ; la fiche porte plafond, délai et retard calculés au jour de Libreville', async () => {
        const saleDay = addDays(todayLocal(), -15);
        await credit(custA, 60_000, { saleDate: saleDay }).expect(201);
        const view = await customerView(custA);
        expect(view).toMatchObject({
          creditLimitFcfa: 100_000,
          paymentTermDays: 10,
          effectiveCreditLimitFcfa: 100_000,
          effectivePaymentTermDays: 10,
          outstandingFcfa: 60_000,
          overdueAmount: 60_000,
          oldestOverdueDays: 5,
          overdue: true,
          limitReached: false,
        });
        // The statement shows the due date of the invoice.
        const lines = (await get(`/farms/${creditFarm}/customers/${custA}/history`, ownerToken).expect(200)).body as any[];
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatchObject({ dueDate: addDays(saleDay, 10), remainingFcfa: 60_000, overdue: true });
      });

      it('au-delà du plafond : refus 409 en français avec dû et plafond ; la vente n’est pas enregistrée', async () => {
        const res = await credit(custA, 60_000).expect(409);
        expect(String(res.body.message)).toMatch(/Plafond de crédit dépassé/);
        expect(String(res.body.message)).toMatch(/60\s000 FCFA/);
        expect(String(res.body.message)).toMatch(/100\s000 FCFA/);
        expect(res.body).toMatchObject({
          code: 'PLAFOND_CREDIT',
          outstandingFcfa: 60_000,
          creditLimitFcfa: 100_000,
          requestedFcfa: 60_000,
          overridable: true,
        });
        expect((await customerView(custA)).outstandingFcfa).toBe(60_000);
      });

      it('une vente payée comptant n’est jamais bloquée ; un acompte réduit la part à crédit', async () => {
        await credit(custA, 60_000, { payments: [{ method: 'CASH', amountFcfa: 60_000 }] }).expect(201);
        expect((await customerView(custA)).outstandingFcfa).toBe(60_000);
        // 60 000 on credit with 45 000 paid now: 15 000 unpaid, 75 000 in total.
        await credit(custA, 60_000, { payments: [{ method: 'CASH', amountFcfa: 45_000 }] }).expect(201);
        expect((await customerView(custA)).outstandingFcfa).toBe(75_000);
      });

      it('commande : refusée si la part non couverte par l’acompte dépasse le plafond, acceptée sinon', async () => {
        const order = (deposit?: number, extra: object = {}) =>
          post(
            `/farms/${creditFarm}/orders`,
            {
              canal: 'FERME',
              customerId: custA,
              items: [{ productType: 'POULET_PIECE', quantity: 25, unit: 'PIECE', unitPriceFcfa: 3000, batchId: creditBatch }],
              ...(deposit ? { deposit: { amountFcfa: deposit } } : {}),
              ...extra,
            },
            ownerToken,
          );
        // 75 000 due + 75 000 unpaid = 150 000 > 100 000.
        const refused = await order().expect(409);
        expect(refused.body.code).toBe('PLAFOND_CREDIT');
        // 75 000 + (75 000 - 50 000) = 100 000 = the ceiling: accepted.
        await order(50_000).expect(201);
      });

      it('dépassement : 403 sans le droit, accepté avec « vente:depasser-credit » et tracé au journal', async () => {
        const body = {
          customerId: custA,
          overrideCreditLimit: true,
          items: [{ productType: 'POULET_PIECE', quantity: 10, unit: 'PIECE', unitPriceFcfa: 3000, batchId: creditBatch }],
        };
        // Without the right: the refusal says so (not overridable), the flag is refused.
        const plain = await post(`/farms/${creditFarm}/sales`, { ...body, overrideCreditLimit: false }, plainAdmin).expect(409);
        expect(plain.body.overridable).toBe(false);
        await post(`/farms/${creditFarm}/sales`, body, plainAdmin).expect(403);
        expect((await customerView(custA)).outstandingFcfa).toBe(75_000);

        // With the right granted in the matrix: allowed, 30 000 more on credit.
        await post(`/farms/${creditFarm}/sales`, body, creditAdmin).expect(201);
        expect((await customerView(custA)).outstandingFcfa).toBe(105_000);
        expect((await customerView(custA)).limitReached).toBe(true);

        const journal = (
          await get(`/audit/events?farmId=${creditFarm}&action=SYSTEM&limit=50`, adminToken).expect(200)
        ).body.items as any[];
        const entry = journal.find((e) => e.route === 'CREDIT_LIMIT_OVERRIDE');
        expect(entry).toBeDefined();
        expect(entry.summary).toMatchObject({ outstandingFcfa: 75_000, creditLimitFcfa: 100_000, newUnpaidFcfa: 30_000 });
      });

      it('retard : une seule alerte active (dédupliquée) malgré les relectures, résolue une fois les impayés soldés', async () => {
        // Reads never raise it; a payment leaving the invoice late does (twice: still one alert).
        await get(`/farms/${creditFarm}/customers`, ownerToken).expect(200);
        expect(await overdueAlerts()).toHaveLength(0);
        await post(`/farms/${creditFarm}/customers/${custA}/payments`, { amountFcfa: 5_000 }, ownerToken).expect(201);
        await post(`/farms/${creditFarm}/customers/${custA}/payments`, { amountFcfa: 5_000 }, ownerToken).expect(201);
        const alerts = await overdueAlerts();
        expect(alerts).toHaveLength(1);
        expect(alerts[0].message).toMatch(/1 client en retard/);
        expect(alerts[0].message).toMatch(/5 jours de retard/);

        // The oldest invoices are paid first: everything is settled.
        await post(`/farms/${creditFarm}/customers/${custA}/payments`, { amountFcfa: 95_000 }, ownerToken).expect(201);
        expect(await overdueAlerts()).toHaveLength(0);
        expect(await customerView(custA)).toMatchObject({ overdue: false, overdueAmount: 0, outstandingFcfa: 0 });
      });

      it('défaut de ferme : appliqué au client sans réglage propre ; réservé au droit « reglages:ferme »', async () => {
        await patch(`/farms/${creditFarm}`, { defaultCreditLimitFcfa: 10_000, defaultPaymentTermDays: 5 }, plainAdmin).expect(403);
        await patch(`/farms/${creditFarm}`, { defaultCreditLimitFcfa: 10_000, defaultPaymentTermDays: 5 }, ownerToken).expect(200);
        expect(await customerView(custB)).toMatchObject({
          creditLimitFcfa: null,
          effectiveCreditLimitFcfa: 10_000,
          effectivePaymentTermDays: 5,
        });
        const refused = await credit(custB, 15_000).expect(409);
        expect(refused.body).toMatchObject({ code: 'PLAFOND_CREDIT', creditLimitFcfa: 10_000 });
        await credit(custB, 9_000).expect(201);
        // The customer's own ceiling wins over the farm default; null falls back to it.
        await patch(`/farms/${creditFarm}/customers/${custB}`, { creditLimitFcfa: 500_000 }, ownerToken).expect(200);
        await credit(custB, 15_000).expect(201);
        await patch(`/farms/${creditFarm}/customers/${custB}`, { creditLimitFcfa: null }, ownerToken).expect(200);
        expect((await customerView(custB)).effectiveCreditLimitFcfa).toBe(10_000);
        // Not a negative or fractional ceiling.
        await patch(`/farms/${creditFarm}/customers/${custB}`, { creditLimitFcfa: -5 }, ownerToken).expect(400);
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────
  // 4. Visites et biosécurité
  // ──────────────────────────────────────────────────────────────────────
  describe('4. Visites : score pondéré, classe de la ferme, rappels, agrégats par province', () => {
    /*
     * Grille (poids lus sur la grille de la ferme) : PEDILUVE 3, CLOTURE_ENTREE 2,
     * REGISTRE_VISITEURS 1.
     * Ferme A (G1) : visite J-40 tout conforme = 100 % (A) ; visite J-2
     *   pédiluve non conforme = (2 + 1) / 6 = 50 % (C), prochaine visite J+10.
     *   La classe de la ferme est celle de la DERNIÈRE visite : C.
     * Ferme B (G1) : une visite J-10, tout conforme = 100 % (A), prochaine
     *   visite prévue J-3 : en retard.
     * Ferme C (G2) : jamais contrôlée.
     * Total : 3 fermes, 2 contrôlées, 1 jamais ; A 1, C 1 ; score moyen 75 %.
     */
    const code = `MET4_${digits}`;
    let farmA: string;
    let farmB: string;
    let farmC: string;
    let agent: string;
    let dge: string;
    const visitIds: Record<string, string> = {};
    const weights: Record<string, number> = {};
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
    const visit = (farmId: string, body: object) =>
      post(`/farms/${farmId}/visits`, { type: 'BIOSECURITE', ...body }, agent);

    beforeAll(async () => {
      await cohort(code);
      const mk = async (name: string, provinceCode: string) =>
        (
          await createProgrammeFarm(server, adminToken, {
            name: `Visites2 ${tag} ${name}`,
            provinceCode,
            extra: { cohort: code },
          })
        ).farmId;
      farmA = await mk('A', 'G1');
      farmB = await mk('B', 'G1');
      farmC = await mk('C', 'G2');
      agent = (await institution('AGENT_TECHNIQUE', { farmIds: [farmA, farmB, farmC] })).token;
      dge = (await institution('DGE')).token;
      const grid = await get(`/farms/${farmA}/visits/grid`, dge).expect(200);
      for (const c of grid.body.criteria as Array<{ code: string; weight: number }>) {
        weights[c.code] = c.weight;
      }
      visitIds.a1 = (await visit(farmA, { visitDate: day(-40), answers: allOk }).expect(201)).body.id;
      visitIds.a2 = (
        await visit(farmA, {
          visitDate: day(-2),
          answers: pediluveKo,
          nextVisitDate: day(10),
          recommendations: 'Renouveler le désinfectant du pédiluve chaque jour.',
        }).expect(201)
      ).body.id;
      visitIds.b1 = (
        await visit(farmB, { visitDate: day(-10), answers: allOk, nextVisitDate: day(-3) }).expect(201)
      ).body.id;
    }, 180_000);

    it('le score est la part pondérée des critères conformes, la classe suit les seuils', async () => {
      const w = (c: string) => weights[c];
      const expectedKo =
        Math.round(((w('CLOTURE_ENTREE') + w('REGISTRE_VISITEURS')) / (w('PEDILUVE') + w('CLOTURE_ENTREE') + w('REGISTRE_VISITEURS'))) * 1000) / 10;
      const a2 = (await get(`/farms/${farmA}/visits/${visitIds.a2}`, agent).expect(200)).body;
      expect(a2.scorePct).toBe(expectedKo);
      expect(a2.scorePct).toBe(50);
      expect(a2.classification).toBe('C');
      const a1 = (await get(`/farms/${farmA}/visits/${visitIds.a1}`, agent).expect(200)).body;
      expect(a1).toMatchObject({ scorePct: 100, classification: 'A' });
      // Each answer carries the weight in force on the day of the visit.
      expect(a2.answers.find((x: any) => x.criterionCode === 'PEDILUVE').weight).toBe(3);
    });

    it('la classe d’une ferme est celle de sa dernière visite, partout (registre, pilotage, synthèse)', async () => {
      const list = async (q: string) =>
        (await get(`/programme/farms?cohort=${code}&pageSize=100${q}`, adminToken).expect(200)).body;
      expect((await list('&biosecurity=C')).items.map((f: any) => f.id)).toEqual([farmA]);
      expect((await list('&biosecurity=A')).items.map((f: any) => f.id)).toEqual([farmB]);
      expect((await list('&biosecurity=NONE')).items.map((f: any) => f.id)).toEqual([farmC]);
      const d = (await get(`/pilotage/dashboard?cohort=${code}`, dge).expect(200)).body.biosecurity;
      expect(d.total).toMatchObject({
        farms: 3,
        controlled: 2,
        neverControlled: 1,
        classA: 1,
        classB: 0,
        classC: 1,
        stale: 0,
        averageScorePct: 75,
      });
      expect(d.provinces.find((p: any) => p.code === 'G1').figures).toMatchObject({ farms: 2, classA: 1, classC: 1 });
      expect(d.provinces.find((p: any) => p.code === 'G2').figures).toMatchObject({ farms: 1, neverControlled: 1 });
      const synth = (await get('/programme/economie/synthese', dge).expect(200)).body;
      const byId = (id: string) => synth.farms.find((f: any) => f.farmId === id);
      expect(byId(farmA)).toMatchObject({ bioClass: 'C', bioScorePct: 50 });
      expect(byId(farmB)).toMatchObject({ bioClass: 'A', bioScorePct: 100 });
      expect(byId(farmC).bioClass).toBe('Non contrôlée');
    });

    it('vue programme : visites par province et par ferme, somme des visites enregistrées', async () => {
      const count = async (farmId: string) =>
        (await get(`/programme/visits?farmId=${farmId}&pageSize=100`, dge).expect(200)).body.items.length as number;
      expect(await count(farmA)).toBe(2);
      expect(await count(farmB)).toBe(1);
      expect(await count(farmC)).toBe(0);
      const g1 = (await get(`/programme/visits?province=G1&farmId=${farmA}&classification=C`, dge).expect(200)).body;
      expect(g1.items.map((v: any) => v.id)).toEqual([visitIds.a2]);
      const g2 = (await get(`/programme/visits?province=G2&farmId=${farmA}`, dge).expect(200)).body;
      expect(g2.items).toHaveLength(0);
    });

    it('suivi : la prochaine visite est en retard pour B, pas pour A (le plan de A est dans 10 jours)', async () => {
      const late = (await get(`/programme/visits?retard=true&farmId=${farmB}`, dge).expect(200)).body;
      expect(late.items.map((v: any) => v.id)).toEqual([visitIds.b1]);
      const notLate = (await get(`/programme/visits?retard=true&farmId=${farmA}`, dge).expect(200)).body;
      expect(notLate.items).toHaveLength(0);
      // The follow-up actions are the visit's recommendations.
      const a2 = (await get(`/farms/${farmA}/visits/${visitIds.a2}`, agent).expect(200)).body;
      expect(a2.recommendations).toContain('pédiluve');
      expect(a2.nextVisitDate).toBe(day(10));
    });

    it.todo(
      'actions de suivi : une visite ne porte que du texte libre (recommendations) et la date de la prochaine visite ; aucune action de suivi structurée (responsable, échéance, statut) ni clôture d’action ; à valider avec les vétérinaires',
    );
    it.todo(
      'validité d’une classe de biosécurité : la classe d’une ferme reste celle de sa dernière visite jusqu’à 365 jours (« contrôle ancien ») ; à valider avec les vétérinaires : durée de validité et fréquence minimale des contrôles',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 5. Tâches, pesées et notifications
  // ──────────────────────────────────────────────────────────────────────
  describe('5. Tâches et rappels : retard, alerte, notification unique, achèvement, pesée en retard', () => {
    /*
     * T1 « Vacciner » J-3 (assignée), T2 « Peser » J+2 (assignée),
     * T3 « Abreuvoir » J-1 (non assignée), T4 aujourd'hui (pas en retard).
     * En retard = échéance strictement passée et ni FAIT ni ANNULEE.
     * Alerte TACHE ROUGE « n tâche(s) ». Chaque tâche en retard est notifiée
     * une fois (événement TASKS_OVERDUE). T1 faite => 1 en retard ; T3
     * annulée => plus d'alerte ; T2 reportée à J-2 => l'alerte revient et
     * T2 est notifiée.
     * Pesée : bande ouverte J-30, pesée à J-20 : prochaine pesée J-20 + fréquence ;
     * en retard si la fréquence est inférieure à 20 jours.
     */
    let token: string;
    let farmId: string;
    let memberId: string;
    let memberToken: string;
    const ids: Record<string, string> = {};
    const events: Array<{ tasks: Array<{ id: string }> }> = [];
    const onOverdue = (e: { tasks: Array<{ id: string }> }) => events.push(e);
    const taskAlert = async () =>
      ((await get(`/farms/${farmId}/alerts`, token).expect(200)).body as any[]).find(
        (a) => a.kind === 'TACHE' && a.status === 'ACTIVE',
      );
    const notified = async (id: string) =>
      (await ds.query(`SELECT overdue_notified_at AS n FROM farm_tasks WHERE id = $1`, [id]))[0].n;
    const newTask = (body: object) => post(`/farms/${farmId}/tasks`, body, token);

    beforeAll(async () => {
      koukouBus.on(KOUKOU_EVENTS.TASKS_OVERDUE, onOverdue as never);
      const farm = await createProgrammeFarm(server, adminToken, { name: `Ferme Tâches2 ${tag}` });
      farmId = farm.farmId;
      token = farm.ownerToken;
      const phone = uniquePhone('+2418');
      const member = await post(
        `/farms/${farmId}/eleveurs`,
        { phone, fullName: 'Aide Tâches', code: 'secret456', role: 'ELEVEUR' },
        token,
      ).expect(201);
      memberId = member.body.user.id;
      memberToken = await login(server, phone, 'secret456');
      ids.t1 = (await newTask({ title: 'Vacciner', dueDate: day(-3), assigneeId: memberId }).expect(201)).body.id;
      ids.t2 = (await newTask({ title: 'Peser', dueDate: day(2), assigneeId: memberId }).expect(201)).body.id;
      ids.t3 = (await newTask({ title: 'Abreuvoir', dueDate: day(-1) }).expect(201)).body.id;
      ids.t4 = (await newTask({ title: 'Aujourd’hui', dueDate: day(0) }).expect(201)).body.id;
    }, 120_000);

    afterAll(() => {
      koukouBus.off(KOUKOU_EVENTS.TASKS_OVERDUE, onOverdue as never);
    });

    it('seules les échéances passées sont en retard : alerte ROUGE pour 2 tâches, notification unique par tâche', async () => {
      const alert = await taskAlert();
      expect(alert.level).toBe('ROUGE');
      expect(alert.message).toContain('2 tâches');
      expect(alert.context.taskIds).toEqual([ids.t1, ids.t3].sort());
      expect(events.flatMap((e) => e.tasks.map((t) => t.id)).sort()).toEqual([ids.t1, ids.t3].sort());
      expect(await notified(ids.t1)).not.toBeNull();
      expect(await notified(ids.t2)).toBeNull();
      expect(await notified(ids.t4)).toBeNull();
      // Opening the list again re-reads the alert, never notifies twice.
      await get(`/farms/${farmId}/tasks`, token).expect(200);
      expect(events.flatMap((e) => e.tasks.map((t) => t.id))).toHaveLength(2);
    });

    it('un éleveur ne voit et ne modifie que ses tâches (statut seulement)', async () => {
      const own = (await get(`/farms/${farmId}/tasks`, memberToken).expect(200)).body as any[];
      expect(own.map((t) => t.id).sort()).toEqual([ids.t1, ids.t2].sort());
      const all = (await get(`/farms/${farmId}/tasks`, token).expect(200)).body as any[];
      expect(all).toHaveLength(4);
      await patch(`/farms/${farmId}/tasks/${ids.t2}`, { dueDate: day(30) }, memberToken).expect(403);
      await patch(`/farms/${farmId}/tasks/${ids.t3}`, { status: 'FAIT' }, memberToken).expect(403);
    });

    it('achèvement : la tâche faite sort du retard (1 restante), puis l’annulation vide l’alerte', async () => {
      const done = await patch(`/farms/${farmId}/tasks/${ids.t1}`, { status: 'FAIT' }, memberToken).expect(200);
      expect(done.body.completedAt).toBeTruthy();
      expect((await taskAlert()).message).toContain('1 tâche de l’équipe en retard');
      await patch(`/farms/${farmId}/tasks/${ids.t3}`, { status: 'ANNULEE' }, token).expect(200);
      expect(await taskAlert()).toBeUndefined();
      // Re-opening a done task clears its completion date.
      const reopened = await patch(`/farms/${farmId}/tasks/${ids.t1}`, { status: 'A_FAIRE' }, token).expect(200);
      expect(reopened.body.completedAt).toBeNull();
      await patch(`/farms/${farmId}/tasks/${ids.t1}`, { status: 'FAIT' }, token).expect(200);
    });

    it('report d’échéance : la tâche repasse en retard, l’alerte revient et elle est notifiée à nouveau', async () => {
      const before = events.length;
      await patch(`/farms/${farmId}/tasks/${ids.t2}`, { dueDate: day(-2) }, token).expect(200);
      const alert = await taskAlert();
      expect(alert.message).toContain('1 tâche de l’équipe en retard');
      expect(alert.context.taskIds).toEqual([ids.t2]);
      expect(events.length).toBe(before + 1);
      expect(events[events.length - 1].tasks.map((t) => t.id)).toEqual([ids.t2]);
      await patch(`/farms/${farmId}/tasks/${ids.t2}`, { status: 'FAIT' }, token).expect(200);
      expect(await taskAlert()).toBeUndefined();
    });

    it('pesée programmée : en retard selon la fréquence du programme, signalée une fois, la nouvelle pesée remet à jour le lot', async () => {
      const bandId = (
        await post(
          `/farms/${farmId}/batches`,
          { batchName: `Pesée ${tag}`, type: 'CHAIR', integrationDate: day(-30), quantityAtStart: 300 },
          token,
        ).expect(201)
      ).body.id as string;
      await post(
        `/farms/${farmId}/batches/${bandId}/daily-entries`,
        { entryDate: day(-20), avgWeightKg: 0.9, sampleSize: 30 },
        token,
      ).expect(201);
      const sheet = (await get(`/farms/${farmId}/bandes/${bandId}`, token).expect(200)).body;
      const frequency = sheet.weighing.frequencyDays as number;
      expect(sheet.weighing).toMatchObject({ lastWeighingDate: day(-20), nextDueDate: day(-20 + frequency) });
      const batch = (await get(`/farms/${farmId}/batches/${bandId}`, token).expect(200)).body;
      expect(batch.metrics.lastWeighingAvgWeightKg).toBe(0.9);
      expect(batch.metrics.lastWeighingAgeDays).toBe(10);
      const weighings = app.get(WeighingsService);
      if (frequency < 20) {
        expect(sheet.weighing.late).toBe(true);
        expect((await weighings.sweepLate()).map((e) => e.batchId)).toContain(bandId);
        expect((await weighings.sweepLate()).map((e) => e.batchId)).not.toContain(bandId);
      }
      // A weighing today moves the due date forward and the band is on time.
      await post(
        `/farms/${farmId}/batches/${bandId}/daily-entries`,
        { entryDate: day(0), avgWeightKg: 2.1, sampleSize: 30 },
        token,
      ).expect(201);
      const after = (await get(`/farms/${farmId}/bandes/${bandId}`, token).expect(200)).body;
      expect(after.weighing).toMatchObject({ lastWeighingDate: day(0), nextDueDate: day(frequency), late: false });
      expect((await weighings.sweepLate()).map((e) => e.batchId)).not.toContain(bandId);
      const refreshed = (await get(`/farms/${farmId}/batches/${bandId}`, token).expect(200)).body;
      expect(refreshed.metrics.lastWeighingAvgWeightKg).toBe(2.1);
      expect(refreshed.metrics.lastWeighingAgeDays).toBe(30);
    });

    it.todo(
      'les tâches ne sont pas générées par les programmes (vaccination, pesée) : le calendrier sanitaire et la pesée ont leurs propres rappels (alertes PROPHYLAXIE, WEIGHING_LATE) mais aucune tâche d’équipe n’est créée ni clôturée automatiquement ; terminer une tâche ne met pas à jour le lot (il faut enregistrer le soin ou la pesée) ; à valider avec les vétérinaires',
    );
    it.todo(
      'notifications de tâches : l’assignation et le retard passent par le push seulement (pas de notification interne dans la boîte /notifications) ; les tâches en retard de plus de 7 jours ne sont jamais notifiées',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 6. RH et masse salariale
  // ──────────────────────────────────────────────────────────────────────
  describe('6. RH : salaires, charges par bande, rentabilité, synthèse du programme', () => {
    /*
     * Deux salariés : 175 000 + 120 000 = 295 000 F par mois.
     * Charge « main-d'œuvre » du mois enregistrée par l'exploitant et répartie
     * sur deux bandes : bande A 177 000 (60 %, payée par la caisse), bande B
     * 118 000 (40 %). 177 000 + 118 000 = 295 000.
     * Bande A : 10 poulets × 5 000 = 50 000 encaissés.
     * Rentabilité : A 50 000 − 177 000 = −127 000 ; B 0 − 118 000 = −118 000 ;
     * ferme −245 000. Caisse : 400 000 + 50 000 − 177 000 = 273 000.
     * Compte 641 : 295 000.
     */
    let token: string;
    let farmId: string;
    let bandA: string;
    let bandB: string;

    beforeAll(async () => {
      const farm = await createProgrammeFarm(server, adminToken, { name: `Ferme RH ${tag}` });
      farmId = farm.farmId;
      token = farm.ownerToken;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 400_000 }, token).expect(201);
      const mk = async (name: string) =>
        (
          await post(
            `/farms/${farmId}/batches`,
            { batchName: `${name} ${tag}`, type: 'CHAIR', integrationDate: day(-10), quantityAtStart: 100 },
            token,
          ).expect(201)
        ).body.id as string;
      bandA = await mk('RH A');
      bandB = await mk('RH B');
      await post(
        `/farms/${farmId}/eleveurs`,
        { phone: uniquePhone('+2418'), fullName: 'Salarié 1', code: 'secret456', role: 'ELEVEUR', jobTitle: 'Éleveur', salaryFcfa: 175_000 },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/eleveurs`,
        { phone: uniquePhone('+2418'), fullName: 'Salarié 2', code: 'secret456', role: 'ELEVEUR', jobTitle: 'Gardien', salaryFcfa: 120_000 },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'MAIN_D_OEUVRE', amountFcfa: 177_000, label: 'Salaires du mois (60 %)', batchId: bandA, paidByCaisse: true },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'MAIN_D_OEUVRE', amountFcfa: 118_000, label: 'Salaires du mois (40 %)', batchId: bandB },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/sales`,
        {
          customerName: 'Client Marché',
          items: [{ productType: 'POULET_PIECE', quantity: 10, unit: 'PIECE', unitPriceFcfa: 5000, batchId: bandA }],
          payments: [{ method: 'CASH', amountFcfa: 50_000 }],
        },
        token,
      ).expect(201);
    }, 180_000);

    it('la fiche RH porte les salaires ; la masse salariale mensuelle est leur somme', async () => {
      const staff = (await get(`/farms/${farmId}/eleveurs`, token).expect(200)).body;
      const json = JSON.stringify(staff);
      expect(json).toContain('175000');
      expect(json).toContain('120000');
      const [{ total, n }] = await ds.query(
        `SELECT COALESCE(SUM(salary_fcfa), 0)::int AS total, COUNT(*)::int AS n FROM farm_employees WHERE farm_id = $1 AND active = true`,
        [farmId],
      );
      expect(total).toBe(295_000);
      const synth = (await get('/programme/economie/synthese', adminToken).expect(200)).body;
      const row = synth.farms.find((f: any) => f.farmId === farmId);
      expect(row.payrollMonthlyFcfa).toBe(295_000);
      expect(row.employeeCount).toBe(n);
    });

    it('rentabilité par bande : la main-d’œuvre imputée pèse sur la bande qui la porte', async () => {
      const a = (await get(`/farms/${farmId}/rentabilite/batches/${bandA}`, token).expect(200)).body;
      expect(a).toMatchObject({ revenueFcfa: 50_000, expensesFcfa: 177_000, netFcfa: -127_000 });
      expect(a.breakdown.byExpenseCategory).toEqual(
        expect.arrayContaining([expect.objectContaining({ category: 'MAIN_D_OEUVRE', amountFcfa: 177_000 })]),
      );
      const b = (await get(`/farms/${farmId}/rentabilite/batches/${bandB}`, token).expect(200)).body;
      expect(b).toMatchObject({ revenueFcfa: 0, expensesFcfa: 118_000, netFcfa: -118_000 });
      expect(b.marginPct).toBeNull();
      const official = (await get(`/farms/${farmId}/bandes/${bandA}/indicators`, token).expect(200)).body;
      expect(official.variables.charges_fcfa).toBe(177_000);
      expect(official.variables.ca_fcfa).toBe(50_000);
    });

    it('ferme = somme des bandes ; compte 641, caisse 571 et synthèse du DGE concordent', async () => {
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.expenses.totalFcfa).toBe(295_000);
      expect(overview.netFcfa).toBe(-245_000);
      expect(overview.netFcfa).toBe(-127_000 + -118_000);
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      expect(result.charges.find((c: any) => c.code === '641').soldeFcfa).toBe(295_000);
      expect(result.resultatFcfa).toBe(-245_000);
      const cash = (await get(`/farms/${farmId}/caisse/current`, token).expect(200)).body;
      expect(cash.expectedBalanceFcfa).toBe(273_000);
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      expect(balance.accounts.find((a: any) => a.code === '571').soldeFcfa).toBe(273_000);
      const synth = (await get('/programme/economie/synthese', adminToken).expect(200)).body;
      const row = synth.farms.find((f: any) => f.farmId === farmId);
      expect(row).toMatchObject({ salesFcfa: 50_000, expensesFcfa: 295_000, marginFcfa: -245_000 });
    });

    it.todo(
      'masse salariale : le salaire de la fiche RH (payrollMonthlyFcfa) n’alimente aucune charge ni écriture 641 ; l’exploitant doit ressaisir chaque mois une dépense MAIN_D_OEUVRE, sans lien avec la fiche ; aucune répartition automatique par bande (au prorata des effectifs ou des jours) ; à valider avec la DGE',
    );
    it.todo(
      'caisse multi-points de vente : la caisse est unique par ferme (pas de session ni de solde par point de vente) ; le rapport par point de vente n’existe pas ; à valider si la DGE attend un solde par boutique',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 7. Rapports et exports
  // ──────────────────────────────────────────────────────────────────────
  describe('7. Exports : CSV, Excel et PDF portent les mêmes chiffres que l’API', () => {
    /*
     * Ferme du programme : vente 10 × 5 000 = 50 000 (caisse), transport
     * 12 000 payé en caisse, vétérinaire 8 000 => charges 20 000, résultat 30 000.
     */
    const code = `MET7_${digits}`;
    let token: string;
    let farmId: string;
    let farmCode: string;
    let bandId: string;
    let dge: string;

    const csvOf = async (report: string, extra = '') =>
      csvRows((await get(`/farms/${farmId}/accounting/export?report=${report}&format=csv${extra}`, token).expect(200)).text);
    const num = (v: string | undefined) => Number((v ?? '0').replace(',', '.'));

    beforeAll(async () => {
      await cohort(code);
      const farm = await createProgrammeFarm(server, adminToken, {
        name: `Ferme Exports ${tag}`,
        extra: { cohort: code },
      });
      farmId = farm.farmId;
      farmCode = farm.farmCode;
      token = farm.ownerToken;
      dge = (await institution('DGE')).token;
      await post(`/farms/${farmId}/caisse/open`, { openingBalanceFcfa: 50_000 }, token).expect(201);
      bandId = (
        await post(
          `/farms/${farmId}/batches`,
          { batchName: `Exports ${tag}`, type: 'CHAIR', integrationDate: day(-10), quantityAtStart: 100 },
          token,
        ).expect(201)
      ).body.id;
      await post(
        `/farms/${farmId}/sales`,
        {
          customerName: 'Client Marché',
          items: [{ productType: 'POULET_PIECE', quantity: 10, unit: 'PIECE', unitPriceFcfa: 5000, batchId: bandId }],
          payments: [{ method: 'CASH', amountFcfa: 50_000 }],
        },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'TRANSPORT', amountFcfa: 12_000, label: 'Transport', batchId: bandId, paidByCaisse: true },
        token,
      ).expect(201);
      await post(
        `/farms/${farmId}/expenses`,
        { category: 'VETERINAIRE', amountFcfa: 8_000, label: 'Vétérinaire', batchId: bandId },
        token,
      ).expect(201);
    }, 180_000);

    it('journal CSV = journal de l’API (lignes, total débit = total crédit)', async () => {
      const journal = (await get(`/farms/${farmId}/accounting/journal`, token).expect(200)).body;
      const rows = await csvOf('journal');
      const lines = journal.entries.reduce((s: number, e: any) => s + e.lines.length, 0);
      expect(rows).toHaveLength(lines);
      const debit = rows.reduce((s, r) => s + num(r['Débit']), 0);
      const credit = rows.reduce((s, r) => s + num(r['Crédit']), 0);
      expect(debit).toBe(journal.totals.debit);
      expect(credit).toBe(journal.totals.credit);
      expect(debit).toBe(credit);
    });

    it('balance et compte de résultat CSV = API, compte par compte', async () => {
      const balance = (await get(`/farms/${farmId}/accounting/balance`, token).expect(200)).body;
      const rows = await csvOf('balance');
      expect(rows).toHaveLength(balance.accounts.length);
      for (const a of balance.accounts) {
        const r = rows.find((x) => x['Compte'] === a.code);
        expect(num(r?.['Solde'])).toBe(a.soldeFcfa);
      }
      const result = (await get(`/farms/${farmId}/accounting/compte-resultat`, token).expect(200)).body;
      const cr = await csvOf('compte-resultat');
      const sumOf = (prefix: string) =>
        cr.filter((r) => r['Compte'].startsWith(prefix)).reduce((s, r) => s + num(r['Solde']), 0);
      expect(sumOf('6')).toBe(result.totalCharges);
      expect(-sumOf('7')).toBe(result.totalProduits);
      expect(result.totalProduits - result.totalCharges).toBe(30_000);
      expect(result.resultatFcfa).toBe(30_000);
    });

    it('bilan CSV = bilan de l’API (actif, résultat) et équilibré', async () => {
      const bilan = (await get(`/farms/${farmId}/accounting/bilan`, token).expect(200)).body;
      const rows = await csvOf('bilan');
      const col = `Montant au ${bilan.asOf} (FCFA)`;
      const actif = rows.filter((r) => r['Rubrique'] === 'Actif').reduce((s, r) => s + num(r[col]), 0);
      expect(actif).toBe(bilan.totalActif);
      const result = rows.find((r) => r['Libellé'] === 'Résultat de l’exercice');
      expect(num(result?.[col])).toBe(bilan.resultatFcfa);
      expect(bilan.ecartFcfa).toBe(0);
      expect(bilan.totalActif).toBe(bilan.totalPassifExterne + bilan.totalCapitaux);
    });

    it('rentabilité : ventes et dépenses des listes = vue d’ensemble = compte du lot', async () => {
      const sales = (await get(`/farms/${farmId}/sales`, token).expect(200)).body;
      const expenses = (await get(`/farms/${farmId}/expenses`, token).expect(200)).body;
      const saleTotal = ((sales.items ?? sales) as any[]).reduce((s, x) => s + x.totalAmountFcfa, 0);
      const expenseTotal = ((expenses.items ?? expenses) as any[]).reduce((s, x) => s + x.amountFcfa, 0);
      const overview = (await get(`/farms/${farmId}/rentabilite/overview`, token).expect(200)).body;
      expect(overview.sales.totalFcfa).toBe(saleTotal);
      expect(overview.expenses.totalFcfa).toBe(expenseTotal);
      expect(overview.netFcfa).toBe(30_000);
      const pnl = (await get(`/farms/${farmId}/rentabilite/batches/${bandId}`, token).expect(200)).body;
      expect(pnl).toMatchObject({ revenueFcfa: 50_000, expensesFcfa: 20_000, netFcfa: 30_000 });
      expect(pnl.marginPct).toBeCloseTo(60, 6);
    });

    it('chaque rapport PDF se génère (comptabilité, rentabilité)', async () => {
      const pdfs = [
        ...['journal', 'grand-livre', 'balance', 'compte-resultat', 'bilan'].map(
          (r) => `/farms/${farmId}/accounting/export?report=${r}`,
        ),
        `/farms/${farmId}/rentabilite/overview/export`,
        `/farms/${farmId}/rentabilite/batches/${bandId}/export`,
      ];
      for (const url of pdfs) {
        const res = await binary(url, token).expect(200);
        expect(res.headers['content-type']).toContain('application/pdf');
        expect((res.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      }
    });

    it('pilotage : CSV et Excel ont les mêmes colonnes et les mêmes valeurs (fermes, bandes, provinces)', async () => {
      const period = `cohort=${code}&from=${day(-29)}&to=${day(0)}`;
      for (const name of ['farms', 'bandes', 'provinces']) {
        const csv = (await get(`/pilotage/exports/${name}.csv?${period}`, dge).expect(200)).text;
        const rows = csvRows(csv);
        const xlsx = await binary(`/pilotage/exports/${name}.xlsx?${period}`, dge).expect(200);
        const sheet = await readXlsx(xlsx.body as Buffer);
        const headers = csv.replace(/^﻿/, '').split(/\r?\n/)[0].split(';').map((c) => c.replace(/^"|"$/g, ''));
        expect(sheet[0].map((c) => c.trim())).toEqual(headers.map((c) => c.trim()));
        expect(sheet.length - 1).toBe(rows.length);
        rows.forEach((row, i) => {
          headers.forEach((h, k) => {
            expect(sameCell(row[h], sheet[i + 1][k])).toBe(true);
          });
        });
      }
      const bandes = csvRows((await get(`/pilotage/exports/bandes.csv?${period}`, dge).expect(200)).text);
      expect(bandes).toHaveLength(1);
      expect(Number(bandes[0]['Mis en place'])).toBe(100);
      expect(Number(bandes[0]['Sortis vivants cumulés'])).toBe(10);
      const dashboard = (await get(`/pilotage/dashboard?${period}`, dge).expect(200)).body;
      expect(dashboard.totals.metrics.placedHeads).toBe(100);
      expect(dashboard.totals.metrics.farms).toBe(1);
    });

    it('synthèse économique : CSV et Excel identiques, la ligne de la ferme = API', async () => {
      const csv = (await get('/programme/economie/synthese/export?format=csv', adminToken).expect(200)).text;
      const xlsx = await binary('/programme/economie/synthese/export?format=xlsx', adminToken).expect(200);
      const sheet = await readXlsx(xlsx.body as Buffer);
      const parsed = csvRows(csv);
      expect(sheet.length - 1).toBe(parsed.length);
      const headers = csv.replace(/^﻿/, '').split(/\r?\n/)[0].split(';').map((c) => c.replace(/^"|"$/g, ''));
      expect(sheet[0].map((c) => c.trim())).toEqual(headers.map((c) => c.trim()));
      const index = sheet.findIndex((r) => r.includes(farmCode));
      expect(index).toBeGreaterThan(0);
      const csvRow = parsed[index - 1];
      headers.forEach((h, k) => expect(sameCell(csvRow[h], sheet[index][k])).toBe(true));
      const synth = (await get('/programme/economie/synthese', adminToken).expect(200)).body;
      const row = synth.farms.find((f: any) => f.farmId === farmId);
      expect(row).toMatchObject({ salesFcfa: 50_000, expensesFcfa: 20_000, collectedFcfa: 50_000, marginFcfa: 30_000 });
      const values = Object.values(csvRow).map((v) => Number(String(v).replace(',', '.')));
      expect(values).toEqual(expect.arrayContaining([50_000, 20_000, 30_000]));
    });

    it.todo(
      'rapports périodiques PDF (pilotage/reports) : les sections « SYNTHESE », « OBJECTIF » et « INTRANTS » sont tirées du tableau de bord du pilotage au moment de la production ; le PDF figé ne se régénère pas si les données sont corrigées après (empreinte SHA-256 stockée) ; à valider : politique de rectification',
    );
  });

  // ──────────────────────────────────────────────────────────────────────
  // 8. Registre du programme
  // ──────────────────────────────────────────────────────────────────────
  describe('8. Registre : identité des fermes, codes, agrégats province, liste des 150, opérateurs', () => {
    /*
     * 5 fermes d'une cohorte : G1 × 3 (capacités 1 000, 2 000, 1 500), G2 × 2
     * (800, 500). Bandes : 400 et 300 poussins (G1), 200 (G2) => 900 mis en
     * place ; G1 700, G2 200. Taux d'occupation de la première ferme =
     * 400 / 1 000 = 40 %.
     */
    const code = `MET8_${digits}`;
    const farms: Array<{ id: string; code: string; token: string; province: string; capacity: number; name: string }> = [];
    let dge: string;
    let localite: { id: string; name: string };

    beforeAll(async () => {
      await cohort(code);
      const provinces = (await get('/programme/provinces', adminToken).expect(200)).body as any[];
      const g1 = provinces.find((p) => p.code === 'G1');
      localite = g1.localites[0];
      const spec: Array<[string, number, number]> = [
        ['G1', 1000, 400],
        ['G1', 2000, 300],
        ['G1', 1500, 0],
        ['G2', 800, 200],
        ['G2', 500, 0],
      ];
      for (const [i, [province, capacity, chicks]] of spec.entries()) {
        const name = `Registre ${tag} F${i + 1}`;
        const f = await createProgrammeFarm(server, adminToken, {
          name,
          provinceCode: province,
          exploitantName: `Exploitant ${i + 1} ${tag}`,
          extra: { cohort: code, capacityPlaces: capacity, ...(i === 0 ? { localiteId: localite.id } : {}) },
        });
        farms.push({ id: f.farmId, code: f.farmCode, token: f.ownerToken, province, capacity, name });
        if (chicks > 0) {
          await post(
            `/farms/${f.farmId}/batches`,
            { batchName: `Registre ${i + 1} ${tag}`, type: 'CHAIR', integrationDate: day(-5), quantityAtStart: chicks },
            f.ownerToken,
          ).expect(201);
        }
      }
      dge = (await institution('DGE')).token;
    }, 240_000);

    it('codes : province + numéro à 4 chiffres, uniques, consécutifs dans une province', async () => {
      for (const f of farms) expect(f.code).toMatch(new RegExp(`^${f.province}-\\d{4,}$`));
      expect(new Set(farms.map((f) => f.code)).size).toBe(5);
      const n = (c: string) => Number(c.split('-')[1]);
      const g1 = farms.filter((f) => f.province === 'G1').map((f) => n(f.code));
      expect(g1).toEqual([g1[0], g1[0] + 1, g1[0] + 2]);
      const g2 = farms.filter((f) => f.province === 'G2').map((f) => n(f.code));
      expect(g2).toEqual([g2[0], g2[0] + 1]);
    });

    it('fiche d’identité : tous les champs du registre sont rendus, taux d’occupation = mis en place / capacité', async () => {
      const f = farms[0];
      const sheet = (await get(`/programme/farms/${f.id}`, adminToken).expect(200)).body;
      expect(sheet).toMatchObject({
        id: f.id,
        code: f.code,
        name: f.name,
        province: { code: 'G1' },
        localite: { id: localite.id },
        cohort: { code },
        capacityPlaces: 1000,
        hasOwnerAccount: true,
        active: true,
        exploitant: { name: `Exploitant 1 ${tag}` },
      });
      expect(sheet.exploitant.phone).toBeTruthy();
      expect(sheet.owner.phone).toBe(sheet.exploitant.phone);
      expect(sheet.occupation).toEqual({ chicksPlaced: 400, capacityPlaces: 1000, ratePct: 40 });
      // The farm sees the same sheet.
      const own = (await get(`/programme/farms/${f.id}`, f.token).expect(200)).body;
      expect(own.code).toBe(f.code);
    });

    it('liste du registre = fermes créées, par province, cohorte et localité', async () => {
      const list = (await get(`/programme/farms?cohort=${code}&pageSize=100`, adminToken).expect(200)).body;
      expect(list.total).toBe(5);
      expect(list.items.map((i: any) => i.code).sort()).toEqual(farms.map((x) => x.code).sort());
      const byProvince = async (p: string) =>
        (await get(`/programme/farms?cohort=${code}&province=${p}&pageSize=100`, adminToken).expect(200)).body.total;
      expect(await byProvince('G1')).toBe(3);
      expect(await byProvince('G2')).toBe(2);
      const dept = (await get(`/programme/farms?cohort=${code}&localiteId=${localite.id}`, adminToken).expect(200)).body;
      expect(dept.items.map((i: any) => i.id)).toEqual([farms[0].id]);
      const item = list.items.find((i: any) => i.id === farms[1].id);
      expect(item).toMatchObject({ capacityPlaces: 2000, province: { code: 'G1' }, hasOwnerAccount: true });
    });

    it('pilotage : fermes et poussins par province = registre + bandes', async () => {
      const period = `cohort=${code}&from=${day(-29)}&to=${day(0)}`;
      const d = (await get(`/pilotage/dashboard?${period}`, dge).expect(200)).body;
      expect(d.farms.total).toBe(5);
      expect(d.totals.metrics).toMatchObject({ farms: 5, bands: 3, placedHeads: 900 });
      const g1 = d.provinces.find((p: any) => p.code === 'G1');
      const g2 = d.provinces.find((p: any) => p.code === 'G2');
      expect(g1.metrics).toMatchObject({ farms: 3, bands: 2, placedHeads: 700 });
      expect(g2.metrics).toMatchObject({ farms: 2, bands: 1, placedHeads: 200 });
      const csv = (await get(`/pilotage/exports/farms.csv?${period}`, dge).expect(200)).text;
      expect(csvRows(csv)).toHaveLength(5);
      for (const f of farms) expect(csv).toContain(f.code);
      const synth = (await get('/programme/economie/synthese', dge).expect(200)).body;
      for (const f of farms) {
        const row = synth.farms.find((r: any) => r.farmId === f.id);
        expect(row).toMatchObject({ code: f.code, provinceCode: f.province });
      }
    });

    it('doublon probable refusé sans confirmation', async () => {
      const dup = await post(
        '/programme/farms',
        { name: farms[0].name, provinceCode: 'G1' },
        adminToken,
      ).expect(409);
      expect(JSON.stringify(dup.body)).toContain(farms[0].code);
    });

    it('opérateurs : code OP-NNNN jamais réutilisé, désactivation sans suppression', async () => {
      const create = async (name: string) =>
        (await post('/trace/operators', { typeCode: 'ABATTOIR', name: `${name} ${tag}` }, adminToken).expect(201)).body;
      const first = await create('Abattoir A');
      const second = await create('Abattoir B');
      expect(first.code).toMatch(/^OP-\d{4,}$/);
      expect(Number(second.code.split('-')[1])).toBe(Number(first.code.split('-')[1]) + 1);
      await patch(`/trace/operators/${first.id}`, { active: false }, adminToken).expect(200);
      const third = await create('Abattoir C');
      expect(Number(third.code.split('-')[1])).toBe(Number(second.code.split('-')[1]) + 1);
      const list = (r: any) => (Array.isArray(r) ? r : r.items) as any[];
      const active = list((await get('/trace/operators', adminToken).expect(200)).body);
      const all = list((await get('/trace/operators?all=true', adminToken).expect(200)).body);
      expect(active.some((o) => o.id === first.id)).toBe(false);
      expect(all.some((o) => o.id === first.id)).toBe(true);
    });

    it('liste des 150 fermes POUFA : 150 lignes, numéros 1 à 150, noms uniques, 9 provinces connues', async () => {
      const file = readFileSync(join(process.cwd(), 'test', 'fixtures', 'fermes-poufa.csv'));
      const table = parseCsv(file.toString('utf8'));
      const rows = table.slice(1).filter((r) => r.length >= 3 && r[1].trim() !== '');
      expect(rows).toHaveLength(150);
      expect(rows.map((r) => Number(r[0]))).toEqual(Array.from({ length: 150 }, (_, i) => i + 1));
      const names = rows.map((r) => r[1].trim().toUpperCase().replace(/\s+/g, ' '));
      expect(new Set(names).size).toBe(150);
      const counts: Record<string, number> = {};
      for (const r of rows) counts[r[2].trim()] = (counts[r[2].trim()] ?? 0) + 1;
      expect(counts).toEqual({
        Estuaire: 90,
        'Haut-Ogooué': 17,
        'Moyen-Ogooué': 3,
        Ngounié: 5,
        Nyanga: 7,
        'Ogooué-Ivindo': 3,
        'Ogooué-Lolo': 3,
        'Ogooué-Maritime': 15,
        'Woleu-Ntem': 7,
      });
      const provinces = (await get('/programme/provinces', adminToken).expect(200)).body as any[];
      const known = new Set(provinces.map((p) => p.name));
      for (const name of Object.keys(counts)) expect(known.has(name)).toBe(true);
      // The importer reads the same 150 lines, rejects none (dry run: nothing written).
      const dry = await request(server)
        .post('/programme/farms/import')
        .set(auth(adminToken))
        .attach('file', file, 'fermes-poufa.csv')
        .expect(201);
      expect(dry.body).toMatchObject({ dryRun: true, read: 150, rejected: 0 });
      expect(dry.body.created + dry.body.matched).toBe(150);
    });

    it.todo(
      'agrégation par département : le registre filtre par localité (département) mais le tableau de bord de pilotage et les exports n’agrègent que par province ; pas de ligne « département » dans les rapports ; à valider avec la DGE',
    );
    it.todo(
      'taux d’occupation : il compte les poussins mis en place dans les bandes ouvertes (quantité de départ), pas les effectifs présents ; une bande qui a perdu 30 % de ses oiseaux compte toujours 100 % ; à valider (formule taux_occupation du programme)',
    );
  });
});

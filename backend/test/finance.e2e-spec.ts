import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Module 4 — Finance & Rentabilité (POS ferme, e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let batchAId: string;
  let batchBId: string;
  let batchCId: string;
  let customerId: string;
  let feedLotId: string;
  let saleAId: string;
  let saleBId: string;
  let saleCId: string;

  async function createBatch(name: string, chickUnitPriceFcfa?: number) {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: name,
        integrationDate: today(),
        quantityAtStart: name === 'Lot PnL (perte)' ? 5 : 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${Date.now()}`,
        hatchDate: today(),
        ...(chickUnitPriceFcfa !== undefined ? { chickUnitPriceFcfa } : {}),
      })
      .expect(201);
    return res.body.id;
  }

  async function activeAlert(kind: string, batchId?: string) {
    const res = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.find(
      (a: any) =>
        a.kind === kind &&
        a.status === 'ACTIVE' &&
        (batchId === undefined || a.batchId === batchId),
    );
  }

  /** L'évaluation RENTABILITE se déclenche de manière asynchrone après la clôture (event bus) : on interroge avec polling. */
  async function waitForAlert(kind: string, batchId: string, ms = 4000) {
    const deadline = Date.now() + ms;
    let alert: any;
    while (Date.now() < deadline) {
      alert = await activeAlert(kind, batchId);
      if (alert) return alert;
      await new Promise((r) => setTimeout(r, 150));
    }
    return alert;
  }

  async function currentCaisse() {
    const res = await request(server)
      .get(`/farms/${farmId}/caisse/current`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body;
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

    const phone = `+24190${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Finance',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme Finance ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const otherPhone = `+24191${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone: otherPhone,
        fullName: 'Autre Proprio',
        code: 'secret123',
      })
      .expect(201);
    const otherLogin = await request(server)
      .post('/auth/login')
      .send({ phone: otherPhone, code: 'secret123' })
      .expect(201);
    otherToken = otherLogin.body.accessToken;
  });

  it('méthodes de paiement : CASH activé, Mobile Money / QR « Bientôt disponible »', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/payment-methods`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const byCode = Object.fromEntries(
      (res.body as any[]).map((m) => [m.code, m]),
    );
    expect(byCode.CASH.enabled).toBe(true);
    expect(byCode.MOBILE_MONEY.enabled).toBe(false);
    expect(byCode.QR_CODE.enabled).toBe(false);
  });

  it('création du lot A (avec prix poussin) pour servir les ventes', async () => {
    batchAId = await createBatch('Lot A vente', 1000);
  });

  it('encaissement espèces sans session de caisse ouverte → 400', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 2,
            unitPriceFcfa: 3000,
            batchId: batchAId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 6000 }],
      })
      .expect(400);
    expect(res.body.message).toContain('caisse');
  });

  it('ouverture de la caisse journalière + création client', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 5000 })
      .expect(201);

    const cust = await request(server)
      .post(`/farms/${farmId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Martine Obiang',
        phone: '+24177000000',
        city: 'Libreville',
      })
      .expect(201);
    customerId = cust.body.id;
    expect(cust.body.type).toBe('PARTICULIER');
    expect(cust.body.code).toMatch(/^CL-\d{4}$/);

    // Le type est purement descriptif (aucun effet sur le crédit).
    const reclass = await request(server)
      .patch(`/farms/${farmId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'RESTAURANT' })
      .expect(200);
    expect(reclass.body.type).toBe('RESTAURANT');
  });

  it('vente pièce (10 × 3000 = 30000 FCFA, espèces) → décrémente le cheptel', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 10,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId: batchAId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 30000 }],
      })
      .expect(201);
    saleAId = res.body.sale.id;
    expect(res.body.sale.status).toBe('SETTLED');
    expect(res.body.sale.totalAmountFcfa).toBe(30000);
    expect(res.body.sale.referenceNumber).toMatch(/^VTE-\d{8}-\d{6}$/);
    expect(res.body.items[0].pieceCount).toBe(10);
  });

  it('vente au kilo avec crédit client : OUTSTANDING, solde à recouvrer tracé', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerId,
        items: [
          {
            productType: 'POULET_KG',
            quantity: 100,
            unit: 'KG',
            pieceCount: 20,
            unitPriceFcfa: 2000,
            batchId: batchAId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 50000 }],
      })
      .then(async (r) => {
        expect(r.status).toBe(201);
        return r;
      });
    saleBId = res.body.sale.id;
    expect(res.body.sale.status).toBe('OUTSTANDING');
    expect(res.body.sale.totalAmountFcfa).toBe(200000);

    const caisse = await currentCaisse();
    expect(caisse.expectedBalanceFcfa).toBe(5000 + 30000 + 50000);

    const balance = await request(server)
      .get(`/farms/${farmId}/customers/${customerId}/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(balance.body.outstandingFcfa).toBe(200000 - 50000);
  });

  it('encaissement du solde → vente réglée', async () => {
    await request(server)
      .post(`/farms/${farmId}/sales/${saleBId}/payments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountFcfa: 150000 })
      .expect(201);

    const sale = await request(server)
      .get(`/farms/${farmId}/sales/${saleBId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(sale.body.status).toBe('SETTLED');

    const balance = await request(server)
      .get(`/farms/${farmId}/customers/${customerId}/balance`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(balance.body.outstandingFcfa).toBe(0);

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${batchAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.body.quantityAlive).toBe(300 - 10 - 20);
  });

  it('vente de provende depuis l’inventaire (2 SAC) → mouvement VENTE + stock déduit', async () => {
    const feed = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende Démarrage Vente',
        supplier: 'CEAG',
        supplierLotNumber: `PV-${Date.now()}`,
        quantity: 10,
        unit: 'SAC',
        unitPriceFcfa: 500,
      })
      .expect(201);
    feedLotId = feed.body.id;

    // Lot en vente sans écoulement AVANT la vente : l'évaluation post-vente doit lever l'alerte invendus.
    batchCId = await createBatch('Lot C invendus');
    await request(server)
      .post(`/farms/${farmId}/batches/${batchCId}/vente`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'PROVENDE',
            quantity: 2,
            unit: 'SAC',
            unitPriceFcfa: 15000,
            inputLotId: feedLotId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 30000 }],
      })
      .expect(201);
    saleCId = res.body.sale.id;
    expect(res.body.sale.status).toBe('SETTLED');

    const stock = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = stock.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem.availableKg).toBe(500 - 100);
    expect(dem.soldKg).toBe(100);
  });

  it('lot en vente sans écoulement → alerte invendus VENTE (JAUNE)', async () => {
    const alert = await activeAlert('VENTE', batchCId);
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('JAUNE');
  });

  it('clôture d’un lot en perte (dépense 1000, aucun revenu) → alerte rentabilité ROUGE', async () => {
    batchBId = await createBatch('Lot PnL (perte)', 800);

    await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'ALIMENTS',
        amountFcfa: 1000,
        label: 'Complément provende',
        batchId: batchBId,
      })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/batches/${batchBId}/cloture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const alert = await waitForAlert('RENTABILITE', batchBId);
    expect(alert).toBeTruthy();
    expect(alert.level).toBe('ROUGE');
    expect(alert.message).toContain('perte');
  });

  it('compte de résultat du lot : revenus produits, coût poussins enrichi', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/rentabilite/batches/${batchAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.revenueFcfa).toBe(30000 + 200000);
    expect(res.body.kgSold).toBe(100);
    expect(res.body.birdsSold).toBe(10 + 20);
    expect(res.body.enrichment.chickCostFcfa).toBe(1000 * 300);
  });

  it('dépense payée par la caisse (25000 TRANSPORT) → mouvement OUT et rapport de période à jour', async () => {
    await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'TRANSPORT',
        amountFcfa: 25000,
        label: 'Livraison Marché Nzeng-Ayong',
        supplier: 'Taxi-brousse',
        paidByCaisse: true,
      })
      .expect(201);

    const caisse = await currentCaisse();
    expect(caisse.inFcfa).toBe(30000 + 50000 + 150000 + 30000);
    expect(caisse.outFcfa).toBe(25000);
    expect(caisse.expectedBalanceFcfa).toBe(5000 + 260000 - 25000);

    const overview = await request(server)
      .get(`/farms/${farmId}/rentabilite/overview`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.body.sales.totalFcfa).toBe(260000);
    expect(overview.body.collectedFcfa).toBe(260000);
    expect(overview.body.outstandingFcfa).toBe(0);
    expect(overview.body.expenses.totalFcfa).toBe(26000);
    expect(overview.body.netFcfa).toBe(260000 - 26000);
  });

  it('reçu PDF avec QR : contenu %PDF', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/sales/${saleAId}/receipt`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.body.length).toBeGreaterThan(1000);
  });

  it('exports PDF du rapport de période et du résultat de lot', async () => {
    const overview = await request(server)
      .get(`/farms/${farmId}/rentabilite/overview/export`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(overview.headers['content-type']).toContain('application/pdf');
    expect(overview.body.length).toBeGreaterThan(1000);

    const batch = await request(server)
      .get(`/farms/${farmId}/rentabilite/batches/${batchBId}/export`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.headers['content-type']).toContain('application/pdf');
    expect(batch.body.length).toBeGreaterThan(1000);
  });

  it('listes : ventes et dépenses renvoyées par l’API (200)', async () => {
    const sales = await request(server)
      .get(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(sales.body)).toBe(true);
    expect(sales.body.length).toBeGreaterThanOrEqual(3);
    expect(sales.body[0].referenceNumber).toMatch(/^VTE-\d{8}-\d{6}$/);

    const settled = await request(server)
      .get(`/farms/${farmId}/sales?status=SETTLED`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(settled.body.every((s: any) => s.status === 'SETTLED')).toBe(true);

    const expenses = await request(server)
      .get(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(Array.isArray(expenses.body)).toBe(true);
    expect(expenses.body.length).toBeGreaterThanOrEqual(2);
  });

  it('clôture de caisse : solde déclaré = attendu → écart nul', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ declaredBalanceFcfa: 240000 })
      .expect(201);
    expect(res.body.status).toBe('CLOSED');
    expect(res.body.closingExpectedFcfa).toBe(240000);
    expect(res.body.closingDifferenceFcfa).toBe(0);

    const current = await currentCaisse();
    expect(current?.session ?? null).toBeNull();
  });

  it('annulation d’une vente (PROPRIÉTAIRE) : remboursement + réintégration du stock provende', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 240000 })
      .expect(201);

    const res = await request(server)
      .delete(
        `/farms/${farmId}/sales/${saleCId}?reason=${encodeURIComponent('Client sans fonds')}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.status).toBe('CANCELLED');
    expect(res.body.cancelledReason).toBe('Client sans fonds');

    const payments = await request(server)
      .get(`/farms/${farmId}/payments?saleId=${saleCId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(payments.body).toHaveLength(1);
    expect(payments.body[0].status).toBe('REFUNDED');

    const stock = await request(server)
      .get(`/farms/${farmId}/feed-stock`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dem = stock.body.byType.find((t: any) => t.foodType === 'DEMARRAGE');
    expect(dem.availableKg).toBe(500);
    expect(dem.soldKg).toBe(0);

    await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ declaredBalanceFcfa: 210000 })
      .expect(201);
  });

  it('idempotence scopée par vente : une clé réutilisée sur une autre vente ne renvoie pas l’ancien paiement', async () => {
    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 0 })
      .expect(201);

    const saleX = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unitPriceFcfa: 3000,
            batchId: batchAId,
          },
        ],
        payments: [
          { method: 'CASH', amountFcfa: 3000, idempotencyKey: 'idem-x' },
        ],
      })
      .expect(201);
    const saleXId = saleX.body.sale.id;
    expect(saleX.body.payments).toHaveLength(1);
    expect(saleX.body.payments[0].saleId).toBe(saleXId);

    const saleY = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unitPriceFcfa: 3000,
            batchId: batchAId,
          },
        ],
        payments: [
          { method: 'CASH', amountFcfa: 3000, idempotencyKey: 'idem-x' },
        ],
      })
      .expect(201);
    const saleYId = saleY.body.sale.id;
    expect(saleYId).not.toBe(saleXId);
    expect(saleY.body.payments).toHaveLength(1);
    expect(saleY.body.payments[0].saleId).toBe(saleYId);

    const paymentsOfY = await request(server)
      .get(`/farms/${farmId}/payments?saleId=${saleYId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(paymentsOfY.body).toHaveLength(1);
    expect(paymentsOfY.body[0].saleId).toBe(saleYId);
  });

  it('invendus détectés au niveau des articles : une vente liée par item éteint l’alerte VENTE du lot', async () => {
    const batchDId = await createBatch('Lot D invendus par articles');
    await request(server)
      .post(`/farms/${farmId}/batches/${batchDId}/vente`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unitPriceFcfa: 3000,
            batchId: batchDId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 3000 }],
      })
      .expect(201);

    const alert = await activeAlert('VENTE', batchDId);
    expect(alert).toBeUndefined();
  });

  it('vente de provende au-delà du stock du lot → 400 (comme le cheptel)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'PROVENDE',
            quantity: 11,
            unit: 'SAC',
            unitPriceFcfa: 15000,
            inputLotId: feedLotId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 165000 }],
      })
      .expect(400);
    expect(res.body.message).toContain('insuffisant');
  });

  it('un utilisateur d’une autre ferme n’a accès à rien → 403', async () => {
    await request(server)
      .get(`/farms/${farmId}/customers`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/rentabilite/overview`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
    await request(server)
      .delete(`/farms/${farmId}/sales/${saleAId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });

  afterAll(async () => {
    await app.close();
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Audit — robustesse finance/inventaire/sécurité (e2e, passe 2)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let otherFarmId: string;
  let batchAId: string;
  let slaughterBatchId: string;
  let feedLotId: string;
  let foreignLotId: string;
  let empToken: string;
  let platformToken: string;

  async function createBatch(name: string, chickUnitPriceFcfa?: number) {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: name,
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        ...(chickUnitPriceFcfa !== undefined ? { chickUnitPriceFcfa } : {}),
      })
      .expect(201);
    return res.body.id;
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

    platformToken = (await createPlatformAdmin(server, app.get(DataSource)))
      .token;
    const owner = await createProgrammeFarm(server, platformToken, {
      name: `Ferme Robustesse ${Date.now()}`,
      exploitantName: 'Proprio Robustesse',
    });
    token = owner.ownerToken;
    farmId = owner.farmId;

    // Seconde ferme (autre propriétaire) pour tester les fuites cross-ferme.
    const other = await createProgrammeFarm(server, platformToken, {
      name: `Autre Ferme ${Date.now()}`,
      provinceCode: 'G2',
      exploitantName: 'Autre Proprio',
    });
    otherToken = other.ownerToken;
    otherFarmId = other.farmId;

    batchAId = await createBatch('Lot Robuste P&L', 1000);
    slaughterBatchId = await createBatch('Lot Abattage Robuste');

    const feed = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende liée au lot',
        supplier: 'CEAG',
        supplierLotNumber: `RB-${Date.now()}`,
        quantity: 2,
        unit: 'SAC',
        unitPriceFcfa: 15000,
        batchId: batchAId,
      })
      .expect(201);
    feedLotId = feed.body.id;

    const foreign = await request(server)
      .post(`/farms/${otherFarmId}/inputs`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende étrangère',
        supplier: 'Autre',
        supplierLotNumber: `FO-${Date.now()}`,
        quantity: 100,
        unit: 'SAC',
      })
      .expect(201);
    foreignLotId = foreign.body.id;

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 0 })
      .expect(201);
  });

  it('P&L lot : netFcfa déduit automatiquement poussins + aliments liés (ALIMENT), kgSold = poulet au kilo uniquement', async () => {
    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        customerName: 'Intégration P&L',
        items: [
          {
            productType: 'POULET_KG',
            quantity: 20,
            unit: 'KG',
            pieceCount: 5,
            unitPriceFcfa: 2000,
            batchId: batchAId,
          },
          {
            productType: 'PROVENDE',
            quantity: 50,
            unit: 'KG',
            unitPriceFcfa: 300,
            inputLotId: feedLotId,
            batchId: batchAId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 55000 }],
      })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'ALIMENTS',
        amountFcfa: 1000,
        label: 'Complément',
        batchId: batchAId,
      })
      .expect(201);

    const res = await request(server)
      .get(`/farms/${farmId}/rentabilite/batches/${batchAId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.kgSold).toBe(20);
    expect(res.body.birdsSold).toBe(5);
    expect(res.body.revenueFcfa).toBe(55000);
    // Lot creation and feed reception generate their own expenses
    // (poussins 300000 + aliment 2 SAC × 15000) next to the manual 1000.
    expect(res.body.expensesFcfa).toBe(1000 + 300000 + 30000);
    expect(res.body.enrichment.chickCostFcfa).toBe(300000);
    expect(res.body.enrichment.feedLotsCostFcfa).toBe(30000);
    // Counted once: 55000 − 1000 − 300000 − 30000
    expect(res.body.netFcfa).toBe(-276000);
    expect(res.body.costPerKgFcfa).toBe(16550);
    expect(res.body.marginPct).toBeLessThan(0);
  });

  it('caisse : sortie manuelle OUT supérieure au solde disponible refusée (400)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/caisse/movements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'OUT', amountFcfa: 500000, reason: 'Test' })
      .expect(400);
    expect(res.body.message).toContain('négative');
  });

  it('dépense payée par caisse supérieure au solde → 400 (transactionnelle, pas de mouvement orphelin)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        category: 'TRANSPORT',
        amountFcfa: 500000,
        label: 'Trop grand',
        paidByCaisse: true,
      })
      .expect(400);
    expect(res.body.message).toContain('caisse');
  });

  it('clé d’idempotence dupliquée dans un même payload → un seul paiement, pas de double encaissement', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unit: 'PIECE',
            unitPriceFcfa: 5000,
            batchId: batchAId,
          },
        ],
        payments: [
          { method: 'CASH', amountFcfa: 2000, idempotencyKey: 'dup-cle-1' },
          { method: 'CASH', amountFcfa: 3000, idempotencyKey: 'dup-cle-1' },
        ],
      })
      .expect(201);
    expect(res.body.sale.status).toBe('OUTSTANDING');
    expect(res.body.payments).toHaveLength(1);
    expect(res.body.payments[0].amountFcfa).toBe(2000);
  });

  it('abattage : un ordre DRAFT ne peut pas être traité directement (400)', async () => {
    const order = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: slaughterBatchId,
        slaughterType: 'VIVANT',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 10,
      })
      .expect(201);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${order.body.id}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('SENT');
  });

  it('abattage : garde de stock à l’envoi (plus d’oiseaux que le cheptel vivant → 400)', async () => {
    const order = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: slaughterBatchId,
        slaughterType: 'ABATTU',
        destination: 'EXTERNE',
        plannedDate: today(),
        birdCount: 500,
      })
      .expect(201);
    const res = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${order.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
    expect(res.body.message).toContain('Cheptel insuffisant');
  });

  it('abattage : le traitement (SENT → PROCESSED) décrémente le cheptel vivant', async () => {
    const order = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: slaughterBatchId,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 10,
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${order.body.id}/send`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    const processed = await request(server)
      .post(`/farms/${farmId}/slaughter-orders/${order.body.id}/process`)
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(201);
    expect(processed.body.status).toBe('PROCESSED');

    const batch = await request(server)
      .get(`/farms/${farmId}/batches/${slaughterBatchId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(batch.body.quantityAlive).toBe(290);
  });

  it('saisie journalière : inputLotId d’une autre ferme rejeté (400)', async () => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches/${batchAId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: today(),
        feedQuantity: 0,
        feedUnit: 'KG',
        inputLotId: foreignLotId,
      })
      .expect(400);
    expect(res.body.message).toContain('ferme');
  });

  it('compte Éleveur : passwordHash jamais exposé, accès POS, 403 sur les actes Propriétaire', async () => {
    const empPhone = uniquePhone();
    const created = await request(server)
      .post(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        phone: empPhone,
        fullName: 'Éleveur Robuste',
        code: 'secret123',
      })
      .expect(201);
    expect('passwordHash' in created.body.user).toBe(false);
    expect(created.body.user.role).toBe('ELEVEUR');
    expect(created.body.employment.farmId).toBe(farmId);

    const login = await request(server)
      .post('/auth/login')
      .send({ phone: empPhone, code: 'secret123' })
      .expect(201);
    empToken = login.body.accessToken;

    await request(server)
      .get(`/farms/${farmId}/caisse/current`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(200);

    // Éleveur : vend et encaisse au POS.
    const empSale = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId: batchAId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 3000 }],
      })
      .expect(201);
    expect(empSale.body.sale.status).toBe('SETTLED');

    // Actes strictement Propriétaire : 403.
    await request(server)
      .delete(`/farms/${farmId}/sales/${empSale.body.sale.id}`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/caisse/movements`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ type: 'OUT', amountFcfa: 100, reason: 'interdit' })
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ declaredBalanceFcfa: 0 })
      .expect(403);
    await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${empToken}`)
      .send({ category: 'ALIMENTS', amountFcfa: 100 })
      .expect(403);
    await request(server)
      .get(`/farms/${farmId}/eleveurs`)
      .set('Authorization', `Bearer ${empToken}`)
      .expect(403);
  });

  it('login : message unifié (pas d’énumération) et téléphone normalisé (trim + casse)', async () => {
    const missing = await request(server)
      .post('/auth/login')
      .send({ phone: `+24199inexistant${Date.now()}`, code: 'wrong123' })
      .expect(401);
    expect(missing.body.message).toContain('Identifiants invalides');
    expect(missing.body.message).not.toContain('introuvable');

    // The only open sign-up is the buyer's.
    const buyer = await registerBuyer(server, { fullName: 'Cas Téléphone' });
    await request(server)
      .post('/auth/login')
      .send({ phone: `  ${buyer.phone.toUpperCase()}  `, code: buyer.code })
      .expect(201);
  });

  it('constante de référence : valeur 0 refusée (strictement positive), admin uniquement', async () => {
    const adminToken = platformToken;

    // Un Propriétaire n’a plus le droit de modifier les constantes.
    await request(server)
      .patch('/reference-constants/default_sac_kg')
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 50 })
      .expect(403);

    await request(server)
      .patch('/reference-constants/default_sac_kg')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 0 })
      .expect(400);
    await request(server)
      .patch('/reference-constants/default_sac_kg')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 50 })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});

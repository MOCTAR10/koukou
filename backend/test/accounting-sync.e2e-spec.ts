import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * M11b — Synchronisation comptable temps réel : commandes (livraison →
 * reconnaissance SALE / ajustement post-init / annulation avant livraison),
 * dépenses (reclassement de catégorie, suppression), caisse (édition et
 * suppression de mouvements manuels). Chaque mutation reste équilibrée et
 * idempotente (ferme, source, sourceId) unique.
 */
describe('M11b — Synchronisation comptable (commandes, dépenses, caisse) (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let noInitFarmId: string;
  let batchId: string;
  let noInitBatchId: string;

  async function login(phone: string, code: string) {
    const res = await request(server)
      .post('/auth/login')
      .send({ phone, code })
      .expect(201);
    return res.body.accessToken as string;
  }

  async function createFarm(name: string) {
    const res = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function createBatch(fid: string, name: string, stamp: number) {
    const res = await request(server)
      .post(`/farms/${fid}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: name,
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CL-${stamp}`,
        hatchDate: today(),
        chickUnitPriceFcfa: 1000,
      })
      .expect(201);
    return res.body.id as string;
  }

  async function journal(fid: string) {
    const res = await request(server)
      .get(`/farms/${fid}/accounting/journal`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.entries as any[];
  }

  async function findEntry(fid: string, sourceId: string) {
    const entries = await journal(fid);
    return entries.find((e: any) => e.sourceId === sourceId);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const stamp = Date.now();
    const phone = (n: number) => `+24171${stamp}${n}`;
    await request(server)
      .post('/auth/register')
      .send({ phone: phone(1), fullName: 'Proprio Sync', code: 'secret123' })
      .expect(201);
    token = await login(phone(1), 'secret123');

    farmId = await createFarm(`Ferme Sync ${stamp}`);
    noInitFarmId = await createFarm(`Ferme Sync Sans-init ${stamp}`);
    batchId = await createBatch(farmId, 'Lot Sync', stamp);
    noInitBatchId = await createBatch(noInitFarmId, 'Lot Sync 2', stamp + 1);

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);
    await request(server)
      .post(`/farms/${noInitFarmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);
  }, 180000);

  afterAll(async () => {
    await app.close();
  });

  it('commande livrée → SALE aux quantités finales (reconnaissance à la livraison)', async () => {
    const orderRes = await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'FERME',
        expectedDate: today(),
        customerPhone: '+241711234567',
        customerName: 'Client Commande',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 10,
            unit: 'PIECE',
            unitPriceFcfa: 3500,
            batchId,
          },
        ],
      })
      .expect(201);
    const orderId = orderRes.body.id;
    const saleId = orderRes.body.sale.id;
    const saleItemId = orderRes.body.items[0].saleItemId as string;

    // Pas encore de chiffre d'affaires reconnu tant que ce n'est pas livré.
    expect(await findEntry(farmId, `sale:${saleId}`)).toBeUndefined();

    await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/deposit`)
      .set('Authorization', `Bearer ${token}`)
      .send({ method: 'CASH', amountFcfa: 1000 })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/livrer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ saleItemId, quantity: 8 }] })
      .expect(201);

    const sale = await findEntry(farmId, `sale:${saleId}`);
    expect(sale).toBeDefined();
    expect(sale.source).toBe('SALE');
    expect(sale.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '411', debitFcfa: 28000 }),
        expect.objectContaining({ accountCode: '7011', creditFcfa: 28000 }),
      ]),
    );
  });

  it('commande : init antérieurs puis livraison modifiée → ajustement équilibré', async () => {
    const orderRes = await request(server)
      .post(`/farms/${farmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'PRECOMMANDE',
        expectedDate: today(),
        customerPhone: '+241711234577',
        customerName: 'Client Init',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 3000,
            batchId,
          },
        ],
        deposit: { method: 'CASH', amountFcfa: 5000 },
      })
      .expect(201);
    const orderId = orderRes.body.id;
    const saleId = orderRes.body.sale.id;
    const saleItemId = orderRes.body.items[0].saleItemId as string;

    // L'init repasse la vente enveloppe au montant de l'instantané (15000).
    await request(server)
      .post(`/farms/${farmId}/accounting/init`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    const inited = await findEntry(farmId, `sale:${saleId}`);
    expect(inited).toBeDefined();
    expect(inited.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '411', debitFcfa: 15000 }),
        expect.objectContaining({ accountCode: '7011', creditFcfa: 15000 }),
      ]),
    );

    // Livraison finale 4 oiseaux → 12000 : recadrage par ajustement (diff).
    await request(server)
      .post(`/farms/${farmId}/orders/${orderId}/livrer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ items: [{ saleItemId, quantity: 4 }] })
      .expect(201);

    const adj = await findEntry(farmId, `sale:${saleId}:adj`);
    expect(adj).toBeDefined();
    expect(adj.label).toContain('ajustement');
    expect(adj.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '411', creditFcfa: 3000 }),
        expect.objectContaining({ accountCode: '7011', debitFcfa: 3000 }),
      ]),
    );
  });

  it('commande annulée avant livraison (jamais reconnue) → contrepassation acompte, pas d’orpheline', async () => {
    const orderRes = await request(server)
      .post(`/farms/${noInitFarmId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        canal: 'FERME',
        expectedDate: today(),
        customerPhone: '+241711234587',
        customerName: 'Client Annulé',
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 10,
            unit: 'PIECE',
            unitPriceFcfa: 1400,
            batchId: noInitBatchId,
          },
        ],
        deposit: { method: 'CASH', amountFcfa: 7000 },
      })
      .expect(201);
    const orderId = orderRes.body.id;
    const saleId = orderRes.body.sale.id;

    await request(server)
      .delete(`/farms/${noInitFarmId}/orders/${orderId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Client renonce' })
      .expect(200);

    // Aucune vente jamais reconnue → ni écriture SALE ni annulation complète.
    expect(await findEntry(noInitFarmId, `sale:${saleId}`)).toBeUndefined();
    expect(await findEntry(noInitFarmId, `cancel:${saleId}`)).toBeUndefined();
    // L'acompte rendu est contre-passé (411/571), l'écriture reste équilibrée.
    const deposits = await findEntry(noInitFarmId, `cancel-deposits:${saleId}`);
    expect(deposits).toBeDefined();
    expect(deposits.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '411', debitFcfa: 7000 }),
        expect.objectContaining({ accountCode: '571', creditFcfa: 7000 }),
      ]),
    );
  });

  it('dépense : changement de catégorie → reclassement du compte de charge', async () => {
    const expRes = await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'TRANSPORT', amountFcfa: 5000, label: 'Transport test' })
      .expect(201);
    const expenseId = expRes.body.id;

    await request(server)
      .patch(`/farms/${farmId}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'MAIN_D_OEUVRE' })
      .expect(200);

    const adj = await findEntry(farmId, `expense:${expenseId}:adj`);
    expect(adj).toBeDefined();
    expect(adj.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '641', debitFcfa: 5000 }),
        expect.objectContaining({ accountCode: '604', creditFcfa: 5000 }),
      ]),
    );
  });

  it('dépense : suppression → contrepassation intégrale', async () => {
    const expRes = await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'TRANSPORT', amountFcfa: 3000, label: 'Transport 2' })
      .expect(201);
    const expenseId = expRes.body.id;

    await request(server)
      .delete(`/farms/${farmId}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(await findEntry(farmId, `expense:${expenseId}`)).toBeDefined();

    const reversal = await findEntry(farmId, `expense-cancel:${expenseId}`);
    expect(reversal).toBeDefined();
    expect(reversal.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '401', debitFcfa: 3000 }),
        expect.objectContaining({ accountCode: '604', creditFcfa: 3000 }),
      ]),
    );
  });

  it('dépense payée depuis la caisse : suppression refusée si session clôturée', async () => {
    const expRes = await request(server)
      .post(`/farms/${farmId}/expenses`)
      .set('Authorization', `Bearer ${token}`)
      .send({ category: 'ALIMENTS', amountFcfa: 6000, paidByCaisse: true })
      .expect(201);
    const expenseId = expRes.body.id;

    const current = await request(server)
      .get(`/farms/${farmId}/caisse/current`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    await request(server)
      .post(`/farms/${farmId}/caisse/close`)
      .set('Authorization', `Bearer ${token}`)
      .send({ declaredBalanceFcfa: current.body.expectedBalanceFcfa })
      .expect(201);

    await request(server)
      .delete(`/farms/${farmId}/expenses/${expenseId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 100000 })
      .expect(201);
  });

  it('caisse : édition de mouvement manuel → ajustement comptable', async () => {
    const movRes = await request(server)
      .post(`/farms/${farmId}/caisse/movements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'OUT', amountFcfa: 3000, reason: 'Sortie test' })
      .expect(201);
    const movementId = movRes.body.id;

    const base = await findEntry(farmId, `movement:${movementId}`);
    expect(base).toBeDefined();
    expect(base.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '108', debitFcfa: 3000 }),
        expect.objectContaining({ accountCode: '571', creditFcfa: 3000 }),
      ]),
    );

    await request(server)
      .patch(`/farms/${farmId}/caisse/movements/${movementId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ amountFcfa: 2000 })
      .expect(200);

    const adj = await findEntry(farmId, `movement:${movementId}:adj`);
    expect(adj).toBeDefined();
    expect(adj.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '571', debitFcfa: 1000 }),
        expect.objectContaining({ accountCode: '108', creditFcfa: 1000 }),
      ]),
    );
  });

  it('caisse : suppression de mouvement manuel → contrepassation', async () => {
    const movRes = await request(server)
      .post(`/farms/${farmId}/caisse/movements`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'IN', amountFcfa: 2000, reason: 'Apport test' })
      .expect(201);
    const movementId = movRes.body.id;

    await request(server)
      .delete(`/farms/${farmId}/caisse/movements/${movementId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const reversal = await findEntry(farmId, `movement-cancel:${movementId}`);
    expect(reversal).toBeDefined();
    expect(reversal.lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountCode: '108', debitFcfa: 2000 }),
        expect.objectContaining({ accountCode: '571', creditFcfa: 2000 }),
      ]),
    );
  });

  it('caisse : un mouvement non manuel (placeholder) est refusé en suppression', async () => {
    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 2,
            unit: 'PIECE',
            unitPriceFcfa: 1500,
            batchId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 3000 }],
      })
      .expect(201);

    const current = await request(server)
      .get(`/farms/${farmId}/caisse/current`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const payMovement = current.body.movements.find(
      (m: any) => m.source === 'SALE_PAYMENT',
    );
    expect(payMovement).toBeDefined();

    await request(server)
      .delete(`/farms/${farmId}/caisse/movements/${payMovement.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('invariant : la balance reste équilibrée après toutes les opérations', async () => {
    const bilan = await request(server)
      .get(`/farms/${farmId}/accounting/bilan`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(bilan.body.ecartFcfa).toBe(0);
  });
});
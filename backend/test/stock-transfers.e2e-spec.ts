import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Transferts de stock ferme → boutique (carcasses / œufs / provende) :
 * décréments du stock source, réserves consommables en vente boutique,
 * retour d'invendus via l'annulation du transfert.
 */
describe('Transferts de stock ferme → boutique (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let otherToken: string;
  let farmId: string;
  let farmPosId: string;
  let boutiqueId: string;
  let abattoirId: string;
  let pondBatchId: string;
  let feedLotId: string;
  let chairId: string;

  function post(url: string, body: object, auth = token) {
    return request(server)
      .post(url)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  }

  function get(url: string, auth = token) {
    return request(server).get(url).set('Authorization', `Bearer ${auth}`);
  }

  function del(url: string, auth = token) {
    return request(server).delete(url).set('Authorization', `Bearer ${auth}`);
  }

  async function createTransfer(
    body: object,
    auth = token,
  ): Promise<request.Response> {
    return post(`/farms/${farmId}/stock-transfers`, body, auth);
  }

  beforeAll(
    async () => {
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    server = app.getHttpServer();

    const phone = `+24170${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: 'Proprio Transferts', code: 'secret123' })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    token = login.body.accessToken;

    const otherPhone = `+24171${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({ phone: otherPhone, fullName: 'Autre Proprio', code: 'secret123' })
      .expect(201);
    const otherLogin = await request(server)
      .post('/auth/login')
      .send({ phone: otherPhone, code: 'secret123' })
      .expect(201);
    otherToken = otherLogin.body.accessToken;

    const farm = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: `Ferme Transferts ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    // Point de vente par défaut (FERME) + boutique externe.
    const posList = await get(`/farms/${farmId}/points-of-sale`);
    farmPosId = posList.body.find((p: any) => p.kind === 'FERME').id;
    const boutique = await request(server)
      .post(`/farms/${farmId}/points-of-sale`)
      .set('Authorization', `Bearer ${token}`)
      .send({ kind: 'BOUTIQUE', name: 'Boutique Choucou', city: 'Libreville' })
      .expect(201);
    boutiqueId = boutique.body.id;

    // Lot CHAIR + ordre d'abattage ABATTU traité → pool de carcasses.
    const chair = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot chair transferts',
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CT-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    chairId = chair.body.id;
    const order = await request(server)
      .post(`/farms/${farmId}/slaughter-orders`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: chair.body.id,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: today(),
        birdCount: 100,
      })
      .expect(201);
    abattoirId = order.body.id;
    await post(`/farms/${farmId}/slaughter-orders/${abattoirId}/send`, {}).expect(
      201,
    );
    const processed = await post(
      `/farms/${farmId}/slaughter-orders/${abattoirId}/process`,
      {},
    ).expect(201);
    expect(processed.body.carcassesAvailable).toBe(100);

    // Lot PONDEUSE + ponte → 300 œufs disponibles (10 alvéoles).
    const pondeuses = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande pondeuses transferts',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'PONDEUSE',
      })
      .expect(201);
    pondBatchId = pondeuses.body.id;
    await post(
      `/farms/${farmId}/batches/${pondBatchId}/daily-entries`,
      {
        entryDate: today(),
        deaths: 0,
        eggsCollected: 300,
        eggsSellable: 300,
        eggsCracked: 0,
        eggsSmall: 0,
        eggsDoubleYolk: 0,
        eggsDirty: 0,
      },
    ).expect(201);

    // Lot d'aliment : 10 sacs (défaut 50 kg/sac → 500 kg disponibles).
    const feed = await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende transferts',
        supplier: 'FeedCo',
        supplierLotNumber: `FT-${Date.now()}`,
        quantity: 10,
        unit: 'SAC',
      })
      .expect(201);
    feedLotId = feed.body.id;

    // Caisse ouverte pour les ventes (débit/réemboursement).
    await post(`/farms/${farmId}/caisse/open`, {
      openingBalanceFcfa: 100000,
    }).expect(201);
  },
  120000,
);

  it('refuse un transfert vers le point ferme (seul un point externe reçoit)', async () => {
    const res = await createTransfer({
      productType: 'ABATTU',
      slaughterOrderId: abattoirId,
      pointOfSaleId: farmPosId,
      quantity: 5,
    });
    expect(res.status).toBe(400);
    expect(res.body.message as string).toContain('Seule une boutique');
  });

  it('ABATTU : exige l’ordre d’abattage et la quantité ≥ 1 (validation)', async () => {
    const missing = await createTransfer({
      productType: 'ABATTU',
      pointOfSaleId: boutiqueId,
      quantity: 5,
    });
    expect(missing.status).toBe(400);
    expect(missing.body.message as string).toContain('ordre d’abattage');

    const zero = await createTransfer({
      productType: 'ABATTU',
      slaughterOrderId: abattoirId,
      pointOfSaleId: boutiqueId,
      quantity: 0,
    });
    expect(zero.status).toBe(400);
  });

  it('ABATTU : transfert valide → décrémente le pool du lot d’abattage', async () => {
    const res = await createTransfer({
      productType: 'ABATTU',
      slaughterOrderId: abattoirId,
      pointOfSaleId: boutiqueId,
      quantity: 20,
    });
    expect(res.status).toBe(201);
    expect(res.body.productType).toBe('ABATTU');
    expect(res.body.quantity).toBe(20);
    expect(res.body.unit).toBe('PIECE');
    expect(res.body.status).toBe('TRANSFERRED');
    expect(res.body.sourcePosId).toBe(farmPosId);
    expect(res.body.pointOfSaleId).toBe(boutiqueId);
    expect(res.body.abattoirId ?? res.body.slaughterOrderId).toBe(abattoirId);

    const order = await get(
      `/farms/${farmId}/slaughter-orders/${abattoirId}`,
    );
    expect(order.body.carcassesAvailable).toBe(80);
    abattoirTransferId = res.body.id;
  });

  it('ABATTU : dépasser le pool disponible → 400', async () => {
    const res = await createTransfer({
      productType: 'ABATTU',
      slaughterOrderId: abattoirId,
      pointOfSaleId: boutiqueId,
      quantity: 200,
    });
    expect(res.status).toBe(400);
    expect(res.body.message as string).toContain('Carcasses insuffisantes');
  });

  it('une autre ferme ne peut pas transférer ici (403)', async () => {
    const res = await createTransfer(
      {
        productType: 'ABATTU',
        slaughterOrderId: abattoirId,
        pointOfSaleId: boutiqueId,
        quantity: 1,
      },
      otherToken,
    );
    expect(res.status).toBe(403);
  });

  it('OEUFS : transfert de 5 alvéoles → réserve réservée', async () => {
    const res = await createTransfer({
      productType: 'OEUFS',
      batchId: pondBatchId,
      pointOfSaleId: boutiqueId,
      quantity: 5,
    });
    expect(res.status).toBe(201);
    expect(res.body.unit).toBe('ALVEOLES');
    eggsTransferId = res.body.id;
  });

  it('OEUFS : vente boutique puisant dans la réserve (quantitéSold + 3)', async () => {
    const sale = await post(`/farms/${farmId}/sales`, {
      pointOfSaleId: boutiqueId,
      items: [
        {
          productType: 'OEUFS',
          quantity: 3,
          unit: 'ALVEOLES',
          unitPriceFcfa: 1200,
          batchId: pondBatchId,
          stockTransferId: eggsTransferId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 3600 }],
    });
    expect(sale.status).toBe(201);
    const item = (sale.body.items as any[]).find(
      (i: any) => i.stockTransferId === eggsTransferId,
    );
    expect(item).toBeDefined();

    const transfer = await get(
      `/farms/${farmId}/stock-transfers?productType=OEUFS`,
    );
    const found = transfer.body.find((t: any) => t.id === eggsTransferId);
    expect(found.quantitySold).toBe(3);
  });

  it('OEUFS : dépasser la réserve du transfert → 400', async () => {
    const sale = await post(`/farms/${farmId}/sales`, {
      pointOfSaleId: boutiqueId,
      items: [
        {
          productType: 'OEUFS',
          quantity: 5,
          unit: 'ALVEOLES',
          unitPriceFcfa: 1200,
          batchId: pondBatchId,
          stockTransferId: eggsTransferId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 6000 }],
    });
    expect(sale.status).toBe(400);
    expect(sale.body.message as string).toContain('Réserve insuffisante');
  });

  it('OEUFS : le stock ferme tient compte des réserves ouvertes (vente 6 alvéoles refusée)', async () => {
    // 300 œufs − 90 vendus (boutique) − 60 réservés (2 alvéoles restantes) = 150 œufs = 5 alvéoles.
    const farmSale = await post(`/farms/${farmId}/sales`, {
      items: [
        {
          productType: 'OEUFS',
          quantity: 6,
          unit: 'ALVEOLES',
          unitPriceFcfa: 1200,
          batchId: pondBatchId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 7200 }],
    });
    expect(farmSale.status).toBe(400);
    expect(farmSale.body.message as string).toContain('Stock d’œufs insuffisant');

    const okSale = await post(`/farms/${farmId}/sales`, {
      items: [
        {
          productType: 'OEUFS',
          quantity: 4,
          unit: 'ALVEOLES',
          unitPriceFcfa: 1200,
          batchId: pondBatchId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 4800 }],
    });
    expect(okSale.status).toBe(201);
    farmEggSaleId = okSale.body.sale.id;
  });

  it('annulation de vente : la réserve du transfert est réintégrée', async () => {
    const res = await del(`/farms/${farmId}/sales/${farmEggSaleId}`);
    expect(res.status).toBe(200);
  });

  it('ABATTU : vente boutique depuis la réserve puis annulation réintègre le transfert', async () => {
    const sale = await post(`/farms/${farmId}/sales`, {
      pointOfSaleId: boutiqueId,
      items: [
        {
          productType: 'ABATTU_PIECE',
          quantity: 3,
          unit: 'PIECE',
          unitPriceFcfa: 6000,
          batchId: chairId,
          stockTransferId: abattoirTransferId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 18000 }],
    });
    expect(sale.status).toBe(201);
    const item = (sale.body.items as any[]).find(
      (i: any) => i.stockTransferId === abattoirTransferId,
    );
    expect(item).toBeDefined();
    expect(item.pieceCount).toBe(3);

    let transfer = await transferById(abattoirTransferId);
    expect(transfer.quantitySold).toBe(3);

    await del(`/farms/${farmId}/sales/${sale.body.sale.id}`).expect(200);
    transfer = await transferById(abattoirTransferId);
    expect(transfer.quantitySold).toBe(0);
  });

  it('annulation d’un transfert : les invendus reviennent au pool d’abattage', async () => {
    const cancelled = await post(
      `/farms/${farmId}/stock-transfers/${abattoirTransferId}/cancel`,
      {},
    );
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');
    expect(cancelled.body.cancelledAt).toBeDefined();

    const order = await get(`/farms/${farmId}/slaughter-orders/${abattoirId}`);
    expect(order.body.carcassesAvailable).toBe(100);

    const again = await post(
      `/farms/${farmId}/stock-transfers/${abattoirTransferId}/cancel`,
      {},
    );
    expect(again.status).toBe(400);
    expect(again.body.message as string).toContain('déjà annulé');
  });

  it('PROVENDE : transfert de 3 sacs puis retour de 2 invendus', async () => {
    const transfer = await createTransfer({
      productType: 'PROVENDE',
      inputLotId: feedLotId,
      pointOfSaleId: boutiqueId,
      quantity: 3,
      unit: 'SAC',
    });
    expect(transfer.status).toBe(201);
    expect(transfer.body.unit).toBe('SAC');
    feedTransferId = transfer.body.id;

    const sale = await post(`/farms/${farmId}/sales`, {
      pointOfSaleId: boutiqueId,
      items: [
        {
          productType: 'PROVENDE',
          quantity: 1,
          unit: 'SAC',
          unitPriceFcfa: 25000,
          stockTransferId: feedTransferId,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: 25000 }],
    });
    expect(sale.status).toBe(201);

    const cancelled = await post(
      `/farms/${farmId}/stock-transfers/${feedTransferId}/cancel`,
      {},
    );
    expect(cancelled.status).toBe(201);
    expect(cancelled.body.status).toBe('CANCELLED');

    const inputs = await get(`/farms/${farmId}/inputs`);
    const lot = inputs.body.find((l: any) => l.id === feedLotId);
    expect(lot.quantity).toBe(9); // 10 − 3 transférés + 2 invendus restitués.
  });

  it('PROVENDE : dépasser le disponible du lot → 400', async () => {
    const res = await createTransfer({
      productType: 'PROVENDE',
      inputLotId: feedLotId,
      pointOfSaleId: boutiqueId,
      quantity: 30,
      unit: 'SAC',
    });
    expect(res.status).toBe(400);
    expect(res.body.message as string).toContain('aliment insuffisant');
  });

  let abattoirTransferId: string;
  let eggsTransferId: string;
  let feedTransferId: string;
  let farmEggSaleId: string;

  async function transferById(id: string): Promise<any> {
    const list = await get(`/farms/${farmId}/stock-transfers`);
    return list.body.find((t: any) => t.id === id);
  }
});
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Breed } from './../src/modules/breeds/entities/breed.entity.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

describe('Audit complet — immuabilité, stocks, alertes, métriques (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;

  let batchAId: string; // PONDEUSE ISA Brown (taux de ponte glissant)
  let batchBId: string; // PONDEUSE (stock œufs / classes)
  let batchCId: string; // CHAIR clôturé (immuabilité saisie + vente)
  let batchDId: string; // CHAIR fermé APRÈS une vente (annulation bloquée)

  const activeOf = async (kind: string, batchId: string | null = null) => {
    const res = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.find(
      (a: any) =>
        a.kind === kind &&
        (batchId == null ? true : a.batchId === batchId) &&
        a.status === 'ACTIVE',
    );
  };

  const postDailyEntry = (batchId: string, body: Record<string, unknown>) =>
    request(server)
      .post(`/farms/${farmId}/batches/${batchId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entryDate: today(), deaths: 0, ...body })
      .expect(201);

  const dashboard = () =>
    request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

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

    const phone = `+24161${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Audit Complet',
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
        name: `Ferme Audit Complet ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 3000,
      })
      .expect(201);
    farmId = farm.body.id;

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 0 })
      .expect(201);
  });

  it('taux de ponte = fenêtre glissante de 7 jours (et non cumul vie entière)', async () => {
    const breeds = await request(server)
      .get('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const isaId = breeds.body.find((b: any) => b.name === 'ISA Brown')?.id;
    expect(isaId).toBeTruthy();

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande ponte glissante',
        integrationDate: dateStr(addDays(new Date(), -400)),
        quantityAtStart: 100,
        type: 'PONDEUSE',
        breedId: isaId,
      })
      .expect(201);
    batchAId = batch.body.id;

    // Hors fenêtre (il y a 10 jours) : 100 œufs — ne doit PAS compter.
    await request(server)
      .post(`/farms/${farmId}/batches/${batchAId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: dateStr(addDays(new Date(), -10)),
        deaths: 0,
        eggsCollected: 100,
      })
      .expect(201);
    // Dans la fenêtre : 50 œufs sur 1 jour saisi.
    await postDailyEntry(batchAId, {
      eggsCollected: 50,
      eggsSellable: 50,
      eggsCracked: 0,
      eggsSmall: 0,
    });

    const dash = await dashboard();
    const lb = dash.body.leaderboard.find((r: any) => r.batchId === batchAId);
    expect(lb.layRatePercent).toBe(50);
    const row = dash.body.healthOverview.find(
      (r: any) => r.batchId === batchAId,
    );
    expect(row.breedStatus.actualLayRatePercent).toBe(50);
  });

  it('stock œufs déduit fêlés + petits ; garde de vente OEUFS (400 hors stock)', async () => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande pondeuse stock',
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'PONDEUSE',
      })
      .expect(201);
    batchBId = batch.body.id;

    // 100 collectés − 20 fêlés − 10 petits = 70 commercialisables.
    await postDailyEntry(batchBId, {
      eggsCollected: 100,
      eggsSellable: 60,
      eggsCracked: 20,
      eggsSmall: 10,
    });

    // Batch A = 150 œufs commercialisables (aucune casse) + B = 70 → 220.
    let dash = await dashboard();
    expect(dash.body.eggStock.availableEggs).toBe(220);
    expect(dash.body.eggStock.availableAlveoles).toBe(7);

    const sellEggs = (alveoles: number, expectCode: number) =>
      request(server)
        .post(`/farms/${farmId}/sales`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [
            {
              productType: 'OEUFS',
              label: 'Œufs frais (audit)',
              quantity: alveoles,
              unit: 'ALVEOLES',
              unitPriceFcfa: 1000,
            },
          ],
          payments: [{ method: 'CASH', amountFcfa: alveoles * 1000 }],
        })
        .expect(expectCode);

    await sellEggs(2, 201); // 60 œufs
    dash = await dashboard();
    expect(dash.body.eggStock.availableEggs).toBe(160);

    await sellEggs(5, 201); // 150 œufs → reste 10
    dash = await dashboard();
    expect(dash.body.eggStock.availableEggs).toBe(10);

    await sellEggs(1, 400); // 30 œufs demandés > 10 disponibles
  });

  it('immuabilité lot clôturé : saisie journalière interdite + aucune vente rattachable', async () => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande à clôturer',
        integrationDate: today(),
        quantityAtStart: 50,
        type: 'CHAIR',
      })
      .expect(201);
    batchCId = batch.body.id;

    // liveStock inclut le lot actif : 100 (A) + 100 (B) + 50 (C) = 250.
    let dash = await dashboard();
    expect(dash.body.liveStock).toBe(250);

    await request(server)
      .post(`/farms/${farmId}/batches/${batchCId}/cloture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    // Le cheptel vivant exclut désormais le lot clôturé.
    dash = await dashboard();
    expect(dash.body.liveStock).toBe(200);
    expect(dash.body.batches).toEqual({
      total: 3,
      actif: 2,
      enVente: 0,
      cloture: 1,
    });

    await request(server)
      .post(`/farms/${farmId}/batches/${batchCId}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({ entryDate: today(), deaths: 1 })
      .expect(400);

    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 1,
            unit: 'PIECE',
            unitPriceFcfa: 2000,
            batchId: batchCId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 2000 }],
      })
      .expect(400);

    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'OEUFS',
            quantity: 1,
            unit: 'ALVEOLES',
            unitPriceFcfa: 1000,
            batchId: batchCId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 1000 }],
      })
      .expect(400);
  });

  it('annulation d’une vente affectant un lot clôturé → 400 (immuabilité)', async () => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande vendue puis clôturée',
        integrationDate: today(),
        quantityAtStart: 50,
        type: 'CHAIR',
      })
      .expect(201);
    batchDId = batch.body.id;

    const sale = await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'POULET_PIECE',
            quantity: 5,
            unit: 'PIECE',
            unitPriceFcfa: 2000,
            batchId: batchDId,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 10000 }],
      })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/batches/${batchDId}/cloture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    await request(server)
      .delete(`/farms/${farmId}/sales/${sale.body.sale.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('souche en doublon → 409 (au lieu d’un 500 de contrainte)', async () => {
    const name = `Doublon Audit ${Date.now()}`;
    await request(server)
      .post('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHAIR', farmId })
      .expect(201);
    await request(server)
      .post('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .send({ name, type: 'CHAIR', farmId })
      .expect(409);
    await app.get(DataSource).getRepository(Breed).delete({ name });
  });

  it('alerte ACQUITTEE réactivée par un risque persistant, sans doublon', async () => {
    // Un lot ACTIF dont un intrant expire dans 2 jours : PEREMPTION ROUGE.
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande réactivation',
        integrationDate: dateStr(addDays(new Date(), -10)),
        quantityAtStart: 300,
        type: 'CHAIR',
      })
      .expect(201);
    const batchId = batch.body.id;

    await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId,
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende À Périmer',
        supplier: 'CEAG',
        supplierLotNumber: 'REA-1',
        quantity: 10,
        unit: 'SAC',
        expirationDate: dateStr(addDays(new Date(), 2)),
      })
      .expect(201);
    // Réévaluation de l'advisory (mutation du lot) → PEREMPTION active.
    await request(server)
      .patch(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ batchName: 'Bande réactivation (1)' })
      .expect(200);

    const per = await activeOf('PEREMPTION', batchId);
    expect(per).toBeTruthy();
    expect(per.level).toBe('ROUGE');

    await request(server)
      .post(`/farms/${farmId}/alerts/${per.id}/acknowledge`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    // Le risque persiste (péremption toujours dans la fenêtre) : réévaluation
    // → l'alerte acquittée doit être réactivée (ACTIVE), PAS dupliquée.
    await request(server)
      .patch(`/farms/${farmId}/batches/${batchId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ batchName: 'Bande réactivation (2)' })
      .expect(200);

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const pers = alerts.body.filter(
      (a: any) => a.kind === 'PEREMPTION' && a.batchId === batchId,
    );
    expect(pers).toHaveLength(1);
    expect(pers[0]).toMatchObject({ id: per.id, status: 'ACTIVE' });
  });

  it('péremption (division UTC) : intrant périmé → PEREMPTION ROUGE', async () => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande péremption',
        integrationDate: dateStr(addDays(new Date(), -10)),
        quantityAtStart: 300,
        type: 'CHAIR',
      })
      .expect(201);
    const batchFId = batch.body.id;

    await request(server)
      .post(`/farms/${farmId}/inputs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchId: batchFId,
        kind: 'ALIMENT',
        foodType: 'DEMARRAGE',
        productName: 'Provende Périmée Audit Complet',
        supplier: 'CEAG',
        supplierLotNumber: 'PEXPC-1',
        quantity: 10,
        unit: 'SAC',
        expirationDate: dateStr(addDays(new Date(), -2)),
      })
      .expect(201);
    await request(server)
      .patch(`/farms/${farmId}/batches/${batchFId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ batchName: 'Bande péremption renommée' })
      .expect(200);

    const peremption = await activeOf('PEREMPTION', batchFId);
    expect(peremption).toBeTruthy();
    expect(peremption.level).toBe('ROUGE');
  });

  afterAll(async () => {
    await app.close();
  });
});

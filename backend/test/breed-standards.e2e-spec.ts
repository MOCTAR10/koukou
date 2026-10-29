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

describe('Référentiel souches & aperçu santé (Breed Intelligence) (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let cobbId: string;
  let isaId: string;

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

    const phone = `+24166${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Souches',
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
        name: `Ferme Souches ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 3000,
      })
      .expect(201);
    farmId = farm.body.id;

    const breeds = await request(server)
      .get('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const names: Record<string, string> = {};
    for (const b of breeds.body) names[b.name] = b.id;
    cobbId = names['Cobb 500'];
    isaId = names['ISA Brown'];
    expect(cobbId).toBeTruthy();
    expect(isaId).toBeTruthy();
  });

  it('référentiel chair : 12 semaines (poids + IC), pas de cible de ponte', async () => {
    const res = await request(server)
      .get(`/breeds/${cobbId}/standards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.breedId).toBe(cobbId);
    expect(res.body.breedName).toBe('Cobb 500');
    expect(res.body.standards).toHaveLength(12);
    const weeks = res.body.standards.map((s: { week: number }) => s.week);
    expect(weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(res.body.standards[0].targetAvgWeightKg).toBe(0.18);
    expect(res.body.standards[11].targetAvgWeightKg).toBe(4.55);
    expect(res.body.standards[11].targetFcr).toBe(2.38);
    for (const s of res.body.standards) {
      expect(s.targetLayRatePercent).toBeNull();
      expect(s.targetAvgWeightKg).toBeGreaterThan(0);
      expect(s.targetFcr).toBeGreaterThan(0);
    }
  });

  it('référentiel pondeuse : semaines 18–72 avec taux de ponte de référence', async () => {
    const res = await request(server)
      .get(`/breeds/${isaId}/standards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const byWeek = new Map(
      (
        res.body.standards as Array<{
          week: number;
          targetLayRatePercent: number | null;
          targetAvgWeightKg: number | null;
        }>
      ).map((s) => [s.week, s] as const),
    );
    expect(byWeek.get(18)?.targetLayRatePercent).toBe(5);
    expect(byWeek.get(30)?.targetLayRatePercent).toBe(92);
    expect(byWeek.get(72)?.targetLayRatePercent).toBe(55);
    for (const s of res.body.standards) {
      expect(s.targetAvgWeightKg).toBeNull();
      expect(s.targetFcr).toBeNull();
    }
  });

  it('souche personnalisée → standards vides ; souche absente → 404', async () => {
    const custom = await request(server)
      .post('/breeds')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Maxi Chair Gabon ${Date.now()}`, type: 'CHAIR', farmId })
      .expect(201);
    const res = await request(server)
      .get(`/breeds/${custom.body.id}/standards?farmId=${farmId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.standards).toEqual([]);
    // A custom breed is only visible within its farm.
    await request(server)
      .get(`/breeds/${custom.body.id}/standards`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(server)
      .get('/breeds/00000000-0000-4000-8000-000000000000/standards')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    await app
      .get(DataSource)
      .getRepository(Breed)
      .delete({ id: custom.body.id });
  });

  it('aperçu santé : lot pondeuse comparé à la courbe ISA Brown (Breed Intelligence)', async () => {
    const quiteOld = dateStr(addDays(new Date(), -300));
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande ISA référence',
        integrationDate: quiteOld,
        quantityAtStart: 100,
        type: 'PONDEUSE',
        breedId: isaId,
      })
      .expect(201);

    await request(server)
      .post(`/farms/${farmId}/batches/${batch.body.id}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: today(),
        deaths: 0,
        feedQuantity: 12,
        feedUnit: 'KG',
        feedType: 'FINITION',
        eggsCollected: 60,
      })
      .expect(201);

    const dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = dash.body.healthOverview.find(
      (r: { batchId: string }) => r.batchId === batch.body.id,
    );
    expect(row).toBeTruthy();
    expect(row.lastEntryDate).toBe(today());
    expect(row.lastEntryLagDays).toBe(0);
    expect(row.breedStatus).toBeTruthy();
    expect(row.breedStatus.breedName).toBe('ISA Brown');
    expect(row.breedStatus.week).toBe(42);
    expect(row.breedStatus.targetLayRatePercent).toBe(86);
    expect(row.breedStatus.actualLayRatePercent).toBe(60);
    expect(row.breedStatus.layRateDeviationPct).toBe(-30.23);
    expect(row.breedStatus.targetAvgWeightKg).toBeNull();
  });

  it('aperçu santé : lot sans souche → breedStatus null ; lot introuvable → 404 standards', async () => {
    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande sans souche',
        integrationDate: today(),
        quantityAtStart: 50,
        type: 'CHAIR',
      })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/batches/${batch.body.id}/daily-entries`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        entryDate: today(),
        deaths: 0,
        feedQuantity: 5,
        feedUnit: 'KG',
        feedType: 'DEMARRAGE',
      })
      .expect(201);

    const dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const row = dash.body.healthOverview.find(
      (r: { batchId: string }) => r.batchId === batch.body.id,
    );
    expect(row.breedStatus).toBeNull();
  });

  it('stock œufs : 2 alvéoles sans alerte → 12 alvéoles = alerte JAUNE → résolue après vente', async () => {
    let dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dash.body.eggStock.availableAlveoles).toBe(2);
    expect(dash.body.eggStock.availableEggs).toBe(60);

    const isaBatch = dash.body.healthOverview.find(
      (r: { breedName: string }) => r.breedStatus?.breedName === 'ISA Brown',
    );
    const post = (date: string) =>
      request(server)
        .post(`/farms/${farmId}/batches/${isaBatch.batchId}/daily-entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          entryDate: date,
          deaths: 0,
          feedQuantity: 12,
          feedUnit: 'KG',
          feedType: 'FINITION',
          eggsCollected: 100,
        })
        .expect(201);
    await post(dateStr(addDays(new Date(), -1)));
    await post(dateStr(addDays(new Date(), -2)));
    await post(dateStr(addDays(new Date(), -3)));

    dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dash.body.eggStock.availableAlveoles).toBe(12);
    expect(dash.body.eggStock.availableEggs).toBe(360);
    let alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const stockAlert = alerts.body.find(
      (a: { kind: string; status: string }) =>
        a.kind === 'STOCK_OEUF' && a.status === 'ACTIVE',
    );
    expect(stockAlert).toBeTruthy();
    expect(stockAlert.level).toBe('JAUNE');

    await request(server)
      .post(`/farms/${farmId}/caisse/open`)
      .set('Authorization', `Bearer ${token}`)
      .send({ openingBalanceFcfa: 0 })
      .expect(201);
    await request(server)
      .post(`/farms/${farmId}/sales`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        items: [
          {
            productType: 'OEUFS',
            label: 'Œufs frais',
            quantity: 10,
            unit: 'ALVEOLES',
            unitPriceFcfa: 1000,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 10000 }],
      })
      .expect(201);

    dash = await request(server)
      .get(`/farms/${farmId}/dashboard`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(dash.body.eggStock.availableAlveoles).toBe(2);
    expect(dash.body.eggStock.availableEggs).toBe(60);
    alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      alerts.body.find(
        (a: { kind: string; status: string }) =>
          a.kind === 'STOCK_OEUF' && a.status === 'ACTIVE',
      ),
    ).toBeFalsy();
  });
});

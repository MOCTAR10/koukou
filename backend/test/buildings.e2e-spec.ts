import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { DatabaseSeedService } from './../src/database/database-seed.service.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('Module 1 — Bâtiments & bandes (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let buildingA: string;
  let buildingB: string;

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
  });

  beforeAll(async () => {
    const phone = `+24180${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Bâtiments',
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
        name: `Ferme Bât ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1500,
      })
      .expect(201);
    farmId = farm.body.id;
  });

  it('crée des bâtiments', async () => {
    const a = await request(server)
      .post(`/farms/${farmId}/buildings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bâtiment A', buildingAreaM2: 30, capacity: 3000 })
      .expect(201);
    buildingA = a.body.id;

    const b = await request(server)
      .post(`/farms/${farmId}/buildings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Bâtiment B', buildingAreaM2: 40, capacity: 2000 })
      .expect(201);
    buildingB = b.body.id;
    expect(buildingA).toBeTruthy();
    expect(buildingB).toBeTruthy();
  });

  it('liste les bâtiments avec occupation (0 lot, densité nulle)', async () => {
    const res = await request(server)
      .get(`/farms/${farmId}/buildings`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBe(2);
    expect(res.body.every((x: any) => x.stats.activeBirds === 0)).toBe(true);
  });

  it('installe 2 lots décalés dans le Bâtiment A : densité cumulée + cohabitation d’âges', async () => {
    // Bande 1 : 40 jours (~5.7 semaines), 1500 oiseaux
    await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande A1',
        integrationDate: daysAgo(40),
        quantityAtStart: 1500,
        type: 'CHAIR',
        buildingId: buildingA,
      })
      .expect(201);
    // Bande 2 : poussins de 2 jours, 800 oiseaux — écart d'âge ~5 semaines
    await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande A2',
        integrationDate: daysAgo(2),
        quantityAtStart: 800,
        type: 'CHAIR',
        buildingId: buildingA,
      })
      .expect(201);

    // Densité cumulée au niveau bâtiment : (1500+800) / 30 = 76.7
    const building = await request(server)
      .get(`/farms/${farmId}/buildings/${buildingA}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(building.body.stats.activeBirds).toBe(2300);
    expect(building.body.stats.activeLots).toBe(2);
    expect(building.body.stats.densityPerM2).toBeCloseTo(2300 / 30, 1);

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const dens = alerts.body.find((a: any) => a.kind === 'DENSITE_BATIMENT');
    const cohab = alerts.body.find((a: any) => a.kind === 'COHABITATION');
    expect(dens).toBeTruthy();
    expect(dens.level).toBe('ROUGE');
    expect(cohab).toBeTruthy();
    expect(cohab.level).toBe('ROUGE'); // un poussin fragile (< 3 semaines) cohabite avec une bande mature
    expect(dens.buildingId).toBe(buildingA);
  });

  it('lève une alerte VIDE SANITAIRE (ROUGE) si on réintroduit trop vite un bâtiment', async () => {
    // Bande dans Bâtiment B, clôturée immédiatement => vide sanitaire non respecté pour la suivante
    const b1 = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande B1',
        integrationDate: daysAgo(70),
        quantityAtStart: 500,
        type: 'CHAIR',
        buildingId: buildingB,
      })
      .expect(201);
    await request(server)
      .patch(`/farms/${farmId}/batches/${b1.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        couvoirSupplier: 'Couvoir',
        chickLotNumber: 'L1',
        hatchDate: daysAgo(70),
      })
      .expect(200);
    await request(server)
      .post(`/farms/${farmId}/batches/${b1.body.id}/cloture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    // Nouvelle bande dans le même bâtiment, quasiment tout de suite
    await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Bande B2',
        integrationDate: daysAgo(1),
        quantityAtStart: 600,
        type: 'CHAIR',
        buildingId: buildingB,
      })
      .expect(201);

    const alerts = await request(server)
      .get(`/farms/${farmId}/alerts/history`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const vs = alerts.body.find((a: any) => a.kind === 'VIDE_SANITAIRE');
    expect(vs).toBeTruthy();
    expect(vs.level).toBe('ROUGE');
    // B2 was placed (backdated) before B1 ended: no rest period at all.
    expect(vs.message).toContain('avant la fin du lot précédent');
  });

  async function newBuilding(name: string): Promise<string> {
    const res = await request(server)
      .post(`/farms/${farmId}/buildings`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name, buildingAreaM2: 100, capacity: 3000 })
      .expect(201);
    return res.body.id;
  }

  async function newLot(
    name: string,
    buildingId: string,
    integrationDate: string,
  ): Promise<string> {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: name,
        integrationDate,
        quantityAtStart: 300,
        type: 'CHAIR',
        buildingId,
      })
      .expect(201);
    return res.body.id;
  }

  async function close(batchId: string, endedDaysAgo?: number) {
    await request(server)
      .post(`/farms/${farmId}/batches/${batchId}/cloture`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);
    if (endedDaysAgo !== undefined) {
      await app
        .get(DataSource)
        .query(
          `UPDATE production_batches SET closed_at = now() - make_interval(days => $2) WHERE id = $1`,
          [batchId, endedDaysAgo],
        );
    }
  }

  async function activeAlerts(where: string, params: unknown[]) {
    return app.get(DataSource).query(
      `SELECT kind, level, status, context, batch_id FROM alerts
          WHERE farm_id = $1 AND status IN ('ACTIVE','ACQUITTEE') AND ${where}`,
      [farmId, ...params],
    );
  }

  it('vider un bâtiment (clôture du dernier lot) ne lève aucune alerte vide sanitaire', async () => {
    const buildingC = await newBuilding('Bâtiment C');
    const c1 = await newLot('Bande C1', buildingC, daysAgo(50));
    await close(c1);
    const building = await request(server)
      .get(`/farms/${farmId}/buildings/${buildingC}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(building.body.stats.activeLots).toBe(0);
    expect(building.body.stats.lastLotEndedAt).toBe(
      new Date().toISOString().slice(0, 10),
    );
    const vs = await activeAlerts(
      `kind = 'VIDE_SANITAIRE' AND building_id = $2`,
      [buildingC],
    );
    expect(vs).toEqual([]);
  });

  it('lot clôturé : ses alertes en cours sont résolues, la traçabilité reste', async () => {
    const buildingD = await newBuilding('Bâtiment D');
    const d1 = await newLot('Bande D1', buildingD, daysAgo(45));
    await app.get(DataSource).query(
      `INSERT INTO alerts (farm_id, batch_id, kind, level, status, message)
       VALUES ($1, $2, 'MORTALITE', 'ROUGE', 'ACQUITTEE', 'test')`,
      [farmId, d1],
    );
    await close(d1);
    const left = await activeAlerts(`batch_id = $2`, [d1]);
    // No hatchery data on D1: the HACCP traceability record stays.
    expect(left.map((a: any) => a.kind)).toEqual(['TRACABILITE']);
  });

  it('vide sanitaire mesuré entre la fin du lot précédent et la mise en place', async () => {
    const buildingE = await newBuilding('Bâtiment E');
    const e1 = await newLot('Bande E1', buildingE, daysAgo(80));
    await close(e1, 30);
    const e2 = await newLot('Bande E2', buildingE, daysAgo(20));
    const red = await activeAlerts(
      `kind = 'VIDE_SANITAIRE' AND building_id = $2`,
      [buildingE],
    );
    expect(red).toHaveLength(1);
    expect(red[0].level).toBe('ROUGE');
    expect(red[0].context.batchId).toBe(e2);
    expect(red[0].context.gapDays).toBe(10);

    const buildingF = await newBuilding('Bâtiment F');
    const f1 = await newLot('Bande F1', buildingF, daysAgo(80));
    await close(f1, 40);
    await newLot('Bande F2', buildingF, daysAgo(23));
    const yellow = await activeAlerts(
      `kind = 'VIDE_SANITAIRE' AND building_id = $2`,
      [buildingF],
    );
    expect(yellow).toHaveLength(1);
    expect(yellow[0].level).toBe('JAUNE');
    expect(yellow[0].context.gapDays).toBe(17);

    const buildingG = await newBuilding('Bâtiment G');
    const g1 = await newLot('Bande G1', buildingG, daysAgo(90));
    await close(g1, 50);
    await newLot('Bande G2', buildingG, daysAgo(25));
    expect(
      await activeAlerts(`kind = 'VIDE_SANITAIRE' AND building_id = $2`, [
        buildingG,
      ]),
    ).toEqual([]);

    // Closing E2 resolves the verdict on it (lot finished, building empty).
    await close(e2);
    expect(
      await activeAlerts(`kind = 'VIDE_SANITAIRE' AND building_id = $2`, [
        buildingE,
      ]),
    ).toEqual([]);
  });

  it('réparation au démarrage : alertes héritées de l’ancienne règle résolues', async () => {
    const buildingH = await newBuilding('Bâtiment H');
    const h1 = await newLot('Bande H1', buildingH, daysAgo(60));
    await close(h1);
    const db = app.get(DataSource);
    // State left by the old rule: red alert on an emptied building, live
    // alert on a closed lot, closing date not pinned.
    await db.query(
      `INSERT INTO alerts (farm_id, building_id, kind, level, status, message)
       VALUES ($1, $2, 'VIDE_SANITAIRE', 'ROUGE', 'ACTIVE', 'ancienne règle')`,
      [farmId, buildingH],
    );
    await db.query(
      `INSERT INTO alerts (farm_id, batch_id, kind, level, status, message)
       VALUES ($1, $2, 'EAU', 'JAUNE', 'ACTIVE', 'ancienne règle')`,
      [farmId, h1],
    );
    await db.query(
      `UPDATE production_batches SET closed_at = NULL WHERE id = $1`,
      [h1],
    );
    const seed = app.get(DatabaseSeedService) as unknown as {
      repairClosedBatchAlerts(): Promise<void>;
    };
    await seed.repairClosedBatchAlerts();
    await seed.repairClosedBatchAlerts(); // idempotent
    const left = await activeAlerts(
      `(building_id = $2 OR batch_id = $3) AND kind <> 'TRACABILITE'`,
      [buildingH, h1],
    );
    expect(left).toEqual([]);
    const [row] = await db.query(
      `SELECT closed_at FROM production_batches WHERE id = $1`,
      [h1],
    );
    expect(row.closed_at).not.toBeNull();
  });

  afterAll(async () => {
    await app.close();
  });
});

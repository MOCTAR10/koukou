import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function daysAhead(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

describe('Audit — corrections pravide & gaps (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;

  async function ownerToken(_prefix: string): Promise<string> {
    const phone = `+2419${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Audit',
        code: 'secret123',
      })
      .expect(201);
    const login = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    return login.body.accessToken;
  }

  async function createFarm(t: string, name: string): Promise<string> {
    const res = await request(server)
      .post('/farms')
      .set('Authorization', `Bearer ${t}`)
      .send({
        name,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 2000,
      })
      .expect(201);
    return res.body.id;
  }

  async function createBuilding(
    t: string,
    farmId: string,
    name: string,
    area: number,
  ): Promise<string> {
    const res = await request(server)
      .post(`/farms/${farmId}/buildings`)
      .set('Authorization', `Bearer ${t}`)
      .send({ name, buildingAreaM2: area, capacity: 2000 })
      .expect(201);
    return res.body.id;
  }

  async function createBatch(
    t: string,
    farmId: string,
    integralDate: string,
    quantity: number,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${t}`)
      .send({
        batchName: `Lot Audit ${Date.now()}`,
        integrationDate: integralDate,
        quantityAtStart: quantity,
        type: 'CHAIR',
        ...extra,
      })
      .expect(201);
    return res.body.id;
  }

  async function activeOf(kind: string, status = 'ACTIVE') {
    const res = await request(server)
      .get(`/farms/${mainFarmId}/alerts`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return res.body.find((a: any) => a.kind === kind && a.status === status);
  }

  let mainFarmId: string;
  let buildingAudit: string;

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
    token = await ownerToken('audit');
    mainFarmId = await createFarm(token, `Ferme Audit ${Date.now()}`);
    buildingAudit = await createBuilding(token, mainFarmId, 'Bât Audit', 30);
  });

  describe('Alertes lot — corrections', () => {
    it('pausage un lot et TRACABILITÉ est évalué à la clôture', async () => {
      const closedBatch = await createBatch(
        token,
        mainFarmId,
        daysAgo(20),
        300,
      );
      await request(server)
        .post(`/farms/${mainFarmId}/batches/${closedBatch}/cloture`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);

      const trac = await activeOf('TRACABILITE');
      expect(trac).toBeTruthy();
      expect(trac.level).toBe('ROUGE');
      expect(trac.batchId).toBe(closedBatch);
    });

    it('le clear PEREMPTION d’un lot dépend de l’agrégat — un lot périmé reste signalé même avec un lot futur', async () => {
      const batchId = await createBatch(token, mainFarmId, daysAgo(10), 300);
      await request(server)
        .post(`/farms/${mainFarmId}/inputs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          batchId,
          kind: 'ALIMENT',
          foodType: 'DEMARRAGE',
          productName: 'Provende Périmée-Audit',
          supplier: 'CEAG',
          supplierLotNumber: 'PEXP-1',
          quantity: 10,
          unit: 'SAC',
          expirationDate: daysAgo(1),
        })
        .expect(201);
      await request(server)
        .post(`/farms/${mainFarmId}/inputs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          batchId,
          kind: 'ALIMENT',
          foodType: 'DEMARRAGE',
          productName: 'Provende Futur-Audit',
          supplier: 'CEAG',
          supplierLotNumber: 'PFUT-1',
          quantity: 10,
          unit: 'SAC',
          expirationDate: daysAhead(60),
        })
        .expect(201);

      // Déclenche l'advisory du lot (après création des intrants).
      await request(server)
        .patch(`/farms/${mainFarmId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ batchName: 'Lot Audit Renommé' })
        .expect(200);

      const peremption = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const alert = peremption.body.find(
        (a: any) =>
          a.kind === 'PEREMPTION' &&
          a.status === 'ACTIVE' &&
          a.batchId === batchId,
      );
      expect(alert).toBeTruthy();
      expect(alert.level).toBe('ROUGE');
      expect(alert.message).toContain('Provende Périmée-Audit');
    });

    it('la SURDENSITÉ se résout quand la surface devient nulle (nettoyage des early-return)', async () => {
      const densBatch = await createBatch(
        token,
        mainFarmId,
        daysAgo(15),
        1200,
        { buildingAreaM2: 5 },
      );
      const created = await request(server)
        .get(`/farms/${mainFarmId}/batches/${densBatch}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(created.body.metrics.densityPerM2 as number).toBeGreaterThan(18);

      await request(server)
        .patch(`/farms/${mainFarmId}/batches/${densBatch}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ buildingAreaM2: null })
        .expect(200);

      const alerts = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const stale = alerts.body.some(
        (a: any) =>
          a.kind === 'SURDENSITE' &&
          a.status === 'ACTIVE' &&
          a.batchId === densBatch,
      );
      expect(stale).toBe(false);
    });

    it('détacher un lot de son bâtiment purge les alertes de niveau bâtiment', async () => {
      const batchId = await createBatch(token, mainFarmId, daysAgo(40), 1500, {
        buildingId: buildingAudit,
      });
      const before = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const dens = before.body.find(
        (a: any) => a.kind === 'DENSITE_BATIMENT' && a.status === 'ACTIVE',
      );
      expect(dens).toBeTruthy();
      expect(dens.buildingId).toBe(buildingAudit);
      expect(dens.level).toBe('ROUGE');

      await request(server)
        .patch(`/farms/${mainFarmId}/batches/${batchId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ buildingId: null })
        .expect(200);

      const after = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        after.body.some(
          (a: any) =>
            a.kind === 'DENSITE_BATIMENT' &&
            a.status === 'ACTIVE' &&
            a.buildingId === buildingAudit,
        ),
      ).toBe(false);
    });
  });

  describe('GMQ — alerte de déviation', () => {
    it('lève une alerte GMQ (JAUNE) quand le GMQ fléchit par rapport à la pesée précédente', async () => {
      const gmqBatch = await createBatch(token, mainFarmId, daysAgo(30), 500);
      await request(server)
        .post(`/farms/${mainFarmId}/batches/${gmqBatch}/daily-entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ entryDate: daysAgo(20), avgWeightKg: 0.8 })
        .expect(201);
      await request(server)
        .post(`/farms/${mainFarmId}/batches/${gmqBatch}/daily-entries`)
        .set('Authorization', `Bearer ${token}`)
        .send({ entryDate: daysAgo(10), avgWeightKg: 1.0 })
        .expect(201);

      const alerts = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      const gmq = alerts.body.find(
        (a: any) => a.kind === 'GMQ' && a.status === 'ACTIVE',
      );
      expect(gmq).toBeTruthy();
      expect(gmq.level).toBe('JAUNE');
    });
  });

  describe('Péremption au niveau ferme (provende non rattachée)', () => {
    it('n’élève aucune alerte quand aucun lot alimentaire n’est périmé', async () => {
      const t = await ownerToken('peremOK');
      const farmId = await createFarm(t, `Ferme Perem OK ${Date.now()}`);
      await request(server)
        .get(`/farms/${farmId}/feed-stock`)
        .set('Authorization', `Bearer ${t}`)
        .expect(200);
      const alerts = await request(server)
        .get(`/farms/${farmId}/alerts`)
        .set('Authorization', `Bearer ${t}`)
        .expect(200);
      expect(
        alerts.body.some(
          (a: any) => a.kind === 'PEREMPTION' && a.status === 'ACTIVE',
        ),
      ).toBe(false);
    });

    it('signale ROUGE une provende périmée au stock (batchId null)', async () => {
      const t = await ownerToken('peremExp');
      const farmId = await createFarm(t, `Ferme Perem Exp ${Date.now()}`);
      await request(server)
        .post(`/farms/${farmId}/inputs`)
        .set('Authorization', `Bearer ${t}`)
        .send({
          kind: 'ALIMENT',
          foodType: 'DEMARRAGE',
          productName: 'Provende Gâtée',
          supplier: 'CEAG',
          supplierLotNumber: 'G-1',
          quantity: 20,
          unit: 'SAC',
          expirationDate: daysAgo(2),
        })
        .expect(201);
      const alerts = await request(server)
        .get(`/farms/${farmId}/alerts`)
        .set('Authorization', `Bearer ${t}`)
        .expect(200);
      const per = alerts.body.find(
        (a: any) => a.kind === 'PEREMPTION' && a.status === 'ACTIVE',
      );
      expect(per).toBeTruthy();
      expect(per.level).toBe('ROUGE');
      expect(per.batchId).toBeNull();
      expect(per.message).toContain('Provende Gâtée');
    });

    it('signale JAUNE une provende sous 14 jours, ROUGE sous 7 jours', async () => {
      const warn = await ownerToken('peremWarn');
      const warnFarm = await createFarm(warn, `Ferme Perem Warn ${Date.now()}`);
      await request(server)
        .post(`/farms/${warnFarm}/inputs`)
        .set('Authorization', `Bearer ${warn}`)
        .send({
          kind: 'ALIMENT',
          foodType: 'CROISSANCE',
          productName: 'Provende Bientôt Périmée',
          supplier: 'CEAG',
          supplierLotNumber: 'W-1',
          quantity: 20,
          unit: 'SAC',
          expirationDate: daysAhead(10),
        })
        .expect(201);
      const warnAlerts = await request(server)
        .get(`/farms/${warnFarm}/alerts`)
        .set('Authorization', `Bearer ${warn}`)
        .expect(200);
      const warnPer = warnAlerts.body.find(
        (a: any) => a.kind === 'PEREMPTION' && a.status === 'ACTIVE',
      );
      expect(warnPer).toBeTruthy();
      expect(warnPer.level).toBe('JAUNE');

      const urgent = await ownerToken('peremUrgent');
      const urgentFarm = await createFarm(
        urgent,
        `Ferme Perem Urgent ${Date.now()}`,
      );
      await request(server)
        .post(`/farms/${urgentFarm}/inputs`)
        .set('Authorization', `Bearer ${urgent}`)
        .send({
          kind: 'ALIMENT',
          foodType: 'CROISSANCE',
          productName: 'Provende Très Proche',
          supplier: 'CEAG',
          supplierLotNumber: 'U-1',
          quantity: 20,
          unit: 'SAC',
          expirationDate: daysAhead(5),
        })
        .expect(201);
      const urgentAlerts = await request(server)
        .get(`/farms/${urgentFarm}/alerts`)
        .set('Authorization', `Bearer ${urgent}`)
        .expect(200);
      const urgentPer = urgentAlerts.body.find(
        (a: any) => a.kind === 'PEREMPTION' && a.status === 'ACTIVE',
      );
      expect(urgentPer).toBeTruthy();
      expect(urgentPer.level).toBe('ROUGE');
    });
  });

  describe('Acquittement d’alerte', () => {
    it('acquitte une alerte active (ACTIVE → ACQUITTEE)', async () => {
      const trac = await activeOf('TRACABILITE');
      expect(trac).toBeTruthy();
      const ack = await request(server)
        .post(`/farms/${mainFarmId}/alerts/${trac.id}/acknowledge`)
        .set('Authorization', `Bearer ${token}`)
        .expect(201);
      expect(ack.body.status).toBe('ACQUITTEE');

      const alerts = await request(server)
        .get(`/farms/${mainFarmId}/alerts`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        alerts.body.some(
          (a: any) => a.id === trac.id && a.status === 'ACQUITTEE',
        ),
      ).toBe(true);
    });

    it('acquitter une alerte inconnue renvoie 404', async () => {
      await request(server)
        .post(
          `/farms/${mainFarmId}/alerts/00000000-0000-4000-8000-000000000000/acknowledge`,
        )
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });
  });

  describe('Réglages — constante de référence (reference-constants)', () => {
    let adminToken: string;

    beforeAll(async () => {
      const adminPhone = `+2417${Date.now()}`;
      await request(server)
        .post('/auth/register')
        .send({
          phone: adminPhone,
          fullName: 'Admin Audit',
          code: 'secret123',
        })
        .expect(201);
      const ds = app.get(DataSource);
      await ds.query(
        `UPDATE users SET role = 'PLATFORM_ADMIN' WHERE phone = $1`,
        [adminPhone],
      );
      const login = await request(server)
        .post('/auth/login')
        .send({ phone: adminPhone, code: 'secret123' })
        .expect(201);
      adminToken = login.body.accessToken;
    });

    it('liste les constantes ; un Propriétaire peut lire mais ne modifie plus (403)', async () => {
      const list = await request(server)
        .get('/reference-constants')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(Array.isArray(list.body)).toBe(true);
      const sac = list.body.find((c: any) => c.key === 'default_sac_kg');
      expect(sac).toBeTruthy();

      await request(server)
        .patch('/reference-constants/default_sac_kg')
        .set('Authorization', `Bearer ${token}`)
        .send({ value: 55 })
        .expect(403);
    });

    it('l’Administrateur plateforme modifie (200), clé inconnue 404, Éleveur 403', async () => {
      const patched = await request(server)
        .patch('/reference-constants/default_sac_kg')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 55 })
        .expect(200);
      expect(patched.body.value).toBe(55);

      const after = await request(server)
        .get('/reference-constants')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(
        after.body.find((c: any) => c.key === 'default_sac_kg').value,
      ).toBe(55);

      await request(server)
        .patch('/reference-constants/default_sac_kg')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 50 })
        .expect(200);

      await request(server)
        .patch('/reference-constants/clé-inconnue')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ value: 1 })
        .expect(404);

      const empPhone = `+2418${Date.now()}`;
      await request(server)
        .post(`/farms/${mainFarmId}/eleveurs`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          phone: empPhone,
          fullName: 'Éleveur Audit',
          code: 'secret123',
        })
        .expect(201);
      const empLogin = await request(server)
        .post('/auth/login')
        .send({ phone: empPhone, code: 'secret123' })
        .expect(201);
      await request(server)
        .patch('/reference-constants/default_sac_kg')
        .set('Authorization', `Bearer ${empLogin.body.accessToken}`)
        .send({ value: 60 })
        .expect(403);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});

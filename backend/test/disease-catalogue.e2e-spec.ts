import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { NotifyService } from './../src/modules/notify/notify.service.js';
import { SanitaryAlertsService } from './../src/modules/surveillance/sanitary-alerts.service.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

interface ListItem {
  code: string;
  label: string;
  family: string | null;
  meta: Record<string, unknown>;
}

describe('Catalogue des maladies et textes de référence — jury lot 1 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let alerts: SanitaryAlertsService;
  let notify: NotifyService;
  let ownerToken: string;
  let farmId: string;
  let batchId: string;

  const stamp = Date.now();
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string) => request(server).get(url).set(auth(ownerToken));
  const declare = (body: object) =>
    request(server)
      .post(`/farms/${farmId}/batches/${batchId}/health-events`)
      .set(auth(ownerToken))
      .send(body);

  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await alerts.flush();
      await notify.flush();
    }
  }

  async function alertsOf(eventId: string): Promise<unknown[]> {
    const list = await get(`/farms/${farmId}/sanitary-alerts`).expect(200);
    return list.body.items.filter(
      (a: { healthEventId: string }) => a.healthEventId === eventId,
    );
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    alerts = app.get(SanitaryAlertsService);
    notify = app.get(NotifyService);

    const adminToken = (await createPlatformAdmin(server, app.get(DataSource)))
      .token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Maladies ${tag}`,
      provinceCode: 'G3',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    const band = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth(ownerToken))
      .send({
        batchName: `Bande maladies ${stamp}`,
        type: 'CHAIR',
        integrationDate: day(-5),
        quantityAtStart: 800,
      })
      .expect(201);
    batchId = band.body.id;
  });

  afterAll(async () => {
    await settle();
    await app.close();
  });

  it('sert le catalogue des maladies avec leur base légale', async () => {
    const diseases = (await get('/programme/lists/MALADIE').expect(200))
      .body as ListItem[];
    const newcastle = diseases.find((d) => d.code === 'NEWCASTLE');
    expect(newcastle).toMatchObject({
      family: 'DECLARATION_OBLIGATOIRE',
      meta: { legalRef: 'LOI_2_65' },
    });
    expect(diseases.find((d) => d.code === 'COCCIDIOSE')?.family).toBe('AUTRE');

    const texts = (await get('/programme/lists/TEXTE_REFERENCE').expect(200))
      .body as ListItem[];
    expect(texts.map((t) => t.code)).toEqual(
      expect.arrayContaining(['LOI_2_65', 'DECRET_0190_2022']),
    );
    // Every legal basis named by a disease is a listed text.
    const codes = new Set(texts.map((t) => t.code));
    for (const d of diseases) {
      if (typeof d.meta.legalRef === 'string') {
        expect(codes.has(d.meta.legalRef), d.code).toBe(true);
      }
    }
  });

  it('refuse un code de maladie inconnu', async () => {
    const res = await declare({
      kind: 'MALADIE',
      occurredAt: day(0),
      severity: 'JAUNE',
      title: `Maladie inconnue ${tag}`,
      diseaseCode: 'INCONNUE_XYZ',
    }).expect(400);
    expect(String(res.body.message)).toContain('Maladie inconnue');
  });

  it("n'ouvre pas d'alerte pour une maladie hors déclaration obligatoire", async () => {
    const res = await declare({
      kind: 'MALADIE',
      occurredAt: day(0),
      severity: 'JAUNE',
      title: `Coccidiose ${tag}`,
      diseaseCode: 'COCCIDIOSE',
    }).expect(201);
    expect(res.body).toMatchObject({
      diseaseCode: 'COCCIDIOSE',
      disease: 'Coccidiose',
      suspicion: false,
    });
    await settle();
    expect(await alertsOf(res.body.id)).toHaveLength(0);
  });

  it('ouvre une alerte officielle pour une maladie à déclaration obligatoire', async () => {
    const res = await declare({
      kind: 'MALADIE',
      occurredAt: day(0),
      severity: 'ROUGE',
      title: `Newcastle ${tag}`,
      diseaseCode: 'NEWCASTLE',
    }).expect(201);
    expect(res.body).toMatchObject({
      diseaseCode: 'NEWCASTLE',
      disease: 'Maladie de Newcastle',
      suspicion: true,
    });
    await settle();
    const opened = await alertsOf(res.body.id);
    expect(opened).toHaveLength(1);
    expect(opened[0]).toMatchObject({
      origin: 'DECLARATION',
      statusFamily: 'NOUVELLE',
    });
  });
});

import { lvDate } from './helpers/libreville-day.js';
import { randomBytes } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  auth,
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  uniquePhone,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return lvDate(d);
}

interface ListItem {
  code: string;
  label: string;
  family: string | null;
  meta: Record<string, unknown>;
}

interface Step {
  id: string;
  name: string;
  active: boolean;
  careType: string;
  vaccineCode: string | null;
}

describe('Catalogue des vaccins et calendrier de référence — jury lot 1 (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ownerToken: string;
  let vetToken: string;
  let farmId: string;

  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = vetToken) =>
    request(server).post(url).set(auth(token)).send(body);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    const admin = await createPlatformAdmin(server, app.get(DataSource));
    const farm = await createProgrammeFarm(server, admin.token, {
      name: `Ferme Vaccins ${tag}`,
      provinceCode: 'G3',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;

    const vetPhone = uniquePhone('+2417');
    const vet = await request(server)
      .post('/programme/access/memberships')
      .set(auth(admin.token))
      .send({
        fullName: `Vétérinaire vaccins ${tag}`,
        phone: vetPhone,
        profileCode: 'VETERINAIRE',
      })
      .expect(201);
    vetToken = await login(server, vetPhone, vet.body.loginCode as string);
  });

  afterAll(async () => {
    await app.close();
  });

  it('sert le catalogue des vaccins, rattaché au catalogue des maladies', async () => {
    const vaccines = (await get('/programme/lists/VACCIN').expect(200))
      .body as ListItem[];
    expect(vaccines.map((v) => v.code)).toEqual(
      expect.arrayContaining([
        'MAREK',
        'NEWCASTLE_VIVANT',
        'BRONCHITE_INFECTIEUSE',
        'NEWCASTLE_BRONCHITE',
        'GUMBORO',
        'VARIOLE_AVIAIRE',
      ]),
    );
    const diseases = new Set(
      ((await get('/programme/lists/MALADIE').expect(200)).body as ListItem[]).map(
        (d) => d.code,
      ),
    );
    for (const v of vaccines) {
      const meta = v.meta as {
        diseaseCodes?: unknown;
        kind?: unknown;
        route?: unknown;
        storage?: unknown;
      };
      expect(['VIVANT', 'INACTIVE'], v.code).toContain(meta.kind);
      expect(typeof meta.route, v.code).toBe('string');
      expect(typeof meta.storage, v.code).toBe('string');
      expect(Array.isArray(meta.diseaseCodes), v.code).toBe(true);
      for (const code of meta.diseaseCodes as string[]) {
        expect(diseases.has(code), `${v.code} -> ${code}`).toBe(true);
      }
    }
  });

  it('refuse un vaccin inconnu sur une étape et le rend sur les lectures', async () => {
    const calendar = await post('/surveillance/vaccination-calendars', {
      name: `Calendrier vaccins ${tag}`,
      species: 'OIE',
      type: 'CHAIR',
      steps: [
        {
          stepOrder: 1,
          dayFrom: 7,
          dayTo: 9,
          careType: 'VACCIN',
          name: 'Gumboro',
          vaccineCode: 'GUMBORO',
        },
      ],
    }).expect(201);
    const id = calendar.body.id as string;
    expect((calendar.body.steps as Step[])[0]).toMatchObject({
      vaccineCode: 'GUMBORO',
    });

    const unknown = await post(`/surveillance/vaccination-calendars/${id}/steps`, {
      stepOrder: 2,
      dayFrom: 14,
      dayTo: 16,
      careType: 'VACCIN',
      name: 'Vaccin inconnu',
      vaccineCode: 'INCONNU_XYZ',
    }).expect(400);
    expect(String(unknown.body.message)).toContain('Vaccin inconnu');

    const notAVaccine = await post(
      `/surveillance/vaccination-calendars/${id}/steps`,
      {
        stepOrder: 3,
        dayFrom: 20,
        dayTo: 22,
        careType: 'VITAMINE',
        name: 'Vitaminage',
        vaccineCode: 'GUMBORO',
      },
    ).expect(400);
    expect(String(notAVaccine.body.message)).toContain('type vaccin');

    const added = await post(`/surveillance/vaccination-calendars/${id}/steps`, {
      stepOrder: 2,
      dayFrom: 21,
      dayTo: 21,
      careType: 'VACCIN',
      name: 'Newcastle',
      vaccineCode: 'NEWCASTLE_VIVANT',
    }).expect(201);
    const step = (added.body.steps as Step[]).find((s) => s.name === 'Newcastle');
    expect(step?.vaccineCode).toBe('NEWCASTLE_VIVANT');

    // Changing it to an unknown code is refused too; null removes it.
    const patch = (body: object) =>
      request(server)
        .patch(`/surveillance/vaccination-calendars/${id}/steps/${step!.id}`)
        .set(auth(vetToken))
        .send(body);
    await patch({ vaccineCode: 'INCONNU_XYZ' }).expect(400);
    const cleared = await patch({ vaccineCode: null }).expect(200);
    expect(
      (cleared.body.steps as Step[]).find((s) => s.id === step!.id)?.vaccineCode,
    ).toBeNull();

    const read = await get(`/sanitary/protocols/${id}`).expect(200);
    expect(
      (read.body.steps as Step[]).find((s) => s.name === 'Gumboro')?.vaccineCode,
    ).toBe('GUMBORO');
  });

  it('planifie une bande de chair ouverte depuis le calendrier Gabon de référence', async () => {
    const protocols = (
      await get('/sanitary/protocols?species=POULET&type=CHAIR').expect(200)
    ).body as Array<{ id: string; code: string; isDefault: boolean; farmId: string | null }>;
    const references = protocols.filter((p) => p.isDefault && p.farmId === null);
    // One reference per species and type: the Gabon programme.
    expect(references.map((p) => p.code)).toEqual(['vacc-poulet-chair-gabon']);
    const standard = protocols.find((p) => p.code === 'proto-poulet-chair-standard');
    expect(standard?.isDefault).toBe(false);

    const detail = (await get(`/sanitary/protocols/${references[0].id}`).expect(200))
      .body as { steps: Step[] };
    const steps = detail.steps.filter((s) => s.active);
    expect(steps.length).toBeGreaterThan(1);
    const marek = steps.find((s) => s.name.includes('Marek'));
    expect(marek?.vaccineCode).toBe('MAREK');

    const band = await post(
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande vaccins ${tag}`,
        type: 'CHAIR',
        integrationDate: day(0),
        quantityAtStart: 400,
      },
      ownerToken,
    ).expect(201);
    const cares = (
      await get(`/farms/${farmId}/batches/${band.body.id}/prophylaxis`).expect(200)
    ).body as Array<{ protocolStepId: string | null; isReference: boolean }>;
    expect(cares).toHaveLength(steps.length);
    expect(cares.every((c) => c.isReference)).toBe(true);
    expect(new Set(cares.map((c) => c.protocolStepId))).toEqual(
      new Set(steps.map((s) => s.id)),
    );
  });
});

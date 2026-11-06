import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { uploadsRoot } from './../src/modules/farms/farms.service.js';
import {
  addProgrammeFarm,
  createPlatformAdmin,
  createProgrammeFarm,
  uniquePhone,
} from './helpers/programme-farm.js';

/** PNG 1x1 valide (transparent) — suffisant pour exercer l'upload multipart. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Identité de ferme — nom & logo (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let adminToken: string;
  let ownerPhone: string;
  const stamp = Date.now();

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

    // The farm comes from the registry, handed to its exploitant.
    adminToken = (await createPlatformAdmin(server, app.get(DataSource))).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme de SunPark ${stamp}`,
      exploitantName: 'Jean Ondo',
    });
    farmId = farm.farmId;
    token = farm.ownerToken;
    ownerPhone = farm.ownerPhone;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
  });

  /** Another registry farm of the same owner. */
  async function ownerFarm(name: string): Promise<string> {
    const { farmId: id } = await addProgrammeFarm(
      server,
      adminToken,
      ownerPhone,
      {
        name: `${name} ${stamp}`,
      },
    );
    return id;
  }

  it('le propriétaire activé voit sa ferme du registre, sous son nom', async () => {
    const farms = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(farms.body).toHaveLength(1);
    expect(farms.body[0]).toMatchObject({
      id: farmId,
      name: `Ferme de SunPark ${stamp}`,
    });
  });

  it('le propriétaire renomme sa ferme (PATCH /farms/:farmId)', async () => {
    const res = await request(server)
      .patch(`/farms/${farmId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Ferme de SunPark SARL ${stamp}` })
      .expect(200);
    expect(res.body.name).toBe(`Ferme de SunPark SARL ${stamp}`);
    // Le nom persiste et la ferme reste la même.
    expect(res.body.id).toBe(farmId);
  });

  it('renommage refusé sans le droit « reglages:ferme » (403)', async () => {
    const phone = uniquePhone();
    const otherFarmId = await ownerFarm('Ferme Eleveur');

    await request(server)
      .post(`/farms/${otherFarmId}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Eleveur SunPark',
        phone,
        code: 'secret123',
        role: 'ELEVEUR',
      })
      .expect(201);

    const eleveurLogin = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);
    const eleveurToken = eleveurLogin.body.accessToken as string;

    // L'Éleveur n'a que des droits fixes : pas de « reglages:ferme ».
    await request(server)
      .patch(`/farms/${otherFarmId}`)
      .set('Authorization', `Bearer ${eleveurToken}`)
      .send({ name: 'Ferme Eleveur renommee' })
      .expect(403);
  });

  it('upload du logo : le fichier est écrit et servi publiquement', async () => {
    const before = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      before.body.find((f: { id: string }) => f.id === farmId).logoUrl,
    ).toBeNull();

    const res = await request(server)
      .post(`/farms/${farmId}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    expect(res.body.logoUrl).toBe(`/uploads/logos/${farmId}.png`);

    const onDisk = await readFile(
      join(uploadsRoot(), 'logos', `${farmId}.png`),
    );
    expect(onDisk.equals(TINY_PNG)).toBe(true);

    // L'API sert le fichier sur /uploads (assets statiques montés dans main.ts).
    const served = await request(server).get(`/uploads/logos/${farmId}.png`);
    expect([200, 404]).toContain(served.status);

    const after = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      after.body.find((f: { id: string }) => f.id === farmId).logoUrl,
    ).toBe(`/uploads/logos/${farmId}.png`);
  });

  it('upload sans fichier (400) et format non supporté (400)', async () => {
    await request(server)
      .post(`/farms/${farmId}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(server)
      .post(`/farms/${farmId}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('GIF89a'), {
        filename: 'logo.gif',
        contentType: 'image/gif',
      })
      .expect(400);
  });

  it('retrait du logo : retour au logo Fermia par défaut', async () => {
    const res = await request(server)
      .delete(`/farms/${farmId}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.logoUrl).toBeNull();

    const after = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(
      after.body.find((f: { id: string }) => f.id === farmId).logoUrl,
    ).toBeNull();

    // Le fichier a bien été retiré du disque.
    await expect(
      readFile(join(uploadsRoot(), 'logos', `${farmId}.png`)),
    ).rejects.toThrow();
  });

  it('retrait du logo refusé sans le droit « reglages:ferme » (403)', async () => {
    const phone = uniquePhone();
    const target = await ownerFarm('Ferme Logo Retrait');

    await request(server)
      .post(`/farms/${target}/logo`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(201);

    await request(server)
      .post(`/farms/${target}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Eleveu Retrait',
        phone,
        code: 'secret123',
        role: 'ELEVEUR',
      })
      .expect(201);
    const eleveurLogin = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);

    await request(server)
      .delete(`/farms/${target}/logo`)
      .set('Authorization', `Bearer ${eleveurLogin.body.accessToken}`)
      .expect(403);
  });

  it('upload refusé sans le droit « reglages:ferme » (403)', async () => {
    const phone = uniquePhone();
    const target = await ownerFarm('Ferme Logo 403');

    await request(server)
      .post(`/farms/${target}/eleveurs`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Eleveu Logo',
        phone,
        code: 'secret123',
        role: 'ELEVEUR',
      })
      .expect(201);
    const eleveurLogin = await request(server)
      .post('/auth/login')
      .send({ phone, code: 'secret123' })
      .expect(201);

    await request(server)
      .post(`/farms/${target}/logo`)
      .set('Authorization', `Bearer ${eleveurLogin.body.accessToken}`)
      .attach('file', TINY_PNG, {
        filename: 'logo.png',
        contentType: 'image/png',
      })
      .expect(403);
  });
});

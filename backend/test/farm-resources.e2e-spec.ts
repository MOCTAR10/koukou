import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { DatabaseSeedService } from './../src/database/database-seed.service.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe('Souches, cultures et programmes personnalisés : propres à la ferme (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  const stamp = Date.now();
  const owner = { token: '', farmId: '' };
  const other = { token: '', farmId: '' };

  async function signUp(prefix: string, target: typeof owner) {
    const phone = `+2417${prefix}${stamp}`;
    await request(server)
      .post('/auth/register')
      .send({ phone, fullName: `Proprio ${prefix}`, code: 'secret123' })
      .expect(201);
    target.token = (
      await request(server)
        .post('/auth/login')
        .send({ phone, code: 'secret123' })
        .expect(201)
    ).body.accessToken;
    target.farmId = (
      await request(server)
        .post('/farms')
        .set('Authorization', `Bearer ${target.token}`)
        .send({
          name: `Ferme ${prefix} ${stamp}`,
          administrativeCity: 'Libreville',
          capacityPerBuilding: 1000,
        })
        .expect(201)
    ).body.id;
  }

  const as = (who: typeof owner) => ({
    get: (url: string) =>
      request(server).get(url).set('Authorization', `Bearer ${who.token}`),
    post: (url: string) =>
      request(server).post(url).set('Authorization', `Bearer ${who.token}`),
  });

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
    await signUp('7', owner);
    await signUp('8', other);
  });

  afterAll(async () => {
    await app.close();
  });

  it('souche : créée dans la ferme, invisible et inutilisable ailleurs', async () => {
    const name = `Souche maison ${stamp}`;
    await as(owner).post('/breeds').send({ name, type: 'CHAIR' }).expect(400);
    await as(owner)
      .post('/breeds')
      .send({ name, type: 'CHAIR', farmId: other.farmId })
      .expect(403);
    const breed = await as(owner)
      .post('/breeds')
      .send({ name, type: 'CHAIR', farmId: owner.farmId })
      .expect(201);
    expect(breed.body.farmId).toBe(owner.farmId);
    expect(breed.body.isCustom).toBe(true);

    const mine = await as(owner)
      .get(`/breeds?farmId=${owner.farmId}`)
      .expect(200);
    expect(mine.body.some((b: any) => b.id === breed.body.id)).toBe(true);
    const theirs = await as(other)
      .get(`/breeds?farmId=${other.farmId}`)
      .expect(200);
    expect(theirs.body.some((b: any) => b.id === breed.body.id)).toBe(false);
    const shared = await as(owner).get('/breeds').expect(200);
    expect(shared.body.some((b: any) => b.id === breed.body.id)).toBe(false);
    expect(shared.body.length).toBeGreaterThan(0);

    // Same name: fine in another farm, 409 in the same farm or vs shared.
    await as(other)
      .post('/breeds')
      .send({ name, type: 'CHAIR', farmId: other.farmId })
      .expect(201);
    await as(owner)
      .post('/breeds')
      .send({ name, type: 'CHAIR', farmId: owner.farmId })
      .expect(409);
    await as(owner)
      .post('/breeds')
      .send({ name: shared.body[0].name, type: 'CHAIR', farmId: owner.farmId })
      .expect(409);

    const lot = {
      batchName: `Lot souche ${stamp}`,
      integrationDate: today(),
      quantityAtStart: 100,
      type: 'CHAIR',
      breedId: breed.body.id,
    };
    await as(other)
      .post(`/farms/${other.farmId}/batches`)
      .send(lot)
      .expect(400);
    await as(owner)
      .post(`/farms/${owner.farmId}/batches`)
      .send(lot)
      .expect(201);
  });

  it('culture : créée dans la ferme, refusée sur la parcelle d’une autre ferme', async () => {
    const culture = await as(owner)
      .post('/cultures')
      .send({
        name: `Culture maison ${stamp}`,
        category: 'MARAICHAGE',
        farmId: owner.farmId,
      })
      .expect(201);
    expect(culture.body.farmId).toBe(owner.farmId);

    const theirs = await as(other)
      .get(`/cultures?farmId=${other.farmId}`)
      .expect(200);
    expect(theirs.body.some((c: any) => c.id === culture.body.id)).toBe(false);

    const parcelle = {
      name: 'Parcelle 1',
      cultureId: culture.body.id,
      areaHa: 1,
    };
    await as(other)
      .post(`/farms/${other.farmId}/parcelles`)
      .send(parcelle)
      .expect(400);
    await as(owner)
      .post(`/farms/${owner.farmId}/parcelles`)
      .send(parcelle)
      .expect(201);
  });

  it('programme sanitaire : lisible et applicable uniquement par sa ferme', async () => {
    const program = await as(owner)
      .post('/sanitary/protocols')
      .send({
        farmId: owner.farmId,
        name: `Programme maison ${stamp}`,
        species: 'POULET',
        type: 'CHAIR',
        steps: [
          {
            stepOrder: 1,
            dayFrom: 1,
            dayTo: 3,
            careType: 'VACCIN',
            name: 'Vaccin J1',
          },
        ],
      })
      .expect(201);
    expect(program.body.farmId).toBe(owner.farmId);

    await as(owner)
      .get(`/sanitary/protocols/${program.body.id}?farmId=${owner.farmId}`)
      .expect(200);
    await as(other)
      .get(`/sanitary/protocols/${program.body.id}?farmId=${other.farmId}`)
      .expect(404);
    await as(other).get(`/sanitary/protocols/${program.body.id}`).expect(404);
    const list = await as(other)
      .get(
        `/sanitary/protocols?farmId=${other.farmId}&species=POULET&type=CHAIR`,
      )
      .expect(200);
    expect(list.body.some((p: any) => p.id === program.body.id)).toBe(false);

    const lot = await as(other)
      .post(`/farms/${other.farmId}/batches`)
      .send({
        batchName: `Lot prog ${stamp}`,
        integrationDate: today(),
        quantityAtStart: 100,
        type: 'CHAIR',
      })
      .expect(201);
    await as(other)
      .post(
        `/farms/${other.farmId}/batches/${lot.body.id}/prophylaxis/generate`,
      )
      .send({ protocolId: program.body.id })
      .expect(404);
  });

  it('réparation : une ancienne souche personnalisée utilisée par une seule ferme lui est rattachée', async () => {
    const db = app.get(DataSource);
    const [legacy] = await db.query(
      `INSERT INTO breeds (name, type, species, is_custom, active)
       VALUES ($1, 'CHAIR', 'POULET', true, true) RETURNING id`,
      [`Souche héritée ${stamp}`],
    );
    const [unused] = await db.query(
      `INSERT INTO breeds (name, type, species, is_custom, active)
       VALUES ($1, 'CHAIR', 'POULET', true, true) RETURNING id`,
      [`Souche orpheline ${stamp}`],
    );
    // Created while the breed was still shared.
    await as(owner)
      .post(`/farms/${owner.farmId}/batches`)
      .send({
        batchName: `Lot hérité ${stamp}`,
        integrationDate: today(),
        quantityAtStart: 50,
        type: 'CHAIR',
        breedId: legacy.id,
      })
      .expect(201);

    const seed = app.get(DatabaseSeedService) as unknown as {
      assignLegacyCustomResources(): Promise<void>;
    };
    await seed.assignLegacyCustomResources();
    await seed.assignLegacyCustomResources(); // idempotent

    const rows: Array<{ id: string; farm_id: string | null }> = await db.query(
      `SELECT id, farm_id FROM breeds WHERE id IN ($1, $2)`,
      [legacy.id, unused.id],
    );
    const byId = new Map(rows.map((r) => [r.id, r.farm_id]));
    expect(byId.get(legacy.id)).toBe(owner.farmId);
    expect(byId.get(unused.id)).toBeNull();
    await db.query(`DELETE FROM breeds WHERE id = $1`, [unused.id]);
  });
});

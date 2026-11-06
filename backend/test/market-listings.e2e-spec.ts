import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { Farm } from './../src/modules/farms/entities/farm.entity.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  login,
  registerBuyer,
  uniquePhone,
} from './helpers/programme-farm.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

describe('Market : annonces et catalogue public (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let dataSource: DataSource;
  let token: string;
  let farmId: string;
  let farmCity: string;
  let batchId: string;
  let adminToken: string;
  let seq = 0;

  const auth = (t = token) => ({ Authorization: `Bearer ${t}` });
  const base = () => `/farms/${farmId}/market/listings`;

  const setVerified = (id: string, isVerified: boolean) =>
    dataSource.getRepository(Farm).update({ id }, { isVerified });

  const newBatch = async (over: Record<string, unknown> = {}) => {
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set(auth())
      .send({
        batchName: `Lot ${seq++}`,
        integrationDate: dayOffset(-45),
        quantityAtStart: 100,
        type: 'CHAIR',
        ...over,
      })
      .expect(201);
    return res.body.id as string;
  };

  const preDraft = (over: Record<string, unknown> = {}) => ({
    kind: 'PRE',
    product: 'BIRDS',
    batchId,
    unitPriceFcfa: 3500,
    quantityPublished: 50,
    readyDate: dayOffset(14),
    depositPct: 30,
    ...over,
  });

  const createDraft = async (over: Record<string, unknown> = {}) => {
    const res = await request(server)
      .post(base())
      .set(auth())
      .send(preDraft(over))
      .expect(201);
    return res.body.id as string;
  };

  const published = async (over: Record<string, unknown> = {}) => {
    const id = await createDraft(over);
    await request(server)
      .post(`${base()}/${id}/publish`)
      .set(auth())
      .expect(201);
    return id;
  };

  const catalogueIds = async (query: Record<string, unknown> = {}) => {
    const res = await request(server)
      .get('/market/listings')
      .query({ limit: 50, ...query })
      .expect(200);
    return (res.body.items as { id: string }[]).map((i) => i.id);
  };

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
    dataSource = app.get(DataSource);

    adminToken = (await createPlatformAdmin(server, dataSource)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Market ${uniquePhone('')}`,
      exploitantName: 'Proprio Market',
      // Market listings are only shown for OPERATIONNELLE farms (POUFA).
      extra: {
        gps: { latitude: 0.41, longitude: 9.45 },
        statusCode: 'OPERATIONNELLE',
      },
    });
    token = farm.ownerToken;
    farmId = farm.farmId;
    // A city no other farm has, for the catalogue filters.
    farmCity = `Ville${Date.now()}`;
    await request(server)
      .patch(`/farms/${farmId}`)
      .set(auth())
      .send({ administrativeCity: farmCity })
      .expect(200);
    await setVerified(farmId, true);
    batchId = await newBatch();
  }, 60_000);

  afterAll(async () => {
    await app.close();
  });

  describe('création', () => {
    it('crée un brouillon invisible du public', async () => {
      const id = await createDraft();
      const read = await request(server)
        .get(`${base()}/${id}`)
        .set(auth())
        .expect(200);
      expect(read.body.status).toBe('DRAFT');
      expect(read.body.hiddenReason).toBe('NOT_PUBLISHED');
      expect(await catalogueIds()).not.toContain(id);
      await request(server).get(`/market/listings/${id}`).expect(404);
    });

    it('donne à la ferme l’espèce et la souche de ses annonces', async () => {
      const batchId = await newBatch({
        species: 'AUTRE',
        customSpecies: 'Canard',
        customBreed: 'Coureur indien',
      });
      const created = await request(server)
        .post(base())
        .set(auth())
        .send(preDraft({ batchId }))
        .expect(201);
      const expected = {
        species: 'AUTRE',
        customSpecies: 'Canard',
        breedName: 'Coureur indien',
      };

      const read = await request(server)
        .get(`${base()}/${created.body.id}`)
        .set(auth())
        .expect(200);
      expect(read.body).toMatchObject(expected);
      const list = await request(server).get(base()).set(auth()).expect(200);
      expect(
        list.body.find((l: { id: string }) => l.id === created.body.id),
      ).toMatchObject(expected);
    });

    it.each([
      ['des œufs en précommande', { product: 'EGGS' }],
      ['une précommande sans date', { readyDate: undefined }],
      ['une vente immédiate avec date', { kind: 'NOW', depositPct: undefined }],
      [
        'une vente immédiate avec acompte',
        { kind: 'NOW', readyDate: undefined },
      ],
      ['un acompte de plus de 100 %', { depositPct: 101 }],
      ['ni retrait ni livraison', { pickupAvailable: false }],
      ['des frais sans livraison', { deliveryFeeFcfa: 1000 }],
      ['un minimum au-dessus de la quantité', { minOrderQty: 51 }],
      ['un prix nul', { unitPriceFcfa: 0 }],
    ])('refuse %s', async (_label, over) => {
      await request(server)
        .post(base())
        .set(auth())
        .send(preDraft(over))
        .expect(400);
    });

    it('refuse le lot d’une autre ferme', async () => {
      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre',
      });
      await request(server)
        .post(`/farms/${other.farmId}/market/listings`)
        .set(auth(other.ownerToken))
        .send(preDraft())
        .expect(404);
    });
  });

  describe('droits', () => {
    it('refuse un acheteur, un autre propriétaire et un éleveur', async () => {
      const buyer = await registerBuyer(server, { fullName: 'Acheteur' });
      await request(server)
        .post(base())
        .set(auth(buyer.token))
        .send(preDraft())
        .expect(403);

      const other = await createProgrammeFarm(server, adminToken, {
        exploitantName: 'Autre',
      });
      await request(server).get(base()).set(auth(other.ownerToken)).expect(403);

      const staffPhone = uniquePhone();
      await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set(auth())
        .send({ phone: staffPhone, fullName: 'Éleveur', code: 'secret123' })
        .expect(201);
      const staffToken = await login(server, staffPhone, 'secret123');
      await request(server).get(base()).set(auth(staffToken)).expect(403);
    });

    it('propose le droit au catalogue des permissions', async () => {
      const res = await request(server)
        .get(`/farms/${farmId}/permissions`)
        .set(auth())
        .expect(200);
      expect(JSON.stringify(res.body)).toContain('market:publier');
    });
  });

  describe('publication', () => {
    it('refuse une ferme non vérifiée, puis accepte une fois vérifiée', async () => {
      const id = await createDraft();
      await setVerified(farmId, false);
      const refused = await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(400);
      expect(refused.body.message).toMatch(/vérifiées/);
      await setVerified(farmId, true);
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(201);
      expect(await catalogueIds()).toContain(id);
    });

    it('refuse plus que le stock libre', async () => {
      const id = await createDraft({ quantityPublished: 101 });
      const res = await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(400);
      expect(res.body.message).toMatch(/100 oiseau/);
    });

    it('compte les commandes ouvertes dans le stock libre', async () => {
      const lot = await newBatch();
      await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 60,
              unitPriceFcfa: 3000,
              batchId: lot,
            },
          ],
        })
        .expect(201);
      const id = await createDraft({ batchId: lot, quantityPublished: 41 });
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(400);
      await request(server)
        .patch(`${base()}/${id}`)
        .set(auth())
        .send({ quantityPublished: 40 })
        .expect(200);
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(201);
    });

    it('refuse une précommande dont la date est passée', async () => {
      const id = await createDraft({ readyDate: dayOffset(0) });
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(400);
    });

    it('suit le cycle publié, suspendu, republié, clôturé', async () => {
      const id = await published();
      await request(server)
        .post(`${base()}/${id}/pause`)
        .set(auth())
        .expect(201);
      expect(await catalogueIds()).not.toContain(id);
      await request(server)
        .post(`${base()}/${id}/pause`)
        .set(auth())
        .expect(400);
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(201);
      expect(await catalogueIds()).toContain(id);
      await request(server)
        .post(`${base()}/${id}/close`)
        .set(auth())
        .expect(201);
      await request(server)
        .post(`${base()}/${id}/close`)
        .set(auth())
        .expect(201);
      expect(await catalogueIds()).not.toContain(id);
      await request(server)
        .post(`${base()}/${id}/publish`)
        .set(auth())
        .expect(400);
      await request(server)
        .patch(`${base()}/${id}`)
        .set(auth())
        .send({ unitPriceFcfa: 1 })
        .expect(400);
    });

    it('interdit de changer ici la date d’une annonce publiée', async () => {
      const id = await published();
      const next = dayOffset(30);
      await request(server)
        .patch(`${base()}/${id}`)
        .set(auth())
        .send({ readyDate: next })
        .expect(400);
      await request(server)
        .patch(`${base()}/${id}`)
        .set(auth())
        .send({ unitPriceFcfa: 3700 })
        .expect(200);
    });
  });

  describe('état sanitaire', () => {
    it('bloque une vente immédiate pendant un délai d’attente, pas une précommande après', async () => {
      const lot = await newBatch();
      const now = await createDraft({
        kind: 'NOW',
        batchId: lot,
        readyDate: undefined,
        depositPct: undefined,
      });
      const after = await createDraft({
        batchId: lot,
        readyDate: dayOffset(20),
      });
      const during = await createDraft({
        batchId: lot,
        readyDate: dayOffset(5),
      });

      await request(server)
        .post(`/farms/${farmId}/batches/${lot}/treatments`)
        .set(auth())
        .send({
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline',
          withdrawalDays: 10,
          reason: 'Infection respiratoire',
          animalCount: 10,
        })
        .expect(201);

      await request(server)
        .post(`${base()}/${now}/publish`)
        .set(auth())
        .expect(400);
      await request(server)
        .post(`${base()}/${during}/publish`)
        .set(auth())
        .expect(400);
      await request(server)
        .post(`${base()}/${after}/publish`)
        .set(auth())
        .expect(201);
      expect(await catalogueIds()).toContain(after);
    });

    it('retire du catalogue une annonce publiée quand un traitement arrive', async () => {
      const lot = await newBatch();
      const id = await published({ batchId: lot, readyDate: dayOffset(5) });
      expect(await catalogueIds()).toContain(id);
      await request(server)
        .post(`/farms/${farmId}/batches/${lot}/treatments`)
        .set(auth())
        .send({
          careType: 'ANTIBIOTIQUE',
          productName: 'Amoxicilline',
          withdrawalDays: 10,
          reason: 'Infection respiratoire',
          animalCount: 10,
        })
        .expect(201);
      expect(await catalogueIds()).not.toContain(id);
      await request(server).get(`/market/listings/${id}`).expect(404);
      const read = await request(server)
        .get(`${base()}/${id}`)
        .set(auth())
        .expect(200);
      expect(read.body.hiddenReason).toBe('SANITARY');
    });
  });

  describe('catalogue public', () => {
    it('se lit sans connexion et ne montre rien de sensible', async () => {
      const id = await published({
        description: 'Poulets fermiers',
        deliveryAvailable: true,
        deliveryFeeFcfa: 2000,
      });
      const res = await request(server)
        .get(`/market/listings/${id}`)
        .expect(200);
      expect(res.body).toMatchObject({
        id,
        kind: 'PRE',
        unitPriceFcfa: 3500,
        availableQuantity: 50,
        depositPct: 30,
        deliveryFeeFcfa: 2000,
        species: 'POULET',
        farm: { id: farmId, city: farmCity },
      });
      const body = JSON.stringify(res.body);
      for (const secret of [
        'batchId',
        batchId,
        'batchName',
        'quantityAlive',
        'latitude',
        'longitude',
        'phone',
        'ownerId',
        'chickUnitPrice',
        'createdById',
        'quantityPublished',
      ]) {
        expect(body).not.toContain(secret);
      }
    });

    it('filtre par ville, type et produit', async () => {
      const id = await published();
      expect(await catalogueIds({ city: farmCity.toLowerCase() })).toContain(
        id,
      );
      expect(await catalogueIds({ city: 'NullePart' })).not.toContain(id);
      expect(await catalogueIds({ kind: 'PRE', city: farmCity })).toContain(id);
      expect(await catalogueIds({ kind: 'NOW', city: farmCity })).not.toContain(
        id,
      );
      expect(
        await catalogueIds({ product: 'EGGS', city: farmCity }),
      ).not.toContain(id);
      expect(
        await catalogueIds({ species: 'DINDE', city: farmCity }),
      ).not.toContain(id);
    });

    it('pagine sans doublon', async () => {
      await published();
      await published();
      const first = await request(server)
        .get('/market/listings')
        .query({ city: farmCity, limit: 1 })
        .expect(200);
      expect(first.body.items).toHaveLength(1);
      expect(first.body.hasMore).toBe(true);
      const second = await request(server)
        .get('/market/listings')
        .query({ city: farmCity, limit: 1, offset: 1 })
        .expect(200);
      expect(second.body.items[0].id).not.toBe(first.body.items[0].id);
    });

    it('refuse un paramètre invalide et un identifiant mal formé', async () => {
      await request(server)
        .get('/market/listings')
        .query({ limit: 51 })
        .expect(400);
      await request(server).get('/market/listings/pas-un-uuid').expect(400);
    });

    it('plafonne la quantité affichée au stock libre, et retire à zéro', async () => {
      const lot = await newBatch();
      const id = await published({ batchId: lot, quantityPublished: 80 });
      const sale = await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 30,
              unitPriceFcfa: 3000,
              batchId: lot,
            },
          ],
        })
        .expect(201);
      const capped = await request(server)
        .get(`/market/listings/${id}`)
        .expect(200);
      expect(capped.body.availableQuantity).toBe(70);

      await request(server)
        .post(`/farms/${farmId}/orders`)
        .set(auth())
        .send({
          canal: 'FERME',
          items: [
            {
              productType: 'POULET_PIECE',
              quantity: 70,
              unitPriceFcfa: 3000,
              batchId: lot,
            },
          ],
        })
        .expect(201);
      await request(server).get(`/market/listings/${id}`).expect(404);
      const read = await request(server)
        .get(`${base()}/${id}`)
        .set(auth())
        .expect(200);
      expect(read.body.hiddenReason).toBe('OUT_OF_STOCK');

      await request(server)
        .delete(`/farms/${farmId}/orders/${sale.body.id}`)
        .set(auth())
        .expect(200);
      const back = await request(server)
        .get(`/market/listings/${id}`)
        .expect(200);
      expect(back.body.availableQuantity).toBe(30);
    });

    it('retire les annonces d’une ferme non vérifiée ou suspendue', async () => {
      const id = await published();
      await setVerified(farmId, false);
      expect(await catalogueIds()).not.toContain(id);
      const read = await request(server)
        .get(`${base()}/${id}`)
        .set(auth())
        .expect(200);
      expect(read.body.hiddenReason).toBe('FARM_NOT_VERIFIED');
      await setVerified(farmId, true);

      await dataSource
        .getRepository(Farm)
        .update({ id: farmId }, { active: false });
      expect(await catalogueIds()).not.toContain(id);
      await request(server).get(`/market/listings/${id}`).expect(404);
      await dataSource
        .getRepository(Farm)
        .update({ id: farmId }, { active: true });
      expect(await catalogueIds()).toContain(id);
    });

    it('met en vente des œufs par alvéole, selon le stock du lot', async () => {
      const lot = await newBatch({ type: 'PONDEUSE' });
      await request(server)
        .post(`/farms/${farmId}/batches/${lot}/daily-entries`)
        .set(auth())
        .send({
          entryDate: dayOffset(0),
          eggsCollected: 300,
          deaths: 0,
          feedKg: 10,
          waterLiters: 20,
        })
        .expect((r) => expect(r.status).toBeLessThan(300));
      const draft = {
        kind: 'NOW',
        product: 'EGGS',
        batchId: lot,
        readyDate: undefined,
        depositPct: undefined,
        unitPriceFcfa: 2500,
      };
      const tooMany = await createDraft({ ...draft, quantityPublished: 11 });
      await request(server)
        .post(`${base()}/${tooMany}/publish`)
        .set(auth())
        .expect(400);
      const id = await published({ ...draft, quantityPublished: 10 });
      const res = await request(server)
        .get(`/market/listings/${id}`)
        .expect(200);
      expect(res.body).toMatchObject({
        product: 'EGGS',
        availableQuantity: 10,
      });
    });
  });

  describe('date suggérée', () => {
    const suggest = (query: Record<string, unknown>) =>
      request(server)
        .get(`/farms/${farmId}/market/ready-date-suggestion`)
        .set(auth())
        .query(query);

    it('part de l’âge minimal du lot', async () => {
      const lot = await newBatch({ integrationDate: dayOffset(-10) });
      const res = await suggest({ batchId: lot }).expect(200);
      expect(res.body.suggestion).toEqual({
        readyDate: dayOffset(25),
        source: 'MIN_AGE',
      });
    });

    it('ne répond rien pour un poids sans courbe de souche', async () => {
      const res = await suggest({ batchId, targetWeightKg: 2 }).expect(200);
      expect(res.body.suggestion).toBeNull();
    });

    it('refuse le lot d’une autre ferme', async () => {
      await suggest({ batchId: '00000000-0000-4000-8000-000000000000' }).expect(
        404,
      );
    });
  });
});

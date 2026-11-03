import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

describe('Comptes acheteurs du Market (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let seq = 0;

  const phone = () => `+24176${String(Date.now()).slice(-6)}${seq++}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
  const registerBuyer = (over: Record<string, unknown> = {}) =>
    request(server)
      .post('/auth/register-buyer')
      .send({ phone: phone(), fullName: 'Acheteur Test', code: 'secret123', ...over });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('inscrit un hôtel sans créer de ferme, puis le connecte', async () => {
    const number = phone();
    const res = await registerBuyer({
      phone: number,
      type: 'HOTEL',
      organizationName: 'Hôtel du Port',
      city: 'Port-Gentil',
    }).expect(201);
    expect(res.body.user.role).toBe('ACHETEUR');

    const login = await request(server)
      .post('/auth/login')
      .send({ phone: number, code: 'secret123' })
      .expect(201);
    expect(login.body.user.role).toBe('ACHETEUR');

    const farms = await request(server)
      .get('/farms')
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(farms.body).toEqual([]);

    const profile = await request(server)
      .get('/auth/buyer-profile')
      .set(bearer(login.body.accessToken))
      .expect(200);
    expect(profile.body).toMatchObject({
      type: 'HOTEL',
      organizationName: 'Hôtel du Port',
      city: 'Port-Gentil',
    });
  });

  it('ne se laisse pas donner un autre rôle à l’inscription', async () => {
    const res = await registerBuyer({ role: 'PLATFORM_ADMIN' }).expect(201);
    expect(res.body.user.role).toBe('ACHETEUR');
  });

  it('refuse un numéro déjà pris, même en concurrence', async () => {
    const number = phone();
    await registerBuyer({ phone: number }).expect(201);
    await registerBuyer({ phone: number }).expect(409);
    await request(server)
      .post('/auth/register')
      .send({ phone: number, fullName: 'X', code: 'secret123' })
      .expect(409);

    const racing = phone();
    const answers = await Promise.all([
      registerBuyer({ phone: racing }),
      registerBuyer({ phone: racing }),
    ]);
    expect(answers.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it('refuse un type inconnu et un code trop court', async () => {
    await registerBuyer({ type: 'ESPION' }).expect(400);
    await registerBuyer({ code: '123' }).expect(400);
  });

  describe('accès aux fermes', () => {
    let buyerToken: string;
    let ownerToken: string;
    let farmId: string;

    beforeAll(async () => {
      const buyer = await registerBuyer().expect(201);
      buyerToken = buyer.body.accessToken;
      const owner = await request(server)
        .post('/auth/register')
        .send({ phone: phone(), fullName: 'Proprio', code: 'secret123' })
        .expect(201);
      ownerToken = owner.body.accessToken;
      const farms = await request(server)
        .get('/farms')
        .set(bearer(ownerToken))
        .expect(200);
      farmId = farms.body[0].id;
    });

    it.each([
      ['get', () => `/farms/${farmId}/batches`],
      ['get', () => `/farms/${farmId}/orders`],
      ['get', () => `/farms/${farmId}/sales`],
      ['get', () => `/farms/${farmId}/customers`],
      ['get', () => `/farms/${farmId}/caisse/current`],
      ['get', () => `/farms/${farmId}/dashboard`],
      ['post', () => `/farms/${farmId}/orders`],
      ['post', () => '/farms'],
      ['get', () => '/admin/metrics'],
    ] as const)('%s %s : 403 pour un acheteur', async (method, path) => {
      await request(server)[method](path())
        .set(bearer(buyerToken))
        .send({})
        .expect(403);
    });

    it('ne voit pas la ferme d’autrui par la liste', async () => {
      const res = await request(server)
        .get('/farms')
        .set(bearer(buyerToken))
        .expect(200);
      expect(res.body).toEqual([]);
    });

    it('ne peut pas être rattaché à une ferme comme employé', async () => {
      const number = phone();
      await registerBuyer({ phone: number }).expect(201);
      const res = await request(server)
        .post(`/farms/${farmId}/eleveurs`)
        .set(bearer(ownerToken))
        .send({ phone: number, fullName: 'Employé', code: 'secret123' });
      expect(res.status).toBe(409);
    });
  });

  describe('profil', () => {
    it('un propriétaire peut aussi avoir un profil d’acheteur', async () => {
      const owner = await request(server)
        .post('/auth/register')
        .send({ phone: phone(), fullName: 'Proprio Acheteur', code: 'secret123' })
        .expect(201);
      const token = owner.body.accessToken;
      const none = await request(server)
        .get('/auth/buyer-profile')
        .set(bearer(token))
        .expect(200);
      expect(none.body).toEqual({});

      await request(server)
        .put('/auth/buyer-profile')
        .set(bearer(token))
        .send({ type: 'RESTAURANT', organizationName: 'Chez Maman' })
        .expect(200);
      const updated = await request(server)
        .put('/auth/buyer-profile')
        .set(bearer(token))
        .send({ type: 'TRAITEUR' })
        .expect(200);
      expect(updated.body.type).toBe('TRAITEUR');
      expect(updated.body.organizationName).toBeNull();
    });

    it('exige une connexion', async () => {
      await request(server).get('/auth/buyer-profile').expect(401);
    });
  });

  describe('devenir éleveur', () => {
    it('garde le compte et le profil, et crée la ferme', async () => {
      const number = phone();
      const buyer = await registerBuyer({ phone: number, type: 'HOTEL' }).expect(201);
      const oldToken = buyer.body.accessToken;

      const res = await request(server)
        .post('/auth/become-farmer')
        .set(bearer(oldToken))
        .send({ farmName: 'Ferme Nouvelle', farmCity: 'Oyem' })
        .expect(201);
      expect(res.body.user.role).toBe('PROPRIETAIRE');
      expect(res.body.user.id).toBe(buyer.body.user.id);

      const farms = await request(server)
        .get('/farms')
        .set(bearer(res.body.accessToken))
        .expect(200);
      expect(farms.body).toHaveLength(1);
      expect(farms.body[0].name).toBe('Ferme Nouvelle');

      await request(server)
        .get(`/farms/${farms.body[0].id}/batches`)
        .set(bearer(res.body.accessToken))
        .expect(200);

      // The role is read from the database, so the old token follows.
      await request(server)
        .get(`/farms/${farms.body[0].id}/batches`)
        .set(bearer(oldToken))
        .expect(200);

      const profile = await request(server)
        .get('/auth/buyer-profile')
        .set(bearer(res.body.accessToken))
        .expect(200);
      expect(profile.body.type).toBe('HOTEL');
    });

    it('ne crée qu’une ferme sur deux appels simultanés', async () => {
      const buyer = await registerBuyer().expect(201);
      const token = buyer.body.accessToken;
      const answers = await Promise.all([
        request(server).post('/auth/become-farmer').set(bearer(token)).send({}),
        request(server).post('/auth/become-farmer').set(bearer(token)).send({}),
      ]);
      expect(answers.filter((r) => r.status === 201)).toHaveLength(1);
      const farms = await request(server)
        .get('/farms')
        .set(bearer(token))
        .expect(200);
      expect(farms.body).toHaveLength(1);
    });

    it('est réservé aux acheteurs', async () => {
      const owner = await request(server)
        .post('/auth/register')
        .send({ phone: phone(), fullName: 'Proprio', code: 'secret123' })
        .expect(201);
      await request(server)
        .post('/auth/become-farmer')
        .set(bearer(owner.body.accessToken))
        .send({})
        .expect(403);
    });
  });
});

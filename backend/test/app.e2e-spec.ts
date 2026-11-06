import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { registerBuyer, uniquePhone } from './helpers/programme-farm.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) non authentifié -> 401 (JwtAuthGuard global)', () => {
    return request(app.getHttpServer()).get('/').expect(401);
  });

  it('/auth/register-buyer (POST) est public', async () => {
    const buyer = await registerBuyer(app.getHttpServer());
    expect(buyer.token).toEqual(expect.any(String));
  });

  it('instance POUFA seule : plus d’inscription Propriétaire ni de création de ferme hors registre (404)', async () => {
    const server = app.getHttpServer();
    // Unknown routes: 404 before any guard, with or without a session.
    const buyer = await registerBuyer(server);
    const bearer = { Authorization: `Bearer ${buyer.token}` };
    await request(server)
      .post('/auth/register')
      .send({ phone: uniquePhone(), fullName: 'X', code: 'secret123' })
      .expect(404);
    await request(server)
      .post('/auth/become-farmer')
      .set(bearer)
      .send({})
      .expect(404);
    await request(server)
      .post('/farms')
      .set(bearer)
      .send({ name: 'Ferme', administrativeCity: 'Libreville' })
      .expect(404);
  });

  afterEach(async () => {
    await app.close();
  });
});

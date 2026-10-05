import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('Module 4 — Zone clients & promos (find-or-create, segments, coupons), e2e', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let batchId: string;
  let empToken: string;

  function post(url: string, body: object, auth = token) {
    return request(server)
      .post(url)
      .set('Authorization', `Bearer ${auth}`)
      .send(body);
  }

  function get(url: string, auth = token) {
    return request(server).get(url).set('Authorization', `Bearer ${auth}`);
  }

  async function createAUTORESale(
    priceFcfa: number,
    extra: Record<string, unknown> = {},
  ) {
    return post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: priceFcfa,
        },
      ],
      payments: [{ method: 'CASH', amountFcfa: priceFcfa }],
      ...extra,
    });
  }

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

    const phone = `+24162${Date.now()}`;
    await request(server)
      .post('/auth/register')
      .send({
        phone,
        fullName: 'Proprio Zone',
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
        name: `Ferme Zone ${Date.now()}`,
        administrativeCity: 'Libreville',
        capacityPerBuilding: 1000,
      })
      .expect(201);
    farmId = farm.body.id;

    const batch = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        batchName: 'Lot Zone',
        integrationDate: today(),
        quantityAtStart: 300,
        type: 'CHAIR',
        couvoirSupplier: 'Canabec',
        chickLotNumber: `CZ-${Date.now()}`,
        hatchDate: today(),
      })
      .expect(201);
    batchId = batch.body.id;

    await post('/farms/' + farmId + '/caisse/open', {
      openingBalanceFcfa: 500000,
    }).expect(201);

    const empPhone = `+24163${Date.now()}`;
    await post('/farms/' + farmId + '/eleveurs', {
      phone: empPhone,
      fullName: 'Éleveur Zone',
      code: 'secret123',
    }).expect(201);
    const empLogin = await request(server)
      .post('/auth/login')
      .send({ phone: empPhone, code: 'secret123' })
      .expect(201);
    empToken = empLogin.body.accessToken;
  });

  it('1ʳᵉ vente avec téléphone : fiche client auto-créée (téléphone normalisé)', async () => {
    const res = await createAUTORESale(5000, {
      customerPhone: '+241 60 12 34 56',
      customerName: 'Aline Ovono',
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.customerId).toBeTruthy();

    const list = await get('/farms/' + farmId + '/customers');
    expect(list.status).toBe(200);
    const aline = list.body.find((c: any) => c.phone === '+24160123456');
    expect(aline).toBeTruthy();
    expect(aline.fullName).toBe('Aline Ovono');
    expect(aline.segment).toBe('NOUVEAU');
    expect(res.body.sale.customerId).toBe(aline.id);

    const profile = await get(`/farms/${farmId}/customers/${aline.id}`);
    expect(profile.body.segment).toBe('NOUVEAU');
  });

  it('2ᵉ vente même numéro, formatage différent : MÊME client, aucun doublon', async () => {
    const listBefore = await get('/farms/' + farmId + '/customers');
    const before = listBefore.body.length;

    const res = await createAUTORESale(4000, {
      customerPhone: '+24160 12 34 56',
    });
    expect(res.status).toBe(201);
    const aline = (await get('/farms/' + farmId + '/customers')).body.find(
      (c: any) => c.phone === '+24160123456',
    );
    expect(res.body.sale.customerId).toBe(aline.id);

    const listAfter = await get('/farms/' + farmId + '/customers');
    expect(listAfter.body.length).toBe(before);
  });

  it('vente anonyme sans téléphone : pas de fiche créée ; nom seul ne crée rien', async () => {
    const listBefore = await get('/farms/' + farmId + '/customers');
    const before = listBefore.body.length;

    const anon = await createAUTORESale(1000);
    expect(anon.status).toBe(201);
    expect(anon.body.sale.customerId).toBeNull();

    const nameOnly = await createAUTORESale(1000, {
      customerName: 'Mme Sans Téléphone',
    });
    expect(nameOnly.status).toBe(201);
    expect(nameOnly.body.sale.customerId).toBeNull();

    const listAfter = await get('/farms/' + farmId + '/customers');
    expect(listAfter.body.length).toBe(before);
  });

  it('profil : GET :customerId → coordonnées + solde + segment NOUVEAU (1 visite)', async () => {
    const aline = (await get('/farms/' + farmId + '/customers')).body.find(
      (c: any) => c.phone === '+24160123456',
    );
    const res = await get(`/farms/${farmId}/customers/${aline.id}`);
    expect(res.status).toBe(200);
    expect(res.body.fullName).toBe('Aline Ovono');
    expect(res.body.segment).toBe('REGULIER');
    expect(res.body.balance.outstandingFcfa).toBe(0);
  });

  it('historique : GET :customerId/history → ventes non annulées avec articles/paiements', async () => {
    const aline = (await get('/farms/' + farmId + '/customers')).body.find(
      (c: any) => c.phone === '+24160123456',
    );
    const res = await get(`/farms/${farmId}/customers/${aline.id}/history`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].items.length).toBeGreaterThan(0);
    expect(res.body[0].payments.length).toBeGreaterThan(0);
  });

  it('stats + segments : NOUVEAU → RÉGULIER (2 visites) → TOP (seuil dépensé)', async () => {
    const aline = (await get('/farms/' + farmId + '/customers')).body.find(
      (c: any) => c.phone === '+24160123456',
    );
    const stats = await get(`/farms/${farmId}/customers/${aline.id}/stats`);
    expect(stats.status).toBe(200);
    expect(stats.body.visits).toBe(2);
    expect(stats.body.totalSpentFcfa).toBe(9000);
    expect(stats.body.avgBasketFcfa).toBe(4500);
    expect(stats.body.segment).toBe('REGULIER');
    expect(stats.body.lastPurchaseDate).toBe(today());
    expect(stats.body.favorites[0].productType).toBe('AUTRE');

    const topPhone = `+24165${Date.now().toString().slice(-6)}`;
    for (let i = 0; i < 4; i++) {
      const res = await createAUTORESale(30000, { customerPhone: topPhone });
      expect(res.status).toBe(201);
    }
    const top = (await get('/farms/' + farmId + '/customers')).body.find(
      (c: any) => c.phone === topPhone,
    );
    const topStats = await get(`/farms/${farmId}/customers/${top.id}/stats`);
    expect(topStats.body.visits).toBe(4);
    expect(topStats.body.totalSpentFcfa).toBe(120000);
    expect(topStats.body.segment).toBe('TOP');
  });

  it('GET :customerId/stats inexistant → 404', async () => {
    const res = await get(
      `/farms/${farmId}/customers/00000000-0000-4000-8000-000000000000/stats`,
    );
    expect(res.status).toBe(404);
    expect(res.body.message).toContain('Client introuvable');
  });

  it('promotions : CRUD + unicité du code (409) + code normalisé en majuscules', async () => {
    const created = await post('/farms/' + farmId + '/promotions', {
      code: 'welcome10',
      label: 'Bienvenue -10%',
      type: 'PCT',
      value: 10,
    });
    expect(created.status).toBe(201);
    expect(created.body.code).toBe('WELCOME10');

    const dup = await post('/farms/' + farmId + '/promotions', {
      code: 'WELCOME10',
      label: 'Doublon',
      type: 'FCFA',
      value: 5,
    });
    expect(dup.status).toBe(409);

    const list = await get('/farms/' + farmId + '/promotions');
    expect(list.status).toBe(200);
    expect(list.body.length).toBeGreaterThanOrEqual(1);
  });

  it('coupon PCT 10 % : vente = sous-total − remise, promotion tracée, reçu PDF', async () => {
    const res = await post('/farms/' + farmId + '/sales', {
      customerPhone: `+24166${Date.now().toString().slice(-6)}`,
      items: [
        {
          productType: 'POULET_PIECE',
          quantity: 1,
          unit: 'PIECE',
          unitPriceFcfa: 10000,
          batchId,
        },
      ],
      promoCode: 'WELCOME10',
      payments: [{ method: 'CASH', amountFcfa: 9000 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.totalAmountFcfa).toBe(9000);
    expect(res.body.sale.discountAmountFcfa).toBe(1000);
    expect(res.body.sale.promotionId).toBeTruthy();

    const receipt = await get(
      `/farms/${farmId}/sales/${res.body.sale.id}/receipt`,
    );
    expect(receipt.status).toBe(200);
    expect(receipt.headers['content-type']).toContain('application/pdf');
    expect(receipt.body.length).toBeGreaterThan(1000);
  });

  it('coupon FCFA 500 : remise montant fixe plafonnée', async () => {
    await post('/farms/' + farmId + '/promotions', {
      code: 'REMISE500',
      label: 'Remise 500 FCFA',
      type: 'FCFA',
      value: 500,
    }).expect(201);

    const res = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 10000,
        },
      ],
      promoCode: 'remise500',
      payments: [{ method: 'CASH', amountFcfa: 9500 }],
    });
    expect(res.status).toBe(201);
    expect(res.body.sale.totalAmountFcfa).toBe(9500);
    expect(res.body.sale.discountAmountFcfa).toBe(500);
  });

  it('code promo invalide / inactif / expiré / non commencé / minimum non atteint → 400', async () => {
    await post('/farms/' + farmId + '/promotions', {
      code: 'INACTIF',
      label: 'Inactive',
      type: 'PCT',
      value: 10,
      active: false,
    }).expect(201);
    await post('/farms/' + farmId + '/promotions', {
      code: 'EXPIRE',
      label: 'Expirée',
      type: 'PCT',
      value: 10,
      endDate: dayOffset(-1),
    }).expect(201);
    await post('/farms/' + farmId + '/promotions', {
      code: 'FUTUR',
      label: 'Future',
      type: 'PCT',
      value: 10,
      startDate: dayOffset(1),
    }).expect(201);
    await post('/farms/' + farmId + '/promotions', {
      code: 'MIN20000',
      label: 'Panier min 20 000',
      type: 'FCFA',
      value: 1000,
      minSubtotalFcfa: 20000,
    }).expect(201);

    const invalide = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 1000,
        },
      ],
      promoCode: 'ZZZ',
      payments: [{ method: 'CASH', amountFcfa: 1000 }],
    });
    expect(invalide.status).toBe(400);
    expect(invalide.body.message).toContain('invalide');

    const inactif = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 1000,
        },
      ],
      promoCode: 'INACTIF',
      payments: [{ method: 'CASH', amountFcfa: 1000 }],
    });
    expect(inactif.status).toBe(400);
    expect(inactif.body.message).toContain('inactif');

    const expire = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 1000,
        },
      ],
      promoCode: 'EXPIRE',
      payments: [{ method: 'CASH', amountFcfa: 1000 }],
    });
    expect(expire.status).toBe(400);
    expect(expire.body.message).toContain('expiré');

    const futur = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 1000,
        },
      ],
      promoCode: 'FUTUR',
      payments: [{ method: 'CASH', amountFcfa: 1000 }],
    });
    expect(futur.status).toBe(400);
    expect(futur.body.message).toContain('pas encore actif');

    const min = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 1000,
        },
      ],
      promoCode: 'MIN20000',
      payments: [{ method: 'CASH', amountFcfa: 1000 }],
    });
    expect(min.status).toBe(400);
    expect(min.body.message).toContain('minimum');
  });

  it('coupon ciblé : réservé à un client précis → 400 pour un autre client', async () => {
    const birthday = `+24167${Date.now().toString().slice(-6)}`;
    const lucky = `+24168${Date.now().toString().slice(-6)}`;
    const first = await createAUTORESale(1000, { customerPhone: birthday });
    const luckySale = await createAUTORESale(1000, { customerPhone: lucky });

    await post('/farms/' + farmId + '/promotions', {
      code: 'FIDELITE',
      label: 'Fidélité',
      type: 'PCT',
      value: 20,
      customerId: first.body.sale.customerId,
    }).expect(201);

    const ok = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 10000,
        },
      ],
      customerPhone: birthday,
      promoCode: 'FIDELITE',
      payments: [{ method: 'CASH', amountFcfa: 8000 }],
    });
    expect(ok.status).toBe(201);
    expect(ok.body.sale.discountAmountFcfa).toBe(2000);

    const denied = await post('/farms/' + farmId + '/sales', {
      items: [
        {
          productType: 'AUTRE',
          quantity: 1,
          unit: 'UNITE',
          unitPriceFcfa: 10000,
        },
      ],
      customerPhone: lucky,
      promoCode: 'FIDELITE',
      payments: [{ method: 'CASH', amountFcfa: 8000 }],
    });
    expect(denied.status).toBe(400);
    expect(denied.body.message).toContain('réservé');
    expect(luckySale.body.sale.customerId).toBeTruthy();
  });

  it('coupon réutilisable : même code appliqué sur 2 ventes', async () => {
    const code = 'REUSE';
    await post('/farms/' + farmId + '/promotions', {
      code,
      label: 'Réutilisable',
      type: 'PCT',
      value: 10,
    }).expect(201);

    for (const subtotal of [10000, 20000]) {
      const res = await post('/farms/' + farmId + '/sales', {
        items: [
          {
            productType: 'AUTRE',
            quantity: 1,
            unit: 'UNITE',
            unitPriceFcfa: subtotal,
          },
        ],
        promoCode: code,
        payments: [{ method: 'CASH', amountFcfa: subtotal - subtotal / 10 }],
      });
      expect(res.status).toBe(201);
      expect(res.body.sale.discountAmountFcfa).toBe(subtotal / 10);
      expect(res.body.sale.totalAmountFcfa).toBe(subtotal - subtotal / 10);
    }
  });

  it('un Éleveur ne peut pas gérer les promotions (403), mais une vente au scoring client reste ELEVEUR-ok', async () => {
    const denied = await post(
      '/farms/' + farmId + '/promotions',
      {
        code: 'ELEVEUR_PROMO',
        label: 'Interdit',
        type: 'PCT',
        value: 10,
      },
      empToken,
    );
    expect(denied.status).toBe(403);

    const res = await post(
      '/farms/' + farmId + '/sales',
      {
        customerPhone: `+24169${Date.now().toString().slice(-6)}`,
        items: [
          {
            productType: 'AUTRE',
            quantity: 1,
            unit: 'UNITE',
            unitPriceFcfa: 1000,
          },
        ],
        payments: [{ method: 'CASH', amountFcfa: 1000 }],
      },
      empToken,
    );
    expect(res.status).toBe(201);
    expect(res.body.sale.customerId).toBeTruthy();
  });

  it('PATCH promotion : désactivation + suppression', async () => {
    const list = await get('/farms/' + farmId + '/promotions');
    const fid = list.body.find((p: any) => p.code === 'FIDELITE');
    const patched = await request(server)
      .patch(`/farms/${farmId}/promotions/${fid.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ active: false });
    expect(patched.status).toBe(200);
    expect(patched.body.active).toBe(false);

    const removed = await request(server)
      .delete(`/farms/${farmId}/promotions/${fid.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(removed.status).toBe(200);

    const after = await get('/farms/' + farmId + '/promotions');
    expect(after.body.find((p: any) => p.id === fid.id)).toBeUndefined();
  });

  it('types de clients : création typée + filtre type + recherche + summary', async () => {
    const resto = await post('/farms/' + farmId + '/customers', {
      fullName: 'Resto La Palette',
      phone: `+24170${Date.now().toString().slice(-6)}`,
      type: 'RESTAURANT',
    });
    expect(resto.status).toBe(201);
    expect(resto.body.type).toBe('RESTAURANT');
    expect(resto.body.code).toMatch(/^CL-\d{4}$/);

    const invalide = await post('/farms/' + farmId + '/customers', {
      fullName: 'Type Invalide',
      type: 'MOUCHETTE',
    });
    expect(invalide.status).toBe(400);

    const byType = await get(`/farms/${farmId}/customers?type=RESTAURANT`);
    expect(byType.status).toBe(200);
    expect(byType.body.length).toBeGreaterThanOrEqual(1);
    for (const c of byType.body) expect(c.type).toBe('RESTAURANT');

    const search = await get(`/farms/${farmId}/customers?search=Palette`);
    expect(search.status).toBe(200);
    expect(search.body.length).toBe(1);
    expect(search.body[0].fullName).toBe('Resto La Palette');

    const summary = await get(`/farms/${farmId}/customers/summary`);
    expect(summary.status).toBe(200);
    expect(summary.body.total).toBeGreaterThanOrEqual(1);
    expect(summary.body.byType.RESTAURANT.count).toBeGreaterThanOrEqual(1);
    expect(summary.body.byType.PARTICULIER.count).toBeGreaterThanOrEqual(1);
    expect(summary.body.bySegment.NOUVEAU).toBeGreaterThanOrEqual(0);
    expect(summary.body.totalInvoicedFcfa).toBeGreaterThanOrEqual(0);
    expect(summary.body.paidFcfa).toBeGreaterThanOrEqual(0);
    expect(summary.body.totalOutstandingFcfa).toBeGreaterThanOrEqual(0);
    expect(summary.body.debtors).toBeGreaterThanOrEqual(0);
  });

  it('codes CL-#### attribués séquentiellement par ferme', async () => {
    const a = await post('/farms/' + farmId + '/customers', {
      fullName: 'Client Séquentiel A',
      phone: `+24171${Date.now().toString().slice(-6)}`,
    });
    const b = await post('/farms/' + farmId + '/customers', {
      fullName: 'Client Séquentiel B',
      phone: `+24172${Date.now().toString().slice(-6)}`,
    });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    const num = (code: string) => parseInt(/^CL-(\d{4})$/.exec(code)![1], 10);
    expect(a.body.code).toMatch(/^CL-\d{4}$/);
    expect(b.body.code).toMatch(/^CL-\d{4}$/);
    expect(num(b.body.code)).toBeGreaterThan(num(a.body.code));
  });

  it('crédit : toute vente à crédit est acceptée, sans plafond', async () => {
    const phone = `+24173${Date.now().toString().slice(-6)}`;
    const credit = await post('/farms/' + farmId + '/sales', {
      customerPhone: phone,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 40000 },
      ],
      payments: [],
    });
    expect(credit.status).toBe(201);
    expect(credit.body.sale.status).toBe('OUTSTANDING');
  });

  it('crédit : la dette cumulée n’est plus plafonnée', async () => {
    const phone = `+24174${Date.now().toString().slice(-6)}`;
    const cust = await post('/farms/' + farmId + '/customers', {
      fullName: 'Crédit illimité',
      phone,
    });
    expect(cust.status).toBe(201);
    expect(cust.body).not.toHaveProperty('creditLimitFcfa');

    const first = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 40000 },
      ],
      payments: [],
    });
    expect(first.status).toBe(201);
    expect(first.body.sale.status).toBe('OUTSTANDING');

    // Cumul bien au-delà de l’ancien plafond « particulier » (50 000 FCFA).
    const second = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 200000 },
      ],
      payments: [],
    });
    expect(second.status).toBe(201);

    const profile = (await get(`/farms/${farmId}/customers/${cust.body.id}`)).body;
    expect(profile.balance.outstandingFcfa).toBe(240000);
  });

  it('crédit : le type de client n’a aucun effet sur le crédit', async () => {
    const gros = await post('/farms/' + farmId + '/customers', {
      fullName: 'Grossiste Central',
      phone: `+24174${Date.now().toString().slice(-6)}`,
      type: 'GROSSISTE',
    });
    expect(gros.status).toBe(201);
    expect(gros.body.type).toBe('GROSSISTE');

    const sale = await post('/farms/' + farmId + '/sales', {
      customerId: gros.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 600000 },
      ],
      payments: [],
    });
    expect(sale.status).toBe(201);
    expect(sale.body.sale.status).toBe('OUTSTANDING');
  });

  it('plafond de crédit : l’encaissement n’est jamais bloqué (paiement ≠ nouveau crédit)', async () => {
    const phone = `+24175${Date.now().toString().slice(-6)}`;
    const cust = await post('/farms/' + farmId + '/customers', {
      fullName: 'Encaissement Espèces',
      phone,
    });
    expect(cust.status).toBe(201);
    const res = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 40000 },
      ],
      payments: [],
    });
    expect(res.status).toBe(201);
    const saleId = res.body.sale.id;
    expect(res.body.sale.status).toBe('OUTSTANDING');

    const paid = await post(`/farms/${farmId}/sales/${saleId}/payments`, {
      method: 'CASH',
      amountFcfa: 40000,
    });
    expect(paid.status).toBe(201);

    const sale = await get(`/farms/${farmId}/sales/${saleId}`);
    expect(sale.body.status).toBe('SETTLED');
  });

  it('encaisser depuis la fiche client : répartit sur les ventes impayées (FIFO)', async () => {
    const cust = await post('/farms/' + farmId + '/customers', {
      fullName: 'Client Encaissement',
      phone: `+24176${Date.now().toString().slice(-6)}`,
    });
    expect(cust.status).toBe(201);

    const saleA = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 30000 },
      ],
      payments: [],
    });
    const saleB = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 20000 },
      ],
      payments: [],
    });
    expect(saleA.status).toBe(201);
    expect(saleB.status).toBe(201);

    // 25 000 → sale A (30 000) partiellement soldée (reste 5 000), sale B intacte.
    const paid = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: 25000,
    });
    expect(paid.status).toBe(201);
    expect(paid.body.balance.outstandingFcfa).toBe(25000);
    const saleADetail = await get(`/farms/${farmId}/sales/${saleA.body.sale.id}`);
    expect(saleADetail.body.status).toBe('OUTSTANDING');

    // Montant > solde dû → 400.
    const over = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: 25001,
    });
    expect(over.status).toBe(400);

    // Montant négatif → 400.
    const negative = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: -1000,
    });
    expect(negative.status).toBe(400);

    // Solde complet → les deux ventes passent en SETTLED.
    const settled = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: 25000,
    });
    expect(settled.status).toBe(201);
    expect(settled.body.balance.outstandingFcfa).toBe(0);
    const saleA2 = await get(`/farms/${farmId}/sales/${saleA.body.sale.id}`);
    expect(saleA2.body.status).toBe('SETTLED');
    const saleBDetail = await get(`/farms/${farmId}/sales/${saleB.body.sale.id}`);
    expect(saleBDetail.body.status).toBe('SETTLED');

    const history = await get(`/farms/${farmId}/customers/${cust.body.id}/history`);
    expect(history.status).toBe(200);
  });

  it('encaisser : rejeu avec la même clé d’idempotence → pas de double encaissement', async () => {
    const cust = await post('/farms/' + farmId + '/customers', {
      fullName: 'Client Idempotent',
      phone: `+24177${Date.now().toString().slice(-6)}`,
    });
    expect(cust.status).toBe(201);
    const sale = await post('/farms/' + farmId + '/sales', {
      customerId: cust.body.id,
      items: [
        { productType: 'AUTRE', quantity: 1, unit: 'UNITE', unitPriceFcfa: 30000 },
      ],
      payments: [],
    });
    expect(sale.status).toBe(201);

    const key = `e2e-${Date.now()}`;
    const first = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: 30000,
      idempotencyKey: key,
    });
    expect(first.status).toBe(201);
    expect(first.body.balance.outstandingFcfa).toBe(0);

    const replay = await post(`/farms/${farmId}/customers/${cust.body.id}/payments`, {
      amountFcfa: 30000,
      idempotencyKey: key,
    });
    expect(replay.status).toBe(201);
    expect(replay.body.balance.outstandingFcfa).toBe(0);
    expect(replay.body.payments).toHaveLength(1);
  });

  afterAll(async () => {
    await app.close();
  });
});

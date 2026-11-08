import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Regression sweep of the business modules: lot lifecycle, feed stock,
 * stock transfers, slaughter, pondage, health events, indicators and the
 * opt-in pagination of the list endpoints.
 */
describe('Régression métier (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let token: string;
  let farmId: string;
  let seq = 0;

  const post = (url: string, body: object = {}) =>
    request(server)
      .post(url)
      .set('Authorization', `Bearer ${token}`)
      .send(body);
  const get = (url: string) =>
    request(server).get(url).set('Authorization', `Bearer ${token}`);
  const del = (url: string) =>
    request(server).delete(url).set('Authorization', `Bearer ${token}`);

  async function createBatch(
    quantityAtStart: number,
    extra: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await post(`/farms/${farmId}/batches`, {
      batchName: `Lot régression ${++seq}`,
      integrationDate: dayOffset(-10),
      quantityAtStart,
      type: 'CHAIR',
      ...extra,
    }).expect(201);
    return res.body.id as string;
  }

  const batchOf = async (id: string) =>
    (await get(`/farms/${farmId}/batches/${id}`).expect(200)).body;

  const entry = (batchId: string, body: Record<string, unknown>) =>
    post(`/farms/${farmId}/batches/${batchId}/daily-entries`, body);

  async function feedLot(quantity: number, unit = 'SAC'): Promise<string> {
    const res = await post(`/farms/${farmId}/inputs`, {
      kind: 'ALIMENT',
      foodType: 'DEMARRAGE',
      productName: `Provende régression ${++seq}`,
      supplier: 'FeedCo',
      supplierLotNumber: `RG-${Date.now()}-${seq}`,
      quantity,
      unit,
    }).expect(201);
    return res.body.id as string;
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

    const platformToken = (
      await createPlatformAdmin(server, app.get(DataSource))
    ).token;
    const owner = await createProgrammeFarm(server, platformToken, {
      name: `Ferme Regression ${Date.now()}`,
      exploitantName: 'Proprio Régression',
    });
    token = owner.ownerToken;
    farmId = owner.farmId;
  }, 120000);

  afterAll(async () => {
    await app.close();
  });

  describe('cycle de vie du lot', () => {
    it('refuse les saisies avant la mise en place, dans le futur et sur lot clôturé', async () => {
      const id = await createBatch(100);
      const before = await entry(id, { entryDate: dayOffset(-11), deaths: 1 });
      expect(before.status).toBe(400);
      const future = await entry(id, { entryDate: dayOffset(5), deaths: 1 });
      expect(future.status).toBe(400);
      const negative = await entry(id, { entryDate: dayOffset(-1), deaths: -3 });
      expect(negative.status).toBe(400);
      await entry(id, { entryDate: dayOffset(-1), deaths: 2 }).expect(201);
      await post(`/farms/${farmId}/batches/${id}/cloture`).expect(201);
      const closed = await entry(id, { entryDate: dayOffset(-2), deaths: 1 });
      expect(closed.status).toBe(400);
      expect((await batchOf(id)).quantityAlive).toBe(98);
    });

    it('refuse plus de morts que de vivants et garde l’effectif positif', async () => {
      const id = await createBatch(20);
      const tooMany = await entry(id, { entryDate: dayOffset(-1), deaths: 21 });
      expect(tooMany.status).toBe(400);
      await entry(id, { entryDate: dayOffset(-1), deaths: 20 }).expect(201);
      const b = await batchOf(id);
      expect(b.quantityAlive).toBe(0);
      expect(Number.isFinite(b.metrics.mortalityPercent)).toBe(true);
      expect(b.metrics.mortalityPercent).toBe(100);
      // Corrigeable à la baisse, jamais au-delà de l’effectif de départ.
      const again = await entry(id, { entryDate: dayOffset(-2), deaths: 1 });
      expect(again.status).toBe(400);
    });

    it('mortalité : saisie + événement sanitaire comptés une seule fois', async () => {
      const id = await createBatch(100);
      await entry(id, { entryDate: dayOffset(-3), deaths: 5 }).expect(201);
      await post(`/farms/${farmId}/batches/${id}/health-events`, {
        kind: 'MORTALITE',
        occurredAt: dayOffset(-2),
        severity: 'ROUGE',
        quantity: 10,
        title: 'Mortalité déclarée',
      }).expect(201);
      expect((await batchOf(id)).quantityAlive).toBe(85);
    });

    it('événement de mortalité daté avant la mise en place ou dans le futur : 400', async () => {
      const id = await createBatch(50);
      const base = {
        kind: 'MORTALITE',
        severity: 'ROUGE',
        quantity: 1,
        title: 'Mortalité datée',
      };
      const before = await post(
        `/farms/${farmId}/batches/${id}/health-events`,
        { ...base, occurredAt: dayOffset(-30) },
      );
      expect(before.status).toBe(400);
      const future = await post(`/farms/${farmId}/batches/${id}/health-events`, {
        ...base,
        occurredAt: dayOffset(10),
      });
      expect(future.status).toBe(400);
      expect((await batchOf(id)).quantityAlive).toBe(50);
    });

    it('deux mortalités concurrentes ne retirent pas plus que le vivant', async () => {
      const id = await createBatch(100);
      const send = () =>
        post(`/farms/${farmId}/batches/${id}/health-events`, {
          kind: 'MORTALITE',
          occurredAt: dayOffset(-1),
          severity: 'ROUGE',
          quantity: 60,
          title: 'Mortalité concurrente',
        });
      const results = await Promise.all([send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect((await batchOf(id)).quantityAlive).toBe(40);
    });

    it('un retrait d’oiseaux ne se supprime plus sur un lot clôturé', async () => {
      const id = await createBatch(100);
      const ev = await post(`/farms/${farmId}/batches/${id}/health-events`, {
        kind: 'MORTALITE',
        occurredAt: dayOffset(-1),
        severity: 'ROUGE',
        quantity: 30,
        title: 'Mortalité avant clôture',
      }).expect(201);
      await post(`/farms/${farmId}/batches/${id}/cloture`).expect(201);
      const res = await del(
        `/farms/${farmId}/batches/${id}/health-events/${ev.body.id}`,
      );
      expect(res.status).toBe(400);
      expect((await batchOf(id)).quantityAlive).toBe(70);
    });

    it('asOf invalide : 400 ; valide : 200', async () => {
      const id = await createBatch(10);
      await get(`/farms/${farmId}/batches/${id}?asOf=2026-02-30`).expect(400);
      await get(`/farms/${farmId}/batches?asOf=n-importe-quoi`).expect(400);
      await get(`/farms/${farmId}/batches/${id}?asOf=${dayOffset(-5)}`).expect(
        200,
      );
    });
  });

  describe('pagination optionnelle des listes', () => {
    it('sans paramètre : tableau complet ; avec limit/offset : page', async () => {
      await createBatch(10);
      await createBatch(10);
      await createBatch(10);
      const all = await get(`/farms/${farmId}/batches`).expect(200);
      expect(Array.isArray(all.body)).toBe(true);
      expect(all.body.length).toBeGreaterThanOrEqual(3);
      const page1 = await get(`/farms/${farmId}/batches?limit=2`).expect(200);
      expect(page1.body).toHaveLength(2);
      const page2 = await get(
        `/farms/${farmId}/batches?limit=2&offset=2`,
      ).expect(200);
      expect(page2.body.length).toBeGreaterThanOrEqual(1);
      const ids1 = page1.body.map((b: any) => b.id);
      expect(page2.body.some((b: any) => ids1.includes(b.id))).toBe(false);
      expect(all.body.map((b: any) => b.id).slice(0, 2)).toEqual(ids1);
    });

    it('valeurs invalides : 400, jamais 500', async () => {
      await get(`/farms/${farmId}/batches?limit=0`).expect(400);
      await get(`/farms/${farmId}/batches?limit=abc`).expect(400);
      await get(`/farms/${farmId}/batches?limit=5&offset=-1`).expect(400);
      await get(`/farms/${farmId}/slaughter-orders?limit=-4`).expect(400);
      await get(`/farms/${farmId}/feed-stock/losses?limit=1.5`).expect(400);
    });

    it('saisies, ordres d’abattage, transferts et pertes : page + tableau', async () => {
      const id = await createBatch(100);
      await entry(id, { entryDate: dayOffset(-3), deaths: 1 }).expect(201);
      await entry(id, { entryDate: dayOffset(-2), deaths: 1 }).expect(201);
      await entry(id, { entryDate: dayOffset(-1), deaths: 1 }).expect(201);
      const entries = await get(
        `/farms/${farmId}/batches/${id}/daily-entries`,
      ).expect(200);
      expect(entries.body).toHaveLength(3);
      const first = await get(
        `/farms/${farmId}/batches/${id}/daily-entries?limit=2`,
      ).expect(200);
      expect(first.body).toHaveLength(2);
      const rest = await get(
        `/farms/${farmId}/batches/${id}/daily-entries?limit=2&offset=2`,
      ).expect(200);
      expect(rest.body).toHaveLength(1);
      expect(Array.isArray((await get(`/farms/${farmId}/slaughter-orders`)).body)).toBe(true);
      expect(Array.isArray((await get(`/farms/${farmId}/stock-transfers?limit=5`)).body)).toBe(true);
      expect(Array.isArray((await get(`/farms/${farmId}/feed-stock/losses?limit=5`)).body)).toBe(true);
    });
  });

  describe('stock d’aliment', () => {
    it('consommation > stock refusée ; conversion sacs ×50 kg ; pas de poids de sac nul', async () => {
      const id = await createBatch(100);
      const lot = await feedLot(2); // 2 sacs = 100 kg
      const over = await entry(id, {
        entryDate: dayOffset(-3),
        feedBags: 3,
        feedUnit: 'SAC',
        inputLotId: lot,
      });
      expect(over.status).toBe(400);
      const ok = await entry(id, {
        entryDate: dayOffset(-2),
        feedBags: 1,
        feedUnit: 'SAC',
        inputLotId: lot,
      }).expect(201);
      expect(ok.body.feedQuantity).toBe(50);
      const zeroBag = await entry(id, {
        entryDate: dayOffset(-1),
        feedBags: 1,
        feedUnit: 'SAC',
        bagSizeKg: 0,
        inputLotId: lot,
      });
      expect(zeroBag.status).toBe(400);
      // 50 kg restants : une perte d’un sac passe, la suivante non.
      await post(`/farms/${farmId}/feed-stock/losses`, {
        inputLotId: lot,
        quantity: 1,
        unit: 'SAC',
        reason: 'HUMIDITE',
      }).expect(201);
      const loss = await post(`/farms/${farmId}/feed-stock/losses`, {
        inputLotId: lot,
        quantity: 1,
        unit: 'SAC',
        reason: 'HUMIDITE',
      });
      expect(loss.status).toBe(400);
    });

    it('deux consommations concurrentes ne dépassent pas le stock du lot', async () => {
      const id = await createBatch(100);
      const lot = await feedLot(100, 'KG');
      const send = (day: number) =>
        entry(id, {
          entryDate: dayOffset(day),
          feedQuantity: 60,
          feedUnit: 'KG',
          inputLotId: lot,
        });
      const results = await Promise.all([send(-3), send(-2)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    });
  });

  describe('pondage', () => {
    it('œufs incohérents refusés ; taux de ponte sans poules = null', async () => {
      const id = await createBatch(10, { type: 'PONDEUSE' });
      const crack = await entry(id, {
        entryDate: dayOffset(-3),
        eggsCollected: 10,
        eggsCracked: 8,
        eggsSmall: 5,
      });
      expect(crack.status).toBe(400);
      const sellable = await entry(id, {
        entryDate: dayOffset(-3),
        eggsCollected: 10,
        eggsSellable: 20,
      });
      expect(sellable.status).toBe(400);
      await entry(id, {
        entryDate: dayOffset(-2),
        eggsCollected: 10,
        eggsSellable: 8,
        eggsCracked: 2,
      }).expect(201);
      // Un lot dont toutes les poules sont parties ne divise pas par zéro.
      await post(`/farms/${farmId}/batches/${id}/health-events`, {
        kind: 'REFORME',
        occurredAt: dayOffset(-1),
        severity: 'JAUNE',
        quantity: 10,
        title: 'Réforme totale',
      }).expect(201);
      const res = await get(`/farms/${farmId}/batches/${id}/pondage`).expect(200);
      expect(res.body.totals.collected).toBe(10);
      expect(res.body.layRatePercent).toBeNull();
      expect(Number.isFinite(res.body.eggsPerHen)).toBe(true);
      for (const w of res.body.weekly) {
        expect(w.layRatePercent === null || Number.isFinite(w.layRatePercent)).toBe(
          true,
        );
      }
    });
  });

  describe('indicateurs zootechniques', () => {
    it('lot sans saisie ni consommation : FCR/GMQ/IPE nuls ou finis', async () => {
      const id = await createBatch(100);
      const b = await batchOf(id);
      for (const key of ['fcr', 'gmqGramsPerDay', 'ipe']) {
        const v = b.metrics[key];
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(b.metrics.mortalityPercent).toBe(0);
      // Pesée sans aliment consommé : pas d’indice de consommation infini.
      await entry(id, {
        entryDate: dayOffset(-1),
        avgWeightKg: 0.5,
        sampleSize: 10,
      }).expect(201);
      const w = await batchOf(id);
      for (const key of ['fcr', 'gmqGramsPerDay', 'ipe']) {
        const v = w.metrics[key];
        expect(v === null || Number.isFinite(v)).toBe(true);
      }
      expect(JSON.stringify(w.metrics)).not.toContain('Infinity');
    });
  });

  describe('abattage', () => {
    const order = (batchId: string, birdCount: number, extra = {}) =>
      post(`/farms/${farmId}/slaughter-orders`, {
        batchId,
        slaughterType: 'ABATTU',
        destination: 'INTERNE',
        plannedDate: dayOffset(0),
        birdCount,
        ...extra,
      });

    it('refuse d’envoyer plus d’oiseaux que de vivants (cumul des ordres compris)', async () => {
      const id = await createBatch(100);
      const a = await order(id, 60).expect(201);
      const b = await order(id, 60).expect(201);
      await post(`/farms/${farmId}/slaughter-orders/${a.body.id}/send`).expect(
        201,
      );
      const second = await post(
        `/farms/${farmId}/slaughter-orders/${b.body.id}/send`,
      );
      expect(second.status).toBe(400);
      const huge = await order(id, 500).expect(201);
      const sendHuge = await post(
        `/farms/${farmId}/slaughter-orders/${huge.body.id}/send`,
      );
      expect(sendHuge.status).toBe(400);
      await post(`/farms/${farmId}/slaughter-orders/${a.body.id}/process`).expect(
        201,
      );
      expect((await batchOf(id)).quantityAlive).toBe(40);
      // Déjà traité : ni second traitement, ni annulation, ni décrément double.
      expect(
        (await post(`/farms/${farmId}/slaughter-orders/${a.body.id}/process`))
          .status,
      ).toBe(400);
      expect(
        (await post(`/farms/${farmId}/slaughter-orders/${a.body.id}/cancel`))
          .status,
      ).toBe(400);
      expect((await batchOf(id)).quantityAlive).toBe(40);
    });

    it('poids carcasse > poids vif, lot clôturé et ordre non envoyé : 400', async () => {
      const id = await createBatch(50);
      const bad = await order(id, 10, { totalWeightKg: 10, carcassWeightKg: 20 });
      expect(bad.status).toBe(400);
      const draft = await order(id, 10).expect(201);
      expect(
        (await post(`/farms/${farmId}/slaughter-orders/${draft.body.id}/process`))
          .status,
      ).toBe(400);
      await post(`/farms/${farmId}/batches/${id}/cloture`).expect(201);
      expect((await order(id, 10)).status).toBe(400);
    });
  });

  describe('transferts de stock', () => {
    let boutiqueId: string;
    let pondId: string;

    beforeAll(async () => {
      // Creates the default « ferme » point of sale (the transfer source).
      await get(`/farms/${farmId}/points-of-sale`).expect(200);
      const boutique = await post(`/farms/${farmId}/points-of-sale`, {
        kind: 'BOUTIQUE',
        name: 'Boutique régression',
        city: 'Libreville',
      }).expect(201);
      boutiqueId = boutique.body.id;
      pondId = await createBatch(100, { type: 'PONDEUSE' });
      await entry(pondId, {
        entryDate: dayOffset(-1),
        eggsCollected: 300,
        eggsSellable: 300,
      }).expect(201);
    });

    const transfer = (body: object) =>
      post(`/farms/${farmId}/stock-transfers`, body);

    it('œufs : jamais plus que le stock, l’annulation rend les alvéoles', async () => {
      const over = await transfer({
        productType: 'OEUFS',
        batchId: pondId,
        pointOfSaleId: boutiqueId,
        quantity: 11,
      });
      expect(over.status).toBe(400);
      const first = await transfer({
        productType: 'OEUFS',
        batchId: pondId,
        pointOfSaleId: boutiqueId,
        quantity: 6,
      }).expect(201);
      const second = await transfer({
        productType: 'OEUFS',
        batchId: pondId,
        pointOfSaleId: boutiqueId,
        quantity: 6,
      });
      expect(second.status).toBe(400);
      await post(
        `/farms/${farmId}/stock-transfers/${first.body.id}/cancel`,
      ).expect(201);
      // Annuler deux fois ne rend rien de plus.
      expect(
        (await post(`/farms/${farmId}/stock-transfers/${first.body.id}/cancel`))
          .status,
      ).toBe(400);
      await transfer({
        productType: 'OEUFS',
        batchId: pondId,
        pointOfSaleId: boutiqueId,
        quantity: 10,
      }).expect(201);
    });

    it('provende : sacs convertis en kg, transferts concurrents bornés par le lot', async () => {
      const lot = await feedLot(10); // 10 sacs
      const send = () =>
        transfer({
          productType: 'PROVENDE',
          inputLotId: lot,
          pointOfSaleId: boutiqueId,
          quantity: 6,
          unit: 'SAC',
        });
      const results = await Promise.all([send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      // 300 kg demandés en kg sur les 200 kg restants : refusé.
      const kg = await transfer({
        productType: 'PROVENDE',
        inputLotId: lot,
        pointOfSaleId: boutiqueId,
        quantity: 250,
        unit: 'KG',
      });
      expect(kg.status).toBe(400);
      await transfer({
        productType: 'PROVENDE',
        inputLotId: lot,
        pointOfSaleId: boutiqueId,
        quantity: 200,
        unit: 'KG',
      }).expect(201);
      const list = await get(`/farms/${farmId}/stock-transfers`).expect(200);
      const page = await get(`/farms/${farmId}/stock-transfers?limit=1`).expect(
        200,
      );
      expect(list.body.length).toBeGreaterThan(1);
      expect(page.body).toHaveLength(1);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import {
  KOUKOU_EVENTS,
  koukouBus,
  type SyncConflictEvent,
} from './../src/common/utils/event-bus.js';
import { WeighingsService } from './../src/modules/bandes/weighings.service.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
} from './helpers/programme-farm.js';

/** `YYYY-MM-DD`, `n` days from today (UTC). */
const day = (n: number) =>
  new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const minutes = (n: number) => new Date(Date.now() + n * 60_000).toISOString();

describe('Programme POUFA — bandes et indicateurs (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let farmId: string;
  let farmCode: string;

  const stamp = Date.now();
  const digits = String(stamp).slice(-7);
  const NAME = `POUFA L3 E2E ${stamp}`;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (url: string, token = ownerToken) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token = ownerToken) =>
    request(server).post(url).set(auth(token)).send(body);

  async function openBand(
    body: Record<string, unknown>,
    farm = farmId,
    token = ownerToken,
  ) {
    const res = await post(
      `/farms/${farm}/batches`,
      {
        batchName: `Bande ${stamp}`,
        type: 'CHAIR',
        integrationDate: day(-10),
        quantityAtStart: 1000,
        ...body,
      },
      token,
    ).expect(201);
    return res.body;
  }

  const entry = (batchId: string, body: object, token = ownerToken) =>
    post(`/farms/${farmId}/batches/${batchId}/daily-entries`, body, token);
  const sortie = (batchId: string, body: object, token = ownerToken) =>
    post(`/farms/${farmId}/bandes/${batchId}/sorties`, body, token);
  const alive = async (batchId: string) =>
    (await get(`/farms/${farmId}/batches/${batchId}`).expect(200)).body
      .quantityAlive as number;

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
    ds = app.get(DataSource);
    adminToken = (await createPlatformAdmin(server, ds)).token;
    // A POUFA instance starts empty: the registry creates the farm and hands
    // it to its exploitant.
    const farm = await createProgrammeFarm(server, adminToken, {
      name: NAME,
      exploitantName: 'Éleveur Bandes',
    });
    farmId = farm.farmId;
    farmCode = farm.farmCode;
    ownerToken = farm.ownerToken;
  }, 120_000);

  afterAll(async () => {
    await app.close();
  });

  describe('ouverture', () => {
    it('numérote la bande (code ferme + rang), en cours de cycle (J+x)', async () => {
      const a = await openBand({ initialAgeDays: 3, initialAvgWeightG: 80 });
      const b = await openBand({ quantityAtStart: 200 });
      expect(a.code).toMatch(new RegExp(`^${farmCode}-B\\d{2,}$`));
      const rank = (code: string) => Number(code.split('-B')[1]);
      expect(rank(b.code)).toBe(rank(a.code) + 1);
      expect(a).toMatchObject({
        initialAgeDays: 3,
        initialAvgWeightG: 80,
      });
      const params = (await get('/programme/parameters').expect(200)).body;
      const duration = params.find(
        (p: any) => p.key === 'BANDE_DUREE_REFERENCE_J',
      ).value;
      expect(a.referenceDurationDays).toBe(duration);

      const sheet = await get(`/farms/${farmId}/bandes/${a.id}`).expect(200);
      expect(sheet.body).toMatchObject({
        code: a.code,
        ageDays: 13,
        expectedEndDate: day(-10 + duration - 3),
        completenessPct: 0,
      });
      const list = await get(`/farms/${farmId}/bandes`).expect(200);
      expect(list.body.map((x: any) => x.id)).toEqual(
        expect.arrayContaining([a.id, b.id]),
      );
    });

    it('âge J+x partout : métriques du lot, calendrier sanitaire', async () => {
      // Received today at 20 days old.
      const band = await openBand({
        integrationDate: day(0),
        initialAgeDays: 20,
      });
      const lot = await get(`/farms/${farmId}/batches/${band.id}`).expect(200);
      expect(lot.body.metrics.ageDays).toBe(20);
      const sheet = await get(`/farms/${farmId}/bandes/${band.id}`).expect(200);
      expect(sheet.body.ageDays).toBe(20);
      // A care step at age N falls on J0 + N (J0 = 20 days ago); steps of an
      // age already passed are not planned.
      const events = (
        await post(
          `/farms/${farmId}/batches/${band.id}/prophylaxis/generate`,
          {},
        ).expect(201)
      ).body as Array<{ protocolStepId: string; scheduledDate: string }>;
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        const [{ dayFrom }] = await ds.query(
          `SELECT day_from AS "dayFrom" FROM protocol_steps WHERE id = $1`,
          [e.protocolStepId],
        );
        expect(dayFrom).toBeGreaterThanOrEqual(20);
        expect(e.scheduledDate.slice(0, 10)).toBe(day(dayFrom - 20));
      }
      // A lot placed as chicks (no J+x) keeps counting from integration.
      const chicks = await openBand({});
      const plain = await get(`/farms/${farmId}/batches/${chicks.id}`).expect(
        200,
      );
      expect(plain.body.metrics.ageDays).toBe(10);
    });

    it('le numéro de bande ne peut pas être modifié', async () => {
      const band = await openBand({});
      await expect(
        ds.query(`UPDATE production_batches SET code = 'X-B99' WHERE id = $1`, [
          band.id,
        ]),
      ).rejects.toThrow(/ne peut pas être modifié/);
    });
  });

  describe('fiche d’élevage, pesées et projection', () => {
    let band: any;

    beforeAll(async () => {
      band = await openBand({});
    });

    it('marque les saisies de rattrapage et contrôle l’échantillon pesé', async () => {
      const late = await entry(band.id, {
        entryDate: day(-9),
        deaths: 10,
        feedQuantity: 50,
        feedUnit: 'KG',
        avgWeightKg: 0.1,
        sampleSize: 30,
      }).expect(201);
      expect(late.body).toMatchObject({ catchUp: true, sampleSize: 30 });
      const fresh = await entry(band.id, {
        entryDate: day(-1),
        deaths: 5,
        feedQuantity: 80,
        feedUnit: 'KG',
      }).expect(201);
      expect(fresh.body.catchUp).toBe(false);
      const noWeight = await entry(band.id, {
        entryDate: day(0),
        deaths: 0,
        sampleSize: 20,
      }).expect(400);
      expect(noWeight.body.message).toContain('poids moyen');
      await entry(band.id, {
        entryDate: day(0),
        avgWeightKg: 0.5,
        sampleSize: 5000,
      }).expect(400);
    });

    it('tient la projection bande × jour dans la même transaction', async () => {
      const rows = (
        await get(`/farms/${farmId}/bandes/${band.id}/daily-stats`).expect(200)
      ).body;
      expect(rows[0].day).toBe(day(-10));
      expect(rows[rows.length - 1].day).toBe(day(0));
      const byDay = new Map(rows.map((r: any) => [r.day, r]));
      expect(byDay.get(day(-9))).toMatchObject({
        presentStart: 1000,
        deaths: 10,
        mortalityDayPct: 1,
        present: 990,
        feedKg: 50,
        weighed: true,
        sampleSize: 30,
        lastWeightG: 100,
        entryDone: true,
        catchUp: true,
      });
      expect(byDay.get(day(-1))).toMatchObject({
        deathsCumulative: 15,
        present: 985,
        feedCumulativeKg: 130,
        entryDone: true,
      });
      expect(byDay.get(day(-5))).toMatchObject({ entryDone: false, deaths: 0 });
      const sheet = await get(`/farms/${farmId}/bandes/${band.id}`).expect(200);
      // 2 days entered out of 10 elapsed (today not entered yet).
      expect(sheet.body.completenessPct).toBe(20);
    });

    it('reconstruit la projection à la demande', async () => {
      await ds.query(`DELETE FROM bande_daily_stats WHERE batch_id = $1`, [
        band.id,
      ]);
      const rebuilt = await post(
        `/farms/${farmId}/bandes/${band.id}/daily-stats/rebuild`,
        {},
      ).expect(201);
      expect(rebuilt.body).toHaveLength(11);
    });

    it('détecte une pesée en retard, une seule fois par échéance', async () => {
      const sheet = (
        await get(`/farms/${farmId}/bandes/${band.id}`).expect(200)
      ).body;
      const frequency = sheet.weighing.frequencyDays;
      expect(sheet.weighing).toMatchObject({
        lastWeighingDate: day(-9),
        lastSampleSize: 30,
        nextDueDate: day(-9 + frequency),
      });
      const weighings = app.get(WeighingsService);
      if (frequency < 9) {
        expect(sheet.weighing.late).toBe(true);
        const first = await weighings.sweepLate();
        expect(first.map((e) => e.batchId)).toContain(band.id);
        const again = await weighings.sweepLate();
        expect(again.map((e) => e.batchId)).not.toContain(band.id);
      }
    });
  });

  describe('sorties', () => {
    let band: any;

    beforeAll(async () => {
      band = await openBand({});
      await entry(band.id, {
        entryDate: day(-2),
        deaths: 20,
        feedQuantity: 100,
        feedUnit: 'KG',
        avgWeightKg: 1.5,
        sampleSize: 30,
      }).expect(201);
    });

    it('un retrait (AUTRE) sort les sujets, une seule fois', async () => {
      const res = await sortie(band.id, {
        sortieDate: day(-1),
        count: 10,
        reasonCode: 'AUTOCONSOMMATION',
        idempotencyKey: `off-sortie-${stamp}`,
      }).expect(201);
      expect(res.body).toMatchObject({
        reasonFamily: 'AUTRE',
        reasonLabel: 'Autoconsommation',
        saleId: null,
      });
      const replay = await sortie(band.id, {
        sortieDate: day(-1),
        count: 10,
        reasonCode: 'AUTOCONSOMMATION',
        idempotencyKey: `off-sortie-${stamp}`,
      }).expect(201);
      expect(replay.body.id).toBe(res.body.id);
      expect(await alive(band.id)).toBe(970);
    });

    it('une vente crée l’enregistrement de vente', async () => {
      const res = await sortie(band.id, {
        sortieDate: day(0),
        count: 100,
        weightKg: 160,
        reasonCode: 'VENTE_VIF',
        recipientName: 'Marché Mont-Bouët',
        recipientPhone: `+24164${digits}`,
        unitPriceFcfa: 2500,
      }).expect(201);
      expect(res.body).toMatchObject({
        reasonFamily: 'VENTE',
        priceUnit: 'TETE',
        saleStatus: 'OUTSTANDING',
      });
      const sale = await get(
        `/farms/${farmId}/sales/${res.body.saleId}`,
      ).expect(200);
      expect(JSON.stringify(sale.body)).toContain('250000');
      expect(await alive(band.id)).toBe(870);
      await post(`/farms/${farmId}/bandes/${band.id}/sorties`, {
        sortieDate: day(0),
        count: 1,
        reasonCode: 'VENTE_VIF',
      }).expect(400);
    });

    it('un envoi à l’abattoir crée l’ordre d’abattage', async () => {
      const res = await sortie(band.id, {
        sortieDate: day(0),
        count: 50,
        reasonCode: 'ABATTOIR',
        recipientName: 'Abattoir de Ntoum',
      }).expect(201);
      expect(res.body).toMatchObject({
        reasonFamily: 'ABATTOIR',
        slaughterStatus: 'DRAFT',
      });
      // The birds leave when the order is processed, not before.
      expect(await alive(band.id)).toBe(870);
    });

    it('refuse plus de sujets que présents et un motif inconnu', async () => {
      const over = await sortie(band.id, {
        sortieDate: day(0),
        count: 5000,
        reasonCode: 'DON',
      }).expect(400);
      expect(over.body.message).toContain('Sortie impossible');
      await sortie(band.id, {
        sortieDate: day(0),
        count: 1,
        reasonCode: 'MOTIF_INCONNU',
      }).expect(400);
    });

    it('la réconciliation compte chaque sortie une seule fois', async () => {
      await entry(band.id, { entryDate: day(0), deaths: 0 }).expect(201);
      expect(await alive(band.id)).toBe(870);
      const rows = (
        await get(`/farms/${farmId}/bandes/${band.id}/daily-stats`).expect(200)
      ).body;
      const last = rows[rows.length - 1];
      expect(last).toMatchObject({ day: day(0), removals: 100, present: 870 });
      expect(rows.find((r: any) => r.day === day(-1)).removals).toBe(10);
    });

    it('calcule les indicateurs officiels avec les formules en vigueur', async () => {
      const res = await get(
        `/farms/${farmId}/bandes/${band.id}/indicators`,
      ).expect(200);
      const by = new Map<string, any>(
        res.body.indicators.map((i: any) => [i.key, i]),
      );
      expect(res.body.variables).toMatchObject({
        mis_en_place: 1000,
        morts_cumules: 20,
        sortis_tetes: 110,
        presents: 870,
        aliment_kg: 100,
        ca_fcfa: 250000,
      });
      expect(by.get('viabilite').value).toBeCloseTo(98, 1);
      expect(by.get('gmq_g_j').value).toBeGreaterThan(0);
      expect(by.get('ic').value).toBeGreaterThan(0);
      expect(by.get('taux_mortalite').parameterVersionId).toEqual(
        expect.any(String),
      );

      // A new formula applies from its date; earlier dates keep the old one.
      const params = (await get('/programme/parameters').expect(200)).body;
      const current = params.find(
        (p: any) => p.key === 'FORMULE_TAUX_MORTALITE',
      );
      const changed = await post(
        '/programme/parameters/FORMULE_TAUX_MORTALITE',
        {
          value: 'morts_cumules / mis_en_place * 1000',
          reason: `E2E bandes ${stamp}`,
        },
        adminToken,
      ).expect(201);
      try {
        const today = await get(
          `/farms/${farmId}/bandes/${band.id}/indicators`,
        ).expect(200);
        const t = today.body.indicators.find(
          (i: any) => i.key === 'taux_mortalite',
        );
        expect(t).toMatchObject({
          value: 20,
          parameterVersionId: changed.body.id,
        });
        const before = await get(
          `/farms/${farmId}/bandes/${band.id}/indicators?asOf=${day(-1)}`,
        ).expect(200);
        const b = before.body.indicators.find(
          (i: any) => i.key === 'taux_mortalite',
        );
        expect(b.parameterVersionId).not.toBe(changed.body.id);
        expect(b.value).toBe(2);
      } finally {
        await post(
          '/programme/parameters/FORMULE_TAUX_MORTALITE',
          { value: current.value, reason: `E2E bandes ${stamp} (retour)` },
          adminToken,
        ).expect(201);
      }
      await get(
        `/farms/${farmId}/bandes/${band.id}/indicators?asOf=${day(-30)}`,
      ).expect(400);
    });
  });

  describe('clôture et bilan figé', () => {
    it('clôture automatiquement à effectif nul, bilan v1 en lecture seule', async () => {
      const band = await openBand({ quantityAtStart: 20 });
      await entry(band.id, {
        entryDate: day(-1),
        deaths: 2,
        feedQuantity: 10,
        feedUnit: 'KG',
        avgWeightKg: 0.9,
        sampleSize: 10,
      }).expect(201);
      await sortie(band.id, {
        sortieDate: day(0),
        count: 18,
        weightKg: 18,
        reasonCode: 'DON',
        recipientName: 'Orphelinat',
      }).expect(201);
      const lot = (await get(`/farms/${farmId}/batches/${band.id}`).expect(200))
        .body;
      expect(lot.status).toBe('CLOTURE');
      const snaps = (
        await get(`/farms/${farmId}/bandes/${band.id}/snapshots`).expect(200)
      ).body;
      expect(snaps).toHaveLength(1);
      expect(snaps[0]).toMatchObject({
        version: 1,
        trigger: 'CLOTURE_AUTO',
        asOf: day(0),
        durationDays: 10,
      });
      expect(snaps[0].variables).toMatchObject({
        morts_cumules: 2,
        sortis_tetes: 18,
        poids_sortis_kg: 18,
        presents: 0,
      });
      const viab = snaps[0].indicators.find((i: any) => i.key === 'viabilite');
      expect(viab).toMatchObject({ value: 90 });
      expect(viab.expression).toEqual(expect.any(String));

      // Read-only: ordinary writes are refused.
      await sortie(band.id, {
        sortieDate: day(0),
        count: 1,
        reasonCode: 'DON',
      }).expect(400);
      await entry(band.id, { entryDate: day(0), deaths: 0 }).expect(400);
      await expect(
        ds.query(`UPDATE bande_snapshots SET reason = 'x' WHERE id = $1`, [
          snaps[0].id,
        ]),
      ).rejects.toThrow(/bilan de bande figé/);
    });

    it('clôture manuelle, puis correction habilitée et journalisée (v2)', async () => {
      const band = await openBand({ quantityAtStart: 300 });
      await entry(band.id, {
        entryDate: day(-3),
        deaths: 6,
        feedQuantity: 40,
        feedUnit: 'KG',
      }).expect(201);
      await post(`/farms/${farmId}/batches/${band.id}/cloture`, {}).expect(201);
      const v1 = (
        await get(`/farms/${farmId}/bandes/${band.id}/snapshots`).expect(200)
      ).body;
      expect(v1).toHaveLength(1);
      expect(v1[0]).toMatchObject({ trigger: 'CLOTURE_MANUELLE' });
      expect(v1[0].variables.morts_cumules).toBe(6);

      const url = `/farms/${farmId}/bandes/${band.id}/corrections`;
      const fix = {
        entryDate: day(-3),
        deaths: 9,
        reason: 'Fiche papier relue par l’agent',
      };
      await post(url, fix).expect(403);
      await post(url, { ...fix, reason: ' ' }, adminToken).expect(400);
      const res = await post(url, fix, adminToken).expect(201);
      expect(res.body.snapshot).toMatchObject({
        version: 2,
        trigger: 'CORRECTION',
        reason: fix.reason,
      });
      expect(res.body.snapshot.variables.morts_cumules).toBe(9);
      const all = (
        await get(`/farms/${farmId}/bandes/${band.id}/snapshots`).expect(200)
      ).body;
      expect(all.map((s: any) => s.version)).toEqual([1, 2]);
      expect(all[0].variables.morts_cumules).toBe(6);

      const [event] = await ds.query(
        `SELECT status_code, summary FROM audit_events
          WHERE method = 'POST' AND route LIKE '%/corrections' AND farm_id = $1
          ORDER BY occurred_at DESC LIMIT 1`,
        [farmId],
      );
      expect(event.status_code).toBe(201);
      expect(JSON.stringify(event.summary)).toContain('Fiche papier relue');
      const [{ n }] = await ds.query(
        `SELECT COUNT(*)::int AS n FROM audit_row_changes
          WHERE table_name = 'daily_entries' AND row_id = $1
            AND op IN ('I', 'U') AND (after ->> 'deaths')::int = 9`,
        [res.body.entry.id],
      );
      expect(n).toBeGreaterThan(0);
      await post(
        `/farms/${farmId}/bandes/${(await openBand({})).id}/corrections`,
        fix,
        adminToken,
      ).expect(400);
    });

    it('la correction s’accorde à un profil depuis l’administration (TECHNIQUE + ADMINISTRER)', async () => {
      const band = await openBand({ quantityAtStart: 100 });
      await entry(band.id, { entryDate: day(-2), deaths: 1 }).expect(201);
      await post(`/farms/${farmId}/batches/${band.id}/cloture`, {}).expect(201);
      const profile = await post(
        '/programme/access/profiles',
        {
          code: `CORR${digits}`,
          label: `Agent correcteur ${digits}`,
          scopeKind: 'ALL',
          matrix: { TECHNIQUE: ['CONSULTER'] },
        },
        adminToken,
      ).expect(201);
      const agentPhone = `+24164${digits}`;
      const member = await post(
        '/programme/access/memberships',
        {
          fullName: `Agent correcteur ${digits}`,
          phone: agentPhone,
          profileCode: `CORR${digits}`,
        },
        adminToken,
      ).expect(201);
      const agentToken = (
        await request(server)
          .post('/auth/login')
          .send({ phone: agentPhone, code: member.body.loginCode })
          .expect(201)
      ).body.accessToken;

      const url = `/farms/${farmId}/bandes/${band.id}/corrections`;
      const fix = {
        entryDate: day(-2),
        deaths: 2,
        reason: 'Recomptage terrain',
      };
      // Reading the band is enough for CONSULTER, not correcting it.
      await get(`/farms/${farmId}/bandes/${band.id}`, agentToken).expect(200);
      await post(url, fix, agentToken).expect(403);

      await request(server)
        .patch(`/programme/access/profiles/${profile.body.id}`)
        .set(auth(adminToken))
        .send({ matrix: { TECHNIQUE: ['CONSULTER', 'ADMINISTRER'] } })
        .expect(200);
      const res = await post(url, fix, agentToken).expect(201);
      expect(res.body.snapshot).toMatchObject({
        version: 2,
        trigger: 'CORRECTION',
      });
    });
  });

  describe('conflits hors ligne', () => {
    let band: any;
    const conflictEvents: SyncConflictEvent[] = [];
    const onConflict = (e: SyncConflictEvent) => conflictEvents.push(e);

    beforeAll(async () => {
      band = await openBand({ quantityAtStart: 500 });
      koukouBus.on(KOUKOU_EVENTS.SYNC_CONFLICT, onConflict);
    });
    afterAll(() => koukouBus.off(KOUKOU_EVENTS.SYNC_CONFLICT, onConflict));

    it('la saisie la plus récente gagne, champ par champ, la perdante est conservée', async () => {
      const date = day(-1);
      const tablet = await entry(band.id, {
        entryDate: date,
        deaths: 4,
        capturedAt: minutes(-50),
        deviceSentAt: minutes(0),
        deviceId: `tablette-${stamp}`,
      }).expect(201);
      const base = tablet.body.updatedAt;

      // Created offline on another phone, captured later: it wins.
      const phone = await entry(band.id, {
        entryDate: date,
        deaths: 7,
        waterL: 30,
        capturedAt: minutes(-20),
        deviceSentAt: minutes(0),
        deviceId: `telephone-${stamp}`,
      }).expect(201);
      expect(phone.body).toMatchObject({ deaths: 7, waterL: 30 });

      // Older capture from a third phone: the server keeps its value.
      const older = await entry(band.id, {
        entryDate: date,
        deaths: 2,
        capturedAt: minutes(-40),
        baseUpdatedAt: base,
        deviceId: `ancien-${stamp}`,
      }).expect(201);
      expect(older.body.deaths).toBe(7);

      // Untouched fields resent as their base value are not written.
      const resend = await entry(band.id, {
        entryDate: date,
        deaths: 0,
        waterL: 45,
        baseValues: { deaths: 0, waterL: 30 },
        baseUpdatedAt: older.body.updatedAt,
        capturedAt: minutes(-5),
        deviceId: `telephone-${stamp}`,
      }).expect(201);
      expect(resend.body).toMatchObject({ deaths: 7, waterL: 45 });

      const conflicts = (
        await get(`/farms/${farmId}/sync-conflicts?batchId=${band.id}`).expect(
          200,
        )
      ).body;
      expect(conflicts).toHaveLength(2);
      const winners = conflicts.map((c: any) => [
        c.winner,
        c.serverValue,
        c.incomingValue,
      ]);
      expect(winners).toEqual(
        expect.arrayContaining([
          ['APPAREIL', 4, 7],
          ['SERVEUR', 7, 2],
        ]),
      );
      await new Promise((r) => setTimeout(r, 20));
      expect(conflictEvents.filter((e) => e.batchId === band.id)).toHaveLength(
        2,
      );
      expect(await alive(band.id)).toBe(493);
    });

    it('corrige l’heure d’un téléphone mal réglé au-delà du seuil', async () => {
      const date = day(0);
      const first = await entry(band.id, {
        entryDate: date,
        deaths: 1,
        capturedAt: minutes(-30),
        deviceId: `tablette-${stamp}`,
      }).expect(201);
      // Phone two hours ahead: its "latest" capture is really a minute ago.
      await entry(band.id, {
        entryDate: date,
        deaths: 3,
        capturedAt: minutes(119),
        deviceSentAt: minutes(120),
        baseUpdatedAt: new Date(
          Date.parse(first.body.updatedAt) - 60_000,
        ).toISOString(),
        deviceId: `avance-${stamp}`,
      }).expect(201);
      const conflicts = (
        await get(`/farms/${farmId}/sync-conflicts?batchId=${band.id}`).expect(
          200,
        )
      ).body;
      const skewed = conflicts.find(
        (c: any) => c.incomingDeviceId === `avance-${stamp}`,
      );
      expect(skewed).toMatchObject({
        winner: 'APPAREIL',
        clockCorrected: true,
      });
      expect(Date.parse(skewed.incomingCapturedAt)).toBeLessThan(Date.now());
      const [sample] = await ds.query(
        `SELECT skew_ms, corrected FROM sync_clock_samples
          WHERE device_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [`avance-${stamp}`],
      );
      expect(sample.corrected).toBe(true);
      expect(sample.skew_ms).toBeGreaterThan(110 * 60_000);
    });
  });
});

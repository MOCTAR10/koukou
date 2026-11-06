import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from './../src/app.module.js';
import { AuditEvent } from './../src/modules/audit/entities/audit-event.entity.js';
import { AuditSealService } from './../src/modules/audit/audit-seal.service.js';
import { addUtcDays, utcDay } from './../src/modules/audit/audit-canonical.js';
import {
  createPlatformAdmin,
  createProgrammeFarm,
  uniquePhone,
} from './helpers/programme-farm.js';

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('Journal d’audit (niveaux 1 et 2, immuabilité, sceaux), e2e', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;

  const stamp = Date.now();
  let ownerPhone: string;
  /** The owner's one-time login code (activate-owner). */
  let code: string;
  let ownerToken: string;
  let ownerId: string;
  let adminToken: string;
  let adminId: string;
  let farmId: string;

  async function eventsOf(requestId: string) {
    return (await ds.query(
      `SELECT action::text AS action, actor_user_id::text AS actor, actor_role AS role,
              farm_id::text AS farm, method, route, params, status_code AS status,
              summary, error_message AS error, user_agent AS ua
       FROM audit_events WHERE request_id = $1 ORDER BY id`,
      [requestId],
    )) as any[];
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
    ds = app.get(DataSource);

    ({ token: adminToken, userId: adminId } = await createPlatformAdmin(server, ds, {
      fullName: 'Admin Audit',
    }));
    const owner = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Audit ${stamp}`,
      exploitantName: 'Proprio Audit',
    });
    ({ ownerToken, ownerId, ownerPhone, ownerCode: code, farmId } = owner);
  });

  afterAll(async () => {
    await app.close();
  });

  it('écho de X-Request-Id : conservé s’il est valide, créé sinon', async () => {
    const id = randomUUID();
    const kept = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', id)
      .expect(200);
    expect(kept.headers['x-request-id']).toBe(id);
    const replaced = await request(server)
      .get('/farms')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', 'pas-un-uuid')
      .expect(200);
    expect(replaced.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(replaced.headers['x-request-id']).not.toBe('pas-un-uuid');
    // A plain read is not journaled.
    expect(await eventsOf(id)).toHaveLength(0);
  });

  it('une écriture : acteur, route modèle, résumé sans secret, même requestId que la ligne modifiée', async () => {
    const requestId = randomUUID();
    const res = await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', requestId)
      .set('User-Agent', 'e2e-audit')
      .send({
        batchName: 'Lot Audit A',
        integrationDate: daysAgo(10),
        quantityAtStart: 500,
        type: 'CHAIR',
        accessCode: 'ne-doit-pas-apparaitre',
        notes: 'x'.repeat(800),
      })
      .expect(201);
    const batchId = res.body.id as string;
    expect(res.headers['x-request-id']).toBe(requestId);

    const [event, ...others] = await eventsOf(requestId);
    expect(others).toHaveLength(0);
    expect(event).toMatchObject({
      action: 'WRITE',
      actor: ownerId,
      role: 'PROPRIETAIRE',
      farm: farmId,
      method: 'POST',
      route: '/farms/:farmId/batches',
      params: { farmId },
      status: 201,
      error: null,
      ua: 'e2e-audit',
    });
    expect(event.summary.batchName).toBe('Lot Audit A');
    expect(event.summary).not.toHaveProperty('accessCode');
    expect(event.summary.notes.length).toBeLessThanOrEqual(501);

    const changes = (await ds.query(
      `SELECT op, request_id::text AS request_id, actor_user_id::text AS actor, after
       FROM audit_row_changes WHERE table_name = 'production_batches' AND row_id = $1`,
      [batchId],
    )) as any[];
    expect(changes.length).toBeGreaterThanOrEqual(1);
    const insert = changes.find((c) => c.op === 'I');
    expect(insert).toMatchObject({ request_id: requestId, actor: ownerId });
    expect(insert.after.batchName ?? insert.after.batch_name).toBe(
      'Lot Audit A',
    );
  });

  it('une écriture refusée est tracée avec son statut (400 validation, 401 sans jeton)', async () => {
    const invalid = randomUUID();
    await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', invalid)
      .send({ batchName: '' })
      .expect(400);
    const [bad] = await eventsOf(invalid);
    expect(bad).toMatchObject({ action: 'WRITE', status: 400, actor: ownerId });
    expect(bad.error).toBeTruthy();

    const anonymous = randomUUID();
    await request(server)
      .post(`/farms/${farmId}/batches`)
      .set('X-Request-Id', anonymous)
      .send({ batchName: 'Intrus' })
      .expect(401);
    const [denied] = await eventsOf(anonymous);
    expect(denied).toMatchObject({
      action: 'WRITE',
      status: 401,
      actor: null,
      route: '/farms/:farmId/batches',
      farm: farmId,
    });
  });

  it('connexion réussie et échouée : tracées, téléphone masqué, jamais le code', async () => {
    const failed = randomUUID();
    await request(server)
      .post('/auth/login')
      .set('X-Request-Id', failed)
      .send({ phone: ownerPhone, code: 'mauvais-code' })
      .expect(401);
    const [ko] = await eventsOf(failed);
    expect(ko).toMatchObject({
      action: 'LOGIN_FAILED',
      status: 401,
      actor: null,
    });
    expect(ko.summary.phone).not.toBe(ownerPhone);
    expect(ko.summary.phone.endsWith(ownerPhone.slice(-3))).toBe(true);
    expect(JSON.stringify(ko)).not.toContain('mauvais-code');

    const ok = randomUUID();
    await request(server)
      .post('/auth/login')
      .set('X-Request-Id', ok)
      .send({ phone: ownerPhone, code })
      .expect(201);
    const [success] = await eventsOf(ok);
    expect(success).toMatchObject({
      action: 'LOGIN',
      status: 201,
      actor: ownerId,
      role: 'PROPRIETAIRE',
    });
    expect(JSON.stringify(success)).not.toContain(code);
  });

  it('une consultation sensible et un export sont tracés', async () => {
    const read = randomUUID();
    await request(server)
      .get('/admin/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Request-Id', read)
      .expect(200);
    const [readEvent] = await eventsOf(read);
    expect(readEvent).toMatchObject({
      action: 'READ_SENSITIVE',
      route: '/admin/users',
      role: 'PLATFORM_ADMIN',
      status: 200,
    });
    expect(readEvent.summary.reason).toContain('utilisateurs');

    const exported = randomUUID();
    const csv = await request(server)
      .get('/audit/events/export')
      .query({ actorUserId: ownerId })
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Request-Id', exported)
      .expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text).toContain('/farms/:farmId/batches');
    const [exportEvent] = await eventsOf(exported);
    expect(exportEvent).toMatchObject({
      action: 'EXPORT',
      route: '/audit/events/export',
      status: 200,
    });
    expect(exportEvent.summary.query).toEqual({ actorUserId: ownerId });

    // The journal itself is filterable and its reading is journaled.
    const list = await request(server)
      .get('/audit/events')
      .query({
        actorUserId: ownerId,
        action: 'WRITE',
        route: 'batches',
        limit: 5,
      })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(list.body.total).toBeGreaterThanOrEqual(2);
    expect(
      list.body.items.every(
        (e: any) => e.actorUserId === ownerId && e.action === 'WRITE',
      ),
    ).toBe(true);
  });

  it('un PDF exporté est tracé (export existant)', async () => {
    const requestId = randomUUID();
    const pdf = await request(server)
      .get(`/farms/${farmId}/rentabilite/overview/export`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', requestId)
      .expect(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
    const [event] = await eventsOf(requestId);
    expect(event).toMatchObject({
      action: 'EXPORT',
      route: '/farms/:farmId/rentabilite/overview/export',
      farm: farmId,
      status: 200,
    });
  });

  it('un échec d’écriture du journal ne casse pas la réponse métier', async () => {
    const repo = app.get(getRepositoryToken(AuditEvent), { strict: false });
    const spy = vi
      .spyOn(repo, 'insert')
      .mockRejectedValueOnce(new Error('panne simulée'));
    try {
      await request(server)
        .post(`/farms/${farmId}/batches`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .send({
          batchName: 'Lot Audit B',
          integrationDate: daysAgo(5),
          quantityAtStart: 100,
          type: 'CHAIR',
        })
        .expect(201);
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it('la base refuse UPDATE, DELETE et TRUNCATE sur le journal', async () => {
    await expect(
      ds.query(
        `UPDATE audit_events SET route = 'x' WHERE id = (SELECT max(id) FROM audit_events)`,
      ),
    ).rejects.toThrow(/non modifiable/);
    await expect(
      ds.query(
        `DELETE FROM audit_events WHERE id = (SELECT max(id) FROM audit_events)`,
      ),
    ).rejects.toThrow(/non modifiable/);
    await expect(ds.query(`TRUNCATE audit_events`)).rejects.toThrow(
      /non modifiable/,
    );
    await expect(
      ds.query(
        `DELETE FROM audit_row_changes WHERE id = (SELECT max(id) FROM audit_row_changes)`,
      ),
    ).rejects.toThrow(/non modifiable/);
  });

  it('les lignes users ne contiennent jamais le hash du mot de passe', async () => {
    const [insert] = (await ds.query(
      `SELECT after FROM audit_row_changes
       WHERE table_name = 'users' AND row_id = $1 AND op = 'I'`,
      [ownerId],
    )) as { after: Record<string, unknown> }[];
    expect(insert.after.phone).toBe(ownerPhone);
    expect(insert.after).not.toHaveProperty('passwordHash');
    expect(insert.after).not.toHaveProperty('password_hash');

    // A password change is visible, the hash is not.
    const throwaway = randomUUID();
    await ds.query(
      `INSERT INTO users (id, phone, "passwordHash", "fullName") VALUES ($1, $2, 'h1', 'Jetable')`,
      [throwaway, uniquePhone()],
    );
    await ds.query(`UPDATE users SET "passwordHash" = 'h2' WHERE id = $1`, [
      throwaway,
    ]);
    const changes = (await ds.query(
      `SELECT op, before, after FROM audit_row_changes
       WHERE table_name = 'users' AND row_id = $1 ORDER BY id`,
      [throwaway],
    )) as { op: string; before: any; after: any }[];
    expect(changes.map((c) => c.op)).toEqual(['I', 'U']);
    expect(changes[1].after._redacted_changed).toEqual(['passwordHash']);
    expect(JSON.stringify(changes)).not.toContain('h1');
    expect(JSON.stringify(changes)).not.toContain('h2');

    // An update that changes nothing but updatedAt is not stored.
    await ds.query(`UPDATE users SET "updatedAt" = now() WHERE id = $1`, [
      throwaway,
    ]);
    const [{ n }] = await ds.query(
      `SELECT count(*)::int AS n FROM audit_row_changes WHERE table_name = 'users' AND row_id = $1`,
      [throwaway],
    );
    expect(n).toBe(2);
  });

  it('scelle un jour passé, vérifie, puis détecte une ligne antidatée', async () => {
    const seals = app.get(AuditSealService);
    const today = utcDay(new Date());
    const yesterday = addUtcDays(today, -1);
    // Seal as of today 00:30 UTC: yesterday is the last sealable day.
    const sealAt = new Date(`${today}T00:30:00.000Z`);

    const [existing] = await ds.query(
      `SELECT 1 FROM audit_seals WHERE day = $1`,
      [yesterday],
    );
    if (!existing) {
      // Fresh database: give yesterday a legitimate row before it is sealed.
      await ds.query(
        `INSERT INTO audit_events (occurred_at, request_id, action, method, route)
         VALUES ($1, $2, 'SYSTEM', 'SYSTEM', 'e2e:veille')`,
        [`${yesterday}T12:00:00.000Z`, randomUUID()],
      );
    }
    await seals.sealPendingDays(sealAt);
    const [sealed] = await ds.query(
      `SELECT day::text AS day, hash, prev_hash FROM audit_seals WHERE day = $1`,
      [yesterday],
    );
    expect(sealed.hash).toMatch(/^[0-9a-f]{64}$/);
    await expect(
      ds.query(`UPDATE audit_seals SET hash = 'x' WHERE day = $1`, [yesterday]),
    ).rejects.toThrow(/non modifiable/);
    await expect(ds.query(`TRUNCATE audit_seals`)).rejects.toThrow(
      /non modifiable/,
    );
    // Idempotent: nothing more to seal.
    expect(await seals.sealPendingDays(sealAt)).toEqual([]);

    expect((await seals.verify(yesterday, yesterday)).ok).toBe(true);
    const full = await seals.verify();
    expect(full.mismatch).toBeNull();
    expect(full.ok).toBe(true);

    const listed = await request(server)
      .get('/audit/seals')
      .query({ from: yesterday, to: yesterday })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(listed.body[0]).toMatchObject({ day: yesterday, hash: sealed.hash });

    // Tamper: a back-dated row inserted directly in SQL.
    const [{ id: fakeId }] = await ds.query(
      `INSERT INTO audit_events (occurred_at, request_id, action, method, route)
       VALUES ($1, $2, 'WRITE', 'POST', '/faux') RETURNING id::text AS id`,
      [`${yesterday}T13:00:00.000Z`, randomUUID()],
    );
    try {
      const report = await request(server)
        .post('/audit/seals/verify')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ from: yesterday, to: yesterday })
        .expect(200);
      expect(report.body.ok).toBe(false);
      expect(report.body.mismatch).toMatchObject({
        day: yesterday,
        reason: 'COUNT',
      });
      expect((await seals.verify()).ok).toBe(false);
    } finally {
      // Clean up the forged row so the shared database stays verifiable. Only
      // a superuser can bypass the append-only trigger, as here.
      const runner = ds.createQueryRunner();
      try {
        await runner.query(`SET session_replication_role = replica`);
        await runner.query(`DELETE FROM audit_events WHERE id = $1`, [fakeId]);
        await runner.query(`SET session_replication_role = DEFAULT`);
      } finally {
        await runner.release();
      }
    }
    expect((await seals.verify(yesterday, yesterday)).ok).toBe(true);
  });

  it('un non-administrateur reçoit 403 sur /audit, et la tentative est tracée', async () => {
    const requestId = randomUUID();
    await request(server)
      .get('/audit/events')
      .set('Authorization', `Bearer ${ownerToken}`)
      .set('X-Request-Id', requestId)
      .expect(403);
    await request(server)
      .post('/audit/seals/verify')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({})
      .expect(403);
    const [event] = await eventsOf(requestId);
    expect(event).toMatchObject({
      action: 'READ_SENSITIVE',
      route: '/audit/events',
      status: 403,
      actor: ownerId,
    });
  });

  it('l’historique des données est filtrable par requête', async () => {
    const requestId = randomUUID();
    // A farm is renamed in the registry (earlier runs left resembling names).
    await request(server)
      .patch(`/programme/farms/${farmId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('X-Request-Id', requestId)
      .send({ name: `Ferme Audit renommée ${stamp}`, confirmDuplicate: true })
      .expect(200);
    const res = await request(server)
      .get('/audit/row-changes')
      .query({ table: 'farms', rowId: farmId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.items.some((c: any) => c.op === 'U')).toBe(true);
    const byRequest = await request(server)
      .get('/audit/row-changes')
      .query({ requestId })
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    // The registry writes inside `dataSource.transaction`: the subscriber tags it.
    const update = byRequest.body.items.find(
      (c: any) => c.tableName === 'farms',
    );
    expect(update).toMatchObject({
      op: 'U',
      rowId: farmId,
      actorUserId: adminId,
    });
    expect(update.after.name).toBe(`Ferme Audit renommée ${stamp}`);
    expect(update.before.name).toBe(`Ferme Audit ${stamp}`);
    const [event] = await eventsOf(requestId);
    expect(event).toMatchObject({
      action: 'WRITE',
      route: '/programme/farms/:farmId',
    });
  });

  it('une écriture hors transaction (query builder) garde une trace de niveau 1, request_id nul au niveau 2', async () => {
    // Documented limit: repository.update / query builder run without a
    // transaction, so no afterTransactionStart and no app.request_id.
    await ds
      .createQueryBuilder()
      .update('farms')
      .set({ name: `Ferme Audit QB ${stamp}` })
      .where('id = :id', { id: farmId })
      .execute();
    const [change] = await ds.query(
      `SELECT request_id FROM audit_row_changes
       WHERE table_name = 'farms' AND row_id = $1 ORDER BY id DESC LIMIT 1`,
      [farmId],
    );
    expect(change.request_id).toBeNull();
  });
});

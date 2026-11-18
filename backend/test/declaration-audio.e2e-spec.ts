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
  uniquePhone,
} from './helpers/programme-farm.js';

function day(offset = 0): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** Minimal MPEG-4 audio: a `ftyp` box (size, "ftyp", "M4A ") then noise. */
function m4a(): Buffer {
  return Buffer.concat([
    Buffer.from([0x00, 0x00, 0x00, 0x18]),
    Buffer.from('ftypM4A ', 'latin1'),
    randomBytes(64),
  ]);
}

describe('Notes vocales des déclarations sanitaires (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let ds: DataSource;
  let adminToken: string;
  let ownerToken: string;
  let otherOwnerToken: string;
  let farmId: string;
  let batchId: string;
  let eventId: string;
  let vetToken: string;
  let vetMembershipId: string;

  const stamp = Date.now();
  const tag = Array.from(randomBytes(6), (b) =>
    String.fromCharCode(65 + (b % 26)),
  ).join('');

  const get = (url: string, token: string) =>
    request(server).get(url).set(auth(token));
  const post = (url: string, body: object, token: string) =>
    request(server).post(url).set(auth(token)).send(body);

  const audioUrl = () =>
    `/farms/${farmId}/batches/${batchId}/health-events/${eventId}/audio`;
  const upload = (bytes: Buffer, filename = 'note.m4a', type = 'audio/mp4') =>
    request(server)
      .post(audioUrl())
      .set(auth(ownerToken))
      .attach('file', bytes, { filename, contentType: type });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();
    ds = app.get(DataSource);

    adminToken = (await createPlatformAdmin(server, ds)).token;
    const farm = await createProgrammeFarm(server, adminToken, {
      name: `Ferme Vocale ${tag}`,
      provinceCode: 'G5',
    });
    ownerToken = farm.ownerToken;
    farmId = farm.farmId;
    otherOwnerToken = (
      await createProgrammeFarm(server, adminToken, {
        name: `Ferme Voisine ${tag}`,
        provinceCode: 'G2',
      })
    ).ownerToken;

    const band = await post(
      `/farms/${farmId}/batches`,
      {
        batchName: `Bande vocale ${stamp}`,
        type: 'CHAIR',
        integrationDate: day(-5),
        quantityAtStart: 500,
      },
      ownerToken,
    ).expect(201);
    batchId = band.body.id;

    const event = await post(
      `/farms/${farmId}/batches/${batchId}/health-events`,
      {
        kind: 'MALADIE',
        occurredAt: day(0),
        severity: 'JAUNE',
        title: `Note vocale ${tag}`,
        quantity: 3,
      },
      ownerToken,
    ).expect(201);
    eventId = event.body.id;

    const phone = uniquePhone('+2417');
    const membership = await post(
      '/programme/access/memberships',
      { fullName: `Vet vocal ${tag}`, phone, profileCode: 'VETERINAIRE' },
      adminToken,
    ).expect(201);
    vetMembershipId = membership.body.id as string;
    const logged = await request(server)
      .post('/auth/login')
      .send({ phone, code: membership.body.loginCode })
      .expect(201);
    vetToken = logged.body.accessToken as string;
  });

  afterAll(async () => {
    await request(server)
      .patch(`/programme/access/memberships/${vetMembershipId}`)
      .set(auth(adminToken))
      .send({ active: false });
    await app.close();
  });

  it('refuses a file that is not audio, whatever its declared type', async () => {
    const res = await upload(
      Buffer.from('ceci est un texte, pas une note vocale'),
      'note.m4a',
      'audio/mp4',
    ).expect(400);
    expect(res.body.message).toContain('note vocale');
  });

  let first: { id: string; mimeType: string; sizeBytes: number; durationMs: number | null };
  const bytes = m4a();

  it('stores a voice note, once even when sent again', async () => {
    const up = await request(server)
      .post(audioUrl())
      .set(auth(ownerToken))
      .field('durationMs', '12000')
      .attach('file', bytes, { filename: 'note.m4a', contentType: 'audio/mp4' })
      .expect(201);
    first = up.body;
    expect(first).toMatchObject({
      mimeType: 'audio/mp4',
      sizeBytes: bytes.length,
      durationMs: 12000,
    });
    const again = await upload(bytes).expect(201);
    expect(again.body.id).toBe(first.id);
  });

  it('rejects an invalid duration', async () => {
    await request(server)
      .post(audioUrl())
      .set(auth(ownerToken))
      .field('durationMs', '999999')
      .attach('file', m4a(), { filename: 'n.m4a', contentType: 'audio/mp4' })
      .expect(400);
  });

  it('caps the notes at two per declaration', async () => {
    await upload(m4a()).expect(201);
    const third = await upload(m4a()).expect(400);
    expect(third.body.message).toContain('2 notes vocales');
  });

  it('returns the notes with the declaration', async () => {
    const list = await get(
      `/farms/${farmId}/batches/${batchId}/health-events`,
      ownerToken,
    ).expect(200);
    const ev = list.body.find((e: { id: string }) => e.id === eventId);
    expect(ev.audio).toHaveLength(2);
    expect(ev.audio[0]).toMatchObject({ id: first.id, mimeType: 'audio/mp4' });
  });

  it('serves the bytes read back unchanged, to the farm and the vets only', async () => {
    const url = `${audioUrl()}/${first.id}`;
    const read = (token: string) =>
      get(url, token)
        .buffer(true)
        .parse((res, cb) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        });
    const mine = await read(ownerToken).expect(200);
    expect(mine.headers['content-type']).toContain('audio/mp4');
    expect(mine.headers['cache-control']).toContain('no-store');
    expect(Number(mine.headers['content-length'])).toBe(bytes.length);
    expect((mine.body as Buffer).equals(bytes)).toBe(true);

    const asVet = await read(vetToken).expect(200);
    expect((asVet.body as Buffer).equals(bytes)).toBe(true);

    const stranger = await get(url, otherOwnerToken);
    expect([403, 404]).toContain(stranger.status);
  });

  it('lists the notes in the vets register', async () => {
    const detail = await get(`/surveillance/declarations/${eventId}`, vetToken).expect(200);
    expect(detail.body.audio).toHaveLength(2);
    expect(detail.body.audio[0]).toMatchObject({ id: first.id, durationMs: 12000 });
  });
});

/**
 * E2E helpers for a POUFA-only instance: every farm is a programme farm,
 * created by the registry (`POST /programme/farms`) and handed to its
 * exploitant by `activate-owner`. Only buyers register themselves.
 *
 * `e2e-setup.ts` sets `PROGRAM_CODE=POUFA` before any app boots.
 */
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

let phoneSeq = 0;

/**
 * A phone number no other spec (or earlier run) uses: time-based, plus a
 * per-process counter so two calls in the same millisecond still differ.
 */
export function uniquePhone(prefix = '+2416'): string {
  phoneSeq = (phoneSeq + 1) % 1000;
  const tail = `${Date.now() % 10_000}${String(phoneSeq).padStart(3, '0')}`;
  return `${prefix}${tail.padStart(7, '0')}`;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Logs in with phone + code, returns the access token. */
export async function login(
  server: App,
  phone: string,
  code: string,
): Promise<string> {
  const res = await request(server)
    .post('/auth/login')
    .send({ phone, code })
    .expect(201);
  return res.body.accessToken as string;
}

/** Self-registered buyer account (the only open sign-up). */
export async function registerBuyer(
  server: App,
  opts: {
    phone?: string;
    fullName?: string;
    code?: string;
    /** Buyer profile fields: `type`, `organizationName`, `city`. */
    profile?: Record<string, unknown>;
  } = {},
): Promise<{ token: string; phone: string; code: string; userId: string }> {
  const phone = opts.phone ?? uniquePhone();
  const code = opts.code ?? 'secret123';
  const res = await request(server)
    .post('/auth/register-buyer')
    .send({
      phone,
      fullName: opts.fullName ?? 'Acheteur E2E',
      code,
      ...opts.profile,
    })
    .expect(201);
  return {
    token: res.body.accessToken as string,
    phone,
    code,
    userId: res.body.user?.id as string,
  };
}

/**
 * A platform administrator: a buyer account promoted by SQL (test DB only),
 * then logged in again so the token carries the new role.
 */
export async function createPlatformAdmin(
  server: App,
  ds: DataSource,
  opts: { phone?: string; fullName?: string; code?: string } = {},
): Promise<{ token: string; phone: string; code: string; userId: string }> {
  const buyer = await registerBuyer(server, {
    fullName: 'Admin E2E',
    ...opts,
  });
  await ds.query(`UPDATE users SET role = 'PLATFORM_ADMIN' WHERE phone = $1`, [
    buyer.phone,
  ]);
  return { ...buyer, token: await login(server, buyer.phone, buyer.code) };
}

export interface ProgrammeFarmOptions {
  /** Farm name; defaults to a unique « Ferme E2E … ». */
  name?: string;
  provinceCode?: string;
  exploitantName?: string;
  exploitantPhone?: string;
  /** Any other registry field (capacityPlaces, localite, gps, …). */
  extra?: Record<string, unknown>;
}

export interface ProgrammeFarm {
  farmId: string;
  /** Programme farm code (province + number), e.g. `G1-0001`. */
  farmCode: string;
  ownerId: string;
  ownerPhone: string;
  /** One-time login code returned by activate-owner. */
  ownerCode: string;
  ownerToken: string;
}

/**
 * Creates a programme farm in the registry and its owner account, then logs
 * the owner in. `adminToken` must be a PLATFORM_ADMIN (see
 * {@link createPlatformAdmin}).
 */
export async function createProgrammeFarm(
  server: App,
  adminToken: string,
  opts: ProgrammeFarmOptions = {},
): Promise<ProgrammeFarm> {
  const ownerPhone = opts.exploitantPhone ?? uniquePhone();
  const created = await request(server)
    .post('/programme/farms')
    .set(auth(adminToken))
    .send({
      name: opts.name ?? `Ferme E2E ${ownerPhone}`,
      provinceCode: opts.provinceCode ?? 'G1',
      capacityPlaces: 2000,
      exploitantName: opts.exploitantName ?? 'Exploitant E2E',
      exploitantPhone: ownerPhone,
      // Specs reuse names across runs on the same DB.
      confirmDuplicate: true,
      ...opts.extra,
    })
    .expect(201);
  const farmId = created.body.id as string;
  const activated = await request(server)
    .post(`/programme/farms/${farmId}/activate-owner`)
    .set(auth(adminToken))
    .send({})
    .expect(201);
  const ownerCode = activated.body.loginCode as string;
  return {
    farmId,
    farmCode: created.body.code as string,
    ownerId: activated.body.owner.id as string,
    ownerPhone: activated.body.owner.phone as string,
    ownerCode,
    ownerToken: await login(server, ownerPhone, ownerCode),
  };
}

/**
 * Another programme farm for an owner who already has an account (an owner
 * with several farms): activate-owner links it with `linkExistingUser`.
 */
export async function addProgrammeFarm(
  server: App,
  adminToken: string,
  ownerPhone: string,
  opts: Omit<ProgrammeFarmOptions, 'exploitantPhone'> = {},
): Promise<{ farmId: string; farmCode: string }> {
  const created = await request(server)
    .post('/programme/farms')
    .set(auth(adminToken))
    .send({
      name: opts.name ?? `Ferme E2E ${ownerPhone} ${uniquePhone('')}`,
      provinceCode: opts.provinceCode ?? 'G1',
      capacityPlaces: 2000,
      exploitantName: opts.exploitantName ?? 'Exploitant E2E',
      exploitantPhone: ownerPhone,
      confirmDuplicate: true,
      ...opts.extra,
    })
    .expect(201);
  await request(server)
    .post(`/programme/farms/${created.body.id}/activate-owner`)
    .set(auth(adminToken))
    .send({ linkExistingUser: true })
    .expect(201);
  return {
    farmId: created.body.id as string,
    farmCode: created.body.code as string,
  };
}

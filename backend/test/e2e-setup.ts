import { lvDate } from './helpers/libreville-day.js';

/**
 * Opt-in: `E2E_FAKE_NOW` moves the clock the specs and the app see through
 * `Date`, to run the suite in the window where Libreville (UTC+1) is already
 * on the next day. Value: an ISO instant (`2026-11-18T23:30:00Z`) or a bare
 * UTC time of day (`23:30`, meaning today at that time). Only `Date` is
 * faked: it keeps ticking (a constant offset) and timers are untouched.
 * The database clock (`now()`) stays real.
 */
function installFakeNow(spec: string): void {
  const m = /^(\d{2}):(\d{2})$/.exec(spec);
  const target = m
    ? new Date().setUTCHours(Number(m[1]), Number(m[2]), 0, 0)
    : Date.parse(spec);
  if (Number.isNaN(target)) throw new Error(`E2E_FAKE_NOW invalide : ${spec}`);
  const RealDate = Date;
  const offset = target - RealDate.now();
  class FakeDate extends RealDate {
    constructor(...args: unknown[]) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...(args as [number]));
    }
    static now(): number {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = FakeDate as DateConstructor;
}
if (process.env.E2E_FAKE_NOW) installFakeNow(process.env.E2E_FAKE_NOW);

// The whole suite runs from one IP; disable rate limiting (see app.module.ts).
process.env.THROTTLE_DISABLED = 'true';
// POUFA-only instance: every farm belongs to the programme (see AGENTS.md).
process.env.PROGRAM_CODE = 'POUFA';
// Specs boot the app many times on a shared DB: no background overdue-task
// sweep (tests call TasksService.sweepOverdue() directly when needed).
process.env.TASK_SWEEP_DISABLED = 'true';
process.env.MARKET_SWEEP_DISABLED = 'true';
process.env.CREDIT_SWEEP_DISABLED = 'true';
// No hourly POUFA band sweep (late weighings, stale projections).
process.env.WEIGHING_SWEEP_DISABLED = 'true';
// No hourly visit reminders: the visits-reminders spec calls VisitRemindersService.sweep().
process.env.VISIT_REMINDER_SWEEP_DISABLED = 'true';
// No hourly audit seal: the audit spec calls AuditSealService directly.
process.env.AUDIT_SEAL_DISABLED = 'true';
// No hourly scheduled reports: the reporting spec calls ReportsService.sweep().
process.env.REPORT_SWEEP_DISABLED = 'true';
// Never call the real Expo Push service (the push spec swaps the transport).
process.env.PUSH_DISABLED = 'true';
// Traceability QR signatures: a fixed test key and public address.
process.env.TRACE_QR_SECRET = 'e2e-trace-qr-secret';
process.env.TRACE_PUBLIC_BASE_URL = 'https://poufa.e2e.ga';
// No minutely notification sweep (escalation, SMS): specs call sweep().
process.env.NOTIFY_SWEEP_DISABLED = 'true';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function dateStr(d: Date): string {
  return lvDate(d);
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}

/**
 * Mock réseau par défaut de la suite e2e : le module météo appelle Open-Meteo
 * (absence de clé, gratuit) — on retourne une prévision « confort » (THI < 75,
 * aucune alerte heat-stress) pour garder tous les autres specs déterministes
 * et hors-ligne. Le spec météo surcharge ce mock, puis le restitue ici.
 */
function defaultWeatherMock(input: RequestInfo | URL): Promise<Response> {
  const u = String(input);
  if (u.includes('geocoding-api.open-meteo.com')) {
    return Promise.resolve(
      json({
        results: [{ latitude: 0.39, longitude: 9.45, name: 'Libreville' }],
      }),
    );
  }
  if (u.includes('api.open-meteo.com')) {
    const time = Array.from({ length: 7 }, (_, i) =>
      dateStr(addDays(new Date(), i)),
    );
    return Promise.resolve(
      json({
        daily: {
          time,
          temperature_2m_max: Array(7).fill(25),
          relative_humidity_2m_max: Array(7).fill(60),
        },
      }),
    );
  }
  return Promise.resolve(new Response('{}', { status: 404 }));
}

(
  globalThis as never as { __E2E_WEATHER_MOCK__: typeof fetch }
).__E2E_WEATHER_MOCK__ = defaultWeatherMock as typeof fetch;

globalThis.fetch = (
  globalThis as never as {
    __E2E_WEATHER_MOCK__: typeof fetch;
  }
).__E2E_WEATHER_MOCK__;

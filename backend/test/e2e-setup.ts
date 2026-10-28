// The whole suite runs from one IP; disable rate limiting (see app.module.ts).
process.env.THROTTLE_DISABLED = 'true';
// Specs boot the app many times on a shared DB: no background overdue-task
// sweep (tests call TasksService.sweepOverdue() directly when needed).
process.env.TASK_SWEEP_DISABLED = 'true';
// Never call the real Expo Push service (the push spec swaps the transport).
process.env.PUSH_DISABLED = 'true';

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
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

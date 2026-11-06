/**
 * Traceability settings from the environment (`backend/.env.example`):
 *
 * - `TRACE_QR_SECRET`: key of the QR signatures and of the scan IP hashes.
 *   **Required in production** (the boot stops without it). Elsewhere a fixed
 *   development key is used, with a warning: QR codes made with it are not
 *   protected and must never be printed for real.
 * - `TRACE_PUBLIC_BASE_URL`: public address of the web app, start of every QR
 *   address (`<base>/l/<code>?s=…`). **Required in production**; default
 *   `http://localhost:5400` (web dev server) elsewhere.
 * - `TRACE_CONSOMMONS_GABONAIS_URL` (optional): link shown on the public page
 *   for the « Consommons Gabonais » mention; default `<base>/consommons-gabonais`.
 */

export const DEV_TRACE_QR_SECRET = 'fermia-dev-trace-qr-secret';
export const DEV_TRACE_PUBLIC_BASE_URL = 'http://localhost:5400';

const PLACEHOLDERS = ['', 'change_me', DEV_TRACE_QR_SECRET];

export interface TraceConfig {
  secret: string;
  publicBaseUrl: string;
  consommonsGabonaisUrl: string;
  /** French warnings to log at boot (development fallbacks in use). */
  warnings: string[];
}

export const TRACE_SECRET_MISSING_MESSAGE =
  'TRACE_QR_SECRET est obligatoire en production : il signe les QR codes des lots (générez-le avec : node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").';
export const TRACE_BASE_URL_MISSING_MESSAGE =
  "TRACE_PUBLIC_BASE_URL est obligatoire en production : c'est l'adresse publique imprimée dans les QR codes des lots (ex. https://poufa.ga).";

/**
 * Resolves the settings.
 * @throws Error in production when the key or the public address is missing
 */
export function resolveTraceConfig(
  env: (key: string) => string | undefined,
): TraceConfig {
  const production = env('NODE_ENV') === 'production';
  const warnings: string[] = [];

  const rawSecret = env('TRACE_QR_SECRET')?.trim() ?? '';
  let secret = rawSecret;
  if (PLACEHOLDERS.includes(rawSecret)) {
    if (production) throw new Error(TRACE_SECRET_MISSING_MESSAGE);
    secret = DEV_TRACE_QR_SECRET;
    warnings.push(
      '[trace] TRACE_QR_SECRET absent : clé de développement utilisée, les QR codes des lots ne sont pas protégés (ne jamais les imprimer pour de vrai).',
    );
  }

  const rawBase = env('TRACE_PUBLIC_BASE_URL')?.trim() ?? '';
  let publicBaseUrl = rawBase.replace(/\/+$/, '');
  if (!publicBaseUrl) {
    if (production) throw new Error(TRACE_BASE_URL_MISSING_MESSAGE);
    publicBaseUrl = DEV_TRACE_PUBLIC_BASE_URL;
  }

  const consommons =
    env('TRACE_CONSOMMONS_GABONAIS_URL')?.trim() ||
    `${publicBaseUrl}/consommons-gabonais`;

  return {
    secret,
    publicBaseUrl,
    consommonsGabonaisUrl: consommons,
    warnings,
  };
}

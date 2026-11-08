/**
 * Number of reverse proxies in front of the API, for Express `trust proxy`.
 * Unset means none: `X-Forwarded-For` is ignored, otherwise any client could
 * forge it to escape the per-IP login rate limit. Behind a proxy it must be set,
 * or every client shares the proxy's IP and therefore one rate-limit bucket.
 */
export function trustProxyHops(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === '') return 0;
  if (!/^\d+$/.test(raw.trim())) {
    throw new Error(
      `TRUST_PROXY must be a number of proxies (0, 1, 2...), got "${raw}".`,
    );
  }
  return Number(raw.trim());
}

/** Swagger is off in production unless SWAGGER_ENABLED=true asks for it. */
export function swaggerEnabled(
  nodeEnv: string | undefined,
  flag: string | undefined,
): boolean {
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return nodeEnv !== 'production';
}

/**
 * CORS origins. Outside production an unset value means `*`; in production
 * it must be listed explicitly (a wildcard default would silently open the API).
 */
export function corsOriginsSetting(
  raw: string | undefined,
  production: boolean,
): string {
  const value = raw?.trim();
  if (value) return value;
  if (production) {
    throw new Error(
      "CORS_ORIGINS est obligatoire en production (liste d'origines séparées par des virgules, ex. https://fermia.example.ga).",
    );
  }
  return '*';
}

type TimeoutTarget = {
  requestTimeout: number;
  headersTimeout: number;
  keepAliveTimeout: number;
};

/**
 * Slow-client (slowloris) bounds on the Node HTTP server. A whole request
 * (headers + body) has 2 minutes, the headers 30 s; keep-alive stays above a
 * typical reverse-proxy idle timeout (60 s) so the proxy never reuses a socket
 * Node has just closed (502).
 */
export function applyServerTimeouts(server: TimeoutTarget): void {
  server.requestTimeout = 120_000;
  server.headersTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
}

type HeaderRes = {
  setHeader(name: string, value: string): unknown;
  removeHeader(name: string): unknown;
};

/**
 * Helmet-equivalent security headers, without the dependency. No CSP here:
 * Swagger UI and the public QR trace page use inline scripts/styles, and the
 * API serves JSON (the web app is served by its own host).
 */
export function securityHeaders(production: boolean) {
  return (_req: unknown, res: HeaderRes, next: () => void): void => {
    res.removeHeader('X-Powered-By');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-DNS-Prefetch-Control', 'off');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    if (production) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=15552000; includeSubDomains',
      );
    }
    next();
  };
}

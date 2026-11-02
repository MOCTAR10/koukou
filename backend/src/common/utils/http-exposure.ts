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

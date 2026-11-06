import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signed QR addresses of the traceability lots (architecture §11.2). The QR
 * holds an address, not a text: `<base>/l/<code>?s=<signature>`. The
 * signature is a truncated HMAC-SHA256 of the code with the server key
 * (`TRACE_QR_SECRET`): codes follow each other, so without it anyone could
 * guess the next one or print a fake QR.
 *
 * The signature is computed once, when the lot is created, and stored on the
 * lot (`qrToken`); a scan compares against the stored value. Rotating the key
 * therefore never invalidates labels already printed, and only lots created
 * afterwards use the new key.
 */

/** 16 base64url characters = 96 bits. */
export const QR_SIGNATURE_LENGTH = 16;

export function signLotCode(secret: string, code: string): string {
  return createHmac('sha256', secret)
    .update(`fermia:trace-lot:v1:${code}`)
    .digest('base64url')
    .slice(0, QR_SIGNATURE_LENGTH);
}

/** Constant-time comparison of a scanned signature with the stored one. */
export function signatureMatches(
  expected: string,
  provided: string | null | undefined,
): boolean {
  if (typeof provided !== 'string' || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}

/** Address printed in the QR code of a lot. */
export function lotQrUrl(baseUrl: string, code: string, token: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  return `${base}/l/${encodeURIComponent(code)}?s=${encodeURIComponent(token)}`;
}

/**
 * Pseudonymous fingerprint of a client IP (never the IP itself): an HMAC with
 * the server key, so the IPv4 space cannot be brute-forced from the table.
 */
export function hashIp(
  secret: string,
  ip: string | null | undefined,
): string | null {
  if (!ip) return null;
  return createHmac('sha256', secret)
    .update(`fermia:qr-scan-ip:v1:${ip}`)
    .digest('hex')
    .slice(0, 32);
}

/**
 * Coarse area of a scan (0.1° ≈ 11 km), from a position the public page may
 * send with the visitor's consent; null when absent or out of range. Only the
 * cell is stored, never the position.
 */
export function geoCellOf(lat: unknown, lng: unknown): string | null {
  const la = typeof lat === 'string' && lat.trim() !== '' ? Number(lat) : NaN;
  const lo = typeof lng === 'string' && lng.trim() !== '' ? Number(lng) : NaN;
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return null;
  if (la < -90 || la > 90 || lo < -180 || lo > 180) return null;
  const cell = (v: number) => (Math.floor(v * 10) / 10).toFixed(1);
  return `${cell(la)};${cell(lo)}`;
}

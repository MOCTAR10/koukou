/**
 * Pure helpers that turn a request body into the audit summary: secrets
 * removed, long strings cut, whole summary capped. Unit-tested.
 */

/** Keys never stored in the journal (passwords, PIN codes, tokens, hashes, OTP). */
export const SECRET_KEY_RE = /pass|code|secret|token|hash|otp/i;

export const MAX_STRING_LENGTH = 500;
export const MAX_SUMMARY_BYTES = 8 * 1024;
const MAX_DEPTH = 8;

function truncateString(value: string, max = MAX_STRING_LENGTH): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/** Recursively drops secret keys and truncates long strings. */
export function sanitizeValue(value: unknown, depth = 0): unknown {
  if (value == null) return value ?? null;
  if (typeof value === 'string') return truncateString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[binaire ${value.length} octets]`;
  if (typeof value !== 'object') return null;
  if (depth >= MAX_DEPTH) return '[profondeur max]';
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEY_RE.test(key)) continue;
    if (item === undefined || typeof item === 'function') continue;
    out[key] = sanitizeValue(item, depth + 1);
  }
  return out;
}

/**
 * Audit summary of a request body: sanitized, then capped to ~8 KB. An
 * oversized summary keeps a truncated JSON preview so the entry still says
 * what was sent.
 */
export function sanitizeSummary(body: unknown): unknown {
  if (body == null) return null;
  if (
    typeof body === 'object' &&
    !Array.isArray(body) &&
    !Buffer.isBuffer(body)
  ) {
    if (Object.keys(body).length === 0) return null;
  }
  const clean = sanitizeValue(body);
  const json = JSON.stringify(clean);
  const bytes = Buffer.byteLength(json, 'utf8');
  if (bytes <= MAX_SUMMARY_BYTES) return clean;
  // The preview is itself JSON-escaped once stored: shrink until it fits.
  let length = MAX_SUMMARY_BYTES - 200;
  for (;;) {
    const capped = {
      _truncated: true,
      _bytes: bytes,
      preview: json.slice(0, length),
    };
    if (
      Buffer.byteLength(JSON.stringify(capped), 'utf8') <= MAX_SUMMARY_BYTES
    ) {
      return capped;
    }
    length = Math.floor(length * 0.8);
  }
}

/** Masks a phone number for the login journal: `+24174123456` → `+241*****456`. */
export function maskPhone(phone: unknown): string | null {
  if (typeof phone !== 'string') return null;
  const value = phone.replace(/[\s.\-()]/g, '');
  if (value.length <= 5) return '*'.repeat(value.length);
  const head = value.startsWith('+') ? 4 : 2;
  const keep = Math.min(head, value.length - 3);
  return `${value.slice(0, keep)}${'*'.repeat(value.length - keep - 3)}${value.slice(-3)}`;
}

export function truncate(value: unknown, max: number): string | null {
  if (value == null) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

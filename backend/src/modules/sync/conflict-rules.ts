/**
 * Offline conflict rules (architecture §14, CDC « Collecte mobile hors
 * connexion » : dernière saisie horodatée retenue, conflit signalé). Pure:
 * the services feed them and store the outcome. The rule is documented for
 * the CGI in `backend/docs/poufa-conflits-hors-ligne.md` — keep both in step.
 */

export interface EffectiveCapture {
  /** Capture time used to decide (corrected when the phone clock is off). */
  capturedAt: Date;
  /** As sent by the phone (null for a live write). */
  raw: Date | null;
  /** Phone clock − server clock (ms), null when the phone sent no time. */
  skewMs: number | null;
  corrected: boolean;
}

/**
 * Capture time of a write. Beyond `thresholdMs` of clock skew the phone time
 * is shifted by the skew, and a capture never lies in the future (clamped to
 * the server time; flagged when beyond the threshold too).
 */
export function effectiveCapture(input: {
  capturedAt: Date | null;
  deviceSentAt: Date | null;
  serverNow: Date;
  thresholdMs: number;
}): EffectiveCapture {
  const now = input.serverNow.getTime();
  const skewMs =
    input.deviceSentAt != null ? input.deviceSentAt.getTime() - now : null;
  if (input.capturedAt == null) {
    return { capturedAt: input.serverNow, raw: null, skewMs, corrected: false };
  }
  let at = input.capturedAt.getTime();
  let corrected = false;
  if (skewMs != null && Math.abs(skewMs) > input.thresholdMs) {
    at -= skewMs;
    corrected = true;
  }
  if (at > now) {
    if (at - now > input.thresholdMs) corrected = true;
    at = now;
  }
  return { capturedAt: new Date(at), raw: input.capturedAt, skewMs, corrected };
}

/** Last write of one field. Dates are ISO strings (stored as jsonb). */
export interface FieldWriteMeta {
  capturedAt: string;
  updatedAt: string;
  userId: string | null;
  deviceId: string | null;
}

export interface ServerField {
  value: unknown;
  meta: FieldWriteMeta;
}

export interface IncomingWrite {
  /** Fields the write sends (undefined = not sent). */
  values: Readonly<Record<string, unknown>>;
  /** Values the phone knew before editing, when it sends them. */
  baseValues?: Readonly<Record<string, unknown>> | null;
  /** `updatedAt` of the record the phone knew; null for an offline creation. */
  baseUpdatedAt: Date | null;
  capturedAt: Date;
  userId: string | null;
  deviceId: string | null;
}

export type FieldAction =
  /** Write the incoming value. */
  | 'apply'
  /** The server's newer capture wins: the incoming value is not written. */
  | 'keep-server'
  /** The phone did not change this field (same as its base): not written. */
  | 'unchanged';

export interface FieldDecision {
  field: string;
  action: FieldAction;
  /** Both sides changed the field to different values. */
  conflict: boolean;
  incomingValue: unknown;
  serverValue: unknown;
  serverMeta: FieldWriteMeta | null;
}

export function sameValue(a: unknown, b: unknown): boolean {
  const na = a ?? null;
  const nb = b ?? null;
  if (typeof na === 'number' && typeof nb === 'number') {
    return Math.abs(na - nb) < 1e-9;
  }
  return na === nb;
}

function sameSource(meta: FieldWriteMeta, write: IncomingWrite): boolean {
  if (meta.deviceId != null || write.deviceId != null) {
    return meta.deviceId === write.deviceId;
  }
  return meta.userId != null && meta.userId === write.userId;
}

/**
 * Field-by-field decision for an offline write on an existing record
 * (`server` null = no record yet: everything applies). For each field sent:
 * 1. sent equal to the phone's base value → the phone did not change it
 *    (the mobile resends untouched fields, zeros included): not written;
 * 2. not changed on the server since the phone's base, or changed by the same
 *    device → written;
 * 3. changed meanwhile by another device: same value → written, no conflict;
 *    different values → conflict, the later capture wins (the server keeps a
 *    tie). The loser is reported, to be kept in `sync_conflicts`.
 */
export function resolveFields(
  server: Readonly<Record<string, ServerField>> | null,
  write: IncomingWrite,
): FieldDecision[] {
  const out: FieldDecision[] = [];
  for (const [field, incomingValue] of Object.entries(write.values)) {
    if (incomingValue === undefined) continue;
    const current = server?.[field] ?? null;
    const decision = (
      action: FieldAction,
      conflict = false,
    ): FieldDecision => ({
      field,
      action,
      conflict,
      incomingValue,
      serverValue: current?.value ?? null,
      serverMeta: current?.meta ?? null,
    });
    if (!current) {
      out.push(decision('apply'));
      continue;
    }
    const base = write.baseValues;
    if (base && Object.hasOwn(base, field) && sameValue(base[field], incomingValue)) {
      out.push(decision('unchanged'));
      continue;
    }
    const changedSinceBase =
      write.baseUpdatedAt == null ||
      Date.parse(current.meta.updatedAt) > write.baseUpdatedAt.getTime();
    if (!changedSinceBase || sameSource(current.meta, write)) {
      out.push(decision('apply'));
      continue;
    }
    if (sameValue(current.value, incomingValue)) {
      out.push(decision('apply'));
      continue;
    }
    const incomingWins =
      write.capturedAt.getTime() > Date.parse(current.meta.capturedAt);
    out.push(decision(incomingWins ? 'apply' : 'keep-server', true));
  }
  return out;
}

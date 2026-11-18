// Voice notes of a sanitary declaration: limits shared with the backend and the
// pure rules (no React, no native module). The recorder and the queue use them.

/** Backend limit per audio file: 3 MiB. */
export const MAX_VOICE_NOTE_BYTES = 3 * 1024 * 1024;
/** Backend limit: notes per health event. */
export const MAX_VOICE_NOTES = 2;
/** Hard stop of the recorder (the server accepts up to 180 s). */
export const MAX_VOICE_NOTE_MS = 120_000;
/** Backend `durationMs` range. */
export const SERVER_MAX_DURATION_MS = 180_000;

/**
 * Recording profile: mono, 16 kHz, 32 kbit/s AAC in an MPEG-4 `.m4a` container.
 * Speech stays clear and 120 s weigh about 480 KB (32 000 / 8 * 120), far
 * under the 3 MiB limit.
 */
export const VOICE_NOTE_BITRATE = 32_000;
export const VOICE_NOTE_SAMPLE_RATE = 16_000;
export const VOICE_NOTE_MIME = 'audio/mp4';

/** A voice note recorded on the phone, waiting to travel with a declaration. */
export interface VoiceNoteDraft {
  uri: string;
  durationMs: number;
  sizeBytes?: number;
}

/** Notes still allowed on one declaration (`max` = 1 in the simple flow). */
export function voiceNoteSlotsLeft(count: number, max: number = MAX_VOICE_NOTES): number {
  return Math.max(0, max - count);
}

/** French refusal of a note before it is queued, or null when it can be sent. */
export function voiceNoteRefusal(note: { sizeBytes?: number | null }, existingCount: number): string | null {
  if (existingCount >= MAX_VOICE_NOTES) return `${MAX_VOICE_NOTES} notes vocales au plus par déclaration.`;
  if (note.sizeBytes != null && note.sizeBytes > MAX_VOICE_NOTE_BYTES) return 'Note vocale trop lourde (3 Mo au plus).';
  return null;
}

/** `durationMs` field sent with the file: whole milliseconds in 1..180000, or null to omit it. */
export function durationField(durationMs: number | null | undefined): string | null {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;
  const ms = Math.round(durationMs);
  if (ms < 1) return null;
  return String(Math.min(ms, SERVER_MAX_DURATION_MS));
}

/** « 1:05 » for a duration in milliseconds. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/** Playback progress 0..1 from seconds (the player reports seconds). */
export function playbackProgress(currentSec: number, durationSec: number): number {
  if (!(durationSec > 0)) return 0;
  return Math.min(1, Math.max(0, currentSec / durationSec));
}

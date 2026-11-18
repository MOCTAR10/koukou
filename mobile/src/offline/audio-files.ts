// Declaration voice notes kept until their declaration syncs (web and tests: no
// durable file copy; the native build copies to the document directory, see
// audio-files.native.ts).
import type { DeclarationAudio } from '@/api/poufa';

/** Queued voice notes can be kept on this platform (native only). */
export const AUDIO_SURVIVES_OFFLINE = false;

/** Size in bytes of a local file (unknown here). */
export function audioFileSize(_uri: string): number | undefined {
  return undefined;
}

/** Copies a recorded note where the OS won't clear it; returns the copy. */
export function persistAudio(audio: DeclarationAudio): DeclarationAudio {
  return audio;
}

/** The local file is still there (a cleared cache loses it). */
export function audioExists(_audio: DeclarationAudio): boolean {
  return true;
}

/** Removes the kept copy once the note reached the server. */
export function discardAudio(_audio: DeclarationAudio): void {}

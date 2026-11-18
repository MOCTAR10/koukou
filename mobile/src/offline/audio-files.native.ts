import { Directory, File, Paths } from 'expo-file-system';

import type { DeclarationAudio } from '@/api/poufa';

/**
 * iOS/Android: a voice note is recorded in the cache, which the OS may clear
 * before the declaration syncs. It is copied to the document directory (like
 * the photos) and deleted once uploaded.
 */
const dir = new Directory(Paths.document, 'koukou-audio');

export const AUDIO_SURVIVES_OFFLINE = true;

function isKept(uri: string): boolean {
  return uri.startsWith(dir.uri);
}

/** Size in bytes of a local file, or undefined when it cannot be read. */
export function audioFileSize(uri: string): number | undefined {
  try {
    const file = new File(uri);
    return file.exists ? file.size : undefined;
  } catch {
    return undefined;
  }
}

export function persistAudio(audio: DeclarationAudio): DeclarationAudio {
  if (isKept(audio.uri)) return audio;
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const target = new File(dir, `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}.m4a`);
    new File(audio.uri).copy(target);
    return { ...audio, uri: target.uri };
  } catch {
    // Copy failed (no space…): keep the recorder's file, it usually survives.
    return audio;
  }
}

export function audioExists(audio: DeclarationAudio): boolean {
  try {
    return new File(audio.uri).exists;
  } catch {
    return false;
  }
}

export function discardAudio(audio: DeclarationAudio): void {
  if (!isKept(audio.uri)) return;
  try {
    const file = new File(audio.uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

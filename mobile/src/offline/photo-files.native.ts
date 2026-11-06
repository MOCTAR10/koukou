import { Directory, File, Paths } from 'expo-file-system';

import type { DeclarationPhoto } from '@/api/poufa';

/**
 * iOS/Android: a picked or shot photo lives in the picker's cache, which the
 * OS may clear before the declaration syncs. It is copied to the document
 * directory (like the offline queue) and deleted once uploaded.
 */
const dir = new Directory(Paths.document, 'koukou-photos');

export const PHOTOS_SURVIVE_OFFLINE = true;

function isKept(uri: string): boolean {
  return uri.startsWith(dir.uri);
}

export function persistPhoto(photo: DeclarationPhoto): DeclarationPhoto {
  if (isKept(photo.uri)) return photo;
  try {
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const ext = photo.name.split('.').pop() || 'jpg';
    const target = new File(dir, `${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}.${ext}`);
    new File(photo.uri).copy(target);
    return { ...photo, uri: target.uri };
  } catch {
    // Copy failed (no space…): keep the picker's file, it usually survives.
    return photo;
  }
}

export function photoExists(photo: DeclarationPhoto): boolean {
  try {
    return new File(photo.uri).exists;
  } catch {
    return false;
  }
}

export function discardPhoto(photo: DeclarationPhoto): void {
  if (!isKept(photo.uri)) return;
  try {
    const file = new File(photo.uri);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}

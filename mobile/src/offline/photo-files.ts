// Declaration photos kept until their declaration syncs (web and tests: no
// durable file copy; the native build copies to the document directory, see
// photo-files.native.ts).
import type { DeclarationPhoto } from '@/api/poufa';

/** Queued photos can be kept on this platform (native only). */
export const PHOTOS_SURVIVE_OFFLINE = false;

/** Copies a picked photo where the OS won't clear it; returns the copy. */
export function persistPhoto(photo: DeclarationPhoto): DeclarationPhoto {
  return photo;
}

/** The local file is still there (a cleared cache loses it). */
export function photoExists(_photo: DeclarationPhoto): boolean {
  return true;
}

/** Removes the kept copy once the photo reached the server. */
export function discardPhoto(_photo: DeclarationPhoto): void {}

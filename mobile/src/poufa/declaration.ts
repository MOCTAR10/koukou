// Sanitary declaration (CDC 21): clinical signs, suspicion and photos added
// to the health-event form. Pure: no React, no network.
import type { DeclarationPayload, RefItem } from '@/api/poufa';

/** Backend `DECLARATION_PHOTOS_MAX` (sanitary/health.service.ts). */
export const MAX_DECLARATION_PHOTOS = 5;
/** Backend `DECLARATION_PHOTO_MAX_BYTES`: 5 MiB per photo. */
export const MAX_DECLARATION_PHOTO_BYTES = 5 * 1024 * 1024;
/** Backend DTO `@ArrayMaxSize(30)` on `clinicalSigns`. */
export const MAX_CLINICAL_SIGNS = 30;

/** Active SIGNE_CLINIQUE items in list order (sort, then label). */
export function clinicalSignOptions(items: readonly RefItem[]): RefItem[] {
  return items
    .filter((i) => i.active)
    .slice()
    .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label, 'fr'));
}

/** Tap on a sign chip: adds it (at the end) or removes it; never a duplicate. */
export function toggleSign(selected: readonly string[], code: string): string[] {
  if (selected.includes(code)) return selected.filter((c) => c !== code);
  if (selected.length >= MAX_CLINICAL_SIGNS) return [...selected];
  return [...selected, code];
}

/** Keeps only codes still offered (a sign deactivated meanwhile would be a 400). */
export function knownSigns(selected: readonly string[], options: readonly RefItem[]): string[] {
  const codes = new Set(options.map((o) => o.code));
  return [...new Set(selected)].filter((c) => codes.has(c));
}

/** Labels of the selected codes, for a summary line (unknown code shown as is). */
export function signLabels(codes: readonly string[], items: readonly RefItem[]): string[] {
  const byCode = new Map(items.map((i) => [i.code, i.label]));
  return codes.map((c) => byCode.get(c) ?? c);
}

/**
 * The health-event payload with the declaration fields: `clinicalSigns` only
 * when some are ticked (deduplicated), `suspicion` only when true (false is
 * the server default). The idempotency key is set by the offline engine.
 */
export function withDeclarationFields(
  base: DeclarationPayload,
  extras: { clinicalSigns: readonly string[]; suspicion: boolean },
): DeclarationPayload {
  const signs = [...new Set(extras.clinicalSigns)];
  return {
    ...base,
    ...(signs.length > 0 ? { clinicalSigns: signs } : {}),
    ...(extras.suspicion ? { suspicion: true } : {}),
  };
}

/** Photos still allowed on one declaration. */
export function photoSlotsLeft(count: number): number {
  return Math.max(0, MAX_DECLARATION_PHOTOS - count);
}

const PHOTO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/** Accepted MIME type of a picked image, or null (the server takes PNG/JPEG/WEBP only). */
export function photoMimeType(asset: { mimeType?: string | null; uri: string }): string | null {
  const declared = asset.mimeType?.toLowerCase();
  if (declared && Object.values(PHOTO_MIME).includes(declared)) return declared;
  const ext = asset.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return PHOTO_MIME[ext] ?? null;
}

/** French refusal for a picked image, or null when it can be sent. */
export function photoRefusal(asset: { mimeType?: string | null; uri: string; fileSize?: number | null }): string | null {
  if (!photoMimeType(asset)) return 'Format non pris en charge : choisissez une photo JPEG, PNG ou WEBP.';
  if (asset.fileSize != null && asset.fileSize > MAX_DECLARATION_PHOTO_BYTES) {
    return 'Photo trop lourde (5 Mo au plus).';
  }
  return null;
}

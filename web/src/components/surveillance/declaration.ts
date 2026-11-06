import type { RefItem } from '../../api/types-programme';

/**
 * Sanitary declaration (POUFA L5, CDC 21): the health event's text, the
 * clinical signs of the SIGNE_CLINIQUE list, the suspicion flag, then the
 * photos once the text is stored. Same limits as `health.service.ts`.
 */

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTOS_MAX = 5;
export const PHOTO_ACCEPT = 'image/png,image/jpeg,image/webp';
const PHOTO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
const PHOTO_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'];
export const SIGNS_MAX = 30;

/** French reason why the file can't be sent, or null (the server checks the bytes again). */
export function photoProblem(file: Pick<File, 'name' | 'size' | 'type'>, existingCount: number): string | null {
  if (existingCount >= PHOTOS_MAX) return `${PHOTOS_MAX} photos au plus par déclaration.`;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const typeOk = file.type ? PHOTO_TYPES.includes(file.type.toLowerCase()) : PHOTO_EXTENSIONS.includes(ext);
  if (!typeOk) return 'Format de photo non supporté. Utilisez un fichier PNG, JPEG ou WEBP.';
  if (file.size === 0) return 'La photo est vide.';
  if (file.size > PHOTO_MAX_BYTES) return 'Une photo ne doit pas dépasser 5 Mo.';
  return null;
}

/** Files of one pick split into the ones to send and the French reasons for the others. */
export function splitPhotos<F extends Pick<File, 'name' | 'size' | 'type'>>(
  files: readonly F[],
  existingCount: number,
): { accepted: F[]; refused: string[] } {
  const accepted: F[] = [];
  const refused: string[] = [];
  for (const file of files) {
    const problem = photoProblem(file, existingCount + accepted.length);
    if (problem) refused.push(`${file.name} : ${problem}`);
    else accepted.push(file);
  }
  return { accepted, refused };
}

/** « 1,2 Mo » / « 350 Ko ». */
export function sizeFr(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(Math.round((bytes / (1024 * 1024)) * 10) / 10).toString().replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

/** Toggles a sign code, list order kept, never more than the server's cap. */
export function toggleSign(selected: readonly string[], code: string, order: readonly Pick<RefItem, 'code'>[]): string[] {
  const set = new Set(selected);
  if (set.has(code)) set.delete(code);
  else if (set.size < SIGNS_MAX) set.add(code);
  const rank = new Map(order.map((item, i) => [item.code, i]));
  return [...set].sort((a, b) => (rank.get(a) ?? 999) - (rank.get(b) ?? 999));
}

/** Labels of sign codes (an unknown or deactivated code shows as is). */
export function signLabels(codes: readonly string[] | null | undefined, items: readonly Pick<RefItem, 'code' | 'label'>[]): string[] {
  const byCode = new Map(items.map((i) => [i.code, i.label]));
  return (codes ?? []).map((c) => byCode.get(c) ?? c);
}

/**
 * Adds the declaration fields to a health-event body: the signs (only active
 * list codes, deduplicated; none: left out), the suspicion when ticked, and
 * the idempotency key that makes a replay return the same event.
 */
export function withDeclaration<T extends object>(
  body: T,
  input: { clinicalSigns: readonly string[]; suspicion: boolean; idempotencyKey: string; activeCodes?: readonly string[] },
): T & { clinicalSigns?: string[]; suspicion?: true; idempotencyKey: string } {
  const allowed = input.activeCodes ? new Set(input.activeCodes) : null;
  const signs = [...new Set(input.clinicalSigns)].filter((c) => !allowed || allowed.has(c)).slice(0, SIGNS_MAX);
  return {
    ...body,
    ...(signs.length ? { clinicalSigns: signs } : {}),
    ...(input.suspicion ? { suspicion: true as const } : {}),
    idempotencyKey: input.idempotencyKey,
  };
}

/** Message once the declaration went to the offline queue (photos need the stored event). */
export const QUEUED_DECLARATION_MESSAGE =
  'Déclaration enregistrée hors ligne : elle sera envoyée au retour de la connexion. Les photos s’ajoutent ensuite, en ligne, depuis la liste des événements.';

/** The server's refusal of a non-veterinary institution (`SANITARY_DECLARATION_MESSAGE`). */
export function isDeclarationRefusal(err: unknown): boolean {
  return !!err && typeof err === 'object' && (err as { status?: number }).status === 403;
}

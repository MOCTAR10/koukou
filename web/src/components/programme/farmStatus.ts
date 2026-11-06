import type { RefItem, SetFarmStatusBody } from '../../api/types-programme';

/** STATUT_FERME families (`programme/ref-list-families.ts` on the server). */
export const PREPARATION_FAMILY = 'PREPARATION';
export const SUSPENDED_FAMILY = 'SUSPENDUE';

const REASON_MAX = 500;

type StatusItem = Pick<RefItem, 'code' | 'label' | 'family' | 'active'>;

/** Family of the farm's current status; a farm without one is still in preparation. */
export function currentFamily(items: StatusItem[], statusCode: string | null | undefined): string {
  if (!statusCode) return PREPARATION_FAMILY;
  return items.find((i) => i.code === statusCode)?.family ?? PREPARATION_FAMILY;
}

/**
 * Statuses the farm may move to: active ones other than the current one. A
 * farm still in preparation can't be suspended (nothing runs yet to suspend).
 */
export function statusChoices<T extends StatusItem>(items: T[], statusCode: string | null | undefined): T[] {
  const family = currentFamily(items, statusCode);
  return items.filter(
    (i) => i.active && i.code !== statusCode && !(family === PREPARATION_FAMILY && i.family === SUSPENDED_FAMILY),
  );
}

export function needsReason(item: Pick<RefItem, 'family'> | null | undefined): boolean {
  return item?.family === SUSPENDED_FAMILY;
}

export interface StatusDraft {
  statusCode: string;
  /** `YYYY-MM-DD` from a date field, empty for now. */
  from: string;
  reason: string;
}

/**
 * Checks the form and builds the request body, with the server's French
 * messages. Today's date (or none) means "now": the server dates it itself.
 */
export function buildStatusPayload(
  draft: StatusDraft,
  context: { items: StatusItem[]; statusCode: string | null | undefined; statusSince?: string | null; today: string },
): { body: SetFarmStatusBody } | { error: string } {
  if (!draft.statusCode) return { error: 'Choisissez le nouveau statut.' };
  const item = statusChoices(context.items, context.statusCode).find((i) => i.code === draft.statusCode);
  if (!item) {
    return {
      error:
        currentFamily(context.items, context.statusCode) === PREPARATION_FAMILY &&
        context.items.find((i) => i.code === draft.statusCode)?.family === SUSPENDED_FAMILY
          ? 'Une ferme en préparation ne peut pas être suspendue.'
          : 'Ce statut n’est pas possible depuis le statut actuel.',
    };
  }
  const from = draft.from.trim();
  if (from && from > context.today) return { error: 'La date d’effet ne peut pas être future.' };
  const since = context.statusSince?.slice(0, 10);
  if (from && since && from < since) {
    return { error: `La date d’effet précède celle du statut en cours (${since}).` };
  }
  const reason = draft.reason.trim();
  if (needsReason(item) && !reason) return { error: 'Le motif est obligatoire pour suspendre une ferme.' };
  if (reason.length > REASON_MAX) return { error: `Le motif ne doit pas dépasser ${REASON_MAX} caractères.` };
  return {
    body: {
      statusCode: item.code,
      ...(from && from !== context.today ? { from } : {}),
      ...(reason ? { reason } : {}),
    },
  };
}

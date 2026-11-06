import { ApiError, errorBody } from '../../api/errors';
import type { ActivateOwnerConflictBody, OwnerLoginCodeConflictBody } from '../../api/types-programme';

/** Owner account of a registry farm: activation and new login code refusals. Pure. */

export type ActivationRefusal =
  /** A PROPRIETAIRE already holds the phone: offer to link the farm to his account. */
  | { kind: 'existingAccount'; message: string }
  /** A Market buyer holds the phone: another number is needed on the sheet. */
  | { kind: 'buyerAccount'; message: string }
  | { kind: 'other'; error: unknown };

/** Sorts an `activate-owner` refusal into the cases the screen answers differently. */
export function classifyActivationError(err: unknown): ActivationRefusal {
  if (err instanceof ApiError && err.status === 409) {
    const body = errorBody<ActivateOwnerConflictBody>(err);
    if (body?.buyerAccount === true) return { kind: 'buyerAccount', message: err.message };
    if (body?.existingAccount === true) return { kind: 'existingAccount', message: err.message };
  }
  return { kind: 'other', error: err };
}

/** Why the activation can't be asked yet (the server needs the exploitant's name and phone on the sheet). */
export function activationBlocker(sheet: { exploitant: { name: string | null; phone: string | null }; hasOwnerAccount: boolean }): string | null {
  if (sheet.hasOwnerAccount) return 'Le compte de l’exploitant est déjà activé.';
  if (!sheet.exploitant.phone?.trim()) return 'Renseignez le téléphone de l’exploitant sur la fiche avant d’activer son compte.';
  if (!sheet.exploitant.name?.trim()) return 'Renseignez le nom de l’exploitant sur la fiche avant d’activer son compte.';
  return null;
}

/**
 * A new owner login code refused because the farm has no owner account yet
 * (409 `noOwnerAccount`: the sheet on screen was stale, activate first).
 */
export function isNoOwnerAccount(err: unknown): boolean {
  return err instanceof ApiError && err.status === 409 && errorBody<OwnerLoginCodeConflictBody>(err)?.noOwnerAccount === true;
}

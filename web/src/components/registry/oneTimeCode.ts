import { ApiError, errorBody } from '../../api/errors';
import type { ActivateOwnerConflictBody } from '../../api/types-programme';

/**
 * A login code the server returns once (owner activation, regenerated code).
 * It lives only in this state: never in the query cache nor in storage, and
 * it is gone once the dialog closes.
 */
export type OneTimeCodeState =
  | { status: 'none' }
  | {
      status: 'shown';
      code: string;
      /** Whose code it is (the exploitant's name and phone). */
      holder: { fullName: string; phone: string };
      reason: 'activation' | 'regeneration';
      copied: boolean;
      /** The admin ticked « j’ai noté le code ». */
      noted: boolean;
    };

export type OneTimeCodeAction =
  | { type: 'reveal'; code: string; holder: { fullName: string; phone: string }; reason: 'activation' | 'regeneration' }
  | { type: 'copied' }
  | { type: 'noted'; value: boolean }
  | { type: 'dismiss' };

export const NO_CODE: OneTimeCodeState = { status: 'none' };

export function oneTimeCodeReducer(state: OneTimeCodeState, action: OneTimeCodeAction): OneTimeCodeState {
  switch (action.type) {
    case 'reveal':
      return { status: 'shown', code: action.code, holder: action.holder, reason: action.reason, copied: false, noted: false };
    case 'copied':
      return state.status === 'shown' ? { ...state, copied: true } : state;
    case 'noted':
      return state.status === 'shown' ? { ...state, noted: action.value } : state;
    case 'dismiss':
      return NO_CODE;
  }
}

/** Closing before the code was copied or noted asks for a confirmation: it will not be shown again. */
export function dismissNeedsConfirm(state: OneTimeCodeState): boolean {
  return state.status === 'shown' && !state.copied && !state.noted;
}

/** « 1234 5678 » for reading aloud; the copy keeps the raw digits. */
export function formatLoginCode(code: string): string {
  const raw = code.replace(/\s+/g, '');
  return raw.match(/.{1,4}/g)?.join(' ') ?? raw;
}

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

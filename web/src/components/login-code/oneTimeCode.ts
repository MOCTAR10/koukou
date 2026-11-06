/**
 * A login code the server returns once (owner activation, institutional
 * account creation, regenerated code). Pure state of the one dialog that
 * shows it (`OneTimeCodeModal`): the code lives only here, never in the query
 * cache nor in storage, and it is gone once the dialog closes.
 */
export type OneTimeCodeState =
  | { status: 'none' }
  | {
      status: 'shown';
      code: string;
      /** Whose code it is. */
      holder: { fullName: string; phone: string };
      title: string;
      /** A new code: the previous one no longer works. */
      regenerated: boolean;
      copied: boolean;
      /** The admin ticked « j’ai noté le code ». */
      noted: boolean;
    };

export type OneTimeCodeAction =
  | { type: 'reveal'; code: string; holder: { fullName: string; phone: string }; title: string; regenerated: boolean }
  | { type: 'copied' }
  | { type: 'noted'; value: boolean }
  | { type: 'dismiss' };

export const NO_CODE: OneTimeCodeState = { status: 'none' };

export function oneTimeCodeReducer(state: OneTimeCodeState, action: OneTimeCodeAction): OneTimeCodeState {
  switch (action.type) {
    case 'reveal':
      return {
        status: 'shown',
        code: action.code,
        holder: { fullName: action.holder.fullName, phone: action.holder.phone },
        title: action.title,
        regenerated: action.regenerated,
        copied: false,
        noted: false,
      };
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

/**
 * « Session expirée »: a 401 on a signed-in call (token past its validity,
 * 8 h for an institutional account, or the account suspended) logs out and
 * reloads the sign-in page, which then says why. The flag survives the reload
 * in sessionStorage (this tab only).
 */

const KEY = 'koukou.sessionExpired';

type FlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function tabStorage(): FlagStorage | null {
  return typeof sessionStorage === 'undefined' ? null : sessionStorage;
}

export const SESSION_EXPIRED_MESSAGE =
  'Votre session a expiré ou a été fermée par le serveur. Reconnectez-vous pour continuer.';

export function markSessionExpired(storage: FlagStorage | null = tabStorage()): void {
  storage?.setItem(KEY, '1');
}

/** Whether the last sign-out came from an expired session (read-only: call `clearSessionExpired` once shown). */
export function sessionExpired(storage: FlagStorage | null = tabStorage()): boolean {
  return storage?.getItem(KEY) === '1';
}

export function clearSessionExpired(storage: FlagStorage | null = tabStorage()): void {
  storage?.removeItem(KEY);
}

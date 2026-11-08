/**
 * Guards a press handler against a double tap that lands before the busy
 * re-render disables the button: a ref-held lock, not React state.
 *
 * - An async handler (returns a promise) keeps the lock until it settles.
 * - A sync handler keeps it for `cooldownMs`, enough to swallow the second tap
 *   of the same burst without noticeably slowing a deliberate second press.
 */
export interface PressGuard {
  /** Runs `fn` unless a previous press is still in flight. Returns whether it ran. */
  run: (fn: (() => unknown) | undefined) => boolean;
}

export function createPressGuard(cooldownMs = 400, now: () => number = Date.now): PressGuard {
  let lockedUntil = 0;
  let inFlight = false;
  return {
    run(fn) {
      if (!fn || inFlight || now() < lockedUntil) return false;
      lockedUntil = now() + cooldownMs;
      let result: unknown;
      try {
        result = fn();
      } catch (e) {
        lockedUntil = 0;
        throw e;
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        inFlight = true;
        const release = () => {
          inFlight = false;
        };
        (result as Promise<unknown>).then(release, release);
      }
      return true;
    },
  };
}

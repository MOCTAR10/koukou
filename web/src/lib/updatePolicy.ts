// When a new version of the app may replace the running page without losing work.

export interface UpdateContext {
  /** A new version is installed and waiting for a reload. */
  updateReady: boolean;
  /** A dialog (form) is open. */
  dialogOpen: boolean;
  /** Last keystroke in a field, ms timestamp (0 = never). */
  lastInputAt: number;
  /** Last pointer/keyboard activity, ms timestamp. */
  lastActivityAt: number;
  now: number;
  /** The user just changed page. */
  navigating?: boolean;
  /** The tab comes back to the foreground. */
  returning?: boolean;
  /** The new version has just been installed. */
  arriving?: boolean;
}

/** Typing in the last 2 minutes may be an unsent form. */
export const TYPING_GRACE_MS = 2 * 60_000;
/** Without any activity for this long, the page can reload. */
export const IDLE_RELOAD_MS = 60_000;

/**
 * Reload now? Never with a dialog open or a recent keystroke. Otherwise as soon
 * as the version arrives if nothing was typed on this page, at the next page
 * change, when the tab returns to the foreground, or when idle.
 */
export function shouldApplyUpdate(c: UpdateContext): boolean {
  if (!c.updateReady || c.dialogOpen) return false;
  if (c.lastInputAt > 0 && c.now - c.lastInputAt < TYPING_GRACE_MS) return false;
  if (c.arriving && c.lastInputAt === 0) return true;
  if (c.navigating || c.returning) return true;
  return c.now - c.lastActivityAt >= IDLE_RELOAD_MS;
}

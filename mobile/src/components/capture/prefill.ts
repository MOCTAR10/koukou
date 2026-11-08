/**
 * True when the form holds something the user typed or picked, i.e. differs
 * from the empty baseline. A late prefill (cache or refetch arriving after the
 * first keystroke) must not overwrite it.
 */
export function hasUserInput<T extends object>(values: T, baseline: T): boolean {
  const a = values as Record<string, unknown>;
  const b = baseline as Record<string, unknown>;
  return Object.keys({ ...a, ...b }).some((k) => (a[k] ?? null) !== (b[k] ?? null));
}

/**
 * Whether the prefill of `stamp` (lot + date) may replace the form values.
 * First fill of a fresh form: only if nothing was typed meanwhile. A later
 * switch of lot/date always reloads (the previous values belong to another entry).
 */
export function shouldApplyPrefill(opts: { alreadyPrefilledStamp: string | null; stamp: string; dirty: boolean }): boolean {
  if (opts.alreadyPrefilledStamp === opts.stamp) return false;
  if (opts.alreadyPrefilledStamp === null && opts.dirty) return false;
  return true;
}

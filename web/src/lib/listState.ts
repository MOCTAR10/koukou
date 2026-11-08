/** What a list page shows: never a blank screen. */
export type ListViewState = 'loading' | 'error' | 'empty' | 'ready';

/**
 * `loading`: first load, nothing to show yet. `error`: failed with nothing
 * saved to show (a failed refresh keeps the rows on screen: `ready`).
 * `empty`: loaded, no row.
 */
export function listViewState(q: { isLoading: boolean; isError?: boolean; error?: unknown; data?: readonly unknown[] | null }): ListViewState {
  const rows = q.data?.length ?? 0;
  if (rows > 0) return 'ready';
  if (q.isLoading) return 'loading';
  if (q.isError || q.error) return 'error';
  return 'empty';
}

// New versions of the app: one registration for the whole site, whatever the page.
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_MS = 10 * 60_000;

let ready = false;
let started = false;
let apply: (() => void) | null = null;
const listeners = new Set<() => void>();

function markReady(): void {
  if (ready) return;
  ready = true;
  for (const l of listeners) l();
}

/** Registers the service worker once and watches for a new version. Safe to call again. */
export function startAppUpdates(): void {
  if (started) return;
  started = true;
  const update = registerSW({
    onNeedRefresh: markReady,
    // Look for a new version now and then, not only at page load.
    onRegisteredSW: (_url, registration) => {
      if (registration) setInterval(() => void registration.update().catch(() => undefined), UPDATE_CHECK_MS);
    },
  });
  apply = () => void update(true);
  // The new service worker takes over at once (skipWaiting): the page still runs the old code.
  const sw = 'serviceWorker' in navigator ? navigator.serviceWorker : null;
  const hadController = !!sw?.controller;
  sw?.addEventListener('controllerchange', () => {
    if (hadController) markReady();
  });
}

export function subscribeUpdateReady(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A new version is installed: the page runs the old code until it reloads. */
export function isUpdateReady(): boolean {
  return ready;
}

/** The « Mettre à jour » button: reload on the new version now. */
export function applyUpdateNow(): void {
  if (apply) apply();
  else window.location.reload();
}

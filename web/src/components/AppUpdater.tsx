import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import { isUpdateReady, startAppUpdates, subscribeUpdateReady } from '../lib/appUpdate';
import { shouldApplyUpdate } from '../lib/updatePolicy';
import { hasOpenDialog } from './form';

/**
 * Applies a new version by itself, on every page of the site (sign-in and
 * Market included): at once when nothing has been typed yet, otherwise at the
 * next page change, when the tab comes back, or when idle. Never over an open
 * form or a field being typed in. Renders nothing.
 */
export function AppUpdater() {
  const updateReady = useSyncExternalStore(subscribeUpdateReady, isUpdateReady, isUpdateReady);
  const { pathname } = useLocation();
  const activity = useRef({ lastInputAt: 0, lastActivityAt: Date.now() });
  const applyIfSafe = useRef((_when: { navigating?: boolean; returning?: boolean; arriving?: boolean }) => {});
  applyIfSafe.current = (when) => {
    const reload = shouldApplyUpdate({
      updateReady,
      dialogOpen: hasOpenDialog(),
      lastInputAt: activity.current.lastInputAt,
      lastActivityAt: activity.current.lastActivityAt,
      now: Date.now(),
      ...when,
    });
    if (reload) window.location.reload();
  };

  useEffect(() => {
    startAppUpdates();
    const seen = () => {
      activity.current.lastActivityAt = Date.now();
    };
    const typed = () => {
      activity.current.lastInputAt = Date.now();
      seen();
    };
    const visible = () => {
      if (document.visibilityState === 'visible') applyIfSafe.current({ returning: true });
    };
    document.addEventListener('input', typed, true);
    document.addEventListener('pointerdown', seen, true);
    document.addEventListener('keydown', seen, true);
    document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => applyIfSafe.current({}), 15_000);
    return () => {
      document.removeEventListener('input', typed, true);
      document.removeEventListener('pointerdown', seen, true);
      document.removeEventListener('keydown', seen, true);
      document.removeEventListener('visibilitychange', visible);
      clearInterval(timer);
    };
  }, []);

  // The version just arrived: with nothing typed on this page, there is nothing to lose.
  useEffect(() => {
    if (updateReady) applyIfSafe.current({ arriving: true });
  }, [updateReady]);

  const firstPath = useRef(pathname);
  useEffect(() => {
    if (firstPath.current === pathname) return;
    firstPath.current = pathname;
    applyIfSafe.current({ navigating: true });
  }, [pathname]);

  return null;
}

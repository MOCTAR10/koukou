import { useEffect } from 'react';

import { announce, stopSpeaking } from './speak';

/**
 * Reads `text` aloud when a screen appears (or its sentence changes), if the
 * device setting allows it, and stops speaking when the screen goes away.
 * `active` lets a hidden screen (closed modal) stay silent.
 */
export function useAnnounce(text: string, active = true): void {
  useEffect(() => {
    if (!active || !text) return;
    announce(text);
    return () => stopSpeaking();
  }, [text, active]);
}

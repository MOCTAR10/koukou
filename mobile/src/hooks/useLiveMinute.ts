import { useEffect, useRef, useState } from 'react';

/** Fires `onTick` each time the wall-clock minute changes (react-keyed like Accueil). Skips the first minute after mount. */
export function useLiveMinute(onTick: () => void) {
  const [liveNow, setLiveNow] = useState(new Date());

  useEffect(() => {
    // Minute resolution: the state only changes with the minute, so the host
    // screen does not re-render every second.
    const id = setInterval(() => {
      setLiveNow((prev) => {
        const next = new Date();
        return Math.floor(next.getTime() / 60_000) === Math.floor(prev.getTime() / 60_000) ? prev : next;
      });
    }, 5_000);
    return () => clearInterval(id);
  }, []);

  const last = useRef('');
  useEffect(() => {
    const key = `${liveNow.getHours()}:${liveNow.getMinutes()}`;
    if (last.current === '') {
      last.current = key;
      return;
    }
    if (last.current === key) return;
    last.current = key;
    onTick();
  }, [liveNow, onTick]);
}
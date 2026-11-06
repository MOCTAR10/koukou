import { storage } from './storage';

/** Key of this install's id (kept across sign-outs: it names the phone, not the user). */
export const DEVICE_ID_KEY = 'koukou.deviceId';

function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  const c = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
  if (c?.getRandomValues) c.getRandomValues(buf);
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256);
  return Array.from(buf, (x) => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Stable id of this install, sent with offline writes (`deviceId`, ≤ 80
 * chars): the server tells two phones of the same account apart with it.
 */
export function deviceId(): string {
  const known = storage.getItem(DEVICE_ID_KEY);
  if (known) return known;
  const id = `mob-${randomHex(12)}`;
  storage.setItem(DEVICE_ID_KEY, id);
  return id;
}

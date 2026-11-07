import { Share } from 'react-native';
import Constants from 'expo-constants';

import { persistentKv } from '@/offline/persistent-kv';

/**
 * Field diagnostics without adb: a fatal JavaScript error closes a release
 * APK silently. The global handler writes it to disk synchronously (the app
 * dies right after), then the next launch shows it and offers to share it.
 * Native crashes (Java/Kotlin/C++) never reach this handler.
 */
const KEY = 'koukou.lastCrash';
const MAX_STACK = 3000;

export type CrashRecord = { at: string; version: string; fatal: boolean; message: string; stack: string };

type ErrorUtilsLike = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

function toRecord(error: unknown, fatal: boolean): CrashRecord {
  const e = error instanceof Error ? error : new Error(String(error));
  return {
    at: new Date().toISOString(),
    version: `${Constants.expoConfig?.version ?? '?'}`,
    fatal,
    message: `${e.name}: ${e.message}`,
    stack: (e.stack ?? '').slice(0, MAX_STACK),
  };
}

let installed = false;

export function installCrashLog(): void {
  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (installed || !errorUtils) return;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    if (isFatal) {
      try {
        persistentKv?.setItem(KEY, JSON.stringify(toRecord(error, true)));
      } catch {
        // Never mask the original error.
      }
    }
    previous(error, isFatal);
  });
}

function readLastCrash(): CrashRecord | null {
  try {
    const raw = persistentKv?.getItem(KEY);
    return raw ? (JSON.parse(raw) as CrashRecord) : null;
  } catch {
    return null;
  }
}

function clearLastCrash(): void {
  persistentKv?.removeItem(KEY);
}

export function formatCrash(c: CrashRecord): string {
  return `Fermia ${c.version}, ${c.at}\n${c.message}\n\n${c.stack}`;
}

/** The crash left by the previous session, read once at startup. */
export const previousCrash: CrashRecord | null = readLastCrash();

export function shareCrash(c: CrashRecord): void {
  Share.share({ message: formatCrash(c) }).catch(() => {});
}

export { clearLastCrash };

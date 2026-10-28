import { persistentKv } from '@/offline/persistent-kv';
import { DEFAULT_REMINDER_SETTINGS, type ReminderSettings } from './plan';

/** Per-device preference (not per account): the phone owns its reminders. */
const KEY = 'koukou.reminders';

let memory: string | null = null;

function read(): string | null {
  if (persistentKv) return persistentKv.getItem(KEY);
  if (typeof localStorage !== 'undefined') return localStorage.getItem(KEY);
  return memory;
}

function write(value: string): void {
  if (persistentKv) persistentKv.setItem(KEY, value);
  else if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value);
  else memory = value;
}

export function loadReminderSettings(): ReminderSettings {
  try {
    const raw = read();
    if (!raw) return DEFAULT_REMINDER_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    return { ...DEFAULT_REMINDER_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
}

export function saveReminderSettings(settings: ReminderSettings): void {
  write(JSON.stringify(settings));
}

type Listener = () => void;
const listeners = new Set<Listener>();
let current: ReminderSettings | null = null;

/** Shared snapshot for `useSyncExternalStore` (Réglages ↔ scheduler). */
export function getReminderSettings(): ReminderSettings {
  current ??= loadReminderSettings();
  return current;
}

export function setReminderSettings(next: ReminderSettings): void {
  current = next;
  saveReminderSettings(next);
  for (const l of listeners) l();
}

export function subscribeReminderSettings(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

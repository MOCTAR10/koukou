// Spoken instructions of the SIMPLE experience: the phone's own speech
// synthesis (works offline, no recordings). Every call is best-effort: a
// missing engine, a missing French voice or a platform without speech must
// never crash a screen.
import * as Speech from 'expo-speech';

import { readDeviceValue, writeDeviceValue } from '@/notifications/settings';

/** Per-device key (not per account): the phone owns its volume habits. */
export const VOICE_SETTING_KEY = 'koukou.simple.voice';

const LANGUAGE = 'fr-FR';
/** A little slower than the default: clearer for a listener who cannot read along. */
const RATE = 0.9;

/** « Lire les consignes à voix haute » — on unless the farmer switched it off. */
export function isVoiceEnabled(): boolean {
  try {
    return readDeviceValue(VOICE_SETTING_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setVoiceEnabled(enabled: boolean): void {
  try {
    writeDeviceValue(VOICE_SETTING_KEY, enabled ? 'on' : 'off');
  } catch {
    // Storage unavailable: the setting simply stays as it was.
  }
  if (!enabled) stopSpeaking();
}

/** Stops the current utterance (and the queue). Never throws. */
export function stopSpeaking(): void {
  try {
    void Promise.resolve(Speech.stop()).catch(() => {});
  } catch {
    // No engine: nothing to stop.
  }
}

/**
 * Reads `text` aloud in French, after stopping the previous utterance.
 * Always speaks (the speaker button); use `announce` for automatic reading.
 */
export function speak(text: string): void {
  const clean = text.trim();
  if (!clean) return;
  stopSpeaking();
  try {
    Speech.speak(clean, { language: LANGUAGE, rate: RATE, onError: () => {} });
  } catch {
    // No engine / no French voice: the screen still works, just silently.
  }
}

/** Automatic reading of a screen's instruction: honours the device setting. */
export function announce(text: string): void {
  if (isVoiceEnabled()) speak(text);
}

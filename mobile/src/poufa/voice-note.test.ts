import { describe, expect, it } from 'vitest';

import {
  MAX_VOICE_NOTE_BYTES,
  durationField,
  formatDuration,
  playbackProgress,
  voiceNoteRefusal,
  voiceNoteSlotsLeft,
} from './voice-note';

describe('voiceNoteRefusal', () => {
  it('accepts a small note', () => {
    expect(voiceNoteRefusal({ sizeBytes: 500_000 }, 0)).toBeNull();
    expect(voiceNoteRefusal({}, 1)).toBeNull();
  });
  it('refuses a note over 3 MiB', () => {
    expect(voiceNoteRefusal({ sizeBytes: MAX_VOICE_NOTE_BYTES + 1 }, 0)).toBe('Note vocale trop lourde (3 Mo au plus).');
    expect(voiceNoteRefusal({ sizeBytes: MAX_VOICE_NOTE_BYTES }, 0)).toBeNull();
  });
  it('refuses a third note', () => {
    expect(voiceNoteRefusal({ sizeBytes: 10 }, 2)).toBe('2 notes vocales au plus par déclaration.');
  });
});

describe('helpers', () => {
  it('counts the slots left', () => {
    expect(voiceNoteSlotsLeft(0)).toBe(2);
    expect(voiceNoteSlotsLeft(2)).toBe(0);
    expect(voiceNoteSlotsLeft(1, 1)).toBe(0);
  });
  it('builds the durationMs field in the server range', () => {
    expect(durationField(65_400.4)).toBe('65400');
    expect(durationField(0)).toBeNull();
    expect(durationField(null)).toBeNull();
    expect(durationField(999_999)).toBe('180000');
  });
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(65_000)).toBe('1:05');
    expect(formatDuration(120_000)).toBe('2:00');
  });
  it('clamps the progress', () => {
    expect(playbackProgress(5, 10)).toBe(0.5);
    expect(playbackProgress(12, 10)).toBe(1);
    expect(playbackProgress(1, 0)).toBe(0);
  });
});

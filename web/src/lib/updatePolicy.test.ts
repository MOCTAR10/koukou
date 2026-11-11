import { describe, expect, it } from 'vitest';
import { shouldApplyUpdate, type UpdateContext } from './updatePolicy';

const base: UpdateContext = { updateReady: true, dialogOpen: false, lastInputAt: 0, lastActivityAt: 1_000_000, now: 1_000_000 };

describe('shouldApplyUpdate', () => {
  it('does nothing without a pending update', () => {
    expect(shouldApplyUpdate({ ...base, updateReady: false, navigating: true })).toBe(false);
  });
  it('applies at the next navigation or when the tab returns', () => {
    expect(shouldApplyUpdate({ ...base, navigating: true })).toBe(true);
    expect(shouldApplyUpdate({ ...base, returning: true })).toBe(true);
  });
  it('waits while the user is active, applies when idle', () => {
    expect(shouldApplyUpdate({ ...base, now: base.now + 10_000 })).toBe(false);
    expect(shouldApplyUpdate({ ...base, now: base.now + 61_000 })).toBe(true);
  });
  it('never reloads over an open form or recent typing', () => {
    expect(shouldApplyUpdate({ ...base, dialogOpen: true, navigating: true, now: base.now + 999_999 })).toBe(false);
    expect(shouldApplyUpdate({ ...base, lastInputAt: base.now - 30_000, navigating: true })).toBe(false);
    expect(shouldApplyUpdate({ ...base, lastInputAt: base.now - 130_000, navigating: true })).toBe(true);
  });
  it('applies as soon as the version arrives when nothing was typed on the page', () => {
    expect(shouldApplyUpdate({ ...base, arriving: true })).toBe(true);
    expect(shouldApplyUpdate({ ...base, arriving: true, dialogOpen: true })).toBe(false);
    expect(shouldApplyUpdate({ ...base, arriving: true, lastInputAt: base.now - 130_000 })).toBe(false);
  });
});

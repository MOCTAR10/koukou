import { describe, expect, it } from 'vitest';
import { createPressGuard } from './pressGuard';

describe('createPressGuard', () => {
  it('runs a sync handler once for a burst of taps', () => {
    let t = 1000;
    const guard = createPressGuard(400, () => t);
    let calls = 0;
    const fn = () => {
      calls += 1;
    };
    expect(guard.run(fn)).toBe(true);
    t += 20;
    expect(guard.run(fn)).toBe(false);
    expect(calls).toBe(1);
    t += 500;
    expect(guard.run(fn)).toBe(true);
    expect(calls).toBe(2);
  });

  it('holds the lock until an async handler settles', async () => {
    let t = 0;
    const guard = createPressGuard(10, () => t);
    let release!: () => void;
    let calls = 0;
    const slow = () => {
      calls += 1;
      return new Promise<void>((r) => {
        release = r;
      });
    };
    expect(guard.run(slow)).toBe(true);
    t += 1000; // past the cooldown, still in flight
    expect(guard.run(slow)).toBe(false);
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(guard.run(slow)).toBe(true);
    expect(calls).toBe(2);
  });

  it('releases after a rejected promise and after a sync throw', async () => {
    let t = 0;
    const guard = createPressGuard(10, () => t);
    expect(guard.run(() => Promise.reject(new Error('x')))).toBe(true);
    await new Promise((r) => setTimeout(r, 0));
    t += 100;
    expect(guard.run(() => undefined)).toBe(true);
    t += 100;
    expect(() =>
      guard.run(() => {
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(guard.run(() => undefined)).toBe(true);
  });

  it('ignores a missing handler', () => {
    expect(createPressGuard().run(undefined)).toBe(false);
  });
});

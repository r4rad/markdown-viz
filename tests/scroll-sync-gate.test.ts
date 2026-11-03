import { afterEach, describe, expect, it, vi } from 'vitest';
import { createScrollSyncGate } from '../src/lib/scroll-sync-gate';

describe('createScrollSyncGate', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks while applying and unlocks after holdMs', () => {
    vi.useFakeTimers();
    const gate = createScrollSyncGate(100);
    expect(gate.isLocked()).toBe(false);

    let applied = false;
    gate.run(() => {
      applied = true;
      expect(gate.isLocked()).toBe(true);
    });
    expect(applied).toBe(true);
    expect(gate.isLocked()).toBe(true);

    vi.advanceTimersByTime(99);
    expect(gate.isLocked()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(gate.isLocked()).toBe(false);
    gate.dispose();
  });

  it('extends the lock when run again before unlock', () => {
    vi.useFakeTimers();
    const gate = createScrollSyncGate(50);
    gate.run(() => {});
    vi.advanceTimersByTime(40);
    gate.run(() => {});
    vi.advanceTimersByTime(40);
    expect(gate.isLocked()).toBe(true);
    vi.advanceTimersByTime(20);
    expect(gate.isLocked()).toBe(false);
    gate.dispose();
  });
});

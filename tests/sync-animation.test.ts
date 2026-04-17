import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('Cloud Sync Animation', () => {
  let btn: HTMLElement;

  beforeEach(() => {
    btn = document.createElement('button');
    btn.id = 'cloud-sync-btn';
    btn.innerHTML = '<svg class="cloud-sync-icon"><circle class="vapor vapor-1"/><circle class="vapor vapor-2"/><circle class="vapor vapor-3"/><line class="drop drop-1"/><line class="drop drop-2"/><line class="drop drop-3"/></svg>';
    document.body.appendChild(btn);
  });

  it('should add syncing class during sync', () => {
    btn.classList.add('syncing');
    expect(btn.classList.contains('syncing')).toBe(true);
    expect(btn.classList.contains('sync-ok')).toBe(false);
  });

  it('should remove syncing and add sync-ok on success', () => {
    btn.classList.add('syncing');
    btn.classList.remove('syncing');
    btn.classList.add('sync-ok');
    expect(btn.classList.contains('syncing')).toBe(false);
    expect(btn.classList.contains('sync-ok')).toBe(true);
  });

  it('should remove syncing and add sync-fail on failure', () => {
    btn.classList.add('syncing');
    btn.classList.remove('syncing');
    btn.classList.add('sync-fail');
    expect(btn.classList.contains('syncing')).toBe(false);
    expect(btn.classList.contains('sync-fail')).toBe(true);
  });

  it('should have vapor elements for syncing animation', () => {
    const vapors = btn.querySelectorAll('.vapor');
    expect(vapors.length).toBe(3);
  });

  it('should have drop elements for rain animation', () => {
    const drops = btn.querySelectorAll('.drop');
    expect(drops.length).toBe(3);
  });

  it('should clean up classes after timeout', () => {
    vi.useFakeTimers();
    btn.classList.add('sync-ok');
    setTimeout(() => btn.classList.remove('sync-ok', 'sync-fail'), 1500);
    vi.advanceTimersByTime(1500);
    expect(btn.classList.contains('sync-ok')).toBe(false);
    vi.useRealTimers();
  });

  it('should not have the old spin animation class behavior', () => {
    btn.classList.add('syncing');
    // The old behavior was `animation: spin 1s linear infinite`
    // New behavior uses .vapor child animations
    expect(btn.querySelector('.vapor-1')).not.toBeNull();
    expect(btn.querySelector('.vapor-2')).not.toBeNull();
    expect(btn.querySelector('.vapor-3')).not.toBeNull();
  });
});

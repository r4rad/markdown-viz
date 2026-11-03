/**
 * While applying a programmatic scroll from the other pane, ignore echo
 * scroll events. A single rAF is too short when the browser coalesces
 * scroll events or CSS scroll-behavior is smooth.
 */
export function createScrollSyncGate(holdMs = 100): {
  isLocked: () => boolean;
  run: (apply: () => void) => void;
  dispose: () => void;
} {
  let locked = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    isLocked: () => locked,
    run(apply: () => void) {
      locked = true;
      if (timer) clearTimeout(timer);
      apply();
      timer = setTimeout(() => {
        locked = false;
        timer = null;
      }, holdMs);
    },
    dispose() {
      if (timer) clearTimeout(timer);
      timer = null;
      locked = false;
    },
  };
}

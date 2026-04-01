import type { EventCallback } from '../types';

type Listener = { event: string; cb: EventCallback<any> };

const listeners: Listener[] = [];

export function on<T = unknown>(event: string, cb: EventCallback<T>): () => void {
  const entry: Listener = { event, cb };
  listeners.push(entry);
  return () => {
    const idx = listeners.indexOf(entry);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

export function emit<T = unknown>(event: string, data?: T): void {
  for (const l of listeners) {
    if (l.event === event) {
      try { l.cb(data); } catch (e) { console.error(`[event:${event}]`, e); }
    }
  }
}

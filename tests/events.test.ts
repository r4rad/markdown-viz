import { describe, it, expect, beforeEach, vi } from 'vitest';
import { on, emit } from '../src/lib/events';

describe('Event System', () => {
  describe('on()', () => {
    it('should register and call a listener', () => {
      const cb = vi.fn();
      on('test-event', cb);
      emit('test-event', 'hello');
      expect(cb).toHaveBeenCalledWith('hello');
    });

    it('should support multiple listeners for the same event', () => {
      const cb1 = vi.fn();
      const cb2 = vi.fn();
      on('multi', cb1);
      on('multi', cb2);
      emit('multi', 42);
      expect(cb1).toHaveBeenCalledWith(42);
      expect(cb2).toHaveBeenCalledWith(42);
    });

    it('should not call listeners for different events', () => {
      const cb = vi.fn();
      on('event-a', cb);
      emit('event-b', 'data');
      expect(cb).not.toHaveBeenCalled();
    });

    it('should return an unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = on('unsub-test', cb);
      emit('unsub-test', 1);
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();
      emit('unsub-test', 2);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it('should handle undefined data', () => {
      const cb = vi.fn();
      on('no-data', cb);
      emit('no-data');
      expect(cb).toHaveBeenCalledWith(undefined);
    });

    it('should handle complex data types', () => {
      const cb = vi.fn();
      on('complex', cb);
      const data = { nested: { array: [1, 2, 3] }, flag: true };
      emit('complex', data);
      expect(cb).toHaveBeenCalledWith(data);
    });

    it('should not crash if a listener throws', () => {
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badCb = vi.fn(() => { throw new Error('fail'); });
      const goodCb = vi.fn();
      on('err-test', badCb);
      on('err-test', goodCb);

      expect(() => emit('err-test', 'x')).not.toThrow();
      expect(badCb).toHaveBeenCalled();
      expect(goodCb).toHaveBeenCalled();
      expect(errSpy).toHaveBeenCalled();
      errSpy.mockRestore();
    });
  });

  describe('emit()', () => {
    it('should do nothing when no listeners are registered', () => {
      expect(() => emit('nonexistent', 'data')).not.toThrow();
    });

    it('should emit to all matching listeners in order', () => {
      const order: number[] = [];
      on('order-test', () => order.push(1));
      on('order-test', () => order.push(2));
      on('order-test', () => order.push(3));
      emit('order-test');
      expect(order).toEqual([1, 2, 3]);
    });
  });
});

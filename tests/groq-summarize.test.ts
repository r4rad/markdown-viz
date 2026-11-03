import { afterEach, describe, expect, it } from 'vitest';
import { clearGroqApiKey, getGroqApiKey, setGroqApiKey } from '../src/lib/groq-summarize';

describe('getGroqApiKey', () => {
  afterEach(() => {
    clearGroqApiKey();
  });

  it('returns null when nothing is stored', () => {
    expect(getGroqApiKey()).toBeNull();
  });

  it('returns the Settings/localStorage key only', () => {
    setGroqApiKey('gsk_test_runtime');
    expect(getGroqApiKey()).toBe('gsk_test_runtime');
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  CHANGELOG_VERSION,
  hasSeenChangelog,
  markChangelogSeen,
  clearChangelogSeen,
  CHANGELOG_ENTRIES,
} from '../src/lib/changelog';

// localStorage mock is provided by jsdom in the test environment

describe('changelog: constants', () => {
  it('CHANGELOG_VERSION is a non-empty string', () => {
    expect(typeof CHANGELOG_VERSION).toBe('string');
    expect(CHANGELOG_VERSION.length).toBeGreaterThan(0);
  });

  it('CHANGELOG_VERSION matches semver format', () => {
    expect(CHANGELOG_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('CHANGELOG_ENTRIES is an array with at least one entry', () => {
    expect(Array.isArray(CHANGELOG_ENTRIES)).toBe(true);
    expect(CHANGELOG_ENTRIES.length).toBeGreaterThan(0);
  });

  it('each CHANGELOG_ENTRY has version, date, and items', () => {
    for (const entry of CHANGELOG_ENTRIES) {
      expect(typeof entry.version).toBe('string');
      expect(typeof entry.date).toBe('string');
      expect(Array.isArray(entry.items)).toBe(true);
      expect(entry.items.length).toBeGreaterThan(0);
    }
  });

  it('each CHANGELOG_ENTRY item has a label and text', () => {
    for (const entry of CHANGELOG_ENTRIES) {
      for (const item of entry.items) {
        expect(typeof item.text).toBe('string');
        expect(item.text.length).toBeGreaterThan(0);
        expect(['feat', 'fix', 'perf', 'chore']).toContain(item.kind);
      }
    }
  });
});

describe('changelog: hasSeenChangelog', () => {
  beforeEach(() => {
    clearChangelogSeen();
  });

  afterEach(() => {
    clearChangelogSeen();
  });

  it('returns false initially for current version', () => {
    expect(hasSeenChangelog(CHANGELOG_VERSION)).toBe(false);
  });

  it('returns false initially for any version', () => {
    expect(hasSeenChangelog('0.0.1')).toBe(false);
    expect(hasSeenChangelog('99.99.99')).toBe(false);
  });

  it('returns false if localStorage is empty', () => {
    localStorage.clear();
    expect(hasSeenChangelog(CHANGELOG_VERSION)).toBe(false);
  });
});

describe('changelog: markChangelogSeen', () => {
  beforeEach(() => {
    clearChangelogSeen();
  });

  afterEach(() => {
    clearChangelogSeen();
  });

  it('after markChangelogSeen, hasSeenChangelog returns true for that version', () => {
    markChangelogSeen('1.0.0');
    expect(hasSeenChangelog('1.0.0')).toBe(true);
  });

  it('markChangelogSeen does not affect other versions', () => {
    markChangelogSeen('1.0.0');
    expect(hasSeenChangelog('1.1.0')).toBe(false);
    expect(hasSeenChangelog('2.0.0')).toBe(false);
  });

  it('multiple versions can be tracked independently', () => {
    markChangelogSeen('1.0.0');
    markChangelogSeen('1.1.0');
    expect(hasSeenChangelog('1.0.0')).toBe(true);
    expect(hasSeenChangelog('1.1.0')).toBe(true);
    expect(hasSeenChangelog('2.0.0')).toBe(false);
  });

  it('calling markChangelogSeen twice is idempotent', () => {
    markChangelogSeen('1.0.0');
    markChangelogSeen('1.0.0');
    expect(hasSeenChangelog('1.0.0')).toBe(true);
  });

  it('marking current version then checking returns true', () => {
    markChangelogSeen(CHANGELOG_VERSION);
    expect(hasSeenChangelog(CHANGELOG_VERSION)).toBe(true);
  });
});

describe('changelog: clearChangelogSeen', () => {
  it('clears all seen versions', () => {
    markChangelogSeen('1.0.0');
    markChangelogSeen('1.1.0');
    clearChangelogSeen();
    expect(hasSeenChangelog('1.0.0')).toBe(false);
    expect(hasSeenChangelog('1.1.0')).toBe(false);
  });

  it('is safe to call when nothing is stored', () => {
    localStorage.clear();
    expect(() => clearChangelogSeen()).not.toThrow();
  });
});

describe('changelog: edge cases', () => {
  beforeEach(() => {
    clearChangelogSeen();
  });

  afterEach(() => {
    clearChangelogSeen();
  });

  it('handles corrupted localStorage gracefully', () => {
    localStorage.setItem('mv-changelog-seen', 'NOT_VALID_JSON{{{');
    expect(() => hasSeenChangelog('1.0.0')).not.toThrow();
    expect(hasSeenChangelog('1.0.0')).toBe(false);
  });

  it('handles empty string version', () => {
    expect(() => hasSeenChangelog('')).not.toThrow();
    expect(() => markChangelogSeen('')).not.toThrow();
  });
});

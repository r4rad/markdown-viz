import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FeedbackData } from '../src/types';

// ── Mock firebase/app ───────────────────────────────────────────────────────
vi.mock('firebase/app', () => ({ getApp: vi.fn() }));

// ── Mock firebase/firestore ─────────────────────────────────────────────────
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'mock-doc' });
vi.mock('firebase/firestore', () => ({
  getFirestore: vi.fn(),
  collection: vi.fn(),
  addDoc: (...args: unknown[]) => mockAddDoc(...args),
}));

// ── Mock firebase-config ────────────────────────────────────────────────────
vi.mock('../src/lib/firebase-config', () => ({
  isFirebaseConfigured: vi.fn(() => true),
}));

// ── Mock @emailjs/browser ───────────────────────────────────────────────────
vi.mock('@emailjs/browser', () => ({ default: { send: vi.fn().mockResolvedValue({}) } }));

// Import after mocks
import { submitFeedback } from '../src/lib/feedback';

const baseFeedback: FeedbackData = {
  name: 'Test User',
  email: 'test@example.com',
  rating: 5,
  message: 'Great app!',
  userId: null,
  createdAt: 1_000_000,
  userAgent: 'vitest',
  url: 'http://localhost',
};

describe('submitFeedback()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddDoc.mockResolvedValue({ id: 'mock-doc' });
  });

  it('returns true on successful Firestore write', async () => {
    const result = await submitFeedback(baseFeedback);
    expect(result).toBe(true);
  });

  it('calls Firestore addDoc with correct fields', async () => {
    await submitFeedback(baseFeedback);
    expect(mockAddDoc).toHaveBeenCalledTimes(1);
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload).toMatchObject({
      name: 'Test User',
      email: 'test@example.com',
      rating: 5,
      message: 'Great app!',
    });
  });

  it('returns false when Firestore throws', async () => {
    mockAddDoc.mockRejectedValue(new Error('Firestore offline'));
    const result = await submitFeedback(baseFeedback);
    expect(result).toBe(false);
  });

  it('handles missing userId gracefully', async () => {
    const data = { ...baseFeedback, userId: undefined };
    const result = await submitFeedback(data);
    expect(result).toBe(true);
    const [, payload] = mockAddDoc.mock.calls[0];
    expect(payload.userId).toBeNull();
  });

  it('does not throw when firebase is not configured', async () => {
    const { isFirebaseConfigured } = await import('../src/lib/firebase-config');
    vi.mocked(isFirebaseConfigured).mockReturnValueOnce(false);
    const result = await submitFeedback(baseFeedback);
    expect(result).toBe(true);
    expect(mockAddDoc).not.toHaveBeenCalled();
  });
});

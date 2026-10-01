import { createHmac, timingSafeEqual } from 'node:crypto';
import { getGithubAppConfig } from './config.js';

/**
 * Verify GitHub webhook HMAC (X-Hub-Signature-256).
 * @see https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
 */
export function verifyGithubWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  webhookSecret: string = getGithubAppConfig().webhookSecret,
): boolean {
  if (!webhookSecret) {
    return false;
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const expected =
    'sha256=' + createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

/** Test helper: build a valid X-Hub-Signature-256 for a body + secret. */
export function signGithubWebhookBody(rawBody: Buffer | string, secret: string): string {
  const buf = typeof rawBody === 'string' ? Buffer.from(rawBody, 'utf8') : rawBody;
  return 'sha256=' + createHmac('sha256', secret).update(buf).digest('hex');
}

/**
 * GitHub App credentials — Cloud Run / Secret Manager only.
 * Never read App private key or webhook secret from VITE_* (browser-bundled) names.
 */

export type GithubAppConfig = {
  appId: string;
  /** PEM private key; empty in stub/local when unset. */
  privateKey: string;
  webhookSecret: string;
};

/** Env names that must never hold GitHub App secrets (would leak to the SPA bundle). */
export const FORBIDDEN_VITE_GITHUB_SECRET_KEYS = [
  'VITE_GITHUB_APP_ID',
  'VITE_GITHUB_APP_PRIVATE_KEY',
  'VITE_GITHUB_APP_WEBHOOK_SECRET',
  'VITE_GITHUB_PRIVATE_KEY',
  'VITE_GITHUB_WEBHOOK_SECRET',
  'VITE_GITHUB_APP_CLIENT_SECRET',
] as const;

/**
 * Reject GitHub App secrets staged under VITE_* names.
 * Call before using App credentials so misconfiguration fails closed.
 */
export function rejectViteGithubAppSecrets(
  env: NodeJS.ProcessEnv = process.env,
): { ok: true } | { ok: false; keys: string[] } {
  const keys = FORBIDDEN_VITE_GITHUB_SECRET_KEYS.filter((k) => {
    const v = env[k];
    return typeof v === 'string' && v.trim().length > 0;
  });
  if (keys.length > 0) {
    return { ok: false, keys: [...keys] };
  }
  return { ok: true };
}

/**
 * Load App config from Cloud Run env (non-VITE).
 * Stub/local may leave private key empty; webhook verify still needs a secret when set.
 */
export function getGithubAppConfig(env: NodeJS.ProcessEnv = process.env): GithubAppConfig {
  const viteCheck = rejectViteGithubAppSecrets(env);
  if (!viteCheck.ok) {
    throw new Error(
      `GitHub App secrets must not use VITE_* (found: ${viteCheck.keys.join(', ')}). ` +
        'Use GITHUB_APP_* on Cloud Run / Secret Manager only.',
    );
  }

  return {
    appId: (env.GITHUB_APP_ID ?? '').trim(),
    privateKey: normalizePem(env.GITHUB_APP_PRIVATE_KEY ?? ''),
    webhookSecret: (env.GITHUB_APP_WEBHOOK_SECRET ?? '').trim(),
  };
}

function normalizePem(raw: string): string {
  // Cloud Run secrets sometimes store PEM with literal \n.
  return raw.replace(/\\n/g, '\n').trim();
}

/**
 * True when enough config exists to mint installation tokens later.
 * Link + webhook skeleton does not require a private key for local/CI.
 */
export function hasGithubAppCredentials(config: GithubAppConfig = getGithubAppConfig()): boolean {
  return Boolean(config.appId && config.privateKey);
}

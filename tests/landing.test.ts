import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/auth', () => ({
  initFirebase: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  isFirebaseReady: vi.fn(() => true),
  signInWithGitHub: vi.fn(async () => {}),
  signInWithGoogle: vi.fn(async () => {}),
}));

import { isAuthenticated, isFirebaseReady, signInWithGitHub } from '../src/lib/auth';
import { mountLandingPage } from '../src/components/LandingPage';

function mount(navigate = vi.fn()): { root: HTMLElement; navigate: ReturnType<typeof vi.fn> } {
  const root = document.createElement('div');
  document.body.append(root);
  mountLandingPage(root, navigate);
  return { root, navigate };
}

describe('landing page', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.mocked(isAuthenticated).mockReturnValue(false);
    vi.mocked(isFirebaseReady).mockReturnValue(true);
    vi.mocked(signInWithGitHub).mockReset();
    vi.mocked(signInWithGitHub).mockResolvedValue(undefined);
  });

  it('renders a marketing page separate from the app shell', () => {
    const { root } = mount();
    const page = root.querySelector('.landing');
    expect(page?.getAttribute('data-route')).toBe('landing');
    expect(root.classList.contains('app-container')).toBe(false);
    expect(page?.querySelector('h1')?.textContent).toMatch(/Team docs/i);
    expect(page?.querySelector('#features')).toBeTruthy();
    expect(page?.querySelector('#how-it-works')).toBeTruthy();
    const featureText = page?.querySelector('#features')?.textContent ?? '';
    expect(featureText).toMatch(/Team docs/);
    expect(featureText).toMatch(/Realtime collaboration/);
    expect(featureText).toMatch(/Diagrams/);
    expect(featureText).toMatch(/GitHub sync/);
  });

  it('opens /app from guest Open editor without signing in', () => {
    const { root } = mount();
    const links = [...root.querySelectorAll<HTMLAnchorElement>('[data-cta="guest-editor"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.tagName).toBe('A');
      expect(link.getAttribute('href')).toBe('/app');
    }
    expect(signInWithGitHub).not.toHaveBeenCalled();
  });

  it('starts create or join, then continues to /app after sign-in', async () => {
    vi.mocked(signInWithGitHub).mockImplementation(async () => {
      vi.mocked(isAuthenticated).mockReturnValue(true);
    });
    const { root, navigate } = mount();

    root.querySelector<HTMLButtonElement>('[data-cta="create-join"]')!.click();
    expect(navigate).not.toHaveBeenCalled();
    const dialog = document.getElementById('landing-auth');
    expect(dialog?.textContent).toMatch(/Create or join a workspace/);

    const github = [...dialog!.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('GitHub'),
    );
    github!.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/app'));
    expect(signInWithGitHub).toHaveBeenCalledOnce();
  });

  it('goes straight to /app when the primary CTA is used by someone already signed in', () => {
    vi.mocked(isAuthenticated).mockReturnValue(true);
    const { root, navigate } = mount();
    root.querySelector<HTMLButtonElement>('[data-cta="create-join"]')!.click();
    expect(document.getElementById('landing-auth')).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/app');
    expect(signInWithGitHub).not.toHaveBeenCalled();
  });
});

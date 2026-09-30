import { mountLandingPage } from './LandingPage';
import { isAuthenticated } from '../lib/auth';
import { acceptInviteById } from '../lib/shared-workspace';
import { isApiConfigured } from '../lib/api-client';

function entryRoot(): HTMLElement {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app');
  app.className = 'route-entry';
  app.replaceChildren();
  return app;
}

function linkToApp(label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = '/app';
  link.textContent = label;
  return link;
}

/** Public marketing page. The editor shell is `/app`, not this route. */
export function mountLandingEntry(): void {
  const app = document.getElementById('app');
  if (!app) throw new Error('Missing #app');
  mountLandingPage(app);
}

/** Invite route: server-validated accept via Cloud Run POST /v1/invites/:id/accept. */
export function mountInviteEntry(inviteId: string): void {
  const app = entryRoot();
  const main = document.createElement('main');
  main.className = 'route-entry-main';
  main.dataset.route = 'invite';
  main.dataset.inviteId = inviteId;

  const heading = document.createElement('h1');
  heading.textContent = 'Workspace invite';

  const text = document.createElement('p');
  const code = document.createElement('code');
  code.textContent = inviteId;
  text.append('Invite ', code);

  const status = document.createElement('p');
  status.dataset.inviteStatus = '1';

  const actions = document.createElement('p');
  const acceptBtn = document.createElement('button');
  acceptBtn.type = 'button';
  acceptBtn.textContent = 'Accept invite';
  acceptBtn.disabled = !isApiConfigured() || !isAuthenticated();

  if (!isApiConfigured()) {
    status.textContent = 'Server invites are not configured (VITE_API_BASE_URL).';
  } else if (!isAuthenticated()) {
    status.textContent = 'Sign in with the invited email, then accept.';
  } else {
    status.textContent = 'Accept to join this workspace. Your signed-in email must match the invite.';
  }

  acceptBtn.addEventListener('click', async () => {
    acceptBtn.disabled = true;
    status.textContent = 'Accepting…';
    try {
      const result = await acceptInviteById(inviteId);
      status.textContent = `Joined workspace ${result.workspaceId} as ${result.role}.`;
      actions.replaceChildren(linkToApp('Continue to editor'));
    } catch (err) {
      status.textContent = err instanceof Error ? err.message : 'Accept failed';
      acceptBtn.disabled = false;
    }
  });

  actions.append(acceptBtn, document.createTextNode(' '), linkToApp('Open editor'));
  main.append(heading, text, status, actions);
  app.append(main);
}

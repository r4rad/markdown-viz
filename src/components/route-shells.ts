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

/** Public marketing entry. Full landing UI is added in the landing-page task. */
export function mountLandingEntry(): void {
  const app = entryRoot();
  const main = document.createElement('main');
  main.className = 'route-entry-main';
  main.dataset.route = 'landing';

  const heading = document.createElement('h1');
  heading.textContent = 'MarkdownViz';

  const text = document.createElement('p');
  text.textContent = 'Markdown workspace for teams.';

  main.append(heading, text, linkToApp('Open editor'));
  app.append(main);
}

/** Invite route shell. Server-validated acceptance is a later task. */
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
  text.append('Invite ', code, ' is open on this page.');

  main.append(heading, text, linkToApp('Continue to editor'));
  app.append(main);
}

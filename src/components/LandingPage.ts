import '../styles/landing.css';
import { icon } from './icons';
import { on } from '../lib/events';
import {
  initFirebase,
  isAuthenticated,
  isFirebaseReady,
  signInWithGitHub,
  signInWithGoogle,
} from '../lib/auth';

const WORKSPACE_INTENT_KEY = 'mv-landing-workspace-intent';

type Navigate = (path: string) => void;

const features = [
  {
    title: 'Team docs',
    body: 'Keep specs, decisions, and notes in one markdown workspace shared by product and engineering.',
  },
  {
    title: 'Realtime collaboration',
    body: 'Write in the same document together. Edits merge without last-write-wins overwrites.',
  },
  {
    title: 'Diagrams',
    body: 'Render Mermaid and Graphviz diagrams next to the writing, in the same document.',
  },
  {
    title: 'GitHub sync',
    body: 'Mirror the workspace onto a GitHub branch so the docs stay beside the code.',
  },
] as const;

const steps = [
  {
    title: 'Create or join',
    body: 'Start a team workspace or join one you were invited to. Sign in when the space is shared.',
  },
  {
    title: 'Write together',
    body: 'Open the editor and draft team docs with the people in that workspace.',
  },
  {
    title: 'Sync to GitHub',
    body: 'Keep the markdown tree aligned with the repository sync branch.',
  },
] as const;

function defaultNavigate(path: string): void {
  window.location.assign(path);
}

function markWorkspaceIntent(): void {
  sessionStorage.setItem(WORKSPACE_INTENT_KEY, '1');
}

function clearWorkspaceIntent(): void {
  sessionStorage.removeItem(WORKSPACE_INTENT_KEY);
}

function hasWorkspaceIntent(): boolean {
  return sessionStorage.getItem(WORKSPACE_INTENT_KEY) === '1';
}

/** Marketing page for `/`. The editor shell stays on `/app`. */
export function mountLandingPage(
  root: HTMLElement,
  navigate: Navigate = defaultNavigate,
): void {
  initFirebase();
  root.className = 'route-entry';
  root.replaceChildren();
  root.append(createLandingPage(() => startCreateOrJoin(navigate)));
  watchWorkspaceIntent(navigate);
}

function watchWorkspaceIntent(navigate: Navigate): void {
  const resume = () => {
    if (!hasWorkspaceIntent() || !isAuthenticated()) return;
    clearWorkspaceIntent();
    navigate('/app');
  };
  resume();
  on('auth-changed', (profile) => {
    if (profile) resume();
  });
}

function startCreateOrJoin(navigate: Navigate): void {
  markWorkspaceIntent();
  if (isAuthenticated()) {
    clearWorkspaceIntent();
    navigate('/app');
    return;
  }
  openCreateJoinDialog(navigate);
}

function createLandingPage(onPrimary: () => void): HTMLElement {
  const page = document.createElement('div');
  page.className = 'landing';
  page.dataset.route = 'landing';
  page.append(createNav(onPrimary), createMain(onPrimary));
  return page;
}

function createNav(onPrimary: () => void): HTMLElement {
  const header = document.createElement('header');
  header.className = 'landing-nav';

  const brand = document.createElement('a');
  brand.className = 'landing-brand';
  brand.href = '/';
  brand.textContent = 'MarkdownViz';

  const links = document.createElement('nav');
  links.className = 'landing-nav-links';
  links.append(anchor('#features', 'Features'), anchor('#how-it-works', 'How it works'));

  const actions = document.createElement('div');
  actions.className = 'landing-nav-actions';
  actions.append(guestLink('Open editor'), primaryButton('Create or join workspace', onPrimary));

  header.append(brand, links, actions);
  return header;
}

function createMain(onPrimary: () => void): HTMLElement {
  const main = document.createElement('main');
  main.append(createHero(onPrimary), createFeatures(), createHowItWorks(), createClosing(onPrimary));
  return main;
}

function createHero(onPrimary: () => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-hero';

  const copy = document.createElement('div');
  copy.className = 'landing-hero-copy';

  const kicker = document.createElement('p');
  kicker.className = 'landing-kicker';
  kicker.textContent = 'Markdown workspace for teams';

  const heading = document.createElement('h1');
  heading.textContent = 'Team docs, diagrams, and GitHub in one place.';

  const lead = document.createElement('p');
  lead.className = 'landing-lead';
  lead.textContent = 'Write the specs your team actually uses. Collaborate in realtime, keep diagrams beside the prose, and sync the workspace to GitHub.';

  const actions = document.createElement('div');
  actions.className = 'landing-hero-actions';
  actions.append(
    primaryButton('Create or join workspace', onPrimary),
    guestLink('Open editor'),
  );

  const note = document.createElement('p');
  note.className = 'landing-note';
  note.textContent = 'Open editor starts a guest session. No account required.';

  copy.append(kicker, heading, lead, actions, note);
  section.append(copy, createPreview());
  return section;
}

function createPreview(): HTMLElement {
  const preview = document.createElement('aside');
  preview.className = 'landing-preview';
  preview.setAttribute('aria-hidden', 'true');

  const bar = document.createElement('div');
  bar.className = 'landing-preview-bar';
  bar.textContent = 'Architecture notes';

  const body = document.createElement('div');
  body.className = 'landing-preview-body';
  body.innerHTML = [
    '<p><strong>Team docs</strong> live in the workspace, not in a personal scratch file.</p>',
    '<p>Collaboration stays on the document. Diagrams render in the preview.</p>',
    '<pre>graph LR\n  Spec --> Review\n  Review --> GitHub</pre>',
  ].join('');

  preview.append(bar, body);
  return preview;
}

function createFeatures(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'features';
  section.className = 'landing-section';

  const heading = document.createElement('h2');
  heading.textContent = 'Built for a team workspace';

  const grid = document.createElement('div');
  grid.className = 'landing-feature-grid';
  for (const feature of features) {
    const card = document.createElement('article');
    card.className = 'landing-feature';
    const title = document.createElement('h3');
    title.textContent = feature.title;
    const text = document.createElement('p');
    text.textContent = feature.body;
    card.append(title, text);
    grid.append(card);
  }

  section.append(heading, grid);
  return section;
}

function createHowItWorks(): HTMLElement {
  const section = document.createElement('section');
  section.id = 'how-it-works';
  section.className = 'landing-section';

  const heading = document.createElement('h2');
  heading.textContent = 'How it works';

  const list = document.createElement('ol');
  list.className = 'landing-steps';
  steps.forEach((step, index) => {
    const item = document.createElement('li');
    const indexEl = document.createElement('span');
    indexEl.className = 'landing-step-index';
    indexEl.textContent = String(index + 1);
    const title = document.createElement('h3');
    title.textContent = step.title;
    const text = document.createElement('p');
    text.textContent = step.body;
    item.append(indexEl, title, text);
    list.append(item);
  });

  section.append(heading, list);
  return section;
}

function createClosing(onPrimary: () => void): HTMLElement {
  const section = document.createElement('section');
  section.className = 'landing-closing';

  const heading = document.createElement('h2');
  heading.textContent = 'Start a workspace, or open the editor.';

  const actions = document.createElement('div');
  actions.className = 'landing-hero-actions';
  actions.append(
    primaryButton('Create or join workspace', onPrimary),
    guestLink('Open editor'),
  );

  section.append(heading, actions);
  return section;
}

function anchor(href: string, label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = label;
  return link;
}

function guestLink(label: string): HTMLAnchorElement {
  const link = document.createElement('a');
  link.className = 'landing-btn landing-btn-ghost';
  link.href = '/app';
  link.dataset.cta = 'guest-editor';
  link.textContent = label;
  return link;
}

function primaryButton(label: string, onPrimary: () => void): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-btn landing-btn-primary';
  button.dataset.cta = 'create-join';
  button.textContent = label;
  button.addEventListener('click', onPrimary);
  return button;
}

function openCreateJoinDialog(navigate: Navigate): void {
  if (document.getElementById('landing-auth')) return;

  const backdrop = document.createElement('div');
  backdrop.id = 'landing-auth';
  backdrop.className = 'landing-auth';

  const panel = document.createElement('div');
  panel.className = 'landing-auth-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  panel.setAttribute('aria-labelledby', 'landing-auth-title');

  const title = document.createElement('h2');
  title.id = 'landing-auth-title';
  title.textContent = 'Create or join a workspace';

  const text = document.createElement('p');
  text.textContent = isFirebaseReady()
    ? 'Sign in to create a team workspace or join one you were invited to. You will continue to the editor.'
    : 'Sign-in is not configured in this build. Continue to the editor to work locally.';

  const error = document.createElement('p');
  error.className = 'landing-auth-error';
  error.hidden = true;

  const actions = document.createElement('div');
  actions.className = 'landing-auth-actions';

  const close = () => {
    clearWorkspaceIntent();
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') close();
  };

  if (isFirebaseReady()) {
    actions.append(
      providerButton('github', 'Continue with GitHub', () => signInWithGitHub(), error, navigate),
      providerButton('google', 'Continue with Google', () => signInWithGoogle(), error, navigate),
    );
  } else {
    const cont = document.createElement('button');
    cont.type = 'button';
    cont.className = 'landing-btn landing-btn-primary';
    cont.textContent = 'Continue to editor';
    cont.addEventListener('click', () => {
      clearWorkspaceIntent();
      navigate('/app');
    });
    actions.append(cont);
  }

  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'landing-btn landing-btn-ghost';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', close);

  panel.append(title, text, error, actions, cancel);
  backdrop.append(panel);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.append(backdrop);
  (panel.querySelector('button') as HTMLButtonElement | null)?.focus();
}

function providerButton(
  name: 'github' | 'google',
  label: string,
  signIn: () => Promise<void>,
  error: HTMLElement,
  navigate: Navigate,
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'landing-btn landing-btn-provider';
  button.innerHTML = `${icon(name)}<span>${label}</span>`;
  button.addEventListener('click', async () => {
    button.disabled = true;
    error.hidden = true;
    markWorkspaceIntent();
    try {
      await signIn();
      if (isAuthenticated()) {
        clearWorkspaceIntent();
        navigate('/app');
        return;
      }
      button.disabled = false;
    } catch (err) {
      console.error('Sign-in error:', err);
      error.textContent = 'Sign-in did not finish. Try again.';
      error.hidden = false;
      button.disabled = false;
    }
  });
  return button;
}

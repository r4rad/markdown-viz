import { currentProfile } from './AuthUI';
import { submitFeedback } from '../lib/feedback';

let overlayEl: HTMLElement | null = null;

export function openFeedbackModal(): void {
  if (overlayEl) return;

  // ── Overlay ────────────────────────────────────────────────────────────
  overlayEl = document.createElement('div');
  overlayEl.className = 'feedback-modal-overlay';
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeModal();
  });

  // ── Panel ──────────────────────────────────────────────────────────────
  const modal = document.createElement('div');
  modal.className = 'feedback-modal';

  // ── Header ─────────────────────────────────────────────────────────────
  const header = document.createElement('div');
  header.className = 'settings-header';
  header.innerHTML = `
    <span class="settings-title">💬 Feedback</span>
    <button class="settings-close" title="Close">×</button>
  `;
  header.querySelector<HTMLButtonElement>('.settings-close')!
    .addEventListener('click', closeModal);

  // ── Form ───────────────────────────────────────────────────────────────
  const form = document.createElement('form');
  form.className = 'feedback-form';

  // Name
  const nameInput = createInput('text', 'fb-name', 'Your name');
  if (currentProfile?.displayName) {
    nameInput.value = currentProfile.displayName;
  } else {
    nameInput.required = true;
  }
  form.appendChild(createField('Name', nameInput));

  // Email
  const emailInput = createInput('email', 'fb-email', 'your@email.com');
  if (currentProfile?.email) {
    emailInput.value = currentProfile.email;
  } else {
    emailInput.required = true;
  }
  form.appendChild(createField('Email', emailInput));

  // Rating
  let currentRating = 0;
  const starContainer = document.createElement('div');
  starContainer.className = 'star-rating';
  const stars: HTMLButtonElement[] = [];

  const updateStars = (preview = currentRating) => {
    stars.forEach((s, i) => s.classList.toggle('active', i < preview));
  };

  for (let i = 1; i <= 5; i++) {
    const star = document.createElement('button');
    star.type = 'button';
    star.className = 'star';
    star.textContent = '★';
    star.setAttribute('aria-label', `Rate ${i} out of 5`);
    star.addEventListener('mouseenter', () => updateStars(i));
    star.addEventListener('mouseleave', () => updateStars());
    star.addEventListener('click', () => { currentRating = i; updateStars(); });
    stars.push(star);
    starContainer.appendChild(star);
  }
  const ratingField = document.createElement('div');
  ratingField.className = 'feedback-field';
  ratingField.appendChild(createLabel('Rating'));
  ratingField.appendChild(starContainer);
  form.appendChild(ratingField);

  // Message
  const textarea = document.createElement('textarea');
  textarea.id = 'fb-message';
  textarea.className = 'feedback-textarea';
  textarea.placeholder = 'Your feedback…';
  textarea.required = true;
  textarea.rows = 4;
  form.appendChild(createField('Message', textarea));

  // Status
  const statusEl = document.createElement('div');
  statusEl.className = 'feedback-status';
  statusEl.hidden = true;
  form.appendChild(statusEl);

  // Submit
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'feedback-submit';
  submitBtn.textContent = 'Send Feedback';
  form.appendChild(submitBtn);

  // ── Submit handler ─────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name    = nameInput.value.trim();
    const email   = emailInput.value.trim();
    const message = textarea.value.trim();

    if (!message) { textarea.focus(); return; }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';
    statusEl.hidden = true;

    const ok = await submitFeedback({
      name,
      email,
      rating:    currentRating,
      message,
      userId:    currentProfile?.uid ?? null,
      createdAt: Date.now(),
      userAgent: navigator.userAgent,
      url:       location.href,
    });

    if (ok) {
      statusEl.textContent = '✅ Thank you!';
      statusEl.className = 'feedback-status feedback-status--success';
      statusEl.hidden = false;
      submitBtn.hidden = true;
      setTimeout(closeModal, 2000);
    } else {
      statusEl.textContent = '❌ Failed — try again';
      statusEl.className = 'feedback-status feedback-status--error';
      statusEl.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Feedback';
    }
  });

  modal.appendChild(header);
  modal.appendChild(form);
  overlayEl.appendChild(modal);
  document.body.appendChild(overlayEl);
}

function closeModal(): void {
  overlayEl?.remove();
  overlayEl = null;
}

function createLabel(text: string, htmlFor?: string): HTMLLabelElement {
  const label = document.createElement('label');
  label.textContent = text;
  if (htmlFor) label.htmlFor = htmlFor;
  return label;
}

function createInput(type: string, id: string, placeholder: string): HTMLInputElement {
  const input = document.createElement('input');
  input.type = type;
  input.id = id;
  input.placeholder = placeholder;
  return input;
}

function createField(labelText: string, control: HTMLElement): HTMLDivElement {
  const field = document.createElement('div');
  field.className = 'feedback-field';
  const id = (control as HTMLInputElement).id;
  field.appendChild(createLabel(labelText, id || undefined));
  field.appendChild(control);
  return field;
}

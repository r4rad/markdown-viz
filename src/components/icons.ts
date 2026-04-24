const ICONS: Record<string, string> = {
  logo: `<svg viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="6" fill="currentColor"/><path d="M8 22V10l4 4 4-4v12" stroke="var(--bg-primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M20 14h4m-4 4h4" stroke="var(--bg-primary)" stroke-width="2" stroke-linecap="round"/></svg>`,
  plus: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="8" y1="3" x2="8" y2="13"/><line x1="3" y1="8" x2="13" y2="8"/></svg>`,
  x: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="4" x2="12" y2="12"/><line x1="12" y1="4" x2="4" y2="12"/></svg>`,
  bold: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2h5a3 3 0 0 1 0 6H4zm0 6h6a3 3 0 0 1 0 6H4z"/></svg>`,
  italic: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="10" y1="2" x2="6" y2="14"/><line x1="6" y1="2" x2="12" y2="2"/><line x1="4" y1="14" x2="10" y2="14"/></svg>`,
  code: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="5,3 1,8 5,13"/><polyline points="11,3 15,8 11,13"/></svg>`,
  link: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M7 9a3 3 0 0 0 4.24 0l2-2a3 3 0 0 0-4.24-4.24l-1 1"/><path d="M9 7a3 3 0 0 0-4.24 0l-2 2a3 3 0 0 0 4.24 4.24l1-1"/></svg>`,
  image: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><circle cx="5" cy="6" r="1.5"/><path d="M1.5 11l3.5-4 3 3 2-2 4 4"/></svg>`,
  list: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="6" y1="4" x2="14" y2="4"/><line x1="6" y1="8" x2="14" y2="8"/><line x1="6" y1="12" x2="14" y2="12"/><circle cx="3" cy="4" r="1" fill="currentColor"/><circle cx="3" cy="8" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/></svg>`,
  table: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.5" y="2" width="13" height="12" rx="1.5"/><line x1="1.5" y1="6" x2="14.5" y2="6"/><line x1="1.5" y1="10" x2="14.5" y2="10"/><line x1="6" y1="2" x2="6" y2="14"/><line x1="10.5" y1="2" x2="10.5" y2="14"/></svg>`,
  eye: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2.5"/></svg>`,
  edit: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M11.5 1.5l3 3L5 14H2v-3z"/></svg>`,
  columns: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="2" width="14" height="12" rx="1.5"/><line x1="8" y1="2" x2="8" y2="14"/></svg>`,
  sync: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 8a6 6 0 0 1 10.5-4"/><path d="M14 8a6 6 0 0 1-10.5 4"/><polyline points="12,1 13,4 10,4"/><polyline points="4,12 3,15 6,15"/></svg>`,
  download: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2v9m0 0l-3-3m3 3l3-3"/><path d="M2 12v2h12v-2"/></svg>`,
  upload: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 11V2m0 0L5 5m3-3l3 3"/><path d="M2 12v2h12v-2"/></svg>`,
  wand: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 14L10 6l2-2"/><path d="M10 2l4 4"/><circle cx="4" cy="3" r="0.5" fill="currentColor"/><circle cx="13" cy="7" r="0.5" fill="currentColor"/><circle cx="12" cy="12" r="0.5" fill="currentColor"/></svg>`,
  palette: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.36-.6-.36-.99 0-.83.67-1.5 1.5-1.5H11c2.76 0 4-1.57 4-4 0-3.31-3.13-6-7-6z"/><circle cx="4.5" cy="7" r="1" fill="currentColor"/><circle cx="6.5" cy="4.5" r="1" fill="currentColor"/><circle cx="9.5" cy="4.5" r="1" fill="currentColor"/><circle cx="11.5" cy="7" r="1" fill="currentColor"/></svg>`,
  user: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.5-5 6-5s6 2 6 5"/></svg>`,
  github: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>`,
  google: `<svg viewBox="0 0 16 16"><path d="M15.68 8.18c0-.57-.05-1.11-.15-1.64H8v3.1h4.3a3.68 3.68 0 0 1-1.6 2.42v2h2.58c1.51-1.4 2.38-3.45 2.38-5.88z" fill="#4285F4"/><path d="M8 16c2.16 0 3.97-.72 5.3-1.94l-2.59-2a4.78 4.78 0 0 1-7.15-2.52H.93v2.06A8 8 0 0 0 8 16z" fill="#34A853"/><path d="M3.56 9.52a4.8 4.8 0 0 1 0-3.06V4.4H.93a8 8 0 0 0 0 7.18l2.63-2.06z" fill="#FBBC05"/><path d="M8 3.18c1.22 0 2.31.42 3.17 1.24l2.38-2.38A7.97 7.97 0 0 0 .93 4.4l2.63 2.06A4.77 4.77 0 0 1 8 3.18z" fill="#EA4335"/></svg>`,
  zoomIn: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/><line x1="7" y1="5" x2="7" y2="9"/></svg>`,
  zoomOut: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="5"/><line x1="11" y1="11" x2="14" y2="14"/><line x1="5" y1="7" x2="9" y2="7"/></svg>`,
  reset: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2v5h5"/><path d="M2 7C3.5 3.5 6 2 8.5 2A5.5 5.5 0 1 1 3 8"/></svg>`,
  save: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M13 14H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1h8l3 3v9a1 1 0 0 1-1 1z"/><path d="M5 14V9h6v5"/><path d="M5 2v3h4"/></svg>`,
  heading: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 2v12M13 2v12M3 8h10"/></svg>`,
  quote: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M3 3h4l-1 4H4l-1 6H1l1-6V3zm7 0h4l-1 4h-2l-1 6H8l1-6V3z"/></svg>`,
  hr: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="2" y1="8" x2="14" y2="8"/></svg>`,
  checklist: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="2" width="4" height="4" rx="0.5"/><path d="M2 4.5l1 1 2-2.5"/><line x1="7" y1="4" x2="15" y2="4"/><rect x="1" y="10" width="4" height="4" rx="0.5"/><line x1="7" y1="12" x2="15" y2="12"/></svg>`,
  gear: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="8" cy="8" r="2.5"/><path d="M8 1l.7 2.2a4.5 4.5 0 0 1 1.8 1l2.1-.7 1 1.7-1.4 1.6a4.5 4.5 0 0 1 0 2.1l1.4 1.6-1 1.7-2.1-.7a4.5 4.5 0 0 1-1.8 1L8 15l-.7-2.2a4.5 4.5 0 0 1-1.8-1l-2.1.7-1-1.7 1.4-1.6a4.5 4.5 0 0 1 0-2.1L2.4 5.5l1-1.7 2.1.7a4.5 4.5 0 0 1 1.8-1L8 1z"/></svg>`,
  'cloud-sync': `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="cloud-sync-icon"><path class="cloud-body" d="M17 18H6a4 4 0 0 1-.85-7.91A5.5 5.5 0 0 1 16.13 9 3.5 3.5 0 0 1 18.5 15H17z"/><line class="drop drop-1" x1="8" y1="20" x2="8" y2="22" stroke-linecap="round" opacity="0"/><line class="drop drop-2" x1="12" y1="20" x2="12" y2="22" stroke-linecap="round" opacity="0"/><line class="drop drop-3" x1="16" y1="20" x2="16" y2="22" stroke-linecap="round" opacity="0"/><circle class="vapor vapor-1" cx="9" cy="20" r="0.8" fill="currentColor" opacity="0"/><circle class="vapor vapor-2" cx="12" cy="21" r="0.8" fill="currentColor" opacity="0"/><circle class="vapor vapor-3" cx="15" cy="20" r="0.8" fill="currentColor" opacity="0"/></svg>`,
  star: `<svg viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.5 4H14l-3.5 2.5 1.3 4L8 9 4.2 11.5l1.3-4L2 5h4.5z"/></svg>`,
  chat: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M14 2H2a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h3l2 2.5L9 12h5a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z"/></svg>`,
  rename: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M11 2l3 3-8 8H3v-3z"/><path d="M9 4l3 3"/></svg>`,
  share: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="12" cy="3" r="2"/><circle cx="4" cy="8" r="2"/><circle cx="12" cy="13" r="2"/><line x1="5.8" y1="7" x2="10.2" y2="4"/><line x1="5.8" y1="9" x2="10.2" y2="12"/></svg>`,
  copy: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="5" y="5" width="9" height="9" rx="1"/><path d="M3 11V3a1 1 0 0 1 1-1h8"/></svg>`,
  cursor: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 2v12"/><path d="M5 14h6"/><path d="M4 5h8"/></svg>`,
  'doc-edit': `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="2" width="14" height="12" rx="1.5"/><path d="M7 12L11 8L12.5 9.5L8.5 13Z"/><line x1="11" y1="8" x2="12.5" y2="6.5" stroke-linecap="round"/></svg>`,
  'scroll-link': `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="2" width="5" height="12" rx="1"/><rect x="10" y="2" width="5" height="12" rx="1"/><path d="M6 6h4M6 10h4" stroke-dasharray="1.5 1.5"/><circle cx="3.5" cy="6" r="0.7" fill="currentColor"/><circle cx="12.5" cy="6" r="0.7" fill="currentColor"/></svg>`,
  play: `<svg viewBox="0 0 16 16" fill="currentColor"><polygon points="4,2 14,8 4,14"/></svg>`,
  pause: `<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="4" height="12" rx="1"/><rect x="9" y="2" width="4" height="12" rx="1"/></svg>`,
  stop: `<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="3" width="10" height="10" rx="1.5"/></svg>`,
  users: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="5" r="2.5"/><path d="M1 13c0-2.5 2-4 5-4s5 1.5 5 4"/><circle cx="11.5" cy="5" r="2"/><path d="M13 10c1.5.5 2.5 1.5 2.5 3"/></svg>`,
};

export function icon(name: string, cls = ''): string {
  return `<span class="icon ${cls}">${ICONS[name] || ''}</span>`;
}

export function iconEl(name: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.className = 'icon';
  span.innerHTML = ICONS[name] || '';
  return span;
}

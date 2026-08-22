const CONF_KEY = 'markdownviz-confluence-token';
const NOTION_KEY = 'markdownviz-notion-token';

let confluenceMem: string | null = null;
let notionMem: string | null = null;

export function setConfluenceToken(token: string | null): void {
  confluenceMem = token;
  try {
    if (!token) sessionStorage.removeItem(CONF_KEY);
    else sessionStorage.setItem(CONF_KEY, token);
  } catch { /* ignore */ }
}

export function getConfluenceToken(): string | null {
  if (confluenceMem) return confluenceMem;
  try { return sessionStorage.getItem(CONF_KEY); } catch { return null; }
}

export function setNotionToken(token: string | null): void {
  notionMem = token;
  try {
    if (!token) sessionStorage.removeItem(NOTION_KEY);
    else sessionStorage.setItem(NOTION_KEY, token);
  } catch { /* ignore */ }
}

export function getNotionToken(): string | null {
  if (notionMem) return notionMem;
  try { return sessionStorage.getItem(NOTION_KEY); } catch { return null; }
}

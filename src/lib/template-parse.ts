export type { DocType, TemplateMeta, TemplateSettings, ParsedTemplate, TemplatePack } from '../types';

export function parseFrontmatter(raw: string): { fields: Record<string, string>; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: raw };
  const fields: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) fields[key] = value;
  }
  return { fields, body: match[2] };
}

export function substitutePlaceholders(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (token, key: string) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : token;
  });
}

export function fileNameFromTitle(title: string): string {
  const base = title.replace(/[<>:"/\\|?*]/g, '').trim() || 'untitled';
  return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
}

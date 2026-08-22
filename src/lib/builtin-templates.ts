import type { DocType, FileTab, ParsedTemplate, TemplateMeta, TemplatePack } from '../types';
import { parseFrontmatter } from './template-parse';

import prd from '../../templates/engineering/prd.md?raw';
import brd from '../../templates/engineering/brd.md?raw';
import taskBreakdown from '../../templates/engineering/task_breakdown.md?raw';
import architecture from '../../templates/engineering/architecture.md?raw';
import meetingNotes from '../../templates/engineering/meeting_notes.md?raw';
import contentPlan from '../../templates/marketing/content_plan.md?raw';
import strategy from '../../templates/marketing/strategy.md?raw';
import contentCalendar from '../../templates/marketing/content_calendar.md?raw';
import note from '../../templates/learner/note.md?raw';
import research from '../../templates/learner/research.md?raw';

const BUILTINS: Record<string, string> = {
  'engineering/prd': prd,
  'engineering/brd': brd,
  'engineering/task_breakdown': taskBreakdown,
  'engineering/architecture': architecture,
  'engineering/meeting_notes': meetingNotes,
  'marketing/content_plan': contentPlan,
  'marketing/strategy': strategy,
  'marketing/content_calendar': contentCalendar,
  'learner/note': note,
  'learner/research': research,
};

function parseBuiltin(id: string, raw: string): ParsedTemplate {
  const { fields, body } = parseFrontmatter(raw);
  const pack = (fields.pack || 'engineering') as TemplatePack;
  const docType = (fields.docType || 'note') as DocType;
  return {
    raw,
    body,
    meta: {
      id,
      pack,
      docType,
      title: fields.titlePattern?.replace(/\{\{title\}\}/g, 'Untitled') || docType,
      titlePattern: fields.titlePattern || '{{title}}',
      default: fields.default === 'true',
      source: 'builtin',
    },
  };
}

export function loadBuiltInTemplates(): ParsedTemplate[] {
  return Object.entries(BUILTINS).map(([id, raw]) => parseBuiltin(id, raw));
}

export function parseWorkspaceOverride(tab: FileTab, templatesFolderId: string): ParsedTemplate | null {
  if (tab.folderId !== templatesFolderId) return null;
  const { fields, body } = parseFrontmatter(tab.content);
  if (!fields.docType) return null;
  const docType = fields.docType as DocType;
  return {
    raw: tab.content,
    body,
    meta: {
      id: `workspace/${tab.id}`,
      pack: (fields.pack || 'engineering') as TemplatePack,
      docType,
      title: tab.name,
      titlePattern: fields.titlePattern || '{{title}}',
      default: fields.default === 'true',
      source: 'workspace',
    },
  };
}

export function listTemplates(tabs: FileTab[], templatesFolderId: string | undefined): ParsedTemplate[] {
  const builtins = loadBuiltInTemplates();
  const overrides = templatesFolderId
    ? tabs.map(t => parseWorkspaceOverride(t, templatesFolderId)).filter((x): x is ParsedTemplate => !!x)
    : [];
  const preferred = new Map<DocType, ParsedTemplate>();
  for (const t of builtins) preferred.set(t.meta.docType, t);
  for (const t of overrides) {
    if (t.meta.default) preferred.set(t.meta.docType, t);
  }
  const listed: ParsedTemplate[] = [...preferred.values()];
  for (const t of overrides) {
    if (!listed.some(x => x.meta.id === t.meta.id)) listed.push(t);
  }
  return listed.sort((a, b) => a.meta.pack.localeCompare(b.meta.pack) || a.meta.docType.localeCompare(b.meta.docType));
}

export function findTemplate(
  templates: ParsedTemplate[],
  idOrType: string,
): ParsedTemplate | undefined {
  return templates.find(t => t.meta.id === idOrType || t.meta.docType === idOrType);
}

export function toTemplateListItem(t: ParsedTemplate): TemplateMeta {
  return t.meta;
}

import type { DocType, FileTab, FolderId, TemplateSettings, WorkspaceFolder } from '../types';
import { fileNameFromTitle, substitutePlaceholders } from './template-parse';
import { ensureDefaultFolders, resolveFolderId } from './template-folders';
import { findTemplate, listTemplates } from './builtin-templates';

export interface InstantiateVars {
  title: string;
  date?: string;
  author?: string;
  workspace?: string;
  url?: string;
}

export interface InstantiateResult {
  name: string;
  content: string;
  folderId: FolderId;
  folders: WorkspaceFolder[];
  docType: DocType;
}

export function instantiateTemplate(input: {
  folders: WorkspaceFolder[];
  tabs: FileTab[];
  settings: TemplateSettings;
  templateIdOrDocType: string;
  vars: InstantiateVars;
  folderId?: FolderId;
}): InstantiateResult {
  const ensured = ensureDefaultFolders(input.folders);
  const templatesFolderId = ensured.ids.templates;
  const templates = listTemplates(input.tabs, templatesFolderId);
  const tpl = findTemplate(templates, input.templateIdOrDocType);
  if (!tpl) throw new Error('Template not found');
  const date = input.vars.date ?? new Date().toISOString().slice(0, 10);
  const vars: Record<string, string> = {
    title: input.vars.title,
    date,
    author: input.vars.author ?? '',
    workspace: input.vars.workspace ?? '',
  };
  if (input.vars.url !== undefined) vars.url = input.vars.url;
  const title = substitutePlaceholders(tpl.meta.titlePattern, vars);
  const content = substitutePlaceholders(tpl.body.replace(/^\n/, ''), { ...vars, url: input.vars.url ?? '{{url}}' });
  const folderId = input.folderId && ensured.folders.some(f => f.id === input.folderId)
    ? input.folderId
    : resolveFolderId(ensured.folders, input.settings, tpl.meta.docType);
  return {
    name: fileNameFromTitle(title),
    content,
    folderId,
    folders: ensured.folders,
    docType: tpl.meta.docType,
  };
}

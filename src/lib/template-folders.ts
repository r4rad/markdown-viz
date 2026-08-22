import type { DocType, FolderId, TemplateSettings, WorkspaceFolder } from '../types';
import { createFolder } from './workspace';

export const DEFAULT_FOLDER_NAMES = {
  engineering: 'Engineering',
  marketing: 'Marketing',
  notes: 'Notes',
  research: 'Research',
  templates: 'Templates',
} as const;

const DOC_TYPE_FOLDER: Record<DocType, 'engineering' | 'marketing' | 'notes' | 'research'> = {
  prd: 'engineering',
  brd: 'engineering',
  task_breakdown: 'engineering',
  architecture: 'engineering',
  meeting_notes: 'engineering',
  content_plan: 'marketing',
  strategy: 'marketing',
  content_calendar: 'marketing',
  note: 'notes',
  research: 'research',
};

export function emptyTemplateSettings(): TemplateSettings {
  return { folderByDocType: {} };
}

export function findFolder(
  folders: WorkspaceFolder[],
  name: string,
  parentId: FolderId | null,
): WorkspaceFolder | undefined {
  return folders.find(f => f.name === name && f.parentId === parentId);
}

export function ensureDefaultFolders(
  folders: WorkspaceFolder[],
  now = Date.now(),
): { folders: WorkspaceFolder[]; ids: Record<string, FolderId> } {
  let next = folders;
  const ensure = (name: string, parentId: FolderId | null, idHint: string): FolderId => {
    const existing = findFolder(next, name, parentId);
    if (existing) return existing.id;
    next = createFolder(next, { name, parentId, now, id: idHint });
    return next[next.length - 1].id;
  };
  const engineering = ensure(DEFAULT_FOLDER_NAMES.engineering, null, 'folder-engineering');
  const marketing = ensure(DEFAULT_FOLDER_NAMES.marketing, null, 'folder-marketing');
  const notes = ensure(DEFAULT_FOLDER_NAMES.notes, null, 'folder-notes');
  const research = ensure(DEFAULT_FOLDER_NAMES.research, notes, 'folder-research');
  const templates = ensure(DEFAULT_FOLDER_NAMES.templates, null, 'folder-templates');
  return {
    folders: next,
    ids: { engineering, marketing, notes, research, templates },
  };
}

export function resolveFolderId(
  folders: WorkspaceFolder[],
  settings: TemplateSettings,
  docType: DocType,
): FolderId {
  if (docType === 'note' && settings.captureNoteFolderId) return settings.captureNoteFolderId;
  if (docType === 'research' && settings.captureResearchFolderId) return settings.captureResearchFolderId;
  const mapped = settings.folderByDocType[docType];
  if (mapped && folders.some(f => f.id === mapped)) return mapped;
  const ensured = ensureDefaultFolders(folders);
  const key = DOC_TYPE_FOLDER[docType];
  return ensured.ids[key];
}

import type { DocType, TemplateSettings } from '../types';
import {
  addTab,
  canEditActiveWorkspace,
  getState,
  replaceFolders,
  setTabDirty,
  setTemplateSettings as setSettingsState,
} from './state';
import { instantiateTemplate } from './instantiate-template';
import { ensureDefaultFolders } from './template-folders';
import { listTemplates } from './builtin-templates';
import { getCurrentUser } from './auth';
import { isFirebaseConfigured } from './firebase-config';
import { getApp } from 'firebase/app';
import { getFirestore, doc, setDoc, getDoc } from 'firebase/firestore';
import { debouncedSave } from './storage';

export function ensurePackFolders(): void {
  const { folders } = ensureDefaultFolders(getState().folders);
  replaceFolders(folders);
}

export function createFromTemplate(input: {
  templateIdOrDocType: string;
  title: string;
  url?: string;
  folderId?: string;
  autoSave?: boolean;
}): { ok: true; fileId: string; folderId: string } | { ok: false; error: string } {
  if (!canEditActiveWorkspace()) {
    return { ok: false, error: 'Viewers cannot create documents from templates.' };
  }
  try {
    const state = getState();
    const user = getCurrentUser();
    const result = instantiateTemplate({
      folders: state.folders,
      tabs: state.tabs,
      settings: state.templateSettings,
      templateIdOrDocType: input.templateIdOrDocType,
      folderId: input.folderId,
      vars: {
        title: input.title,
        author: user?.displayName || user?.email || '',
        workspace: state.activeWorkspaceId === 'personal' ? 'Personal' : state.activeWorkspaceId,
        url: input.url,
      },
    });
    replaceFolders(result.folders);
    const tab = addTab(result.name, result.content, { folderId: result.folderId });
    if (input.autoSave) setTabDirty(tab.id, false);
    debouncedSave(getState());
    return { ok: true, fileId: tab.id, folderId: result.folderId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create from template.' };
  }
}

export function duplicateTemplateToWorkspace(docType: DocType): { ok: true; fileId: string } | { ok: false; error: string } {
  if (!canEditActiveWorkspace()) return { ok: false, error: 'Viewers cannot duplicate templates.' };
  const { folders, ids } = ensureDefaultFolders(getState().folders);
  replaceFolders(folders);
  const builtins = listTemplates([], ids.templates);
  const tpl = builtins.find(t => t.meta.docType === docType);
  if (!tpl) return { ok: false, error: 'Template not found' };
  const raw = tpl.raw.includes('default:')
    ? tpl.raw.replace(/default:\s*\w+/, 'default: true')
    : tpl.raw.replace(/^---\n/, '---\ndefault: true\n');
  const tab = addTab(`${tpl.meta.docType}.md`, raw, { folderId: ids.templates });
  setTabDirty(tab.id, false);
  debouncedSave(getState());
  return { ok: true, fileId: tab.id };
}

export async function persistTemplateSettings(settings: TemplateSettings): Promise<void> {
  setSettingsState(settings);
  const user = getCurrentUser();
  if (!isFirebaseConfigured() || !user) return;
  const db = getFirestore(getApp());
  const wsId = getState().activeWorkspaceId;
  if (wsId && wsId !== 'personal') {
    await setDoc(doc(db, 'workspaces', wsId, 'settings', 'templates'), settings);
  } else {
    await setDoc(doc(db, 'users', user.uid, 'settings', 'templates'), settings);
  }
}

export async function loadTemplateSettings(): Promise<void> {
  const user = getCurrentUser();
  if (!isFirebaseConfigured() || !user) return;
  const db = getFirestore(getApp());
  const wsId = getState().activeWorkspaceId;
  const ref = wsId && wsId !== 'personal'
    ? doc(db, 'workspaces', wsId, 'settings', 'templates')
    : doc(db, 'users', user.uid, 'settings', 'templates');
  const snap = await getDoc(ref);
  if (snap.exists()) setSettingsState(snap.data() as TemplateSettings);
}

export function listedTemplates() {
  const { folders, ids } = ensureDefaultFolders(getState().folders);
  return listTemplates(getState().tabs, ids.templates).map(t => t.meta);
}

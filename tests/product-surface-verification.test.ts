import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/lib/auth', () => ({
  initFirebase: vi.fn(),
  isAuthenticated: vi.fn(() => false),
  isFirebaseReady: vi.fn(() => true),
  signInWithGitHub: vi.fn(async () => {}),
  signInWithGoogle: vi.fn(async () => {}),
}));

import { isAuthenticated, isFirebaseReady } from '../src/lib/auth';
import { mountLandingPage } from '../src/components/LandingPage';
import { parseClientRoute } from '../src/lib/client-router';
import {
  rulesCanEditBody,
  rulesCanComment,
  rulesClientCanWriteBackendManagedCollection,
} from '../src/lib/firestore-rules-policy';
import {
  canWriteWorkspace,
  canCommentWorkspace,
  canManageMembers,
  canSyncWiki,
} from '../src/lib/workspace-acl';
import { filterMarkdownRelativePaths } from '../src/lib/import';
import { threeWayMerge } from '../src/lib/three-way-merge';
import {
  getActiveTab,
  setWorkspaceContext,
  updateTabContent,
} from '../src/lib/state';
import { on } from '../src/lib/events';
import type { FileTab, Role, WorkspaceFolder } from '../src/types';

/**
 * Wave 6 exit-criteria suite (task 6.3).
 * Covers ACL denials, sync conflict fixtures, landing route smoke,
 * plus roles/import checks that can run without a real browser pair.
 * Manual two-browser steps: docs/manual-two-browser-checklist.md
 */

const DENIED_WRITE_ROLES: Role[] = ['viewer', 'commentator'];
const ALLOWED_WRITE_ROLES: Role[] = ['owner', 'editor'];

function sampleWorkspace(role: Role): void {
  const folders: WorkspaceFolder[] = [
    { id: 'f1', name: 'Docs', parentId: null, createdAt: 1, updatedAt: 1 },
  ];
  const tabs: FileTab[] = [
    {
      id: 't1',
      name: 'doc.md',
      content: 'base',
      cursorPos: 0,
      scrollTop: 0,
      scrollPreview: 0,
      dirty: false,
      updatedAt: 1,
      createdAt: 1,
      folderId: 'f1',
      origin: { kind: 'local' },
    },
  ];
  setWorkspaceContext({ workspaceId: 'ws-verify', role, folders, tabs });
}

describe('product surface verification (exit criteria)', () => {
  describe('landing route smoke', () => {
    beforeEach(() => {
      document.body.innerHTML = '';
      sessionStorage.clear();
      vi.mocked(isAuthenticated).mockReturnValue(false);
      vi.mocked(isFirebaseReady).mockReturnValue(true);
    });

    it('maps / to landing and /app to the editor shell', () => {
      expect(parseClientRoute('/')).toEqual({ handler: 'landing' });
      expect(parseClientRoute('/app')).toEqual({ handler: 'app' });
    });

    it('mounts the marketing landing shell with CTA into /app', () => {
      const root = document.createElement('div');
      document.body.append(root);
      mountLandingPage(root, vi.fn());
      const page = root.querySelector('.landing');
      expect(page?.getAttribute('data-route')).toBe('landing');
      expect(root.querySelector('[data-cta="guest-editor"]')?.getAttribute('href')).toBe('/app');
      expect(root.querySelector('[data-cta="create-join"]')).toBeTruthy();
    });
  });

  describe('emulator ACL denials', () => {
    it('denies body writes for viewer and commentator (rules policy)', () => {
      for (const role of DENIED_WRITE_ROLES) {
        expect(rulesCanEditBody(role)).toBe(false);
        expect(canWriteWorkspace(role)).toBe(false);
      }
      for (const role of ALLOWED_WRITE_ROLES) {
        expect(rulesCanEditBody(role)).toBe(true);
        expect(canWriteWorkspace(role)).toBe(true);
      }
    });

    it('denies client writes to backend-managed collections', () => {
      for (const col of ['repoLinks', 'syncJobs', 'history', 'conflicts', 'invites'] as const) {
        expect(rulesClientCanWriteBackendManagedCollection(col)).toBe(false);
      }
    });

    it('blocks shared-workspace Markdown edits for viewer and commentator', () => {
      for (const role of DENIED_WRITE_ROLES) {
        sampleWorkspace(role);
        const errors: string[] = [];
        const off = on('workspace-error', (msg: unknown) => {
          errors.push(String(msg));
        });
        updateTabContent(getActiveTab()!.id, 'mutated');
        expect(getActiveTab()!.content).toBe('base');
        expect(errors.length).toBeGreaterThan(0);
        off();
      }
    });
  });

  describe('roles matrix', () => {
    it('commentator can comment; viewer cannot; only owner manages members', () => {
      expect(canCommentWorkspace('commentator')).toBe(true);
      expect(rulesCanComment('commentator')).toBe(true);
      expect(canCommentWorkspace('viewer')).toBe(false);
      expect(rulesCanComment('viewer')).toBe(false);
      expect(canManageMembers('owner')).toBe(true);
      expect(canManageMembers('editor')).toBe(false);
      expect(canSyncWiki('viewer')).toBe(false);
      expect(canSyncWiki('editor')).toBe(true);
    });
  });

  describe('import (markdown folder)', () => {
    it('keeps only markdown paths from a mixed directory listing', () => {
      expect(
        filterMarkdownRelativePaths([
          'docs/a.md',
          'docs/logo.png',
          'docs/b.mdx',
          'docs/data.json',
        ]),
      ).toEqual(['docs/a.md', 'docs/b.mdx']);
    });
  });

  describe('sync conflict fixtures', () => {
    it('flags overlapping edits and auto-merges non-overlapping ones', () => {
      const conflict = threeWayMerge('same\n', 'local\n', 'remote\n');
      expect(conflict.conflict).toBe(true);
      if (conflict.conflict) {
        expect(conflict.conflicted).toContain('<<<<<<< local');
        expect(conflict.conflicted).toContain('>>>>>>> remote');
      }

      const merged = threeWayMerge('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n');
      expect(merged.conflict).toBe(false);
      if (!merged.conflict) {
        expect(merged.merged).toContain('A');
        expect(merged.merged).toContain('C');
      }
    });
  });
});

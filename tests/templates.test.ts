import { describe, it, expect } from 'vitest';
import { parseFrontmatter, substitutePlaceholders } from '../src/lib/template-parse';
import { ensureDefaultFolders, emptyTemplateSettings } from '../src/lib/template-folders';
import { instantiateTemplate } from '../src/lib/instantiate-template';
import { loadBuiltInTemplates, listTemplates } from '../src/lib/builtin-templates';

describe('template engine', () => {
  it('substitutes known placeholders and keeps unknown tokens', () => {
    const out = substitutePlaceholders('Hi {{title}} {{unknown}}', { title: 'Doc' });
    expect(out).toBe('Hi Doc {{unknown}}');
  });

  it('parses YAML frontmatter', () => {
    const { fields, body } = parseFrontmatter('---\npack: engineering\ndocType: prd\n---\n# Body\n');
    expect(fields.pack).toBe('engineering');
    expect(fields.docType).toBe('prd');
    expect(body).toContain('# Body');
  });

  it('creates default pack folders when missing', () => {
    const { folders, ids } = ensureDefaultFolders([]);
    expect(folders.map(f => f.name).sort()).toEqual(['Engineering', 'Marketing', 'Notes', 'Research', 'Templates'].sort());
    expect(folders.find(f => f.id === ids.research)?.parentId).toBe(ids.notes);
  });

  it('places instantiated files in the mapped default folder', () => {
    const result = instantiateTemplate({
      folders: [],
      tabs: [],
      settings: emptyTemplateSettings(),
      templateIdOrDocType: 'prd',
      vars: { title: 'Search', author: 'Ada', workspace: 'Personal' },
    });
    const engineering = result.folders.find(f => f.name === 'Engineering');
    expect(result.folderId).toBe(engineering?.id);
    expect(result.content).toContain('# Search');
    expect(result.content).toContain('## Problem');
    expect(result.content).toContain('## Out of scope');
    expect(result.name).toMatch(/prd — search\.md/i);
  });

  it('research capture lands in Notes/Research and substitutes url', () => {
    const result = instantiateTemplate({
      folders: [],
      tabs: [],
      settings: emptyTemplateSettings(),
      templateIdOrDocType: 'research',
      vars: { title: 'Paper', url: 'https://example.com' },
    });
    const research = result.folders.find(f => f.name === 'Research');
    expect(result.folderId).toBe(research?.id);
    expect(result.content).toContain('https://example.com');
    expect(result.content).not.toContain('{{url}}');
  });

  it('prefers workspace override when default true', () => {
    const { folders, ids } = ensureDefaultFolders([]);
    const tabs = [{
      id: 'ov',
      name: 'custom.md',
      content: '---\npack: engineering\ndocType: prd\ndefault: true\ntitlePattern: "Custom {{title}}"\n---\n# Override\n',
      cursorPos: 0, scrollTop: 0, scrollPreview: 0, dirty: false, updatedAt: 1, createdAt: 1,
      folderId: ids.templates,
      origin: { kind: 'local' as const },
    }];
    const listed = listTemplates(tabs, ids.templates);
    const prd = listed.find(t => t.meta.docType === 'prd');
    expect(prd?.meta.source).toBe('workspace');
    expect(prd?.body).toContain('# Override');
  });
});

describe('built-in packs', () => {
  const builtins = loadBuiltInTemplates();
  const byType = Object.fromEntries(builtins.map(t => [t.meta.docType, t]));

  it('loads engineering marketing and learner packs', () => {
    expect(builtins).toHaveLength(10);
    expect(byType.prd.meta.pack).toBe('engineering');
    expect(byType.content_plan.meta.pack).toBe('marketing');
    expect(byType.note.meta.pack).toBe('learner');
  });

  it('architecture includes mermaid dot and nomnoml fences', () => {
    const body = byType.architecture.body;
    expect(body).toMatch(/```mermaid/);
    expect(body).toMatch(/```dot/);
    expect(body).toMatch(/```nomnoml/);
  });

  it('task breakdown includes task list items', () => {
    expect(byType.task_breakdown.body).toMatch(/- \[ \]/);
  });

  it('meeting notes include attendees agenda decisions actions', () => {
    const b = byType.meeting_notes.body.toLowerCase();
    expect(b).toContain('attendees');
    expect(b).toContain('agenda');
    expect(b).toContain('decisions');
    expect(b).toContain('actions');
  });

  it('content calendar has date channel title status url columns', () => {
    const b = byType.content_calendar.body.toLowerCase();
    expect(b).toContain('date');
    expect(b).toContain('channel');
    expect(b).toContain('title');
    expect(b).toContain('status');
    expect(b).toMatch(/cta|url/);
  });

  it('research template has source url section', () => {
    expect(byType.research.body).toMatch(/Source URL/i);
    expect(byType.research.body).toContain('{{url}}');
  });
});

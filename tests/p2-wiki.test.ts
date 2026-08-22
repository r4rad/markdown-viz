import { describe, it, expect } from 'vitest';
import { applyWikiDirection } from '../src/lib/wiki-sync';
import { confluenceStorageToMarkdown, markdownToConfluenceStorage } from '../src/lib/confluence-md';
import { markdownToNotionBlocks, notionBlocksToMarkdown } from '../src/lib/notion-md';
import { mappingWithoutSecrets } from '../src/lib/wiki-mappings';
import { confluenceConnector } from '../src/lib/connectors/confluence';
import { notionConnector } from '../src/lib/connectors/notion';
import { driveConnector } from '../src/lib/connectors/drive';

describe('wiki sync', () => {
  it('two-way conflict keeps local', () => {
    const result = applyWikiDirection('two-way', {
      localContent: 'local',
      localChecksum: 'L2',
      remoteContent: 'remote',
      remoteChecksum: 'R2',
      lastLocalChecksum: 'L1',
      lastRemoteChecksum: 'R1',
    });
    expect(result.conflict).toBe(true);
    expect(result.keep).toBe('local');
    expect(result.localContent).toBe('local');
  });

  it('confluence mapper preserves unknown macros as warning', () => {
    const { markdown, warning } = confluenceStorageToMarkdown(
      '<h1>Hi</h1><ac:structured-macro>x</ac:structured-macro>',
    );
    expect(markdown).toMatch(/Hi/);
    expect(warning).toBeTruthy();
    expect(markdown).toMatch(/wiki-unknown/);
    const back = markdownToConfluenceStorage('# Title');
    expect(back).toContain('<h1>Title</h1>');
  });

  it('notion mapper round-trips headings and unknown blocks', () => {
    const { markdown, warning } = notionBlocksToMarkdown([
      { type: 'heading_1', heading_1: { rich_text: [{ text: { content: 'T' } }] } },
      { type: 'unsupported_widget', foo: 1 },
    ]);
    expect(markdown).toContain('# T');
    expect(warning).toBeTruthy();
    const blocks = markdownToNotionBlocks('# Hello\n- item');
    expect(blocks[0].type).toBe('heading_1');
  });

  it('mapping strips secrets', () => {
    const safe = mappingWithoutSecrets({
      id: 'm',
      workspaceId: 'w',
      connector: 'notion',
      remote: { pageId: 'p', token: 'secret' },
    });
    expect(safe.remote.token).toBeUndefined();
    expect(safe.remote.pageId).toBe('p');
  });

  it('drive stays stub; wiki connectors advertise sync', () => {
    expect(driveConnector.listCapabilities()).not.toContain('sync');
    expect(confluenceConnector.listCapabilities()).toContain('sync');
    expect(notionConnector.listCapabilities()).toContain('sync');
  });
});

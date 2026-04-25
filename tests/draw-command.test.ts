import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DIAGRAM_TYPES,
  DIAGRAM_LABELS,
  DIAGRAM_TEMPLATES,
  getDrawTemplate,
  replaceDiagramType,
  extractDiagramSource,
  isValidDiagramType,
  type DiagramType,
} from '../src/lib/draw-command';

describe('draw-command: constants', () => {
  it('DIAGRAM_TYPES contains all three supported types', () => {
    expect(DIAGRAM_TYPES).toContain('mermaid');
    expect(DIAGRAM_TYPES).toContain('nomnoml');
    expect(DIAGRAM_TYPES).toContain('dot');
    expect(DIAGRAM_TYPES).toHaveLength(3);
  });

  it('DIAGRAM_LABELS has labels for all types', () => {
    for (const type of DIAGRAM_TYPES) {
      expect(DIAGRAM_LABELS[type]).toBeTypeOf('string');
      expect(DIAGRAM_LABELS[type].length).toBeGreaterThan(0);
    }
  });

  it('DIAGRAM_TEMPLATES has templates for all types', () => {
    for (const type of DIAGRAM_TYPES) {
      expect(DIAGRAM_TEMPLATES[type]).toBeTypeOf('string');
      expect(DIAGRAM_TEMPLATES[type].length).toBeGreaterThan(0);
    }
  });
});

describe('draw-command: getDrawTemplate', () => {
  it('returns a code fence with mermaid type', () => {
    const result = getDrawTemplate('mermaid');
    expect(result).toMatch(/\n```mermaid\n/);
    expect(result).toMatch(/\n```\n?$/);
  });

  it('returns a code fence with nomnoml type', () => {
    const result = getDrawTemplate('nomnoml');
    expect(result).toMatch(/\n```nomnoml\n/);
    expect(result).toMatch(/\n```\n?$/);
  });

  it('returns a code fence with dot type', () => {
    const result = getDrawTemplate('dot');
    expect(result).toMatch(/\n```dot\n/);
    expect(result).toMatch(/\n```\n?$/);
  });

  it('returned template contains the diagram template content', () => {
    const result = getDrawTemplate('mermaid');
    expect(result).toContain(DIAGRAM_TEMPLATES['mermaid']);
  });

  it('returned template for nomnoml contains nomnoml content', () => {
    const result = getDrawTemplate('nomnoml');
    expect(result).toContain(DIAGRAM_TEMPLATES['nomnoml']);
  });

  it('returned template for dot contains dot content', () => {
    const result = getDrawTemplate('dot');
    expect(result).toContain(DIAGRAM_TEMPLATES['dot']);
  });

  it('wrapped in newlines so it does not merge with previous content', () => {
    const result = getDrawTemplate('mermaid');
    // Should start with newline so inserting mid-line works cleanly
    expect(result).toMatch(/\n```mermaid/);
  });
});

describe('draw-command: replaceDiagramType', () => {
  it('wraps source in new type fence', () => {
    const source = 'A -> B';
    const result = replaceDiagramType(source, 'mermaid');
    expect(result).toMatch(/^```mermaid\n/);
    expect(result).toContain('A -> B');
    expect(result).toMatch(/\n```$/);
  });

  it('replaces mermaid with dot type fence', () => {
    const source = 'digraph G { A -> B }';
    const result = replaceDiagramType(source, 'dot');
    expect(result).toMatch(/^```dot\n/);
    expect(result).toContain('digraph G { A -> B }');
  });

  it('handles empty source string', () => {
    const result = replaceDiagramType('', 'nomnoml');
    expect(result).toMatch(/^```nomnoml\n/);
    expect(result).toMatch(/\n```$/);
  });

  it('handles multiline source', () => {
    const source = 'flowchart LR\n    A --> B\n    B --> C';
    const result = replaceDiagramType(source, 'mermaid');
    expect(result).toContain('flowchart LR');
    expect(result).toContain('A --> B');
    expect(result).toContain('B --> C');
  });
});

describe('draw-command: extractDiagramSource', () => {
  it('extracts source from a mermaid code fence', () => {
    const fence = '```mermaid\nflowchart LR\n    A --> B\n```';
    const result = extractDiagramSource(fence);
    expect(result).toEqual({ type: 'mermaid', source: 'flowchart LR\n    A --> B' });
  });

  it('extracts source from a nomnoml code fence', () => {
    const fence = '```nomnoml\n[A] -> [B]\n```';
    const result = extractDiagramSource(fence);
    expect(result).toEqual({ type: 'nomnoml', source: '[A] -> [B]' });
  });

  it('extracts source from a dot code fence', () => {
    const fence = '```dot\ndigraph G {\n    A -> B\n}\n```';
    const result = extractDiagramSource(fence);
    expect(result).toEqual({ type: 'dot', source: 'digraph G {\n    A -> B\n}' });
  });

  it('returns null for non-diagram code fence', () => {
    const fence = '```javascript\nconsole.log("hi");\n```';
    const result = extractDiagramSource(fence);
    expect(result).toBeNull();
  });

  it('returns null for plain text', () => {
    const result = extractDiagramSource('just some text');
    expect(result).toBeNull();
  });

  it('handles graphviz alias', () => {
    const fence = '```graphviz\ndigraph G { A -> B }\n```';
    const result = extractDiagramSource(fence);
    // graphviz is an alias for dot
    expect(result).not.toBeNull();
    expect(result?.source).toContain('digraph G { A -> B }');
  });
});

describe('draw-command: isValidDiagramType', () => {
  it('returns true for mermaid', () => {
    expect(isValidDiagramType('mermaid')).toBe(true);
  });

  it('returns true for nomnoml', () => {
    expect(isValidDiagramType('nomnoml')).toBe(true);
  });

  it('returns true for dot', () => {
    expect(isValidDiagramType('dot')).toBe(true);
  });

  it('returns false for unknown type', () => {
    expect(isValidDiagramType('unknown')).toBe(false);
    expect(isValidDiagramType('')).toBe(false);
    expect(isValidDiagramType('javascript')).toBe(false);
  });

  it('returns false for graphviz (internal alias, not user-facing)', () => {
    // graphviz is an alias handled internally, not a user-selectable type
    expect(isValidDiagramType('graphviz')).toBe(false);
  });
});

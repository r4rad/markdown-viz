// Supported diagram types (user-facing selection options)
export type DiagramType = 'mermaid' | 'nomnoml' | 'dot';

export const DIAGRAM_TYPES: DiagramType[] = ['mermaid', 'nomnoml', 'dot'];

export const DIAGRAM_LABELS: Record<DiagramType, string> = {
  mermaid:  'Mermaid — flowcharts, sequences, Gantt, ER…',
  nomnoml:  'Nomnoml — quick UML sketches',
  dot:      'DOT/Graphviz — graph networks & trees',
};

export const DIAGRAM_TEMPLATES: Record<DiagramType, string> = {
  mermaid: `flowchart LR
    A[Start] --> B{Decision}
    B -->|Yes| C[Result]
    B -->|No| D[End]`,
  nomnoml: `[Customer|+name: string|+age: int] -> [Order]
[Order] o--> [LineItem]`,
  dot: `digraph G {
    rankdir=LR
    A [label="Start"]
    B [label="Process"]
    C [label="End"]
    A -> B -> C
}`,
};

/**
 * Returns a markdown code fence for the given diagram type, wrapped in
 * leading/trailing newlines so it can be safely inserted inline.
 */
export function getDrawTemplate(type: DiagramType): string {
  return `\n\`\`\`${type}\n${DIAGRAM_TEMPLATES[type]}\n\`\`\`\n`;
}

/**
 * Wraps raw diagram source in a code fence of the specified type.
 * Returns the full markdown fence block (no surrounding newlines).
 */
export function replaceDiagramType(source: string, newType: DiagramType): string {
  return `\`\`\`${newType}\n${source}\n\`\`\``;
}

/**
 * Given a markdown code fence string, extracts the diagram type and raw source.
 * Returns null if the fence is not a recognized diagram type.
 * Handles the 'graphviz' alias (mapped to 'dot').
 */
export function extractDiagramSource(
  fence: string,
): { type: DiagramType; source: string } | null {
  const match = fence.match(/^```(\w+)\n([\s\S]*?)\n```$/);
  if (!match) return null;

  const rawLang = match[1].toLowerCase();
  const source = match[2];

  // Resolve graphviz alias
  const type: DiagramType | null =
    rawLang === 'mermaid'  ? 'mermaid'  :
    rawLang === 'nomnoml'  ? 'nomnoml'  :
    rawLang === 'dot'      ? 'dot'      :
    rawLang === 'graphviz' ? 'dot'      :
    null;

  if (!type) return null;
  return { type, source };
}

/**
 * Returns true only for the three user-selectable diagram types.
 * Does NOT include 'graphviz' (that is an internal alias).
 */
export function isValidDiagramType(value: string): value is DiagramType {
  return (DIAGRAM_TYPES as string[]).includes(value);
}

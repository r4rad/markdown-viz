#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { resolveAuthenticatedUser } from './auth.js';
import { callTool, TOOL_DEFS } from './tools.js';
import { createFirestorePort } from './firestore-rest.js';
import { createGithubPort } from './github-rest.js';

async function main(): Promise<void> {
  const server = new Server(
    { name: 'markdownviz-mcp', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOL_DEFS }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const auth = await resolveAuthenticatedUser(process.env);
    if ('error' in auth) {
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: auth.error }) }],
        isError: true,
      };
    }
    return callTool(request.params.name, (request.params.arguments ?? {}) as Record<string, unknown>, {
      uid: auth.uid,
      githubToken: process.env.GITHUB_TOKEN,
      firestore: createFirestorePort(process.env),
      github: createGithubPort(process.env.GITHUB_TOKEN),
    });
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

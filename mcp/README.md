# MarkdownViz MCP server

Stdio MCP server for listing, reading, and writing the signed-in user’s workspace Markdown, plus explicit GitHub saves.

## Auth

| Env | Purpose |
|-----|---------|
| `MARKDOWNVIZ_FIREBASE_ID_TOKEN` | Firebase Auth ID token (required in production) |
| `MARKDOWNVIZ_FIREBASE_API_KEY` | Web API key used to verify the ID token |
| `MARKDOWNVIZ_FIREBASE_PROJECT_ID` | Firestore project |
| `GITHUB_TOKEN` | PAT or OAuth token for linked-repo list/read/save |
| `MARKDOWNVIZ_ALLOW_UNVERIFIED_UID=1` + `MARKDOWNVIZ_USER_ID` | Local-only bypass; never use in production |

PATs stay in the MCP process environment. They are never written to Firestore.

## Cursor config example

```json
{
  "mcpServers": {
    "markdownviz": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/absolute/path/to/markdown-viz/mcp",
      "env": {
        "MARKDOWNVIZ_FIREBASE_ID_TOKEN": "<id-token>",
        "MARKDOWNVIZ_FIREBASE_API_KEY": "<web-api-key>",
        "MARKDOWNVIZ_FIREBASE_PROJECT_ID": "<project-id>",
        "GITHUB_TOKEN": "<github-pat>"
      }
    }
  }
}
```

## Tools

- `list_tree`, `list_folder`, `read_file`, `write_file` (Firestore only)
- `list_connectors`, `save_to_connector` (`github` live, `drive` → `NOT_IMPLEMENTED`)

`write_file` on a GitHub-origin document stores a local overlay and does **not** commit. Call `save_to_connector` with `connector: "github"` to commit.

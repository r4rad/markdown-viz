# Cloud Run API (`services/api`)

Trusted backend for invites, GitHub App, webhooks, sync APIs, and document history.

## Local run

```bash
cd services/api
cp .env.example .env   # optional; defaults are fine for stub mode
npm install
npm run dev            # http://localhost:8080/healthz
```

Or build and run:

```bash
npm run build
npm start
```

### Health check

```bash
curl -s http://localhost:8080/healthz
# {"ok":true}
```

No GitHub or Firebase secrets are required for `/healthz` or stub auth.

### Auth stub

Protected routes under `/v1/*` expect `Authorization: Bearer <token>`.

| Env | Purpose |
|-----|---------|
| `FIREBASE_AUTH_MODE=stub` | Accept any non-empty bearer (default for local/CI) |
| `FIREBASE_AUTH_MODE=verify` | Placeholder for real `firebase-admin` verify (not wired; returns 501) |
| `FIREBASE_PROJECT_ID` | Placeholder for production project id |
| `GOOGLE_APPLICATION_CREDENTIALS` | Runtime path to service account — **never commit** |

Stub tokens:

- `stub:alice` → uid `alice`
- `stub:bob:bob@example.com` → uid + email (needed for invite accept)

Example stub call:

```bash
curl -s -H "Authorization: Bearer stub:alice" http://localhost:8080/v1/ping
```

### Invites

| Method | Path | Authz |
|--------|------|-------|
| POST | `/v1/invites` | workspace owner |
| POST | `/v1/invites/:id/accept` | invitee (email match) |
| GET | `/v1/workspaces/:workspaceId/invites` | workspace owner |

Create body: `{ "workspaceId", "email", "role": "editor"|"commentator"|"viewer" }`.

Email mismatch on accept returns `403` and leaves the invite `pending`.

Persistence is an in-memory store locally/CI; production swaps in Firestore Admin.

### GitHub App

| Method | Path | Authz |
|--------|------|-------|
| POST | `/v1/github/installations/link` | workspace owner (Firebase bearer) |
| POST | `/v1/github/webhooks` | GitHub `X-Hub-Signature-256` |

Link body: `{ "workspaceId", "installationId", "owner", "repo", "syncBranch", "pathPrefix?" }`.

Response is a `RepositoryLink` (metadata only). The App private key and webhook secret stay on Cloud Run — never in the JSON response or `VITE_*`.

| Env | Purpose |
|-----|---------|
| `GITHUB_APP_ID` | GitHub App id |
| `GITHUB_APP_PRIVATE_KEY` | PEM private key (Secret Manager) |
| `GITHUB_APP_WEBHOOK_SECRET` | Webhook HMAC secret |

Setting any of `VITE_GITHUB_APP_*` / `VITE_GITHUB_PRIVATE_KEY` / `VITE_GITHUB_WEBHOOK_SECRET` causes config load to fail closed.

Webhook example (local):

```bash
# compute sha256=… HMAC of the raw body with GITHUB_APP_WEBHOOK_SECRET, then:
curl -s -X POST http://localhost:8080/v1/github/webhooks \
  -H "content-type: application/json" \
  -H "x-hub-signature-256: sha256=…" \
  -H "x-github-event: ping" \
  -d '{"zen":"keep it simple"}'
```

### Sync jobs (Cloud Tasks quiet commits)

| Method | Path | Authz |
|--------|------|-------|
| POST | `/v1/sync/enqueue` | editor+ (Firebase bearer) |
| POST | `/v1/internal/sync/run` | `X-Sync-Task-Secret` (Cloud Tasks) |
| POST | `/v1/conflicts/:id/resolve` | editor+ (Firebase bearer) |

Enqueue body: `{ "documentId", "workspaceId" }`.

Response `202` is a `SyncJob` with `quietUntil ≈ now + 30s`. The memory/Cloud Tasks queue runs the job after the quiet window and commits via the GitHub App installation (stub locally). Transient commit failures re-queue with backoff.

When local and remote overlap on a push webhook, the API creates a durable `Conflict`, sets `syncStatus=Conflict`, and enqueue returns `409 blocked_conflict` until an editor resolves via keep-local / take-remote / merged.

Resolve body: `{ "resolution": "local" | "remote" | "merged", "mergedContent"?: string }`.

| Env | Purpose |
|-----|---------|
| `SYNC_QUIET_PERIOD_MS` | Quiet delay before run (default `30000`) |
| `SYNC_TASKS_SECRET` | Shared secret for `/v1/internal/sync/run` (optional in local stub) |

```bash
curl -s -X POST http://localhost:8080/v1/sync/enqueue \
  -H "Authorization: Bearer stub:alice" \
  -H "content-type: application/json" \
  -d '{"workspaceId":"ws-1","documentId":"doc-1"}'
```

### History (unlimited snapshots + deltas)

| Method | Path | Authz |
|--------|------|-------|
| GET | `/v1/history/:documentId?workspaceId=` | member |
| POST | `/v1/history/:documentId` | editor+ (append event) |
| POST | `/v1/history/:documentId/restore` | editor+ |

Append body: `{ "workspaceId", "content", "source"?: "save"|"sync"|"conflict"|"git_import"|"mcp", "gitSha"? }`.

Restore body: `{ "workspaceId", "eventId" }` — applies prior content as a **new** `restore` event; prior history is never deleted.

Compaction writes periodic `.snap.zst` paths every 50 events (or ~1 MiB of deltas); intervening events use `.delta.zst`. Persistence is in-memory locally/CI; production uses Firestore metadata + Cloud Storage blobs.

## Tests

```bash
npm test
```

## CI

Root GitHub Actions workflow builds and tests this package alongside the SPA. Workflow env uses placeholders only — no secrets in the repository.

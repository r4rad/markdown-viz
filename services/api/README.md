# Cloud Run API (`services/api`)

Trusted backend for invites, GitHub App, webhooks, and sync APIs.

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

## Tests

```bash
npm test
```

## CI

Root GitHub Actions workflow builds and tests this package alongside the SPA. Workflow env uses placeholders only — no secrets in the repository.

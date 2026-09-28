# Cloud Run API (`services/api`)

Trusted backend for invites, GitHub App, webhooks, and sync APIs. This scaffold ships `/healthz` and a Firebase Auth verify **stub** only.

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

Example stub call:

```bash
curl -s -H "Authorization: Bearer stub:alice" http://localhost:8080/v1/ping
```

## Tests

```bash
npm test
```

## CI

Root GitHub Actions workflow builds and tests this package alongside the SPA. Workflow env uses placeholders only — no secrets in the repository.

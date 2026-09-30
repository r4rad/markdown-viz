# Cloud Run collab gateway (`services/collab`)

Yjs WebSocket gateway for real-time document sync. Firebase ID token auth; in-memory snapshot stub (Firestore/Storage later). Redis/Memorystore pub/sub syncs updates across gateway instances.

## Local run

```bash
cd services/collab
cp .env.example .env   # optional; defaults are fine for stub mode
npm install
npm run dev            # http://localhost:8081/healthz
```

Or build and run:

```bash
npm run build
npm start
```

### Health check

```bash
curl -s http://localhost:8081/healthz
# {"ok":true}
```

### WebSocket

```
ws://localhost:8081/doc/:documentId?token=<FirebaseIdToken>
```

| Env | Purpose |
|-----|---------|
| `FIREBASE_AUTH_MODE=stub` | Accept any non-empty token (default for local/CI) |
| `FIREBASE_AUTH_MODE=verify` | Placeholder for real `firebase-admin` verify (not wired; rejects) |
| `PORT` | Default `8081` (API uses `8080`) |
| `REDIS_URL` | Optional. When set, publishes/subscribes Yjs updates for multi-instance sync |

Stub tokens:

- `stub:alice` → uid `alice`
- `stub:bob:bob@example.com` → uid + email

Invalid / missing tokens are rejected before the socket is accepted (HTTP 401 on upgrade).

Binary frames are raw Yjs updates. On join, the gateway sends the current room state as a Yjs update. Peers in the same `documentId` room on this instance receive each other's updates. Snapshots are kept in an in-memory stub (`persistSnapshotStub`).

### Redis / Memorystore (multi-instance)

Without `REDIS_URL`, each Cloud Run instance only syncs its local WebSocket clients.

With `REDIS_URL`, each instance:

1. Publishes local Yjs updates to `collab:yjs:{documentId}`
2. Subscribes to `collab:yjs:*` and fans updates out to local clients
3. Ignores messages from its own `instanceId` (no echo loops)

**Local Redis (Docker):**

```bash
docker run --rm -p 6379:6379 redis:7-alpine
# in services/collab/.env
REDIS_URL=redis://127.0.0.1:6379
```

**Memorystore:** point `REDIS_URL` at the Memorystore private IP from Cloud Run (VPC connector). No secrets in the repo.

CI uses an in-memory pub/sub bus that implements the same adapter contract — no Redis required for `npm test`.

### Client reconnect

If the socket closes (gateway restart, token expiry, network blip):

1. Refresh the Firebase ID token
2. Reconnect to `ws(s)://…/doc/:documentId?token=…`
3. Apply the gateway's catch-up state frame, then continue sending/receiving binary Yjs updates

The SPA (`src/lib/crdt.ts`) should treat disconnect as recoverable; snapshot/delta persistence (later tasks) fills gaps after restarts.

### SPA

Set `VITE_COLLAB_WS_URL=ws://localhost:8081` in the SPA `.env` to point the client at this gateway when configured.

## Tests

```bash
npm test
```

Includes a two-instance integration test over the shared memory pub/sub adapter (Redis contract without a live Redis).

## CI

Root GitHub Actions workflow builds and tests this package alongside the SPA and API. Workflow env uses placeholders only — no secrets in the repository.

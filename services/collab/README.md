# Cloud Run collab gateway (`services/collab`)

Yjs WebSocket gateway for real-time document sync. Firebase ID token auth; in-memory snapshot stub (Firestore/Storage later).

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

Stub tokens:

- `stub:alice` → uid `alice`
- `stub:bob:bob@example.com` → uid + email

Invalid / missing tokens are rejected before the socket is accepted (HTTP 401 on upgrade).

Binary frames are raw Yjs updates. On join, the gateway sends the current room state as a Yjs update. Peers in the same `documentId` room receive each other's updates. Snapshots are kept in an in-memory stub (`persistSnapshotStub`).

### SPA

Set `VITE_COLLAB_WS_URL=ws://localhost:8081` in the SPA `.env` to point the client at this gateway when configured.

## Tests

```bash
npm test
```

## CI

Root GitHub Actions workflow builds and tests this package alongside the SPA and API. Workflow env uses placeholders only — no secrets in the repository.

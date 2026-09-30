import { createServer } from './app.js';
import { createPubSubFromEnv } from './pubsub.js';

const port = Number(process.env.PORT ?? 8081);

const pubsub = await createPubSubFromEnv();
const server = createServer({ pubsub: pubsub ?? undefined });
await server.collabReady;

server.listen(port, () => {
  const mode = pubsub ? `redis (${process.env.REDIS_URL})` : 'single-instance (no REDIS_URL)';
  console.log(`markdown-viz collab gateway listening on :${port} [${mode}]`);
});

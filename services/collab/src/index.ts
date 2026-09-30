import { createServer } from './app.js';

const port = Number(process.env.PORT ?? 8081);

const server = createServer();
server.listen(port, () => {
  console.log(`markdown-viz collab gateway listening on :${port}`);
});

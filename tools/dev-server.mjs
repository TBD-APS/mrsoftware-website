import { startSite } from './ux-site.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

const host = argument('--host', '127.0.0.1');
const port = Number(argument('--port', '7100'));
if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Port must be an integer from 0 to 65535.');

const app = await startSite({ host, port });
const actualPort = new URL(app.base).port;
console.log(`READY http://localhost:${actualPort}/`);

let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await app.close();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await close();
    process.exit(0);
  });
}

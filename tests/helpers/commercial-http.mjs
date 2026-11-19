import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCommercialHarness } from './commercial.mjs';

const defaultRoot = fileURLToPath(new URL('../../.commercial-dist/', import.meta.url));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };

// Real application + real ephemeral D1. Identity substitution is confined to this
// test helper; the production application has no test flag or header bypass.
export async function startCommercialSite({ root = defaultRoot, verifyIdentity = async () => ({ sub: 'synthetic-owner', email: 'william@example.test' }), assetOverrides = new Map() } = {}) {
  const cleanup = [];
  const harness = await createCommercialHarness({ after: callback => cleanup.push(callback) }, { verifyIdentity });
  const { app, env } = harness;
  const assets = async request => {
    const url = new URL(request.url);
    if (url.pathname === '/favicon.ico') return new Response(null, { status: 204 });
    let relative;
    try { relative = decodeURIComponent(url.pathname).replace(/^\/+/, ''); } catch { return new Response('Not found', { status: 404 }); }
    if (relative.split('/').some(part => part.startsWith('.'))) return new Response('Not found', { status: 404 });
    const filename = path.resolve(root, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
    if (!filename.startsWith(path.resolve(root) + path.sep)) return new Response('Not found', { status: 404 });
    try {
      const body = assetOverrides.has(url.pathname) ? assetOverrides.get(url.pathname) : await readFile(filename);
      if (body instanceof Response) return body.clone();
      return new Response(body, { headers: { 'Content-Type': contentTypes[path.extname(filename)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' } });
    } catch { return new Response('Not found', { status: 404 }); }
  };
  env.ASSETS = { fetch: assets };
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, `http://${incoming.headers.host}`);
      const chunks = [];
      for await (const chunk of incoming) chunks.push(chunk);
      const headers = new Headers(incoming.headers);
      headers.set('CF-Connecting-IP', '203.0.113.8');
      const request = new Request(url, { method: incoming.method, headers, ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Buffer.concat(chunks) }) });
      const result = await app.fetch(request, env);
      outgoing.writeHead(result.status, Object.fromEntries(result.headers));
      outgoing.end(Buffer.from(await result.arrayBuffer()));
    } catch {
      outgoing.writeHead(500, { 'Content-Type': 'text/plain' });
      outgoing.end('Local preview failed.');
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  env.DEMO_HOST = `127.0.0.1:${port}`;
  env.BACKOFFICE_HOST = `localhost:${port}`;
  return {
    ...harness, assetOverrides, assets, port, address: server.address().address,
    base: `http://${env.DEMO_HOST}/`,
    privateBase: `http://${env.BACKOFFICE_HOST}/`,
    async close() {
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      for (const callback of cleanup.reverse()) await callback();
    },
  };
}

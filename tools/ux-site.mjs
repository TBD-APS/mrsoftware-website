import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export async function startSite() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json' };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const filename = path.resolve(root, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!filename.startsWith(root) || relative.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end(); return; }
      const body = await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    base: `http://dashboard.mrsoftware.dk:${server.address().port}/`,
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}

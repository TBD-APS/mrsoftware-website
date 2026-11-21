import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createDashboardHandler } from '../dashboard/handler.mjs';
import { verifyTestAccess, testToken } from '../tests/ux/access-fixture.mjs';
import { data as sampleData, graphs as sampleGraphs } from '../tests/ux/snapshot-fixture.mjs';
import { publicCommercialEntry } from '../website-entry.mjs';

export async function startSite({ roadmapHtml, host = '127.0.0.1', port = 0, publicRoot } = {}) {
  const root = path.resolve(publicRoot ?? fileURLToPath(new URL('../', import.meta.url))) + path.sep;
  const snapshotDir = process.env.DASHBOARD_SNAPSHOT_DIR;
  const data = snapshotDir ? JSON.parse(await readFile(path.join(snapshotDir, 'data.json'), 'utf8')) : sampleData;
  const graphs = snapshotDir ? JSON.parse(await readFile(path.join(snapshotDir, 'graphs.json'), 'utf8')) : sampleGraphs;
  const files = Object.fromEntries(await Promise.all(['index.html', 'app.js', 'code-graph.js', 'styles.css'].map(async name => [name, await readFile(path.join(root, 'dashboard', name), 'utf8')])));
  files['data.js'] = 'window.MR_SOFTWARE_DATA = ' + JSON.stringify(data) + ';';
  files['graphs.js'] = 'window.MR_SOFTWARE_GRAPHS = ' + JSON.stringify(graphs) + ';';
  const token = await testToken();
  const handle = createDashboardHandler({ files, verifyAccess: verifyTestAccess });
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.pdf': 'application/pdf', '.csv': 'text/csv; charset=utf-8', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
        const result = await handle(new Request('https://mrsoftware.dk' + url.pathname, { method: request.method }), {
          ASSETS: { fetch: async () => new Response(await readFile(path.join(root, 'data/links.json'))) },
        });
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      if (url.pathname.startsWith('/_development')) {
        const headers = new Headers();
        if (request.headers['x-test-access'] !== 'deny') headers.set('Cf-Access-Jwt-Assertion', token);
        const result = await handle(new Request('https://' + (request.headers['x-test-host'] || 'dashboard.mrsoftware.dk') + url.pathname + url.search, { headers }), {});
        response.writeHead(result.status, Object.fromEntries(result.headers));
        response.end(Buffer.from(await result.arrayBuffer()));
        return;
      }
      if (url.pathname === '/favicon.ico') { response.writeHead(204); response.end(); return; }
      const entry = publicCommercialEntry(new Request('https://' + (request.headers['x-test-host'] || 'mrsoftware.dk') + url.pathname + url.search, { method: request.method }));
      if (entry) { response.writeHead(entry.status, Object.fromEntries(entry.headers)); response.end(); return; }
      const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
      const filename = path.resolve(root, relative + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!filename.startsWith(root) || relative.split('/').some(part => part.startsWith('.'))) { response.writeHead(403); response.end(); return; }
      const body = url.pathname === '/roadmap/' && roadmapHtml !== undefined ? roadmapHtml : await readFile(filename);
      response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise(resolve => server.listen(port, host, resolve));
  return {
    base: `http://dashboard.mrsoftware.dk:${server.address().port}/`,
    expected: { data, graphs },
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph } from '../js/linking.js';
import { publicLinkUpdates } from '../tools/prerender-links.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = process.env.LINKS_ROOT ?? repo;

function jsonPath() {
  return join(contentRoot, 'data/links.json');
}

function modulePath() {
  return join(contentRoot, 'js/site-links.js');
}

async function readGraph() {
  // Sitemap metadata belongs to the catalogue, not the link editor's graph.
  const { sitemapPages, ...graph } = JSON.parse(await readFile(jsonPath(), 'utf8'));
  const checked = checkGraph(graph);
  if (!checked.ok) throw new Error(checked.errors[0]);
  return checked.graph;
}

async function writeGraph(graph) {
  const checked = checkGraph(graph);
  if (!checked.ok) throw new Error(checked.errors[0]);
  const { sitemapPages } = JSON.parse(await readFile(jsonPath(), 'utf8'));
  const pages = await publicLinkUpdates(contentRoot, checked.graph);
  const text = `${JSON.stringify(checked.graph, null, 2)}\n`;
  await mkdir(dirname(jsonPath()), { recursive: true });
  await mkdir(dirname(modulePath()), { recursive: true });
  await writeFile(jsonPath(), `${JSON.stringify({ ...checked.graph, sitemapPages }, null, 2)}\n`);
  await writeFile(modulePath(), `export const graph = ${text};\n`);
  for (const { file, html } of pages) await writeFile(file, html);
  return checked.graph;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 100_000) reject(new Error('The link file is too large.'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, status, body, type) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
}

function linksApi() {
  return {
    name: 'links-api',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        console.log(`READY http://127.0.0.1:${address.port}`);
      });
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/api/links') {
          next();
          return;
        }
        try {
          if (request.method === 'GET') {
            send(response, 200, JSON.stringify(await readGraph()), 'application/json; charset=utf-8');
            return;
          }
          if (request.method === 'POST') {
            const graph = await writeGraph(JSON.parse(await readBody(request)));
            send(response, 200, JSON.stringify(graph), 'application/json; charset=utf-8');
            return;
          }
          send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8');
        } catch (error) {
          send(response, 400, error.message || 'The links were not saved.', 'text/plain; charset=utf-8');
        }
      });
    },
  };
}

export default {
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: Number(process.env.PORT ?? 5173),
    strictPort: true,
    fs: { allow: [repo] },
  },
  plugins: [linksApi()],
};

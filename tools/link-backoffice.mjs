import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph } from '../js/linking.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = process.env.LINKS_ROOT ?? repo;
const port = Number(process.env.PORT ?? 0);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const files = {
  '/': 'backoffice/index.html',
  '/backoffice/editor.js': 'backoffice/editor.js',
  '/js/linking.js': 'js/linking.js',
  '/css/linking.css': 'css/linking.css',
};

function jsonPath() {
  return join(contentRoot, 'data/links.json');
}

function modulePath() {
  return join(contentRoot, 'js/site-links.js');
}

async function readGraph() {
  const checked = checkGraph(JSON.parse(await readFile(jsonPath(), 'utf8')));
  if (!checked.ok) throw new Error(checked.errors[0]);
  return checked.graph;
}

async function writeGraph(graph) {
  const checked = checkGraph(graph);
  if (!checked.ok) throw new Error(checked.errors[0]);
  const text = `${JSON.stringify(checked.graph, null, 2)}\n`;
  await mkdir(dirname(jsonPath()), { recursive: true });
  await mkdir(dirname(modulePath()), { recursive: true });
  await writeFile(jsonPath(), text);
  await writeFile(modulePath(), `export const graph = ${text};\n`);
  return checked.graph;
}

function send(response, status, body, type) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }).end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 100_000) throw new Error('The link file is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  try {
    if (url.pathname === '/api/links' && request.method === 'GET') {
      send(response, 200, JSON.stringify(await readGraph()), 'application/json; charset=utf-8');
      return;
    }
    if (url.pathname === '/api/links' && request.method === 'POST') {
      const graph = await writeGraph(JSON.parse(await readBody(request)));
      send(response, 200, JSON.stringify(graph), 'application/json; charset=utf-8');
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8');
      return;
    }
    const relative = files[url.pathname];
    if (!relative) {
      send(response, 404, 'Not found', 'text/plain; charset=utf-8');
      return;
    }
    const body = await readFile(join(repo, relative));
    send(response, 200, request.method === 'HEAD' ? '' : body, types[extname(relative)] ?? 'text/plain; charset=utf-8');
  } catch (error) {
    send(response, 400, error.message || 'The links were not saved.', 'text/plain; charset=utf-8');
  }
});

server.listen(port, '127.0.0.1', () => {
  const address = server.address();
  console.log(`READY http://127.0.0.1:${address.port}`);
});

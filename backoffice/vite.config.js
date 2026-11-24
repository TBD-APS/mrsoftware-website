import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph } from '../js/linking.js';
import { publicLinkUpdates } from '../tools/prerender-links.mjs';
import { readSiteContent, mergeHomepageCta, applyHomepageCtaHtml } from '../tools/render-content.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const contentRoot = process.env.LINKS_ROOT ?? repo;

function jsonPath() {
  return join(contentRoot, 'data/links.json');
}

function modulePath() {
  return join(contentRoot, 'js/site-links.js');
}

function siteContentPath() {
  return join(contentRoot, 'data/site-content.json');
}

function indexPath() {
  return join(contentRoot, 'index.html');
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

async function readSiteContentJson() {
  const raw = await readFile(siteContentPath(), 'utf8');
  const data = JSON.parse(raw);
  return {
    homepageCta: mergeHomepageCta(data),
    version: contentVersion(data),
  };
}

function contentVersion(data) {
  return `"${createHash('sha256').update(JSON.stringify(mergeHomepageCta(data))).digest('hex')}"`;
}

async function writeSiteContentJson(patch, version) {
  const existing = await readSiteContent(contentRoot);
  if (!version) {
    throw Object.assign(new Error('Reload the page before saving your changes.'), { status: 428 });
  }
  if (version !== contentVersion(existing)) {
    throw Object.assign(new Error('Someone else changed this content. Reload the page before saving again.'), { status: 412 });
  }
  const next = {
    ...existing,
    homepageCta: {
      ...(existing.homepageCta ?? {}),
      ...patch,
    },
  };
  const cta = mergeHomepageCta(next);
  const html = await readFile(indexPath(), 'utf8');
  const rendered = applyHomepageCtaHtml(html, cta);
  await mkdir(dirname(siteContentPath()), { recursive: true });
  await writeFile(siteContentPath(), `${JSON.stringify(next, null, 2)}\n`);
  if (rendered !== html) await writeFile(indexPath(), rendered);
  return { homepageCta: cta, version: contentVersion(next) };
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', chunk => {
      size += chunk.length;
      if (size > 100_000) reject(new Error('The request body is too large.'));
      else chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, status, body, type, headers = {}) {
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers }).end(body);
}

function linksApi() {
  let contentWrite = Promise.resolve();
  return {
    name: 'links-api',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const address = server.httpServer.address();
        console.log(`READY http://127.0.0.1:${address.port}`);
      });
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        try {
          if (url.pathname === '/api/links') {
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
            return;
          }
          if (url.pathname === '/api/site-content') {
            if (request.method === 'GET') {
              const data = await readSiteContentJson();
              send(response, 200, JSON.stringify(data.homepageCta), 'application/json; charset=utf-8', { etag: data.version });
              return;
            }
            if (request.method === 'POST') {
              const origin = request.headers.origin;
              if (origin && origin !== `http://${request.headers.host}`) {
                send(response, 403, 'Save homepage content from this editor only.', 'text/plain; charset=utf-8');
                return;
              }
              if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
                send(response, 415, 'Send homepage content as JSON.', 'text/plain; charset=utf-8');
                return;
              }
              const patch = JSON.parse(await readBody(request));
              const pending = contentWrite.then(() => writeSiteContentJson(patch, request.headers['if-match']));
              contentWrite = pending.catch(() => {});
              const data = await pending;
              send(response, 200, JSON.stringify(data.homepageCta), 'application/json; charset=utf-8', { etag: data.version });
              return;
            }
            send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8');
            return;
          }
          next();
        } catch (error) {
          send(response, error.status ?? 400, error.message || 'Request failed.', 'text/plain; charset=utf-8');
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

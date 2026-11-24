import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph } from '../js/linking.js';
import { publicLinkUpdates } from '../tools/prerender-links.mjs';
import { readSiteContent, mergeHomepageCta, mergeHomepageContact, mergeHomepageStories, applyHomepageCtaHtml, applyHomepageContactHtml, applyHomepageStoriesHtml } from '../tools/render-content.mjs';

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
  const data = await readSiteContent(contentRoot);
  return {
    homepageCta: mergeHomepageCta(data),
    homepageContact: mergeHomepageContact(data),
    homepageStories: mergeHomepageStories(data),
    raw: data,
  };
}

async function writeSiteContentJson(patch) {
  const existing = await readSiteContent(contentRoot);
  const next = {
    ...existing,
  };
  if (patch && typeof patch === 'object') {
    if (patch.homepageCta && typeof patch.homepageCta === 'object') {
      next.homepageCta = { ...(existing.homepageCta ?? {}), ...patch.homepageCta };
    }
    if (patch.homepageContact && typeof patch.homepageContact === 'object') {
      next.homepageContact = { ...(existing.homepageContact ?? {}), ...patch.homepageContact };
    }
    if (patch.homepageStories && typeof patch.homepageStories === 'object') {
      next.homepageStories = { ...(existing.homepageStories ?? {}), ...patch.homepageStories };
    }
  }
  await mkdir(dirname(siteContentPath()), { recursive: true });
  await writeFile(siteContentPath(), `${JSON.stringify(next, null, 2)}\n`);
  const cta = mergeHomepageCta(next);
  const contact = mergeHomepageContact(next);
  const stories = mergeHomepageStories(next);
  let html = await readFile(indexPath(), 'utf8');
  html = applyHomepageCtaHtml(html, cta);
  html = applyHomepageContactHtml(html, contact);
  html = applyHomepageStoriesHtml(html, stories);
  await writeFile(indexPath(), html);
  return { homepageCta: cta, homepageContact: contact, homepageStories: stories };
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
              send(response, 200, JSON.stringify(data.homepageCta), 'application/json; charset=utf-8');
              return;
            }
            if (request.method === 'POST') {
              const patch = JSON.parse(await readBody(request));
              const data = await writeSiteContentJson(patch);
              send(response, 200, JSON.stringify(data.homepageCta), 'application/json; charset=utf-8');
              return;
            }
            send(response, 405, 'Method not allowed', 'text/plain; charset=utf-8');
            return;
          }
          next();
        } catch (error) {
          send(response, 400, error.message || 'Request failed.', 'text/plain; charset=utf-8');
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

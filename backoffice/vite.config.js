import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkGraph } from '../js/linking.js';
import { publicLinkUpdates } from '../tools/prerender-links.mjs';
import { readSiteContent, mergeHomepageCta, mergeHomepageContact, mergeHomepageStories, mergeHomepageStoriesCards, applyHomepageCtaHtml, applyHomepageContactHtml, applyHomepageStoriesHtml } from '../tools/render-content.mjs';
import { readStoriesContent, mergeStories, applyStoriesContent } from '../tools/render-stories.mjs';
import { readNavHeroesContent, mergeNavHeroes, applyNavHeroesContent } from '../tools/render-nav-heroes.mjs';

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

function storiesContentPath() {
  return join(contentRoot, 'data/stories-content.json');
}

function navHeroesPath() {
  return join(contentRoot, 'data/nav-heroes.json');
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

async function readAllContentJson() {
  const data = await readSiteContent(contentRoot);
  const stories = await readStoriesContent(contentRoot);
  const navHeroes = await readNavHeroesContent(contentRoot);
  return {
    homepageCta: mergeHomepageCta(data),
    homepageContact: mergeHomepageContact(data),
    homepageStories: mergeHomepageStories(data),
    homepageStoriesCards: mergeHomepageStoriesCards(data),
    stories: mergeStories(stories),
    navHeroes: mergeNavHeroes(navHeroes),
  };
}

async function writeAllContentJson(patch) {
  const existing = await readSiteContent(contentRoot);
  const next = { ...existing };
  const existingStories = await readStoriesContent(contentRoot);
  const nextStories = { ...existingStories };
  const existingNav = await readNavHeroesContent(contentRoot);
  const nextNav = { ...existingNav };

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
    if (patch.homepageStoriesCards && Array.isArray(patch.homepageStoriesCards)) {
      next.homepageStoriesCards = patch.homepageStoriesCards;
    }
    if (patch.stories && typeof patch.stories === 'object') {
      for (const k of ['storiesIndex', 'theOffer', 'theJob', 'theShipment', 'theChoices']) {
        if (patch.stories[k] && typeof patch.stories[k] === 'object') {
          nextStories[k] = { ...(existingStories[k] ?? {}), ...patch.stories[k] };
        }
      }
    }
    if (patch.navHeroes && typeof patch.navHeroes === 'object') {
      for (const k of ['integrations', 'research', 'roadmap', 'status']) {
        if (patch.navHeroes[k] && typeof patch.navHeroes[k] === 'object') {
          nextNav[k] = { ...(existingNav[k] ?? {}), ...patch.navHeroes[k] };
        }
      }
      if (patch.navHeroes.roadmapGreenyShowcase && typeof patch.navHeroes.roadmapGreenyShowcase === 'object') {
        nextNav.roadmapGreenyShowcase = { ...(existingNav.roadmapGreenyShowcase ?? {}), ...patch.navHeroes.roadmapGreenyShowcase };
      }
    }
  }

  await mkdir(dirname(siteContentPath()), { recursive: true });
  await writeFile(siteContentPath(), `${JSON.stringify(next, null, 2)}\n`);
  await mkdir(dirname(storiesContentPath()), { recursive: true });
  await writeFile(storiesContentPath(), `${JSON.stringify(nextStories, null, 2)}\n`);
  await mkdir(dirname(navHeroesPath()), { recursive: true });
  await writeFile(navHeroesPath(), `${JSON.stringify(nextNav, null, 2)}\n`);

  const cta = mergeHomepageCta(next);
  const contact = mergeHomepageContact(next);
  const storiesHome = mergeHomepageStories(next);
  const storiesCards = mergeHomepageStoriesCards(next);
  let html = await readFile(indexPath(), 'utf8');
  html = applyHomepageCtaHtml(html, cta);
  html = applyHomepageContactHtml(html, contact);
  html = applyHomepageStoriesHtml(html, storiesHome, storiesCards);
  await writeFile(indexPath(), html);

  await applyStoriesContent(contentRoot, nextStories);
  await applyNavHeroesContent(contentRoot, nextNav);

  return { homepageCta: cta, homepageContact: contact, homepageStories: storiesHome, homepageStoriesCards: storiesCards, stories: mergeStories(nextStories), navHeroes: mergeNavHeroes(nextNav) };
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
              const data = await readAllContentJson();
              send(response, 200, JSON.stringify(data), 'application/json; charset=utf-8');
              return;
            }
            if (request.method === 'POST') {
              const patch = JSON.parse(await readBody(request));
              const data = await writeAllContentJson(patch);
              send(response, 200, JSON.stringify(data), 'application/json; charset=utf-8');
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

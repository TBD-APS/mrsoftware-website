import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULTS = {
  integrations: {
    pill: 'Trading and shipping',
    lead: 'Our products exchange data with the tools around them, so an order, a shipment or a document is entered once. Tell us what you use and we confirm what is supported today.',
  },
  research: {
    label: 'Our papers and projects',
    h1: 'Research behind the software.',
    lead: 'Our papers and projects examine how to build controlled AI and consolidate complex software. Read the proposals, methods and evidence limits, then see how they inform the way we work.',
  },
  roadmap: {
    h1: 'Product roadmap',
    lead: 'See what’s developed, in development or planned for each package.',
    note: 'Developed features are implemented. Availability varies by product and setup.',
  },
  status: {
    label: 'MR Software',
    h1: 'System status',
    lead: 'This page pings our services directly from your browser and shows whether they respond. Each service has to answer with HTTP 200 and a JSON message that identifies the service, not just a generic page. Data refreshes every 60 seconds.',
  },
};

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceMarked(html, start, end, body) {
  const block = `${start}\n${body}\n    ${end}`;
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'm');
  if (!re.test(html)) throw new Error(`Missing markers ${start} ... ${end}`);
  return html.replace(re, block);
}

export function mergeNavHeroes(data) {
  const src = data ?? {};
  return {
    integrations: { ...DEFAULTS.integrations, ...(src.integrations ?? {}) },
    research: { ...DEFAULTS.research, ...(src.research ?? {}) },
    roadmap: { ...DEFAULTS.roadmap, ...(src.roadmap ?? {}) },
    status: { ...DEFAULTS.status, ...(src.status ?? {}) },
  };
}

export function renderIntegrationsHero(d) {
  return `<section class="product-hero on-dark page-hero" aria-labelledby="integrations-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · Integrations</p>
        <p class="pill">${escapeHtml(d.pill)}</p>
        <h1 class="blur-in" id="integrations-title"><span style="--i:0">Connected</span> <span style="--i:1">to</span> <span style="--i:2">the</span> <span style="--i:3">systems</span> <span style="--i:4">your</span> <span style="--i:5">trade</span> <span style="--i:6">already</span> <span style="--i:7">runs</span> <span style="--i:8">on.</span></h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <div class="hero-actions">
          <a class="button button-primary" href="#greeny-example">Explore Greeny</a>
          <a class="button button-secondary" href="#examples">Try Excel and Outlook</a>
          <a class="button button-secondary" href="#categories">See what we connect to</a>
        </div>
        <div class="hub"><svg viewBox="0 0 1200 380" aria-hidden="true"><path class="hub-line" d="M330 64 C 450 64, 430 190, 500 190"/><rect class="hub-node" x="30" y="40" width="300" height="48" rx="12"/><text x="50" y="70">ERP and order management</text><path class="hub-line" d="M330 148 C 450 148, 430 190, 500 190"/><rect class="hub-node" x="30" y="124" width="300" height="48" rx="12"/><text x="50" y="154">Accounting and invoicing</text><path class="hub-line" d="M330 232 C 450 232, 430 190, 500 190"/><rect class="hub-node" x="30" y="208" width="300" height="48" rx="12"/><text x="50" y="238">Carriers and shipping lines</text><path class="hub-line" d="M330 316 C 450 316, 430 190, 500 190"/><rect class="hub-node" x="30" y="292" width="300" height="48" rx="12"/><text x="50" y="322">Freight forwarders</text><path class="hub-line" d="M700 190 C 770 190, 750 64, 870 64"/><rect class="hub-node" x="870" y="40" width="300" height="48" rx="12"/><text x="890" y="70">Customs and trade documents</text><path class="hub-line" d="M700 190 C 770 190, 750 148, 870 148"/><rect class="hub-node" x="870" y="124" width="300" height="48" rx="12"/><text x="890" y="154">Warehouse and inventory</text><path class="hub-line" d="M700 190 C 770 190, 750 232, 870 232"/><rect class="hub-node" x="870" y="208" width="300" height="48" rx="12"/><text x="890" y="238">Email and messaging</text><path class="hub-line" d="M700 190 C 770 190, 750 316, 870 316"/><rect class="hub-node" x="870" y="292" width="300" height="48" rx="12"/><text x="890" y="322">Files and spreadsheets</text><rect class="hub-core" x="500" y="150" width="200" height="80" rx="12"/><text class="hub-core-text" x="600" y="196" text-anchor="middle">Your workflow</text></svg></div>
      </div>
    </section>`;
}

export function renderResearchHero(d) {
  return `<div class="page-hero on-dark">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · Research</p>
        <p class="label">${escapeHtml(d.label)}</p>
        <h1>${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
      </div>
    </div>`;
}

export function renderRoadmapHero(d) {
  return `<div class="page-hero on-light roadmap-hero">
      <div class="page-width">
        <h1>${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="roadmap-note">${escapeHtml(d.note)}</p>
        <nav class="roadmap-jumps" aria-label="Roadmap sections">
          <a href="#greeny-showcase">Explore Greeny</a>
          <a href="#boney-modules">Explore reusable Boney modules</a>
          <a href="#roadmap-packages">Browse the product roadmap</a>
        </nav>
      </div>
    </div>`;
}

export function renderStatusHero(d) {
  return `<div class="page-hero on-dark">
      <div class="page-width">
      <p class="label">${escapeHtml(d.label)}</p>
      <h1>${escapeHtml(d.h1)}</h1>
      <p class="lead">${escapeHtml(d.lead)}</p>
      </div>
    </div>`;
}

export async function readNavHeroesContent(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/nav-heroes.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return mergeNavHeroes({});
    throw e;
  }
}

export async function applyNavHeroesContent(root, data) {
  const d = mergeNavHeroes(data);
  const base = root instanceof URL ? fileURLToPath(root) : root;
  const files = [
    { path: resolve(base, 'integrations/index.html'), start: '<!-- CONTENT:integrationsHero:start -->', end: '<!-- CONTENT:integrationsHero:end -->', html: renderIntegrationsHero(d.integrations) },
    { path: resolve(base, 'research/index.html'), start: '<!-- CONTENT:researchHero:start -->', end: '<!-- CONTENT:researchHero:end -->', html: renderResearchHero(d.research) },
    { path: resolve(base, 'roadmap/index.html'), start: '<!-- CONTENT:roadmapHero:start -->', end: '<!-- CONTENT:roadmapHero:end -->', html: renderRoadmapHero(d.roadmap) },
    { path: resolve(base, 'status/index.html'), start: '<!-- CONTENT:statusHero:start -->', end: '<!-- CONTENT:statusHero:end -->', html: renderStatusHero(d.status) },
  ];
  for (const f of files) {
    const src = await readFile(f.path, 'utf8');
    const next = replaceMarked(src, f.start, f.end, f.html);
    if (next !== src) await writeFile(f.path, next);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const data = await readNavHeroesContent(root);
  await applyNavHeroesContent(root, data);
  console.log('Updated nav hero sections from data/nav-heroes.json');
}

import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULTS = {
  storiesIndex: {
    h1: 'The work, told as a day.',
    lead: 'A buyer writes. A technician is on site. A trailer is already on the road. The software is built to be there for that day, and to keep the record in one place.',
    label: 'These are the working days the products are built for. They are not a quote from a named customer, and they are not a measured saving.',
  },
  theOffer: {
    h1: 'The offer is ready before the chat goes quiet.',
    lead: 'The buyer does not open a new system to ask for frozen fish. They write in WhatsApp. Tradey is built so that message becomes an offer, and the offer waits for a person before it is sent.',
    label: 'A working day the product is built for. Not a quote from a named customer, and not a measured saving.',
  },
  theJob: {
    h1: 'The office sees what the field already recorded.',
    lead: 'The job is created in the morning. On site, the checklist is completed and the photos are attached. The approval waits for the office. Nothing is typed a second time to make that true.',
    label: 'A working day the product is built for. Not a quote from a named customer, and not a measured saving.',
  },
  theShipment: {
    h1: 'The shipment is not rebuilt from an inbox.',
    lead: 'An independent forwarder books the same kind of road work every week. The confirmation, the packing list, customs and the proof of delivery belong to that shipment. Shippy keeps them there.',
    label: 'A working day the product is built for. Not a quote from a named customer, and not a measured saving.',
  },
  theChoices: {
    h1: 'We chose the place the work already lives.',
    lead: 'The products look different because the days are different. The choices underneath are the same: one record, a person on anything that leaves the building, and a public account of how we check the software.',
    label: 'This page is how we build. It is not a quote from a named customer, and it is not a measured saving.',
  },
};

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function mergeStories(data) {
  const src = data ?? {};
  return {
    storiesIndex: { ...DEFAULTS.storiesIndex, ...(src.storiesIndex ?? {}) },
    theOffer: { ...DEFAULTS.theOffer, ...(src.theOffer ?? {}) },
    theJob: { ...DEFAULTS.theJob, ...(src.theJob ?? {}) },
    theShipment: { ...DEFAULTS.theShipment, ...(src.theShipment ?? {}) },
    theChoices: { ...DEFAULTS.theChoices, ...(src.theChoices ?? {}) },
  };
}

function wrap(start, end, body) {
  return `${start}\n${body}\n    ${end}`;
}

function replaceMarked(html, start, end, body) {
  const block = wrap(start, end, body);
  const re = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`, 'm');
  if (!re.test(html)) throw new Error(`Missing markers ${start} ... ${end}`);
  return html.replace(re, block);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function renderStoriesIndexHero(d) {
  return `<section class="product-hero on-dark page-hero" aria-labelledby="stories-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · Stories</p>
        <h1 id="stories-title">${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="story-label">${escapeHtml(d.label)}</p>
      </div>
    </section>`;
}

export function renderStoryOfferHero(d) {
  return `<section class="product-hero page-hero status-building" aria-labelledby="offer-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · <a href="/stories/">Stories</a> · The offer</p>
        <p class="status"><span class="status-state">Tradey</span><span>In development · Demo</span></p>
        <h1 id="offer-title">${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="story-label">${escapeHtml(d.label)}</p>
      </div>
    </section>`;
}

export function renderStoryJobHero(d) {
  return `<section class="product-hero on-dark page-hero" aria-labelledby="job-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · <a href="/stories/">Stories</a> · The job</p>
        <p class="status"><span class="status-state">Workslip</span><span>Live</span></p>
        <h1 id="job-title">${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="story-label">${escapeHtml(d.label)}</p>
      </div>
    </section>`;
}

export function renderStoryShipmentHero(d) {
  return `<section class="product-hero page-hero status-building" aria-labelledby="shipment-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · <a href="/stories/">Stories</a> · The shipment</p>
        <p class="status"><span class="status-state">Shippy</span><span>Demo</span></p>
        <h1 id="shipment-title">${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="story-label">${escapeHtml(d.label)}</p>
      </div>
    </section>`;
}

export function renderStoryChoicesHero(d) {
  return `<section class="product-hero on-dark page-hero" aria-labelledby="choices-title">
      <div class="page-width">
        <p class="breadcrumbs"><a href="/">Home</a> · <a href="/stories/">Stories</a> · The choices</p>
        <p class="status"><span class="status-state">How we build</span><span>On purpose</span></p>
        <h1 id="choices-title">${escapeHtml(d.h1)}</h1>
        <p class="lead">${escapeHtml(d.lead)}</p>
        <p class="story-label">${escapeHtml(d.label)}</p>
      </div>
    </section>`;
}

export async function readStoriesContent(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/stories-content.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return mergeStories({});
    throw e;
  }
}

export async function applyStoriesContent(root, data) {
  const d = mergeStories(data);
  const base = root instanceof URL ? fileURLToPath(root) : root;

  const files = [
    {
      path: resolve(base, 'stories/index.html'),
      start: '<!-- CONTENT:storiesIndexHero:start -->',
      end: '<!-- CONTENT:storiesIndexHero:end -->',
      html: renderStoriesIndexHero(d.storiesIndex),
    },
    {
      path: resolve(base, 'stories/the-offer/index.html'),
      start: '<!-- CONTENT:storyOfferHero:start -->',
      end: '<!-- CONTENT:storyOfferHero:end -->',
      html: renderStoryOfferHero(d.theOffer),
    },
    {
      path: resolve(base, 'stories/the-job/index.html'),
      start: '<!-- CONTENT:storyJobHero:start -->',
      end: '<!-- CONTENT:storyJobHero:end -->',
      html: renderStoryJobHero(d.theJob),
    },
    {
      path: resolve(base, 'stories/the-shipment/index.html'),
      start: '<!-- CONTENT:storyShipmentHero:start -->',
      end: '<!-- CONTENT:storyShipmentHero:end -->',
      html: renderStoryShipmentHero(d.theShipment),
    },
    {
      path: resolve(base, 'stories/the-choices/index.html'),
      start: '<!-- CONTENT:storyChoicesHero:start -->',
      end: '<!-- CONTENT:storyChoicesHero:end -->',
      html: renderStoryChoicesHero(d.theChoices),
    },
  ];

  for (const f of files) {
    const src = await readFile(f.path, 'utf8');
    const next = replaceMarked(src, f.start, f.end, f.html);
    if (next !== src) await writeFile(f.path, next);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const data = await readStoriesContent(root);
  await applyStoriesContent(root, data);
  console.log('Updated stories hero sections from data/stories-content.json');
}

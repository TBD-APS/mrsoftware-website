import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULTS = {
  homepageCta: {
    eyebrow: 'Ready when you are',
    heading: 'Stop chasing updates in inboxes and spreadsheets.',
    lead: 'Tell us where work gets stuck — we’ll show you the simplest way to put orders, shipments, and approvals in one place.',
    primaryLabel: 'Book a short conversation →',
    primaryHref: "mailto:wp@mrsoftware.dk?subject=Let%E2%80%99s%20fix%20a%20workflow",
    secondaryLabel: 'Try the demos',
    secondaryHref: '/demo/',
  },
  homepageContact: {
    eyebrow: 'Get started',
    heading: 'Tell us where the work gets stuck.',
    lead: 'Write a few lines about the workflow. We reply by email and tell you whether software is the right fix.',
    primaryLabel: 'Email us →',
    primaryHref: 'mailto:wp@mrsoftware.dk?subject=Conversation%20about%20software%20and%20workflows',
    secondaryLabel: 'Contact details',
    secondaryHref: '/contact/',
  },
  homepageStories: {
    eyebrow: 'Stories',
    heading: 'Four working days, and the choices behind them.',
    lead: 'A buyer in a chat. A job on site. A shipment already on the road. The software is built for that day.',
  },
  homepageStoriesCards: [
    { title: 'The offer', href: '/stories/the-offer/', text: 'The buyer asks in the chat they already use. The offer is drafted there, and a person approves it before it is sent.' },
    { title: 'The job', href: '/stories/the-job/', text: 'The checklist, the photos and the approval stay with the job. The office sees what was recorded on site.' },
    { title: 'The shipment', href: '/stories/the-shipment/', text: 'Booking, documents, customs and status stay with the shipment. Nobody rebuilds it from an inbox.' },
    { title: 'The choices', href: '/stories/the-choices/', text: 'Why the software sits where the work already is, and why a person still approves what leaves the building.' },
  ],
  homepageUseCases: {
    eyebrow: 'Use cases',
    heading: "Four examples of software we've built.",
  },
};

export function mergeHomepageCta(data) {
  const src = data?.homepageCta ?? {};
  return { ...DEFAULTS.homepageCta, ...src };
}

export function mergeHomepageContact(data) {
  const src = data?.homepageContact ?? {};
  return { ...DEFAULTS.homepageContact, ...src };
}

export function mergeHomepageStories(data) {
  const src = data?.homepageStories ?? {};
  return { ...DEFAULTS.homepageStories, ...src };
}

export function mergeHomepageUseCases(data) {
  const src = data?.homepageUseCases ?? {};
  return { ...DEFAULTS.homepageUseCases, ...src };
}

export function mergeHomepageStoriesCards(data) {
  const src = Array.isArray(data?.homepageStoriesCards) ? data.homepageStoriesCards : [];
  const out = [];
  for (let i = 0; i < 4; i++) {
    const d = src[i] && typeof src[i] === 'object' ? src[i] : {};
    const def = DEFAULTS.homepageStoriesCards[i];
    out.push({
      title: String(d.title ?? def.title),
      href: String(d.href ?? def.href),
      text: String(d.text ?? def.text),
    });
  }
  return out;
}

export function renderHomepageCtaBlock(cta) {
  const label = String(cta.primaryLabel ?? '');
  const hasArrow = label.includes('→');
  const labelHtml = escapeHtml(label);
  return `<section class="section band-rose" id="get-started-cta" aria-labelledby="get-started-cta-heading">
      <div class="page-width" data-reveal>
        <p class="eyebrow">${escapeHtml(cta.eyebrow)}</p>
        <h2 class="heading" id="get-started-cta-heading">${escapeHtml(cta.heading)}</h2>
        <p class="lead">${escapeHtml(cta.lead)}</p>
        <div class="hero-actions contact-actions" style="margin-top: var(--s4);">
          <a class="button button-primary" href="${escapeAttr(cta.primaryHref)}">${labelHtml}${hasArrow ? '' : ' <span class="arrow" aria-hidden="true">→</span>'}</a>
          <a class="button button-secondary" href="${escapeAttr(cta.secondaryHref)}">${escapeHtml(cta.secondaryLabel)}</a>
        </div>
      </div>
    </section>`;
}

export function renderHomepageContactBlock(c) {
  const label = String(c.primaryLabel ?? '');
  const hasArrow = label.includes('→');
  const labelHtml = escapeHtml(label);
  return `<section class="section band-night cta-night" id="contact" aria-labelledby="contact-heading">
      <div class="page-width" data-reveal>
        <p class="eyebrow">${escapeHtml(c.eyebrow)}</p>
        <h2 class="heading" id="contact-heading">${escapeHtml(c.heading)}</h2>
        <p class="lead">${escapeHtml(c.lead)}</p>
        <div class="contact-actions">
          <a class="button button-light" href="${escapeAttr(c.primaryHref)}">${labelHtml}${hasArrow ? '' : ' <span class="arrow" aria-hidden="true">→</span>'}</a>
          <a class="button button-light" href="${escapeAttr(c.secondaryHref)}">${escapeHtml(c.secondaryLabel)}</a>
        </div>
      </div>
    </section>`;
}

export function renderHomepageStoriesBlock(s, cards) {
  const c = cards ?? mergeHomepageStoriesCards({ homepageStoriesCards: DEFAULTS.homepageStoriesCards });
  const cardsHtml = c.map(card => `          <article class="use">
            <h3><a href="${escapeAttr(card.href)}">${escapeHtml(card.title)}</a></h3>
            <p>${escapeHtml(card.text)}</p>
          </article>`).join('\n');
  return `<section class="section" id="stories" aria-labelledby="stories-heading">
      <div class="page-width">
        <div data-reveal>
          <p class="eyebrow">${escapeHtml(s.eyebrow)}</p>
          <h2 class="heading" id="stories-heading">${escapeHtml(s.heading)}</h2>
          <p class="lead">${escapeHtml(s.lead)}</p>
        </div>
        <!-- CONTENT:homepageStoriesCards:start -->
        <div class="uses" data-reveal>
${cardsHtml}
        </div>
        <!-- CONTENT:homepageStoriesCards:end -->
      </div>
    </section>`;
}

export function renderHomepageUseCasesIntro(u) {
  return `          <p class="eyebrow">${escapeHtml(u.eyebrow)}</p>
          <h2 class="heading" id="solutions-heading">${escapeHtml(u.heading)}</h2>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(str) {
  return String(str).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

const CTA_START = '<!-- CTA:homepage:start -->';
const CTA_END = '<!-- CTA:homepage:end -->';
const CONTACT_START = '<!-- CONTENT:homepageContact:start -->';
const CONTACT_END = '<!-- CONTENT:homepageContact:end -->';
const STORIES_START = '<!-- CONTENT:homepageStories:start -->';
const STORIES_END = '<!-- CONTENT:homepageStories:end -->';
const USECASES_INTRO_START = '<!-- CONTENT:homepageUseCasesIntro:start -->';
const USECASES_INTRO_END = '<!-- CONTENT:homepageUseCasesIntro:end -->';

export function applyHomepageCtaHtml(html, cta) {
  const block = `${CTA_START}\n${renderHomepageCtaBlock(cta)}\n    ${CTA_END}`;
  const re = new RegExp(`${escapeRegExp(CTA_START)}[\\s\\S]*?${escapeRegExp(CTA_END)}`, 'm');
  if (!re.test(html)) {
    throw new Error('Homepage CTA markers not found in index.html. Add <!-- CTA:homepage:start --> and <!-- CTA:homepage:end --> around the CTA section.');
  }
  return html.replace(re, block);
}

export function applyHomepageContactHtml(html, c) {
  const block = `${CONTACT_START}\n${renderHomepageContactBlock(c)}\n    ${CONTACT_END}`;
  const re = new RegExp(`${escapeRegExp(CONTACT_START)}[\\s\\S]*?${escapeRegExp(CONTACT_END)}`, 'm');
  if (!re.test(html)) {
    throw new Error('Homepage contact markers not found in index.html.');
  }
  return html.replace(re, block);
}

export function applyHomepageStoriesHtml(html, s, cards) {
  const block = `${STORIES_START}\n${renderHomepageStoriesBlock(s, cards)}\n    ${STORIES_END}`;
  const re = new RegExp(`${escapeRegExp(STORIES_START)}[\\s\\S]*?${escapeRegExp(STORIES_END)}`, 'm');
  if (!re.test(html)) {
    throw new Error('Homepage stories markers not found in index.html.');
  }
  return html.replace(re, block);
}

export function applyHomepageUseCasesIntroHtml(html, u) {
  const block = `${USECASES_INTRO_START}\n${renderHomepageUseCasesIntro(u)}\n          ${USECASES_INTRO_END}`;
  const re = new RegExp(`${escapeRegExp(USECASES_INTRO_START)}[\\s\\S]*?${escapeRegExp(USECASES_INTRO_END)}`, 'm');
  if (!re.test(html)) {
    throw new Error('Homepage use cases intro markers not found in index.html.');
  }
  return html.replace(re, block);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function readSiteContent(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/site-content.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return { homepageCta: { ...DEFAULTS.homepageCta }, homepageContact: { ...DEFAULTS.homepageContact }, homepageStories: { ...DEFAULTS.homepageStories } };
    throw e;
  }
}

export function mergeAllContent(data) {
  return {
    homepageCta: mergeHomepageCta(data),
    homepageContact: mergeHomepageContact(data),
    homepageStories: mergeHomepageStories(data),
    homepageStoriesCards: mergeHomepageStoriesCards(data),
    homepageUseCases: mergeHomepageUseCases(data),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const data = await readSiteContent(root);
  const { homepageCta, homepageContact, homepageStories, homepageStoriesCards } = mergeAllContent(data);
  const indexPath = resolve(fileURLToPath(root), 'index.html');
  let html = await readFile(indexPath, 'utf8');
  html = applyHomepageCtaHtml(html, homepageCta);
  html = applyHomepageContactHtml(html, homepageContact);
  html = applyHomepageStoriesHtml(html, homepageStories, homepageStoriesCards);
  html = applyHomepageUseCasesIntroHtml(html, mergeHomepageUseCases(data));
  await writeFile(indexPath, html);
  console.log('Homepage content render complete.');
}

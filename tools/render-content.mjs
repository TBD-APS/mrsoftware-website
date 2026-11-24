import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULTS = {
  homepageCta: {
    eyebrow: 'Ready when you are',
    heading: 'Stop chasing updates in inboxes and spreadsheets.',
    lead: 'Tell us where work gets stuck, and we’ll show you the simplest way to put orders, shipments, and approvals in one place.',
    primaryLabel: 'Book a short conversation →',
    primaryHref: "mailto:wp@mrsoftware.dk?subject=Let%E2%80%99s%20fix%20a%20workflow",
    secondaryLabel: 'Try the demos',
    secondaryHref: '/demo/',
  },
};

export function mergeHomepageCta(data) {
  const src = data?.homepageCta ?? {};
  return { ...DEFAULTS.homepageCta, ...src };
}

export function renderHomepageCtaBlock(cta) {
  return `<section class="section band-rose" id="get-started-cta" aria-labelledby="get-started-cta-heading">
      <div class="page-width" data-reveal>
        <p class="eyebrow">${escapeHtml(cta.eyebrow)}</p>
        <h2 class="heading" id="get-started-cta-heading">${escapeHtml(cta.heading)}</h2>
        <p class="lead">${escapeHtml(cta.lead)}</p>
        <div class="hero-actions contact-actions" style="margin-top: var(--s4);">
          <a class="button button-primary" href="${escapeAttr(cta.primaryHref)}">${escapeHtml(cta.primaryLabel)} <span class="arrow" aria-hidden="true">→</span></a>
          <a class="button button-secondary" href="${escapeAttr(cta.secondaryHref)}">${escapeHtml(cta.secondaryLabel)}</a>
        </div>
      </div>
    </section>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function escapeAttr(str) {
  // Keep simple: escape quotes and ampersands for hrefs we control; also basic safety.
  return String(str).replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

const CTA_START = '<!-- CTA:homepage:start -->';
const CTA_END = '<!-- CTA:homepage:end -->';

export function applyHomepageCtaHtml(html, cta) {
  const block = `${CTA_START}\n${renderHomepageCtaBlock(cta)}\n    ${CTA_END}`;
  const re = new RegExp(`${escapeRegExp(CTA_START)}[\\s\\S]*?${escapeRegExp(CTA_END)}`, 'm');
  if (!re.test(html)) {
    throw new Error('Homepage CTA markers not found in index.html. Add <!-- CTA:homepage:start --> and <!-- CTA:homepage:end --> around the CTA section.');
  }
  return html.replace(re, block);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

export async function readSiteContent(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/site-content.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return { homepageCta: { ...DEFAULTS.homepageCta } };
    throw e;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const data = await readSiteContent(root);
  const cta = mergeHomepageCta(data);
  const indexPath = resolve(fileURLToPath(root), 'index.html');
  const html = await readFile(indexPath, 'utf8');
  const next = applyHomepageCtaHtml(html, cta);
  if (next !== html) {
    await writeFile(indexPath, next);
    console.log('Updated homepage CTA from data/site-content.json');
  } else {
    console.log('Homepage CTA already up to date.');
  }
}

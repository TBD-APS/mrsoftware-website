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
};

export function mergeHomepageCta(data) {
  const src = data?.homepageCta ?? {};
  return { ...DEFAULTS.homepageCta, ...src };
}

export function mergeHomepageContact(data) {
  const src = data?.homepageContact ?? {};
  return { ...DEFAULTS.homepageContact, ...src };
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

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function readSiteContent(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/site-content.json');
  try {
    const raw = await readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === 'ENOENT') return { homepageCta: { ...DEFAULTS.homepageCta }, homepageContact: { ...DEFAULTS.homepageContact } };
    throw e;
  }
}

export function mergeAllContent(data) {
  return {
    homepageCta: mergeHomepageCta(data),
    homepageContact: mergeHomepageContact(data),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = new URL('..', import.meta.url);
  const data = await readSiteContent(root);
  const { homepageCta, homepageContact } = mergeAllContent(data);
  const indexPath = resolve(fileURLToPath(root), 'index.html');
  let html = await readFile(indexPath, 'utf8');
  const next1 = applyHomepageCtaHtml(html, homepageCta);
  html = next1;
  const next2 = applyHomepageContactHtml(html, homepageContact);
  if (next2 !== (await readFile(indexPath, 'utf8'))) {
    await writeFile(indexPath, next2);
    console.log('Updated homepage content from data/site-content.json');
  } else {
    // still write if CTA changed only
    const afterCta = await readFile(indexPath, 'utf8');
    if (afterCta !== next2) await writeFile(indexPath, next2);
    console.log('Homepage content render complete.');
  }
}

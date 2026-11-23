import { parse } from 'parse5';
import { publicCommercialEntry } from '../website-entry.mjs';

export const origin = 'https://mrsoftware.dk';
export const normalize = value => value.replace(/\s+/g, ' ').trim();
const humanAttributes = new Set(['alt', 'title', 'aria-label', 'aria-description', 'aria-valuetext', 'placeholder', 'data-detail', 'data-label-open', 'data-label-close', 'data-label-ok', 'data-label-warning', 'data-label-down', 'data-label-probe', 'data-label-health', 'data-label-unreachable', 'data-label-static', 'data-label-last-check', 'data-label-completion', 'data-related-heading', 'data-link-list-heading']);
const humanJsonKeys = new Set(['name', 'description', 'headline', 'text', 'caption']);
export const runtimeStrings = ['tonne-km', 'See also', 'The offer', 'The job', 'The shipment', 'The choices', 'Greeny emissions example', 'Excel and Outlook examples', 'What we can connect', 'Reusable Boney modules', 'Principles', 'Decision gates', 'Evaluation', 'Research papers', 'Security and data privacy', 'How we validate', 'System status', 'Greeny', 'Sample reply approved. No email was sent.', 'contact selected for import.', 'contacts selected for import.'];
const attributes = node => Object.fromEntries((node.attrs ?? []).map(item => [item.name, item.value]));
const isMetadata = node => node.tagName === 'meta' && /description|title|image:alt|keywords/.test(attributes(node).name ?? attributes(node).property ?? '');
const escapeText = value => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = value => escapeText(value).replace(/"/g, '&quot;');
function walk(node, visit) { visit(node); for (const child of node.childNodes ?? []) walk(child, visit); }
function patches(source, changes) {
  for (const change of changes.sort((a, b) => b.start - a.start)) source = source.slice(0, change.start) + change.value + source.slice(change.end);
  return source;
}
const textCandidate = value => /[A-Za-zÀ-ž]/.test(value) && !/^(?:https?:|mailto:|\/)/.test(value) && !/^\d{4}-\d{2}-\d{2}T[\d:.+-]+Z?$/.test(value);

export function pageAddress(file) { return file === 'index.html' ? '/' : '/' + file.replace(/index\.html$/, ''); }
export function danishAddress(path) { return path.startsWith('/da/') ? path : '/da' + path; }

export function localizeLink(value, path, pages) {
  if (!value || value.startsWith('#') || /^(?:mailto:|tel:|data:|javascript:)/i.test(value)) return value;
  const url = new URL(value, origin + path);
  if (url.origin !== origin) return value;
  if (pages.has(url.pathname)) url.pathname = danishAddress(url.pathname);
  else {
    const redirect = publicCommercialEntry(new Request(url));
    if (redirect) return redirect.headers.get('Location');
  }
  return /^https?:/i.test(value) ? url.href : url.pathname + url.search + url.hash;
}

export function htmlStrings(source) {
  const strings = new Set();
  const add = value => { const text = normalize(value); if (textCandidate(text)) strings.add(text); };
  function jsonStrings(value) {
    if (Array.isArray(value)) value.forEach(jsonStrings);
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) {
      if (humanJsonKeys.has(key) && typeof item === 'string') add(item); else jsonStrings(item);
    }
  }
  walk(parse(source), node => {
    if (node.nodeName === '#text' && !['style', 'script'].includes(node.parentNode?.tagName) && !attributes(node.parentNode ?? {}).class?.split(' ').includes('language-switch')) add(node.value);
    if (node.tagName === 'script' && attributes(node).type === 'application/ld+json') jsonStrings(JSON.parse(node.childNodes.map(child => child.value ?? '').join('')));
    for (const attr of node.attrs ?? []) {
      if (humanAttributes.has(attr.name) || (isMetadata(node) && attr.name === 'content')) add(attr.value);
      if (attr.name === 'href' && attr.value.startsWith('mailto:')) {
        for (const [name, value] of new URL(attr.value).searchParams) if (['subject', 'body'].includes(name)) add(value);
      }
    }
  });
  return [...strings];
}

export function normalizeEnglish(source, translations) {
  const changes = [];
  function visit(node) {
    const attrs = attributes(node);
    if (attrs.lang === 'da' || ['script', 'style'].includes(node.tagName)) return;
    const update = value => {
      const key = normalize(value);
      return Object.hasOwn(translations, key) ? value.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, before, after) => before + translations[key] + after) : value;
    };
    if (node.nodeName === '#text') {
      const value = update(node.value);
      if (value !== node.value) changes.push({ start: node.sourceCodeLocation.startOffset, end: node.sourceCodeLocation.endOffset, value: escapeText(value) });
    }
    for (const attr of node.attrs ?? []) if (humanAttributes.has(attr.name) || (isMetadata(node) && attr.name === 'content')) {
      const value = update(attr.value);
      if (value !== attr.value) { const range = node.sourceCodeLocation.attrs[attr.name]; changes.push({ start: range.startOffset, end: range.endOffset, value: `${attr.name}="${escapeAttribute(value)}"` }); }
    }
    for (const child of node.childNodes ?? []) visit(child);
  }
  visit(parse(source, { sourceCodeLocationInfo: true }));
  return patches(source, changes);
}

// Source offsets retain the original markup, SVGs, identifiers and numeric data.
export function languageLinks(source, path, locale = 'en') {
  const removals = [];
  walk(parse(source, { sourceCodeLocationInfo: true }), node => {
    const attrs = attributes(node);
    if (node.tagName !== 'link' || attrs.rel !== 'alternate' || !['en', 'da', 'x-default'].includes(attrs.hreflang)) return;
    const location = node.sourceCodeLocation;
    let start = location.startOffset;
    while (start > 0 && /[ \t]/.test(source[start - 1])) start--;
    const newline = source.indexOf('\n', location.endOffset);
    const end = newline >= 0 && !source.slice(location.endOffset, newline).trim() ? newline + 1 : location.endOffset;
    removals.push({ start, end, value: '' });
  });
  source = patches(source, removals);
  const tree = parse(source, { sourceCodeLocationInfo: true });
  const changes = [];
  let head, body, brand, language;
  walk(tree, node => {
    const attrs = attributes(node);
    if (node.tagName === 'head') head = node;
    if (node.tagName === 'body') body = node;
    if (attrs.class?.split(' ').includes('brand')) brand = node;
    if (attrs.class?.split(' ').includes('language-switch')) language = node;
  });
  if (head) {
    const end = head.sourceCodeLocation.endTag.startOffset;
    const links = [['en', path], ['da', danishAddress(path)], ['x-default', path]].map(([language, address]) => `  <link rel="alternate" hreflang="${language}" href="${origin + address}">`).join('\n');
    changes.push({ start: end, end, value: (source[end - 1] === '\n' ? '' : '\n') + links + '\n' });
  }
  const standalone = !brand ? ' style="display:inline-block;margin:1rem;padding:.5rem"' : '';
  const other = locale === 'da' ? 'en' : 'da';
  const link = `<a class="language-switch"${standalone} href="${other === 'en' ? path : danishAddress(path)}" lang="${other}" hreflang="${other}">${other === 'en' ? 'English' : 'Dansk'}</a>`;
  if (language) changes.push({ start: language.sourceCodeLocation.startOffset, end: language.sourceCodeLocation.endOffset, value: link });
  else if (brand) changes.push({ start: brand.sourceCodeLocation.endOffset, end: brand.sourceCodeLocation.endOffset, value: '\n      ' + link });
  else if (body) changes.push({ start: body.sourceCodeLocation.startTag.endOffset, end: body.sourceCodeLocation.startTag.endOffset, value: '\n' + link + '\n' });
  return patches(source, changes).replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n');
}
export const englishLanguageLinks = (source, path) => languageLinks(source, path, 'en');

export function reportArticle(source) {
  let location;
  walk(parse(source, { sourceCodeLocationInfo: true }), node => {
    if (node.tagName === 'article' && attributes(node).class?.split(' ').includes('mr-content')) location = node.sourceCodeLocation;
  });
  if (!location) throw Error('Missing admitted report article');
  return { ...location, html: source.slice(location.startOffset, location.endOffset) };
}

export function translateHtml(source, { dictionary, path, pages, heading }) {
  const translate = value => {
    const key = normalize(value);
    if (!textCandidate(key)) return value;
    if (!Object.hasOwn(dictionary, key) || !dictionary[key]) throw Error(`Missing Danish translation on ${path}: ${key}`);
    return value.replace(/^(\s*)[\s\S]*?(\s*)$/, (_, before, after) => before + dictionary[key] + after);
  };
  const changes = [];
  const tree = parse(source, { sourceCodeLocationInfo: true });
  let head, siteScript;
  function json(value, key = '') {
    if (Array.isArray(value)) return value.map(item => json(item, key));
    if (value && typeof value === 'object') {
      const result = Object.fromEntries(Object.entries(value).map(([name, item]) => [name, json(item, name)]));
      if (['WebPage', 'WebSite'].includes(result['@type'])) result.inLanguage = 'da';
      return result;
    }
    if (typeof value !== 'string') return value;
    if (humanJsonKeys.has(key)) return translate(value);
    if (/^https?:/i.test(value) && new URL(value).origin === origin && !value.endsWith('#organization')) return localizeLink(value, path, pages);
    return value;
  }
  function visit(node, skip = false) {
    const attrs = attributes(node);
    const location = node.sourceCodeLocation;
    const commercialLink = node.tagName === 'a' && attrs.href && !attrs.href.startsWith('#') && publicCommercialEntry(new Request(new URL(attrs.href, origin + path)));
    if (commercialLink) {
      if (!attrs.hreflang) changes.push({ start: location.startTag.endOffset - 1, end: location.startTag.endOffset - 1, value: ' hreflang="en"' });
      changes.push({ start: location.endTag.startOffset, end: location.endTag.startOffset, value: ' <span>(engelsk)</span>' });
    }
    if (node.tagName === 'head') head = node;
    if (node.tagName === 'script' && attrs.src === '/js/site.js') siteScript = node;
    if (node.tagName === 'h1' && heading) {
      if (/<\/?(?:script|iframe|style)|\son\w+\s*=/i.test(heading)) throw Error('Unsafe heading override');
      changes.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, value: heading });
      skip = true;
    }
    if (node.tagName === 'script') {
      if (attrs.type === 'application/ld+json') {
        const value = JSON.stringify(json(JSON.parse(node.childNodes.map(child => child.value ?? '').join(''))), null, 2).replace(/</g, '\\u003c');
        changes.push({ start: location.startTag.endOffset, end: location.endTag.startOffset, value: '\n' + value + '\n  ' });
      }
      return;
    }
    if (node.tagName === 'style') return;
    if (attrs.class?.split(' ').includes('language-switch')) {
      changes.push({ start: location.startOffset, end: location.endOffset, value: `<a class="language-switch"${attrs.style ? ` style="${escapeAttribute(attrs.style)}"` : ''} href="${path}" lang="en" hreflang="en">English</a>` });
      return;
    }
    if (node.nodeName === '#text' && !skip && textCandidate(normalize(node.value))) changes.push({ start: location.startOffset, end: location.endOffset, value: escapeText(translate(node.value)) });
    for (const attr of node.attrs ?? []) {
      let value = attr.value;
      if (attr.name === 'lang' && node.tagName === 'html') value = 'da';
      else if (humanAttributes.has(attr.name) || (isMetadata(node) && attr.name === 'content')) value = translate(value);
      else if (node.tagName === 'meta' && attrs.property === 'og:locale') value = 'da_DK';
      else if (node.tagName === 'meta' && attrs.property === 'og:url') value = localizeLink(value, path, pages);
      else if (['href', 'src', 'action'].includes(attr.name) && !(node.tagName === 'link' && attrs.rel === 'alternate')) {
        if (value.startsWith('mailto:')) {
          const url = new URL(value);
          for (const [name, text] of url.searchParams) if (['subject', 'body'].includes(name)) url.searchParams.set(name, translate(text));
          url.search = url.search.replace(/\+/g, '%20');
          value = url.href;
        } else value = localizeLink(value, path, pages);
      }
      if (value !== attr.value) {
        const range = location.attrs[attr.name];
        changes.push({ start: range.startOffset, end: range.endOffset, value: `${attr.name}="${escapeAttribute(value)}"` });
      }
    }
    if (!skip) for (const child of node.childNodes ?? []) visit(child);
  }
  visit(tree);
  if (head && !source.includes('property="og:locale"')) changes.push({ start: head.sourceCodeLocation.endTag.startOffset, end: head.sourceCodeLocation.endTag.startOffset, value: '  <meta property="og:locale" content="da_DK">\n' });
  if (siteScript) changes.push({ start: siteScript.sourceCodeLocation.startOffset, end: siteScript.sourceCodeLocation.startOffset, value: '<script src="/js/site-locale.da.js" defer></script>\n  ' });
  let html = patches(source, changes);
  if (path === '/') {
    for (const [legacy, current] of [['produkter', 'solutions'], ['kontakt', 'contact'], ['ansvar', 'responsibility']]) {
      const expression = new RegExp(`(<(?:section|div)\\b[^>]*\\bid="${current}"[^>]*>)`);
      if (expression.test(html)) html = html.replace(expression, `$1<span id="${legacy}" aria-hidden="true" style="display:block;scroll-margin-top:80px"></span>`);
    }
  }
  return html;
}

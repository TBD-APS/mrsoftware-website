// UX gate. Walks the customer journeys in headless Chrome on desktop and phone (the projects in
// playwright.config.mjs), each with a click budget, then audits every screen for dead clicks, names that
// do not open their record, unnamed controls, small tap targets, tiny text, buried headings, sideways
// overflow, hidden menu items, broken deep links, a record page without what config.everyRecordShows names
// (for example its history), and browser errors.
// App-specific parts live in ux.config.mjs, and the journeys in tests/ux/journeys.mjs. This file is the
// shared ux-flows gate and is copied unchanged between projects.
import { test as base, expect } from '@playwright/test';
import config from '../../ux.config.mjs';
import { journeys } from './journeys.mjs';

const interactive = config.clickable ?? 'a[href],button,input,select,textarea,summary,label,[role=button],[role=link],[onclick],[data-href],[data-action]';
const roots = config.roots ?? ['main', 'dialog[open]'];
const exempt = config.exempt ?? 'h1,pre,code,[data-plain-name]';
const nav = config.nav ?? 'nav a';
const busy = config.busy ?? '[aria-busy="true"]';
const ready = config.ready ?? (page => page.waitForSelector('main', { timeout: 10_000 }));

const routeOf = (page, base) => page.url().startsWith(base) ? page.url().slice(base.length) : page.url();

const test = base.extend({
  // A fresh app for every test, so a journey can change settings freely (config.start).
  app: async ({}, use) => {
    const app = await config.start();
    try {
      await use(app);
    } finally {
      await app.close();
    }
  },
  // An app whose controls need a signed-in person signs the fresh context in here (config.prepare).
  context: async ({ context, app }, use) => {
    await config.prepare?.({ context, base: app.base });
    await use(context);
  },
  // Every browser error a test sees, with the screen it was on. A test fails when the list is not empty.
  browserErrors: async ({ page, app }, use) => {
    const errors = [];
    page.on('pageerror', error => errors.push(`page error on ${routeOf(page, app.base) || '(start)'}: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console error on ${routeOf(page, app.base) || '(start)'}: ${message.text()}`);
    });
    await use(errors);
  },
});

// The screen is ready when the app says so, nothing tells assistive technology it is still busy, and
// its entrance animations have finished. A box measured mid-animation is moved or scaled, so a 24 px
// tap target could read as 23.99 px. Endless animations (spinners) are not waited for.
async function settle(page) {
  await ready(page);
  await page.waitForFunction(selector => !document.querySelector(selector), busy, { timeout: 10_000 })
    .catch(() => { throw new Error(`screen never settled: ${busy} is still present`); });
  await page.waitForTimeout(200);
  await page.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
      .map(animation => animation.finished.catch(() => {}))),
    new Promise(done => setTimeout(done, 3000)),
  ]));
}

const scopeOf = (page, within) => !within ? page : typeof within === 'string' ? page.locator(within) : page.locator(within.selector, { hasText: within.hasText });
const named = (scope, role, name) => scope.getByRole(role, { name, exact: typeof name === 'string' }).filter({ visible: true }).first();
const describe = step => step.click ? `click ${step.click} "${step.name}"` : step.clickCard ? `click card ${step.clickCard} "${step.hasText}"` : step.check ? `tick "${step.check}"` : step.fill ? `fill "${step.fill}"` : step.select ? `choose "${step.select}"` : 'check state';

// The first point inside the card that a person can click without hitting one of its own controls.
async function emptySpot(card) {
  return card.evaluate((element, selector) => {
    const box = element.getBoundingClientRect();
    for (const fy of [0.5, 0.8, 0.2, 0.95, 0.05]) for (const fx of [0.9, 0.7, 0.5, 0.3, 0.1]) {
      const x = box.left + box.width * fx, y = box.top + box.height * fy, hit = document.elementFromPoint(x, y);
      const control = hit?.closest(selector);
      if (hit && element.contains(hit) && (!control || control === element || !element.contains(control))) return { x, y };
    }
    return null;
  }, interactive);
}

async function runStep(page, step, count, base) {
  const scope = scopeOf(page, step.within);
  if (step.click) { await named(scope, step.click, step.name).click({ timeout: 5000 }); count.clicks++; return; }
  if (step.clickCard) {
    const card = page.locator(step.clickCard, { hasText: step.hasText }).filter({ visible: true }).first();
    await card.scrollIntoViewIfNeeded({ timeout: 5000 });
    const spot = await emptySpot(card);
    if (!spot) throw new Error(`No empty spot to click in ${step.clickCard} "${step.hasText}"; the whole card is covered by controls`);
    const before = page.url();
    await page.mouse.click(spot.x, spot.y); count.clicks++;
    await settle(page);
    if (page.url() === before && !await page.locator('dialog[open],[role=dialog]:visible').count()) throw new Error(`Clicking an empty spot in ${step.clickCard} "${step.hasText}" did nothing; the whole card must open its record`);
    return;
  }
  if (step.check) { await scope.getByLabel(step.check).first().check({ timeout: 5000 }); count.clicks++; return; }
  if (step.fill) { await scope.getByLabel(step.fill).filter({ visible: true }).first().fill(step.value, { timeout: 5000 }); count.fields++; return; }
  if (step.select) { await scope.getByLabel(step.select).first().selectOption(step.value, { timeout: 5000 }); count.fields++; return; }
  if (step.expect) { await expectState(page, step.expect, base); return; }
  throw new Error('Unknown journey step ' + JSON.stringify(step));
}

// Each check retries until it holds or the expect timeout runs out, so a value still on its way is not
// read as a wrong one.
async function expectState(page, expected, base) {
  if (expected.route instanceof RegExp) await expect.poll(() => routeOf(page, base), { message: `the address matches ${expected.route}` }).toMatch(expected.route);
  else if (expected.route) await expect.poll(() => routeOf(page, base), { message: `the address is ${expected.route}` }).toBe(expected.route);
  for (const [selector, pattern] of expected.text ?? []) {
    await expect(page.locator(selector).filter({ visible: true }).first(), `${selector} shows ${pattern}`).toHaveText(pattern, { useInnerText: true });
  }
  for (const [selector, pattern] of expected.selected ?? []) {
    await expect.poll(
      () => page.locator(selector).first().evaluate(select => select.selectedOptions[0]?.textContent ?? '', null, { timeout: 1000 }).catch(() => null),
      { message: `${selector} has ${pattern} selected` },
    ).toMatch(pattern);
  }
  if (expected.inView) {
    const height = page.viewportSize().height;
    await expect.poll(async () => {
      const top = await page.locator(expected.inView).filter({ visible: true }).first().evaluate(element => Math.round(element.getBoundingClientRect().top), null, { timeout: 1000 }).catch(() => null);
      return top !== null && top >= 0 && top <= height / 2 ? 'in the top half' : `starts at ${top}px`;
    }, { message: `${expected.inView} starts in the top half of the ${height}px screen` }).toBe('in the top half');
  }
}

for (const journey of journeys) {
  test(`${journey.task} (${journey.id})`, async ({ page, app, browserErrors }, testInfo) => {
    const viewport = testInfo.project.name;
    test.skip(Boolean(journey.only) && journey.only !== viewport, `only on ${journey.only}`);
    const budget = { clicks: journey.budget.clicks, fields: journey.budget.fields, ...journey.budget[viewport] };
    const steps = journey.steps.filter(step => !step.on || step.on === viewport);
    const count = { clicks: 0, fields: 0 };

    await test.step(`open ${journey.start}`, async () => {
      await page.goto(app.base + journey.start);
      await settle(page);
    });
    for (const [index, step] of steps.entries()) {
      await test.step(`step ${index + 1}: ${describe(step)}`, async () => {
        await runStep(page, step, count, app.base);
        await settle(page);
      });
    }
    await test.step('result', () => expectState(page, journey.done, app.base));
    await testInfo.attach(`${journey.id}-${viewport}`, { body: await page.screenshot(), contentType: 'image/png' });
    testInfo.annotations.push({ type: 'budget', description: `${count.clicks}/${budget.clicks ?? 0} clicks · ${count.fields}/${budget.fields ?? 0} fields` });
    expect.soft(count.clicks, `clicks used, budget ${budget.clicks ?? 0}`).toBeLessThanOrEqual(budget.clicks ?? 0);
    expect.soft(count.fields, `fields used, budget ${budget.fields ?? 0}`).toBeLessThanOrEqual(budget.fields ?? 0);

    if (routeOf(page, app.base) !== journey.start) {
      await test.step('Back stays in the app', async () => {
        const finalUrl = page.url();
        await page.goBack();
        await settle(page);
        expect.soft(page.url().startsWith(app.base) && page.url() !== finalUrl, `Back went to ${page.url()} instead of the previous screen`).toBe(true);
        await page.goForward();
        await settle(page);
      });
    }
    // A reload of the final address must show the same result, so links can be shared and bookmarked.
    await test.step('a reload keeps the result', async () => {
      await page.reload();
      await settle(page);
      await expectState(page, { route: journey.done.route, text: journey.done.text, selected: journey.done.selected }, app.base);
    });
    expect(browserErrors, 'browser errors').toEqual([]);
  });
}

// Runs inside the page. Returns one finding per broken thing on the current screen.
function auditScreen({ interactive, roots, exempt, nav, phone, names, heading, section }) {
  const findings = [];
  const visible = element => { const box = element.getBoundingClientRect(); return box.width > 0 && box.height > 0 && element.checkVisibility({ visibilityProperty: true, contentVisibilityAuto: true }) && !element.closest('[hidden],dialog:not([open]),details:not([open]) > :not(summary)'); };
  const path = element => { const parts = []; for (let node = element; node && node !== document.body && parts.length < 3; node = node.parentElement) parts.unshift(node.tagName.toLowerCase() + (node.id ? '#' + node.id : '') + [...node.classList].slice(0, 2).map(name => '.' + name).join('')); return parts.join(' > '); };
  const text = element => (element.getAttribute('aria-label') || element.innerText || element.title || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const add = (check, element, detail) => findings.push({ check, selector: path(element), text: text(element), detail });
  const scopes = roots.flatMap(selector => [...document.querySelectorAll(selector)]);
  for (const scope of scopes) for (const element of scope.querySelectorAll('*')) {
    if (!visible(element) || getComputedStyle(element).cursor !== 'pointer' || element.closest(interactive)) continue;
    add('dead-pointer', element, 'Looks clickable but nothing happens');
  }
  for (const element of document.querySelectorAll('a[href],button,[role=button],[role=link]')) {
    if (visible(element) && !text(element) && !element.querySelector('img[alt]:not([alt=""]),svg title')) add('unnamed-control', element, 'No text or aria-label');
  }
  if (phone) for (const element of document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,[role=button]')) {
    if (!visible(element) || (element.matches('input') && element.closest('label')) || (element.matches('a') && getComputedStyle(element).display === 'inline')) continue;
    const box = element.getBoundingClientRect();
    if (box.width < 24 || box.height < 24) add('small-target', element, `${Math.round(box.width)}×${Math.round(box.height)}px, minimum 24×24px`);
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) findings.push({ check: 'horizontal-overflow', selector: 'html', text: '', detail: `Page is ${document.documentElement.scrollWidth}px wide on a ${innerWidth}px screen` });
  if (phone) {
    const links = [...document.querySelectorAll(nav)].filter(visible);
    const hidden = links.filter(link => { const box = link.getBoundingClientRect(); return box.right > innerWidth + 1 || box.left < -1; });
    if (hidden.length) findings.push({ check: 'hidden-nav', selector: nav, text: hidden.map(link => link.innerText.trim()).join(', '), detail: `${hidden.length} of ${links.length} menu items are off screen with no visible way to reach them` });
    // Text a person has to read is at least 11px.
    for (const element of document.querySelectorAll('body *')) {
      if (!visible(element) || ![...element.childNodes].some(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim())) continue;
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size < 11) add('tiny-text', element, `${size}px text, minimum 11px on a phone`);
    }
    // A section screen starts with its own content: its heading begins in the top 40% of the first screen.
    const title = section && scrollY === 0 && [...document.querySelectorAll(heading)].find(visible);
    if (title && title.getBoundingClientRect().top > innerHeight * 0.4) add('buried-heading', title, `Heading starts at ${Math.round(title.getBoundingClientRect().top)}px; it must start in the top 40% (${Math.round(innerHeight * 0.4)}px) of the ${innerHeight}px screen`);
  }
  // A record name a person reads must open that record, except where config.exempt says otherwise.
  for (const scope of scopes) {
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (!element || !visible(element) || element.closest(interactive) || element.closest(exempt)) continue;
      for (const name of names) if (node.data.includes(name.text)) add('name-not-link', element, `${name.kind} "${name.text}" does not open its record`);
    }
  }
  return findings;
}

// One line per distinct problem, with every screen it was seen on.
function group(findings) {
  const groups = new Map();
  for (const { route, ...finding } of findings) {
    const key = [finding.check, finding.selector, finding.text, finding.detail].join('|');
    const entry = groups.get(key) ?? { ...finding, routes: [] };
    if (!entry.routes.includes(route)) entry.routes.push(route);
    groups.set(key, entry);
  }
  return [...groups.values()];
}
const line = finding => `${finding.check}: ${finding.detail}${finding.text ? ` · "${finding.text}"` : ''}${finding.selector ? ` · ${finding.selector}` : ''} · ${finding.routes.slice(0, 4).map(route => route || '(start)').join(' ')}${finding.routes.length > 4 ? ` +${finding.routes.length - 4}` : ''}`;

test('Screen audit', async ({ page, app, browserErrors }, testInfo) => {
  test.setTimeout(300_000);
  const phone = testInfo.project.name === 'phone';
  await page.goto(app.base);
  await settle(page);
  // The records can come from the API or from the app itself, which is why the page is passed too.
  const records = ((await config.records?.({ base: app.base, page })) ?? []).filter(record => record.text);
  const routes = (await config.routes?.({ base: app.base, page })) ?? [''];
  const findings = [];
  for (const route of [...new Set([...routes, ...records.map(record => record.route)])]) {
    await test.step(`audit ${route || '(start)'}`, async () => {
      await page.goto(app.base + route);
      await page.reload();
      await settle(page);
      const found = await page.evaluate(auditScreen, { interactive, roots, exempt, nav, phone, names: records.map(({ kind, text }) => ({ kind, text })), heading: config.heading ?? 'main h1', section: !records.some(record => record.route === route) });
      for (const finding of found) findings.push({ ...finding, route });
      const record = records.find(item => item.route === route);
      // Every record page must show what the product says every record shows, such as its history.
      if (record && config.everyRecordShows) {
        const { selector, what } = config.everyRecordShows;
        if (!await page.locator(selector).filter({ visible: true }).count()) findings.push({ check: 'record-missing', selector, text: '', detail: `${record.kind} "${record.text}" does not show ${what}`, route });
      }
      if (!record?.heading) return;
      const shown = await page.locator(record.heading).filter({ visible: true }).first().evaluate(element => ({ text: element.innerText, top: Math.round(element.getBoundingClientRect().top) }), null, { timeout: 3000 }).catch(() => null);
      const height = page.viewportSize().height;
      if (!shown || !shown.text.includes(record.text)) findings.push({ check: 'deep-link', selector: record.heading, text: '', detail: `${record.kind} "${record.text}" is not shown when its address is opened`, route });
      else if (shown.top < 0 || shown.top > height / 2) findings.push({ check: 'deep-link', selector: record.heading, text: '', detail: `${record.kind} "${record.text}" starts at ${shown.top}px; it must start in the top half of the ${height}px screen`, route });
    });
  }
  const problems = group(findings);
  await testInfo.attach('findings.json', { body: JSON.stringify(problems, null, 2), contentType: 'application/json' });
  expect.soft(problems.map(line), 'screen audit').toEqual([]);
  expect(browserErrors, 'browser errors').toEqual([]);
});

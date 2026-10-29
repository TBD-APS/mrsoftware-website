import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

test('Embedded charts use the dashboard origin without ChatGPT requests', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const external = [];
    page.on('request', request => { if (new URL(request.url()).hostname.endsWith('chatgpt.site')) external.push(request.url()); });
    await page.goto(app.base + '?development=tradey');
    await expect(page.locator('#development-frame')).toHaveAttribute('src', new URL('/_development/?view=code&repo=tradey', app.base).href);
    expect(external).toEqual([]);
  } finally { await app.close(); }
});

test('Each dashboard address opens the matching private view', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const overviewOrigin = new URL('/_development', app.base).href;
    for (const [key, label, source] of [
      ['tasks', 'Task progress', overviewOrigin + '/'],
      ['mr-saasy', 'MR SAASy', overviewOrigin + '/?view=code'],
      ['tradey', 'Tradey', overviewOrigin + '/?view=code&repo=tradey'],
      ['__proto__', 'Task progress', overviewOrigin + '/'],
    ]) {
      await page.goto(app.base + '?development=' + key);
      await expect(page.locator('#development-frame')).toHaveAttribute('src', source);
      await expect(page.locator('#development-open')).toHaveAttribute('href', source);
      await expect(page.locator('#development-views [aria-current="page"]')).toHaveText(label);
      await expect(page.locator('main h1')).toHaveCount(1);
      await expect(page.locator('main #hero-heading')).toHaveText('Software that moves work forward.');
    }
  } finally { await app.close(); }
});

test('Task totals and both graph maps render through the embedded dashboard', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const failures = [];
    page.on('pageerror', error => failures.push(error.message));
    await page.goto(app.base);
    const frame = page.frameLocator('#development-frame');
    await expect(frame.locator('#completed-value')).toHaveText(String(app.expected.data.portfolio.completed));
    await expect(frame.locator('#remaining-value')).toHaveText(String(app.expected.data.portfolio.remaining));
    await expect(frame.locator('#trend-chart svg')).toBeVisible();
    await testInfo.attach('embedded-task-progress', { body: await page.screenshot(), contentType: 'image/png' });
    for (const [key, label] of [['mr-saasy', 'MR SAASy'], ['tradey', 'Tradey']]) {
      await page.locator('#development-views').getByRole('link', { name: label }).click();
      await expect(frame.locator('#codebase-select')).toHaveValue(key);
      await expect(frame.locator('#code-network svg')).toBeVisible();
      const repo = app.expected.graphs.repositories.find(item => item.id === key);
      await expect(frame.locator('#graph-totals')).toContainText(new Intl.NumberFormat('en-GB').format(repo.totalNodes) + ' nodes');
      await testInfo.attach('embedded-' + key, { body: await page.screenshot(), contentType: 'image/png' });
    }
    expect(failures).toEqual([]);
  } finally { await app.close(); }
});

test('The public company homepage never requests the private overview', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const requests = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/_development/')) requests.push(request.url()); });
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk'));
    await expect(page).toHaveTitle('MR Software | Software that moves work forward');
    await expect(page.locator('main h1')).toHaveText('Software that moves work forward.');
    await expect(page.locator('#development-overview, #development-frame')).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(1);
    await expect(page.locator('#contact iframe')).toHaveAttribute('src', 'https://storage.googleapis.com/maps-solutions-pztn9ofean/locator-plus/rz1v/locator-plus.html');
    expect(requests).toEqual([]);
  } finally { await app.close(); }
});

test('The full view uses the same dashboard sign-in', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base, { signedIn: false });
    await page.goto(app.base + '?development=tradey');
    await expect(page.frameLocator('#development-frame').locator('body')).toContainText('Dashboard sign-in required');
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Open full view/ }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(new URL('/_development/?view=code&repo=tradey', app.base).href);
    await popup.close();
    await expect(page).toHaveURL(app.base + '?development=tradey');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await testInfo.attach('sign-in-fallback-local-fixture', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { await app.close(); }
});

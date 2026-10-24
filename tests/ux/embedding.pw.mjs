import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { overviewOrigin, prepareContext } from './fixtures.mjs';

test('Each dashboard address opens the matching private view', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
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
      await expect(page.locator('main #hero-heading')).toHaveText('Vi bygger software, der skaber målbar værdi.');
    }
  } finally { await app.close(); }
});

test('The public company homepage never requests the private overview', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const requests = [];
    page.on('request', request => { if (request.url().startsWith(overviewOrigin)) requests.push(request.url()); });
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk'));
    await expect(page).toHaveTitle('MR Software | Software der skaber målbar forretningsværdi');
    await expect(page.locator('main h1')).toHaveText('Vi bygger software, der skaber målbar værdi.');
    await expect(page.locator('iframe')).toHaveCount(0);
    expect(requests).toEqual([]);
  } finally { await app.close(); }
});

test('Sign-in leaves a working standalone link for the selected graph', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base, { signedIn: false });
    await page.goto(app.base + '?development=tradey');
    await expect(page.frameLocator('#development-frame').getByRole('heading', { name: 'Sign in required' })).toBeVisible();
    const popupPromise = page.waitForEvent('popup');
    await page.getByRole('link', { name: /Open separately/ }).click();
    const popup = await popupPromise;
    await expect(popup).toHaveURL(overviewOrigin + '/?view=code&repo=tradey');
    await popup.close();
    await expect(page).toHaveURL(app.base + '?development=tradey');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
    await testInfo.attach('sign-in-fallback-local-fixture', { body: await page.screenshot(), contentType: 'image/png' });
  } finally { await app.close(); }
});

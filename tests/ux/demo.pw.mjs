import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

test('Open the demo centre from the homepage in one click', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await page.locator('.site-footer').getByRole('link', { name: 'Demo centre' }).click();
    await expect(page).toHaveURL(/\/demo\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Explore the products.');
    await expect(page.locator('.demo-grid h2')).toHaveText(['Roady', 'Shippy', 'Tradey']);
    await testInfo.attach(`demo-centre-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

test('Demo centre needs no code and states its boundary', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');

    const cards = page.locator('.demo-grid');
    await expect(cards.getByRole('link', { name: 'Open Roady' })).toHaveAttribute('href', 'https://pbrsgtftzin4k.kimi.page/');
    await expect(cards.getByRole('link', { name: 'Open Tradey' })).toHaveAttribute('href', 'https://ztrutb4jielr6.kimi.page/');
    await expect(cards.getByRole('link', { name: 'Open the read-only view' })).toHaveAttribute('href', '/demo/shippy/');
    for (const link of await cards.locator('a[target="_blank"]').all()) await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    // Demos are open to everyone: no access code may be published or required on the page.
    await expect(page.locator('main')).not.toContainText(/demo ?code|demokode|\b\d{4,}\b/i);
    await expect(page.locator('.demo-boundary')).toContainText('Do not enter real credentials or customer information.');
    await expect(page.locator('h1')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

test('See every Shippy section read-only, with no action that does anything', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');
    await page.getByRole('link', { name: 'Open the read-only view' }).click();
    await expect(page).toHaveURL(/\/demo\/shippy\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Shippy, read only');
    await expect(page.locator('.view-banner')).toContainText('Fictional data');

    const sections = ['Overview', 'Purchase orders', 'Shipments', 'Quotes and booking', 'Documents', 'Messages', 'Analytics'];
    const nav = page.getByRole('navigation', { name: 'Shippy sections' });
    await expect(nav.getByRole('link')).toHaveText(sections);
    await nav.getByRole('link', { name: 'Analytics' }).click();
    await expect(page).toHaveURL(/#analytics$/);
    await expect(page.locator('#analytics')).toBeInViewport();

    // The overview counts agree with the order table they summarise.
    const rows = page.locator('#orders tbody tr');
    await expect(rows).toHaveCount(5);
    await expect(rows.filter({ hasNotText: 'Delivered' })).toHaveCount(4);
    await expect(page.locator('#overview .view-kpis')).toContainText('Open POs4');

    // Read-only: no form, no button and no script on the page.
    await expect(page.locator('main form, main button, main input')).toHaveCount(0);
    expect(await page.locator('script:not([src="/js/site.js"])').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`shippy-view-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

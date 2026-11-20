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
    await expect(page.locator('.demo-grid h2')).toHaveText(['Roady', 'Shippy', 'Tradey', 'Workslip']);
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
    const card = name => cards.locator('article').filter({ has: page.getByRole('heading', { name }) });
    await expect(card('Roady').getByRole('link', { name: 'Open the read-only view' })).toHaveAttribute('href', '/demo/roady/');
    await expect(card('Shippy').getByRole('link', { name: 'Open the read-only view' })).toHaveAttribute('href', '/demo/shippy/');
    await expect(card('Tradey').getByRole('link', { name: 'Open the read-only view' })).toHaveAttribute('href', '/demo/tradey/');
    await expect(card('Workslip').getByRole('link', { name: 'Open the read-only view' })).toHaveAttribute('href', '/demo/workslip/');
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
    await page.locator('.demo-grid article').filter({ has: page.getByRole('heading', { name: 'Shippy' }) })
      .getByRole('link', { name: 'Open the read-only view' }).click();
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

test('See Tradey read-only: its own demo company, offers, catalogue, files and drafts', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');
    await page.locator('.demo-grid article').filter({ has: page.getByRole('heading', { name: 'Tradey' }) })
      .getByRole('link', { name: 'Open the read-only view' }).click();
    await expect(page).toHaveURL(/\/demo\/tradey\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tradey, read only');
    const nav = page.getByRole('navigation', { name: 'Tradey sections' });
    await expect(nav.getByRole('link')).toHaveText(['Today', 'Offers', 'Catalogue', 'Documents', 'Order drafts']);

    // The figures agree with Tradey's seed: 3 suppliers x 4 products = 12 offers over 8 shared products.
    await expect(page.locator('#offers tbody tr')).toHaveCount(12);
    await expect(page.locator('#catalogue tbody tr')).toHaveCount(8);
    await expect(page.locator('#today .view-kpis')).toContainText('Åbne tilbud12');
    // Unknown stays unknown, never zero.
    await expect(page.locator('#today .view-kpis dd').filter({ hasText: 'Ukendt' })).toHaveCount(2);
    await expect(page.locator('#order-drafts h3')).toHaveText(['Demo Hverdagskæden (syntetisk)', 'Demo Nabokæden (syntetisk)']);

    await expect(page.locator('main form, main button, main input')).toHaveCount(0);
    expect(await page.locator('script:not([src="/js/site.js"])').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`tradey-view-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

test('See Workslip read-only: job statuses, the six creation steps and the leader analysis', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');
    await page.locator('.demo-grid article').filter({ has: page.getByRole('heading', { name: 'Workslip' }) })
      .getByRole('link', { name: 'Open the read-only view' }).click();
    await expect(page).toHaveURL(/\/demo\/workslip\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Workslip, read only');

    // Status counts agree with the job table.
    const rows = page.locator('#jobs tbody tr');
    await expect(rows).toHaveCount(6);
    await expect(rows.filter({ hasText: 'Aktiv' })).toHaveCount(3);
    await expect(page.locator('#jobs .view-kpis')).toContainText('Aktiv3');
    await expect(page.locator('#create-job .view-rail li')).toHaveCount(6);
    // Each month's approved, rejected and open jobs add up to its total.
    for (const row of await page.locator('#analysis tbody tr').all()) {
      const [, total, approved, rejected, open] = (await row.locator('td').allTextContents()).map(Number);
      expect(approved + rejected + open).toBe(total);
    }

    await expect(page.locator('main form, main button, main input')).toHaveCount(0);
    expect(await page.locator('script:not([src="/js/site.js"])').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`workslip-view-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

test('See Roady read-only: transports, one transport\'s sourced events and the gate register', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(publicBase(app.base) + 'demo/');
    await page.locator('.demo-grid article').filter({ has: page.getByRole('heading', { name: 'Roady' }) })
      .getByRole('link', { name: 'Open the read-only view' }).click();
    await expect(page).toHaveURL(/\/demo\/roady\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roady, read only');
    const nav = page.getByRole('navigation', { name: 'Roady sections' });
    await expect(nav.getByRole('link')).toHaveText(['Transports', 'One transport', 'Gate register', 'Connections']);

    // The totals agree with the transport table they summarise.
    const rows = page.locator('#transports tbody tr');
    await expect(rows).toHaveCount(5);
    const vehicles = (await rows.locator('td:nth-child(4)').allTextContents()).map(Number).reduce((a, b) => a + b, 0);
    await expect(page.locator('#transports .view-kpis')).toContainText(`Vehicles${vehicles}`);
    await expect(page.locator('#transports .view-kpis')).toContainText(`Need attention${await rows.filter({ hasText: 'needs attention' }).count()}`);
    await expect(page.locator('#transports .view-list li')).toHaveCount(3);
    // Every event names its source and whether it was observed or planned.
    for (const row of await page.locator('#transport tbody tr').all()) {
      await expect(row.locator('td').nth(3)).toHaveText(/^(Observed|Planned)$/);
      await expect(row.locator('td').nth(4)).not.toBeEmpty();
    }
    await expect(page.locator('#gate-register tbody tr')).toHaveCount(4);

    await expect(page.locator('main form, main button, main input')).toHaveCount(0);
    expect(await page.locator('script:not([src="/js/site.js"])').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`roady-view-${testInfo.project.name}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  } finally {
    await app.close();
  }
});

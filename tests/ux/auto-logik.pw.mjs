import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

test('Open the Dansk Auto Logik case from the homepage', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = publicBase(app.base);
    await page.goto(base);
    await page.locator('#solutions').getByRole('link', { name: 'Dansk Auto Logik', exact: true }).click();
    await expect(page).toHaveURL(base + 'cases/dansk-auto-logik/');
    const heading = page.getByRole('heading', { level: 1, name: 'The plan stays a suggestion until a person accepts it.' });
    await expect(heading).toBeInViewport();
    await page.reload();
    await expect(page).toHaveURL(base + 'cases/dansk-auto-logik/');
    await expect(heading).toBeVisible();
    await expect(page.locator('main')).toContainText('The sample transports are synthetic');
    await expect(page.locator('main')).toContainText('not a measured saving');
    await expect(page.locator('main')).toContainText('no quote from Dansk Auto Logik');
    const widths = await page.locator('html').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
    expect(widths.scroll - widths.client).toBeLessThanOrEqual(1);
  } finally {
    await app.close();
  }
});

test('The read-only view names the case and keeps the sample label', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = publicBase(app.base);
    await page.goto(base + 'cases/dansk-auto-logik/');
    await page.getByRole('link', { name: 'Open the read-only view' }).first().click();
    await expect(page).toHaveURL(base + 'demo/roady/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Roady, read only');
    await page.getByRole('link', { name: 'Dansk Auto Logik', exact: true }).click();
    await expect(page).toHaveURL(base + 'cases/dansk-auto-logik/');
  } finally {
    await app.close();
  }
});

import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const stories = [
  ['/stories/the-offer/', 'The offer', /The offer is ready before the chat goes quiet/],
  ['/stories/the-job/', 'The job', /The office sees what the field already recorded/],
  ['/stories/the-shipment/', 'The shipment', /The shipment is not rebuilt from an inbox/],
  ['/stories/the-choices/', 'The choices', /We chose the place the work already lives/],
];

test('Each story opens from its name and stays put on reload', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
    await page.goto(base + 'stories/');
    await expect(page.getByRole('heading', { level: 1, name: 'The work, told as a day.' })).toBeVisible();
    await expect(page.locator('main')).toContainText('not a quote from a named customer');

    for (const [path, name, heading] of stories) {
      await page.goto(base + 'stories/');
      await page.locator('.uses').getByRole('link', { name, exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
      await expect(page.locator('main')).toContainText('not a measured saving');
      if (path === '/stories/the-offer/') {
        await expect(page.getByRole('region', { name: 'See also' }).getByRole('link', { name: /The job/ })).toHaveAttribute('href', '/stories/the-job/');
      }
      await page.reload();
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible();
    }
  } finally {
    await app.close();
  }
});

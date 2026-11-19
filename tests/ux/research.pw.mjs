import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const papers = [
  'saassy-medical-platform-research-paper.pdf',
  'donor-network-consolidation-research-paper.pdf',
];

test('Research opens from the homepage and exposes working sections and papers', async ({ page, context, request }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = publicBase(app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(base);
    if (testInfo.project.name === 'phone') await page.locator('.nav-toggle').click();
    await page.locator('#main-nav').getByRole('link', { name: 'How we work', exact: true }).click();

    await expect(page).toHaveURL(/\/research\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Evidence before authority.' })).toBeVisible();
    await expect(page.locator('h1')).toHaveCount(1);

    for (const id of ['principles', 'decision-gates', 'evaluation', 'papers']) {
      await page.locator(`.toc a[href="#${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`#${id}`)).toBeVisible();
    }

    for (const paper of papers) {
      const response = await request.get(`http://127.0.0.1:${new URL(app.base).port}/research/${paper}`);
      expect(response.status()).toBe(200);
      expect(response.headers()['content-type']).toContain('application/pdf');
      expect((await response.body()).subarray(0, 4).toString()).toBe('%PDF');
    }

    await page.goto(base + 'research/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath(`research-${testInfo.project.name}.png`), fullPage: true });
  } finally {
    await app.close();
  }
});

import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const papers = [
  'saassy-medical-platform-research-paper.pdf',
  'donor-network-consolidation-research-paper.pdf',
];

// Journeys: homepage -> research (1 click, including on a phone); research ->
// a paper (1 click); research -> a method section (1 click). No sign-in.
test('Research opens directly from the homepage and exposes working sections and papers', async ({ page, context, request }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    const base = publicBase(app.base);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));

    await page.goto(base);
    const feature = page.locator('#research');
    await feature.scrollIntoViewIfNeeded();
    await expect(feature.getByRole('heading', { name: 'Research shapes what we build.' })).toBeVisible();
    const researchLink = feature.getByRole('link', { name: 'Explore our research' });
    const target = await researchLink.boundingBox();
    expect(target.height).toBeGreaterThanOrEqual(44);
    await testInfo.attach(`homepage-research-${testInfo.project.name}`, {
      body: await feature.screenshot(), contentType: 'image/png',
    });
    await researchLink.click();

    await expect(page).toHaveURL(/\/research\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Research behind the software.' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('.toc a').first()).toHaveAttribute('href', '#papers');
    await expect(page.locator('.page-body > section').first()).toHaveAttribute('id', 'papers');

    await page.goBack();
    await expect(feature).toBeVisible();
    await researchLink.click();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Research behind the software.' })).toBeVisible();

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
      const downloadPromise = page.waitForEvent('download');
      await page.locator(`.research-paper[href="/research/${paper}"]`).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toBe(paper);
      expect(await download.failure()).toBeNull();
    }

    await page.goto(base + 'research/');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await testInfo.attach(`research-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: true }), contentType: 'image/png',
    });
  } finally {
    await app.close();
  }
});

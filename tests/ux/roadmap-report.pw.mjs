import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { sha256 } from '@mr-software/content';
import { startSite } from '../../tools/ux-site.mjs';

const receipt = JSON.parse(await readFile(new URL('../../roadmap/report/export-receipt.json', import.meta.url), 'utf8'));
test('open the roadmap overview and download the same data as PDF and Office files', async ({ page, context }, info) => {
  const app = await startSite();
  try {
    // Real loopback requests exercise browser downloads; fulfilling a synthetic
    // hostname through Playwright routing does not carry the download stream.
    const base = app.base.replace('dashboard.mrsoftware.dk', '127.0.0.1');
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + 'roadmap/');
    await page.getByRole('link', { name: /^View roadmap overview and reports/ }).click();
    await expect(page).toHaveURL(/\/roadmap\/report\/$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Roadmap overview' })).toBeVisible();
    await expect(page.locator('.mr-content')).toHaveAttribute('data-content-snapshot', receipt.snapshotHash);
    for (const metric of receipt.metrics) await expect(page.locator(`[data-metric="${metric.id}"]`)).toHaveText(metric.display);
    const downloads = page.getByRole('navigation', { name: 'Report downloads' });
    for (const [label, file] of [['PDF', 'roadmap.pdf'], ['Word', 'roadmap.docx'], ['Excel', 'roadmap.xlsx'], ['PowerPoint', 'roadmap.pptx'], ['CSV data', 'roadmap.csv'], ['Developed graph (SVG)', 'developed-by-package.svg']]) {
      const promise = page.waitForEvent('download');
      await downloads.getByRole('link', { name: label, exact: true }).click();
      const download = await promise;
      expect(sha256(await readFile(await download.path()))).toBe(receipt.files[file].sha256);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath('roadmap-report.png'), fullPage: true });
    await page.getByRole('link', { name: /^Return to roadmap/ }).click();
    await expect(page).toHaveURL(/\/roadmap\/$/);
  } finally { await app.close(); }
});

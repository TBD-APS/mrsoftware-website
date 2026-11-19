import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { renderRoadmap } from '../../tools/sync-public-roadmap.mjs';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const template = await readFile(new URL('../../roadmap/index.html', import.meta.url), 'utf8');
const fixtures = [
  { id: 'container-tracking', issue: 'SAS-1', product: 'Shippy', title: 'Container tracking', summary: 'See container updates with the purchase order.' },
  { id: 'terminal-visits', issue: 'SAS-2', product: 'Roady', title: 'Terminal visits', summary: 'Follow each vehicle from arrival to departure.' },
  { id: 'carbon-reports', issue: 'SAS-3', product: 'Greeny', title: 'Carbon reports', summary: 'See the emissions data behind your shipments.' },
];
const roadmapHtml = renderRoadmap(template, fixtures, new Map(
  ['completed', 'started', 'backlog'].map((type, index) => [fixtures[index].issue, { archivedAt: null, state: { type } }]),
));

// Desktop / 390px journeys: open the roadmap in one click (two from the
// phone's menu), find a completed feature, and jump straight to planned work.
test('discover the public feature list and its two stages', async ({ page, context, isMobile }, info) => {
  const app = await startSite({ roadmapHtml });
  try {
    await prepareContext(context, app.base);
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk'));
    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('#main-nav').getByRole('link', { name: 'Roadmap' }).click();
    await expect(page).toHaveURL(/\/roadmap\/$/);
    await expect(page.getByRole('heading', { name: 'Product roadmap', level: 1 })).toBeVisible();
    const developed = page.getByRole('region', { name: 'Developed' });
    const pipeline = page.getByRole('region', { name: 'In the pipeline' });
    await expect(developed.getByRole('heading', { name: 'Container tracking' })).toBeAttached();
    await expect(pipeline.getByRole('heading', { name: 'Terminal visits' })).toBeAttached();
    await page.getByRole('link', { name: 'In the pipeline' }).click();
    await expect(page).toHaveURL(/#in-the-pipeline$/);
    await expect(pipeline.getByRole('heading', { name: 'In the pipeline' })).toBeInViewport();
    await expect(pipeline.getByText('In development').first()).toBeAttached();
    await expect(pipeline.getByText('Planned').first()).toBeAttached();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.getByRole('heading', { name: 'Product roadmap' }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath('roadmap.png'), fullPage: true });
  } finally { await app.close(); }
});

test('open and reload a shared link to a feature without navigation steps', async ({ page, context }) => {
  const app = await startSite({ roadmapHtml });
  try {
    await prepareContext(context, app.base);
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk') + 'roadmap/#terminal-visits');
    const feature = page.getByRole('heading', { name: 'Terminal visits' });
    await expect(feature).toBeInViewport();
    await page.reload();
    await expect(feature).toBeInViewport();
  } finally { await app.close(); }
});

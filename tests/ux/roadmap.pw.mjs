import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { renderRoadmap } from '../../tools/sync-public-roadmap.mjs';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const template = await readFile(new URL('../../roadmap/index.html', import.meta.url), 'utf8');
const fixtures = [
  { id: 'boney-crm', source: { path: 'docs/crm.md', stage: 'developed' }, title: 'Company and contact directory', summary: 'Find and manage companies and contacts.' },
  { id: 'terminal-visits', source: { issue: 'SAS-2' }, title: 'Terminal visits', summary: 'Follow each vehicle from arrival to departure.' },
  { id: 'carbon-reports', source: { issue: 'SAS-3' }, title: 'Carbon reports', summary: 'See the emissions data behind your shipments.' },
];
const roadmapHtml = renderRoadmap(template, [
  { id: 'boney', name: 'Boney', features: fixtures.slice(0, 1) },
  { id: 'roady', name: 'Roady', features: fixtures.slice(1) },
], new Map([
  ['SAS-2', { archivedAt: null, state: { type: 'started' } }],
  ['SAS-3', { archivedAt: null, state: { type: 'backlog' } }],
]));

// Open the roadmap in one click (two from the phone menu), scan package
// counts and jump straight to either package without opening a new screen.
test('find the package overview, compare counts and jump to the feature list', async ({ page, context, isMobile }, info) => {
  const app = await startSite({ roadmapHtml });
  try {
    await prepareContext(context, app.base);
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk'));
    if (isMobile) await page.getByRole('button', { name: 'Open menu' }).click();
    await page.locator('#main-nav').getByRole('link', { name: 'Roadmap' }).click();
    await expect(page).toHaveURL(/\/roadmap\/$/);
    await expect(page.getByRole('heading', { name: 'Product roadmap', level: 1 })).toBeVisible();
    const packages = page.getByRole('navigation', { name: 'Packages' });
    await expect(packages.getByRole('link', { name: /Boney/ })).toContainText('1 developed · 0 in the pipeline');
    const roadyLink = packages.getByRole('link', { name: /Roady/ });
    await expect(roadyLink).toContainText('0 developed · 2 in the pipeline');
    await roadyLink.click();
    await expect(page).toHaveURL(/#package-roady$/);
    const roady = page.getByRole('region', { name: 'Roady' });
    await expect(roady.getByRole('heading', { name: 'Roady' })).toBeInViewport();
    await expect(roady.getByRole('heading', { name: 'Terminal visits' })).toBeAttached();
    await expect(roady.getByText('In development')).toBeAttached();
    await expect(roady.getByText('Planned')).toBeAttached();
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

test('find reusable Boney modules and the products that use them', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk') + 'roadmap/');
    await page.getByRole('link', { name: 'Explore reusable Boney modules' }).click();
    await expect(page).toHaveURL(/#boney-modules$/);
    const showcase = page.getByRole('region', { name: 'Reusable Boney modules' });
    await expect(showcase.getByRole('heading', { level: 2 })).toBeInViewport();
    await expect(showcase.getByText('Boney.Comms.Outlook', { exact: true })).toBeAttached();
    const productLinks = showcase.getByRole('link', { name: /^(Tradey|MR SAAS’y|Roady)$/ });
    await expect(productLinks).toHaveText(['Tradey', 'MR SAAS’y', 'Roady']);
    await productLinks.filter({ hasText: 'MR SAAS’y' }).click();
    await expect(page).toHaveURL(/#package-mr-saassy$/);
    await expect(page.getByRole('heading', { level: 2, name: 'MR SAAS’y' })).toBeInViewport();
    await page.goBack();
    await showcase.getByRole('link', { name: 'Try the Excel and Outlook examples' }).click();
    await expect(page.getByRole('heading', { name: 'Try two everyday integrations.' })).toBeInViewport();
  } finally { await app.close(); }
});

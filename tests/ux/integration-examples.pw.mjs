import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { startSite } from '../../tools/ux-site.mjs';

test('review an Excel export and approve an Outlook sample using only sample data', async ({ page, isMobile }, info) => {
  const app = await startSite();
  try {
    const site = app.base.replace('dashboard.mrsoftware.dk', '127.0.0.1');
    const requests = [];
    page.on('request', request => requests.push(request));

    await page.goto(site + 'integrations/');
    await page.getByRole('link', { name: 'Try Excel and Outlook' }).click();
    await expect(page).toHaveURL(/\/integrations\/#examples$/);
    const excel = page.getByRole('article', { name: 'Turn a spreadsheet into CRM contacts' });
    await excel.getByText('Review sample contacts', { exact: true }).click();
    await expect(excel.getByRole('row', { name: /Coastline Foods/ })).toContainText('Missing name');
    await expect(excel.getByRole('row', { name: /Coastline Foods/ }).getByRole('checkbox')).toHaveCount(0);
    await expect(excel.getByRole('status')).toHaveText('2 contacts selected for import.');
    await excel.getByRole('checkbox', { name: 'Include Mikkel Lund' }).uncheck();
    await expect(excel.getByRole('status')).toHaveText('1 contact selected for import.');

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 5_000 }),
      excel.getByRole('link', { name: 'Download the sample CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('sample-contacts.csv');
    expect((await readFile(await download.path(), 'utf8')).trim().split(/\r?\n/)).toEqual([
      'Company,Contact',
      'North Quay,Eva Holm',
      'Harbor Goods,Mikkel Lund',
      'Coastline Foods,',
    ]);

    const outlook = page.getByRole('article', { name: 'Review a reply with the shipment open' });
    await outlook.getByText('Review sample reply', { exact: true }).click();
    await expect(outlook.getByText('eva@northquay.example', { exact: true })).toBeVisible();
    await expect(outlook.getByText(/shipment SH-1042 is expected on Friday/)).toBeVisible();
    const approval = outlook.getByRole('button', { name: 'Approve sample reply' });
    await approval.click();
    await expect(approval).toBeDisabled();
    await expect(outlook.getByRole('status')).toHaveText('Sample reply approved. No email was sent.');
    await expect(page).toHaveURL(/\/integrations\/#examples$/);
    expect(requests.filter(request => request.method() !== 'GET' || !request.url().startsWith(site))).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    if (isMobile) {
      await excel.screenshot({ path: info.outputPath('excel-example.png'), animations: 'disabled' });
      await outlook.screenshot({ path: info.outputPath('outlook-example.png'), animations: 'disabled' });
    } else {
      await page.locator('#examples-heading').evaluate(heading => heading.scrollIntoView({ behavior: 'instant' }));
      await page.screenshot({ path: info.outputPath('integration-examples.png'), animations: 'disabled' });
    }

    await outlook.getByRole('link', { name: 'See the Boney Outlook module' }).click();
    await expect(page).toHaveURL(/\/roadmap\/#boney-outlook$/);
    await expect(page.getByRole('heading', { level: 3, name: 'Outlook connection' })).toBeInViewport();
  } finally { await app.close(); }
});

test('find Greeny and see how road distance changes emissions', async ({ page, isMobile }, info) => {
  const app = await startSite();
  try {
    const site = app.base.replace('dashboard.mrsoftware.dk', '127.0.0.1');
    await page.goto(site + 'roadmap/');
    await page.getByRole('link', { name: 'Explore Greeny' }).click();
    const spotlight = page.getByRole('region', { name: 'Greeny', exact: true }).filter({ has: page.getByRole('link', { name: 'Try the freight emissions example' }) });
    await expect(spotlight.getByRole('heading', { level: 2 })).toBeInViewport();
    await spotlight.getByRole('link', { name: 'Try the freight emissions example' }).click();
    await expect(page).toHaveURL(/\/integrations\/#greeny-example$/);
    await expect(page.getByRole('heading', { name: 'See where freight emissions come from.' })).toBeInViewport();
    await expect(page.getByRole('link', { name: 'Open Greeny’s demo workspace' })).toHaveAttribute('href', 'https://greeny.mrsoftware.dk/');

    const estimate = page.locator('#greeny-estimate');
    const total = estimate.getByRole('status', { name: 'Estimated emissions for this leg' });
    await expect(total).toHaveText('18 kg CO₂e');
    await estimate.getByLabel('Road distance').selectOption('250');
    await expect(total).toHaveText('45 kg CO₂e');
    await expect(total).toBeInViewport();
    await expect(estimate.locator('#greeny-driving')).toHaveText('37.5 kg CO₂e');
    await expect(estimate.locator('#greeny-energy')).toHaveText('7.5 kg CO₂e');
    await estimate.getByText('See the calculation', { exact: true }).click();
    await expect(estimate.getByText('375 tonne-km', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);

    const screenshotStart = isMobile ? estimate : page.locator('#greeny-example');
    await screenshotStart.evaluate(element => element.scrollIntoView({ behavior: 'instant' }));
    await page.screenshot({ path: info.outputPath('greeny-freight-estimate.png'), animations: 'disabled' });

    await page.getByRole('link', { name: 'See Greeny’s roadmap' }).click();
    await expect(page).toHaveURL(/\/roadmap\/#package-greeny$/);
    await expect(page.getByRole('heading', { name: 'Road freight carbon calculation' })).toBeAttached();
  } finally { await app.close(); }
});

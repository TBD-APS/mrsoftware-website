import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { homepageJourneys } from './homepage-journeys.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

for (const journey of homepageJourneys) {
  test(`${journey.task} (${journey.id})`, async ({ page, context }, testInfo) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.goto(publicBase(app.base));

      let clicks = 0;
      if (journey.target) {
        await page.locator(`a[href="${journey.target}"]`).first().click({ timeout: 5_000 });
        clicks += 1;
        await expect(page).toHaveURL(new RegExp(`${journey.target}$`));
      }

      const section = journey.target ? page.locator(journey.target) : page.locator('#main');
      await expect(section.getByRole('heading', { name: journey.expectedHeading }).first()).toBeVisible();
      expect(clicks).toBeLessThanOrEqual(journey.budget);

      const widths = await page.locator('html').evaluate(node => ({
        scroll: node.scrollWidth,
        client: node.clientWidth,
      }));
      expect(widths.scroll - widths.client).toBeLessThanOrEqual(1);

      await testInfo.attach(`${journey.id}-${testInfo.project.name}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    } finally {
      await app.close();
    }
  });
}

test('Product links and factual result labels stay explicit', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));

    await expect(page.getByRole('link', { name: /Workslip/ })).toHaveAttribute('href', 'https://app.mrsoftware.dk/');
    await expect(page.getByRole('link', { name: /FoodTrading/ })).toHaveAttribute('href', 'https://foodtrading.mrsoftware.dk/');
    await expect(page.locator('#resultater')).toContainText('3 min.');
    await expect(page.locator('#resultater')).toContainText('4,6 dage');
    await expect(page.locator('#resultater')).toContainText(/ikke dokumenteret tidsbesparelse, ROI eller kundens økonomiske gevinst/i);
  } finally {
    await app.close();
  }
});

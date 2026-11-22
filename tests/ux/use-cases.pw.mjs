import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';
import { useCaseJourneys } from './use-case-journeys.mjs';

const entries = [
  { name: 'English', start: '/#solutions', cards: '#solutions .use-case-cards > article', overview: '#solutions .use-case-overview' },
  { name: 'Danish', start: '/da/#produkter', cards: '#produkter .product-summary', overview: '#produkter' },
];

for (const entry of entries) {
  for (const journey of useCaseJourneys) {
    test(`${entry.name}: open the ${journey.name} use case from the whole card`, async ({ page, context }, testInfo) => {
      const app = await startSite();
      try {
        await prepareContext(context, app.base);
        const origin = new URL(app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk')).origin;
        await page.goto(origin + entry.start);
        const cards = page.locator(entry.cards);
        await expect(cards.locator('h3')).toHaveText(useCaseJourneys.map(item => item.name));
        const card = cards.filter({ has: page.getByRole('link', { name: journey.name, exact: true }) });
        // Danish cards are links themselves; English cards stretch their name link.
        const control = entry.name === 'Danish' ? cards.filter({ hasText: journey.name }) : card;
        await control.scrollIntoViewIfNeeded();
        if (journey.id === 'tradey') {
          await expect(page.locator(entry.overview)).toBeVisible();
          // The sticky header would cover the heading in a capture taller than the viewport.
          // Hide it only during this overview capture; navigation runs with the real header.
          await testInfo.attach(`use-cases-${entry.name.toLowerCase()}-${testInfo.project.name}`, {
            body: await page.locator(entry.overview).screenshot({ style: '.site-header { visibility: hidden; }' }),
            contentType: 'image/png',
          });
        }
        // One real action must reach the case without an intermediate step.
        await control.click({ position: { x: 8, y: 8 } });
        await expect(page).toHaveURL(origin + journey.target);
        const heading = page.getByRole('heading', { name: journey.heading, exact: true });
        await expect(heading).toBeInViewport();
        await page.reload();
        await expect(page).toHaveURL(origin + journey.target);
        await expect(heading).toBeInViewport();
        await page.goBack();
        await expect(page).toHaveURL(origin + entry.start);
        await expect(control).toBeInViewport();
      } finally { await app.close(); }
    });
  }
}

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
        await page.locator(`a[href="${journey.target}"]`).filter({ visible: true }).first().click({ timeout: 5_000 });
        clicks += 1;
        await expect(page).toHaveURL(new RegExp(`${journey.target}$`));
      }

      const section = journey.target ? page.locator(journey.target) : page.locator('#main');
      await expect(section.getByRole('heading', { name: journey.expectedHeading }).first()).toBeVisible();
      expect(clicks).toBeLessThanOrEqual(journey.budget);
      await page.waitForLoadState('networkidle');

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

    const solutions = page.locator('#loesninger');
    await expect(solutions.getByRole('link', { name: /Workslip/ })).toHaveAttribute('href', 'https://app.mrsoftware.dk/');
    await expect(solutions.getByRole('link', { name: /FoodTrading/ })).toHaveAttribute('href', 'https://foodtrading.mrsoftware.dk/');
    await expect(page.locator('#resultater')).toContainText('3 min.');
    await expect(page.locator('#resultater')).toContainText('4,6 dage');
    await expect(page.locator('#resultater')).toContainText(/ikke dokumenteret tidsbesparelse, ROI eller kundens økonomiske gevinst/i);
  } finally {
    await app.close();
  }
});

test('Homepage uses the approved visual tokens and responsive layout', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));

    const tokens = await page.locator('body').evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      const hero = getComputedStyle(document.querySelector('.hero'));
      return {
        ink: root.getPropertyValue('--ink').trim(),
        paper: root.getPropertyValue('--paper').trim(),
        accent: root.getPropertyValue('--accent').trim(),
        heroMinHeight: Number.parseFloat(hero.minHeight),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(tokens.ink).toBe('#11110f');
    expect(tokens.paper).toBe('#f2efe8');
    expect(tokens.accent).toBe('#d2542a');
    expect(tokens.heroMinHeight).toBeGreaterThanOrEqual(testInfo.project.name === 'phone' ? 620 : 700);
    expect(tokens.overflow).toBeLessThanOrEqual(1);
  } finally {
    await app.close();
  }
});

test('Mobile navigation opens, closes, and returns focus', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'phone behavior');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));

    const toggle = page.locator('.nav-toggle');
    await expect(toggle).toHaveAccessibleName('Åbn menu');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName('Luk menu');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Åbn menu');
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.getByRole('link', { name: 'Løsninger', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/#loesninger$/);
  } finally {
    await app.close();
  }
});

test('Homepage stays usable across the required viewport matrix', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'matrix runs once');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await page.goto(publicBase(app.base));
      const layout = await page.evaluate(() => {
        const h1 = document.querySelector('h1').getBoundingClientRect();
        const primary = document.querySelector('.button-primary').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1Width: h1.width,
          primaryHeight: primary.height,
        };
      });
      expect(layout.overflow, `${width}px has no horizontal overflow`).toBeLessThanOrEqual(1);
      expect(layout.h1Width, `${width}px shows the page title`).toBeGreaterThan(0);
      expect(layout.primaryHeight, `${width}px keeps the primary target usable`).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await app.close();
  }
});

test('Images load and reduced motion disables smooth scrolling', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(publicBase(app.base));

    const images = page.locator('#main img');
    for (let index = 0; index < await images.count(); index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    }

    const scrollBehavior = await page.locator('html').evaluate(node => getComputedStyle(node).scrollBehavior);
    expect(scrollBehavior).toBe('auto');
  } finally {
    await app.close();
  }
});

test('Keyboard navigation exposes the skip link first', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Spring til indhold' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Spring til indhold' })).toBeVisible();
  } finally {
    await app.close();
  }
});

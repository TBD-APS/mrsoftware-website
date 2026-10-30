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

    const solutions = page.locator('#solutions');
    await expect(solutions.getByRole('link', { name: /Workslip/ })).toHaveAttribute('href', 'https://app.mrsoftware.dk/');
    await expect(solutions.getByRole('link', { name: /FoodTrading/ })).toHaveAttribute('href', 'https://foodtrading.mrsoftware.dk/');
    await expect(page.locator('#results')).toContainText('3 min');
    await expect(page.locator('#results')).toContainText('4.6 days');
    await expect(page.locator('#results')).toContainText(/not documented time savings, ROI or financial gain for the customer/i);
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

    expect(tokens.ink).toBe('#111111');
    expect(tokens.paper).toBe('#ffffff');
    expect(tokens.accent).toBe('#c0392b');
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
    await expect(toggle).toHaveAccessibleName('Open menu');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAccessibleName('Close menu');
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(toggle).toHaveAccessibleName('Open menu');
    await expect(toggle).toBeFocused();

    await toggle.click();
    await page.getByRole('link', { name: 'Solutions', exact: true }).click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page).toHaveURL(/#solutions$/);
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
      const map = await page.locator('#contact iframe').boundingBox();
      expect(map.width, `${width}px gives the location finder usable width`).toBeGreaterThanOrEqual(272);
      expect(map.height, `${width}px reserves space for the location finder`).toBeGreaterThanOrEqual(560);
      expect(map.x + map.width, `${width}px keeps the location finder inside the page`).toBeLessThanOrEqual(width);
    }
  } finally {
    await app.close();
  }
});

test('Contact keeps email and a direct location link when the external map is unavailable', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    // The isolated context blocks external services; verify the fallback without Google availability.
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base) + '#contact');
    const contact = page.locator('#contact');
    const map = contact.locator('iframe');
    await expect(map).toBeVisible();
    await expect(map).toHaveAccessibleName('MR Software locations and directions');
    await expect(map).toHaveAttribute('loading', 'lazy');
    await expect(contact.getByRole('link', { name: 'kontakt@mrsoftware.dk', exact: true })).toHaveAttribute('href', 'mailto:kontakt@mrsoftware.dk');
    const locationLink = contact.getByRole('link', { name: 'Open location finder' });
    await expect(locationLink).toHaveAttribute('href', await map.getAttribute('src'));
    await expect(locationLink).toHaveAttribute('target', '_blank');
    await locationLink.scrollIntoViewIfNeeded();
    await expect(locationLink).toBeVisible();
    const target = await locationLink.boundingBox();
    expect(target.height).toBeGreaterThanOrEqual(44);
    await testInfo.attach('contact-locations-fallback-' + testInfo.project.name, { body: await contact.screenshot(), contentType: 'image/png' });
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
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeFocused();
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();
  } finally {
    await app.close();
  }
});

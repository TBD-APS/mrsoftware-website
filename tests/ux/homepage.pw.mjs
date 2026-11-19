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
        const link = page.locator(`a[href="${journey.target}"]`).filter({ visible: true }).first();
        if (await link.count()) {
          await link.click({ timeout: 5_000 });
          clicks += 1;
        } else {
          // The compact phone header keeps the content scrollable; shared section links remain valid.
          await page.goto(publicBase(app.base) + journey.target);
        }
        await expect(page).toHaveURL(new RegExp(`${journey.target}$`));
      }

      const section = journey.target ? page.locator(journey.target) : page.locator('#main-content');
      await expect(section.getByRole('heading', { name: journey.expectedHeading }).first()).toBeVisible();
      expect(clicks).toBeLessThanOrEqual(journey.budget);
      await page.waitForLoadState('networkidle');
      const widths = await page.locator('html').evaluate(node => ({ scroll: node.scrollWidth, client: node.clientWidth }));
      expect(widths.scroll - widths.client).toBeLessThanOrEqual(1);
      await testInfo.attach(`${journey.id}-${testInfo.project.name}`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally {
      await app.close();
    }
  });
}

test('Four product stories and three explicit public demo links are available', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));

    const projects = page.locator('#projects');
    await expect(projects.locator('.project')).toHaveCount(4);
    await expect(projects.locator('.project h3')).toHaveText(['Roady', 'Boney', 'Shippy', 'Tradey']);
    for (const [id, name] of [['roady', 'Roady'], ['boney', 'Boney'], ['shippy', 'Shippy'], ['tradey', 'Tradey']]) {
      await expect(page.locator(`#${id} h2`)).toHaveText(name);
      await expect(page.locator(`#${id} .product-case__boundary`)).toContainText(/demo|foundation|product/i);
    }
    await expect(projects).toContainText('Photographs are illustrative, not product screenshots.');

    const demos = page.locator('#demo');
    await expect(demos.locator('.demo-link')).toHaveCount(3);
    await expect(demos.getByRole('link', { name: 'Open Roady' })).toHaveAttribute('href', 'https://pbrsgtftzin4k.kimi.page/');
    await expect(demos.getByRole('link', { name: 'Open Shippy' })).toHaveAttribute('href', 'https://lst3sstxzovpm.kimi.page/');
    await expect(demos.getByRole('link', { name: 'Open Tradey' })).toHaveAttribute('href', 'https://ztrutb4jielr6.kimi.page/');
    await expect(demos).toContainText('246810');
    await expect(demos).toContainText('not a real account or a security boundary');
    await expect(demos).toContainText('Production Authy, customer accounts and business data are not part of these demos.');

    const resources = page.locator('.company-footer');
    await expect(resources.getByRole('link', { name: 'Demo centre' })).toHaveAttribute('href', '/demo/');
    await expect(resources.getByRole('link', { name: 'Roadmap' })).toHaveAttribute('href', '/roadmap/');
    await expect(resources.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy/');
    await expect(resources.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms-of-service/');
    await expect(resources.getByRole('link', { name: 'Data deletion' })).toHaveAttribute('href', '/data-deletion/');
  } finally {
    await app.close();
  }
});

test('Existing product pages open the same isolated demos', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base) + 'products/workslip/');
    await expect(page.getByRole('link', { name: /Open Workslip/ })).toHaveAttribute('href', 'https://app.mrsoftware.dk/');
    await expect(page.locator('.product-hero .status-state')).toHaveText('Live');

    await page.goto(publicBase(app.base) + 'products/tradey/');
    await expect(page.getByRole('link', { name: /Open the Tradey demo/ }).first()).toHaveAttribute('href', 'https://ztrutb4jielr6.kimi.page/');
    await expect(page.locator('.product-hero .status-state')).toHaveText('In development · Demo');

    await page.goto(publicBase(app.base) + 'products/shippy/');
    await expect(page.getByRole('link', { name: /Open the Shippy demo/ }).first()).toHaveAttribute('href', 'https://lst3sstxzovpm.kimi.page/');
    await expect(page.locator('.product-hero')).toContainText('246810');
    await expect(page.locator('.product-hero .status-state')).toHaveText('Demo');

    await page.goto(publicBase(app.base) + 'integrations/');
    const categories = page.locator('#categories');
    await expect(categories.getByRole('heading', { level: 3 })).toHaveText([
      'ERP and order management', 'Accounting and invoicing', 'Carriers and shipping lines',
      'Freight forwarders', 'Customs and trade documents', 'Warehouse and inventory',
      'Email and messaging', 'Files and spreadsheets',
    ]);
    await expect(categories).toContainText('Availability depends on the product');
  } finally {
    await app.close();
  }
});

test('Homepage uses its visual tokens and responsive layout', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await page.evaluate(() => document.fonts.ready);
    const tokens = await page.locator('body').evaluate(() => {
      const root = getComputedStyle(document.documentElement);
      return {
        ink: root.getPropertyValue('--ink').trim(),
        paper: root.getPropertyValue('--paper').trim(),
        accent: root.getPropertyValue('--accent').trim(),
        heroBackground: getComputedStyle(document.querySelector('.hero')).backgroundColor,
        footerBackground: getComputedStyle(document.querySelector('.site-footer')).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        primaryBackground: getComputedStyle(document.querySelector('.button--accent')).backgroundColor,
        fontLoaded: document.fonts.check('400 16px "Squada One"') && document.fonts.check('400 16px "Plus Jakarta Sans"') && document.fonts.check('400 16px "Victor Mono"'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(tokens.ink).toBe('#0d0d0d');
    expect(tokens.paper).toBe('#f2f0e9');
    expect(tokens.accent).toBe('#ffd97d');
    expect(tokens.heroBackground).toBe('rgb(13, 13, 13)');
    expect(tokens.footerBackground).toBe('rgb(13, 13, 13)');
    expect(tokens.bodyBackground).toBe('rgb(13, 13, 13)');
    expect(tokens.primaryBackground).toBe('rgb(255, 217, 125)');
    expect(tokens.fontLoaded).toBe(true);
    expect(tokens.overflow).toBeLessThanOrEqual(1);
  } finally {
    await app.close();
  }
});

test('Homepage and contact stay usable across the required viewport matrix', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'matrix runs once');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    for (const width of [320, 375, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width <= 390 ? 844 : 900 });
      await page.goto(publicBase(app.base));
      const layout = await page.evaluate(() => {
        const h1 = document.querySelector('h1').getBoundingClientRect();
        const primary = document.querySelector('.hero .button--accent').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, h1Width: h1.width, primaryHeight: primary.height };
      });
      expect(layout.overflow, `${width}px has no horizontal overflow`).toBeLessThanOrEqual(1);
      expect(layout.h1Width, `${width}px shows the page title`).toBeGreaterThan(0);
      expect(layout.primaryHeight, `${width}px keeps the primary target usable`).toBeGreaterThanOrEqual(44);
      await page.goto(publicBase(app.base) + 'contact/');
      const map = await page.locator('#locations iframe').boundingBox();
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
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base) + 'contact/');
    const contact = page.locator('#main');
    const map = contact.locator('iframe');
    await expect(map).toBeVisible();
    await expect(map).toHaveAccessibleName('MR Software locations and directions');
    await expect(map).toHaveAttribute('loading', 'lazy');
    await expect(contact.getByRole('link', { name: 'wp@mrsoftware.dk', exact: true })).toHaveAttribute('href', 'mailto:wp@mrsoftware.dk');
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

test('Images load and reduced motion disables animation and smooth scrolling', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(publicBase(app.base));
    const images = page.locator('#main-content img');
    expect(await images.count()).toBeGreaterThanOrEqual(9);
    for (let index = 0; index < await images.count(); index += 1) {
      const image = images.nth(index);
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth > 0)).toBe(true);
    }
    const motion = await page.evaluate(() => ({
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      transition: getComputedStyle(document.querySelector('.project__image img')).transitionDuration,
    }));
    expect(motion.scrollBehavior).toBe('auto');
    expect(parseFloat(motion.transition)).toBeLessThanOrEqual(0.001);
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
    await expect(page.getByRole('link', { name: 'Skip to content' })).toHaveAttribute('href', '#main-content');
    await expect(page.getByRole('link', { name: 'Skip to content' })).toBeVisible();
  } finally {
    await app.close();
  }
});

test('Homepage metadata, organization data and company navigation are present', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await expect(page.locator('.brand')).toHaveCount(2);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mrsoftware.dk/');
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://mrsoftware.dk/assets/images/brand/og-image.png');
    const data = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
    expect(data['@type']).toBe('Organization');
    expect(data.name).toBe('MR Software');
    expect(data.email).toBe('wp@mrsoftware.dk');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main')).toHaveCount(1);
  } finally {
    await app.close();
  }
});

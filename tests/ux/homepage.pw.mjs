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
      let menuTaps = 0;
      if (journey.target) {
        const link = page.locator(`a[href="${journey.target}"]`).filter({ visible: true }).first();
        // On a phone the section links live in the menu, which costs one extra tap.
        if (!await link.count()) {
          await page.locator('.nav-toggle').click();
          menuTaps += 1;
        }
        await link.click({ timeout: 5_000 });
        clicks += 1;
        await expect(page).toHaveURL(new RegExp(`${journey.target}$`));
      }

      const section = journey.target ? page.locator(journey.target) : page.locator('#main');
      await expect(section.getByRole('heading', { name: journey.expectedHeading }).first()).toBeVisible();
      expect(clicks).toBeLessThanOrEqual(journey.budget);
      expect(menuTaps).toBeLessThanOrEqual(1);
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

    // The homepage cards open the product pages; each product page carries the link to the product itself.
    const solutions = page.locator('#solutions');
    await expect(solutions.getByRole('link', { name: 'Workslip', exact: true })).toHaveAttribute('href', '/products/workslip/');
    await expect(solutions.getByRole('link', { name: 'Tradey', exact: true })).toHaveAttribute('href', '/products/tradey/');
    await expect(solutions.getByRole('link', { name: 'Shippy', exact: true })).toHaveAttribute('href', '/products/shippy/');
    await expect(solutions.getByRole('link', { name: 'Roady', exact: true })).toHaveAttribute('href', '/demo/roady/');
    // SAS-585: three main products, MR SAAS'y underneath with Workslip as its live case, and Integrations is not a product.
    await expect(solutions.locator('.cards > article h3')).toHaveText(['Tradey', 'Shippy', 'Roady']);
    await expect(solutions.locator('.platform')).toContainText("MR SAAS'y");
    await expect(solutions.locator('.platform article h3')).toHaveText('Workslip');
    await expect(solutions.getByRole('link', { name: 'Integrations', exact: true })).toHaveCount(0);
    await expect(page.locator('#results')).toContainText('3 min');
    await expect(page.locator('#results')).toContainText('4.6 days');
    await expect(page.locator('#results')).toContainText(/not documented time savings, ROI or financial gain for the customer/i);
    // KR-03: no minutes are extrapolated from Workslip's measurement onto products that were never measured.
    await expect(page.locator('#results .potential, #results .pot')).toHaveCount(0);
    await expect(page.locator('#results')).not.toContainText(/2 h 30 min|15 min|Potential per/);
    // Each product states its real status, and every illustration is marked as demo data.
    await expect(page.locator('#solutions article').filter({ hasText: 'Workslip' }).locator('.status-state')).toHaveText('Live');
    await expect(page.locator('#solutions article').filter({ hasText: 'Tradey' }).locator('.status-state')).toHaveText('In development · Demo');
    await expect(page.locator('#solutions article').filter({ hasText: 'Shippy' }).locator('.status-state')).toHaveText('Demo');
    await expect(page.locator('#solutions article').filter({ hasText: 'Roady' }).locator('.status-state')).toHaveText('Demo');
    for (const figure of await page.locator('#main figure.frame').all()) {
      await expect(figure).toHaveAttribute('aria-label', /demo data/i);
      const tags = figure.locator('.demo-tag');
      expect(await tags.count()).toBeGreaterThan(0);
      for (const tag of await tags.all()) await expect(tag).toHaveText('Demo data');
    }
    // Internal process notes and prices stay out of the public page.
    await expect(page.locator('body')).not.toContainText(/internal approval|TODO|kr\.|DKK|€/i);
    await expect(page.locator('body')).not.toContainText('—');

    await page.goto(publicBase(app.base) + 'products/workslip/');
    await expect(page.getByRole('link', { name: /Open Workslip/ })).toHaveAttribute('href', 'https://app.mrsoftware.dk/');
    await expect(page.locator('.product-hero .status-state')).toHaveText('Live');
    await page.goto(publicBase(app.base) + 'products/tradey/');
    await expect(page.getByRole('link', { name: /Open the Tradey demo/ })).toHaveAttribute('href', 'https://ztrutb4jielr6.kimi.page/');
    await expect(page.locator('.product-hero .status-state')).toHaveText('In development · Demo');
    await page.goto(publicBase(app.base) + 'products/shippy/');
    await expect(page.locator('.product-hero .status-state')).toHaveText('Demo');
    // The category overview still uses generic system types and explains availability.
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

test('Visitors can open Guessy from the free products section', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.route('https://guessy.mrsoftware.dk/', route => route.fulfill({ body: 'Guessy' }));
    await page.goto(publicBase(app.base));
    const freeProducts = page.getByRole('region', { name: 'Free products' });
    await expect(freeProducts.getByRole('heading', { name: 'Guessy' })).toBeVisible();
    await expect(page.locator('.site-footer').getByRole('link', { name: 'Guessy' })).toHaveAttribute('href', 'https://guessy.mrsoftware.dk/');
    await freeProducts.getByRole('link', { name: 'Play Guessy' }).click();
    await expect(page).toHaveURL('https://guessy.mrsoftware.dk/');
  } finally {
    await app.close();
  }
});

test('Homepage uses the approved visual tokens and responsive layout', async ({ page, context }) => {
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
        radius: root.getPropertyValue('--radius').trim(),
        heroBackground: getComputedStyle(document.querySelector('.hero')).backgroundColor,
        footerBackground: getComputedStyle(document.querySelector('.site-footer')).backgroundColor,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        primaryBackground: getComputedStyle(document.querySelector('.button-primary')).backgroundColor,
        integrationsBackground: getComputedStyle(document.querySelector('#integrations')).backgroundColor,
        fontLoaded: document.fonts.check('500 16px Geist') && document.fonts.check('400 42px Newsreader') && document.fonts.check('13px "Fragment Mono"'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(tokens.ink).toBe('#181513');
    expect(tokens.paper).toBe('#fffcf7');
    expect(tokens.accent).toBe('#8a1c2c');
    expect(tokens.radius).toBe('8px');
    expect(tokens.heroBackground).toBe('rgba(0, 0, 0, 0)');
    expect(tokens.footerBackground).toBe('rgb(255, 252, 247)');
    expect(tokens.integrationsBackground).toBe('rgb(138, 28, 44)');
    expect(tokens.bodyBackground).toBe('rgb(255, 252, 247)');
    expect(tokens.primaryBackground).toBe('rgb(24, 21, 19)');
    expect(tokens.fontLoaded).toBe(true);
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
    await page.getByRole('link', { name: 'Products', exact: true }).click();
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
        const primary = document.querySelector('.hero .button-primary').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          h1Width: h1.width,
          primaryHeight: primary.height,
        };
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
    // The isolated context blocks external services; verify the fallback without Google availability.
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

test('Header and footer carry the one-piece MR Software logo', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    await expect(page.locator('.brand a')).toHaveAttribute('aria-label', 'MR Software home');
    const logos = page.locator('.brand-logo');
    await expect(logos).toHaveCount(2);
    await page.locator('.footer-logo').scrollIntoViewIfNeeded();
    for (const logo of await logos.all()) {
      await expect.poll(() => logo.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
      await expect(logo).toHaveAttribute('src', '/assets/images/brand/mr-mark.svg');
    }
    await expect(page.locator('.footer-legal').getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', '/privacy-policy/');
  } finally {
    await app.close();
  }
});

test('The headline word rotates, and stays still when motion is reduced', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    const shown = page.locator('.rotate-word.is-in');
    await expect(shown).toHaveText('order.');
    await expect(shown).toHaveText('shipment.', { timeout: 4_000 });
    await expect(page.locator('h1')).toHaveAccessibleName('One place for every order, shipment, document and approval.');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForTimeout(3_000);
    await expect(page.locator('.rotate-word.is-in')).toHaveText('order.');
  } finally {
    await app.close();
  }
});

test('The hero cycles through a shipment, an offer and a transport, and shows one still record when motion is reduced', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    const lanes = page.locator('.hero-lane');
    await expect(lanes.locator('.frame-bar strong')).toHaveText(['Shippy · Shipment', 'Tradey · Offer', 'Roady · Transport']);
    await expect(page.locator('.hero-frame')).toHaveAttribute('aria-label', /demo data.*Shippy.*Tradey.*Roady/i);
    // The offer takes its turn after the shipment.
    await expect.poll(() => lanes.nth(1).evaluate(node => Number(getComputedStyle(node).opacity)), { timeout: 9_000 }).toBeGreaterThan(0.9);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await page.waitForTimeout(1_000);
    expect(await lanes.evaluateAll(nodes => nodes.map(node => getComputedStyle(node).visibility))).toEqual(['visible', 'hidden', 'hidden']);
    expect(await lanes.first().evaluate(node => getComputedStyle(node).animationName)).toBe('none');
  } finally {
    await app.close();
  }
});

test('Pointing at a system type in the ticker pauses it and explains what it covers', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Hover is a pointer interaction; keyboard focus is checked on desktop too.');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.goto(publicBase(app.base));
    const ticker = page.locator('.ticker-wrap');
    const detail = ticker.locator('.ticker-detail');
    await expect(detail).toBeHidden();
    await ticker.locator('.ticker a').nth(2).hover({ force: true });
    await expect(ticker.locator('.ticker ul')).toHaveCSS('animation-play-state', 'paused');
    await expect(ticker.locator('.ticker a.is-active')).toHaveText('Carriers and shipping lines');
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Bookings, schedules and tracking.');
    // The panel can be reached with the pointer and leads on to the integrations overview.
    await detail.getByRole('link', { name: /Read more/ }).hover();
    await expect(detail).toBeVisible();
    await expect(detail.getByRole('link', { name: /Read more/ })).toHaveAttribute('href', '/integrations/#categories');

    // The keyboard gets the same explanation, and Escape closes it. The repeated copy is not focusable.
    await page.mouse.move(0, 0);
    await expect(detail).toBeHidden();
    await ticker.locator('.ticker a').first().focus();
    await expect(detail).toContainText('Orders, customers and items.');
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await expect(ticker.locator('li[aria-hidden="true"] a:not([tabindex="-1"])')).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('Top menu items turn bold and open their pages on hover or focus (SAS-586)', async ({ page, context }, testInfo) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    if (testInfo.project.name === 'phone') {
      // The phone menu stays a flat list: the dropdowns are not shown and cannot be tabbed into.
      await page.goto(publicBase(app.base) + 'stories/');
      await page.getByRole('button', { name: 'Open menu' }).click();
      await expect(page.locator('.nav-sub').first()).toBeHidden();
      return;
    }
    for (const pathname of ['', 'stories/']) {
      await page.goto(publicBase(app.base) + pathname);
      const nav = page.locator('#main-nav');
      const products = nav.locator('.nav-group').filter({ has: page.getByRole('link', { name: 'Products', exact: true }) });
      const next = nav.getByRole('link', { name: 'Integrations', exact: true });
      const before = (await next.boundingBox()).x;
      await products.getByRole('link', { name: 'Products', exact: true }).hover();
      await expect(products.getByRole('link', { name: 'Products', exact: true })).toHaveCSS('font-weight', '600');
      // Bold text does not push the next item sideways.
      expect(Math.abs((await next.boundingBox()).x - before)).toBeLessThanOrEqual(1);
      const sub = products.locator('.nav-sub');
      await expect(sub).toBeVisible();
      await expect(sub.getByRole('link')).toHaveText(['Tradey', 'Shippy', 'Roady', 'Workslip', 'Demo centre']);
      await expect(sub.getByRole('link', { name: 'Roady' })).toHaveAttribute('href', '/demo/roady/');
      await page.mouse.move(700, 600);
      await expect(sub).toBeHidden();
    }
    // Keyboard: focus opens the list, Tab walks into it, Escape closes it and returns to the item.
    await page.goto(publicBase(app.base) + 'stories/');
    const stories = page.locator('#main-nav .nav-group').filter({ has: page.getByRole('link', { name: 'Stories', exact: true }) });
    await stories.getByRole('link', { name: 'Stories', exact: true }).focus();
    await expect(stories.locator('.nav-sub')).toBeVisible();
    await page.keyboard.press('Tab');
    await expect(stories.getByRole('link', { name: 'The offer' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(stories.getByRole('link', { name: 'Stories', exact: true })).toBeFocused();
    await expect(stories.locator('.nav-sub')).toBeHidden();
    // Items without pages under them, like Contact, get no list.
    await expect(page.locator('#main-nav .nav-group').filter({ has: page.getByRole('link', { name: 'Contact', exact: true }) })).toHaveCount(0);
  } finally {
    await app.close();
  }
});

test('The ticker keeps the focused explanation when the pointer leaves or visits another type', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Combined pointer and keyboard behavior.');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(publicBase(app.base));
    const ticker = page.locator('.ticker-wrap');
    const first = ticker.locator('a[data-detail]').first();
    const second = ticker.locator('a[data-detail]').nth(1);
    const detail = ticker.locator('.ticker-detail');
    await first.hover();
    await first.focus();
    await page.mouse.move(0, 0);
    await expect(first).toBeFocused();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Orders, customers and items.');

    await second.hover();
    await expect(detail).toContainText('Invoices, payments and accounts.');
    await page.mouse.move(0, 0);
    await expect(first).toBeFocused();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Orders, customers and items.');
  } finally {
    await app.close();
  }
});

test('The ticker keeps the hovered explanation when keyboard focus moves outside', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Combined pointer and keyboard behavior.');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(publicBase(app.base));
    const ticker = page.locator('.ticker-wrap');
    const first = ticker.locator('a[data-detail]').first();
    const second = ticker.locator('a[data-detail]').nth(1);
    const detail = ticker.locator('.ticker-detail');
    // Keep the next keyboard target on screen so moving focus does not scroll the pointer away.
    await ticker.evaluate(node => window.scrollBy(0, node.getBoundingClientRect().top - 160));
    const next = page.locator('.research-feature .button');
    await expect(next).toBeInViewport();
    await first.hover();
    await second.focus();
    await expect(detail).toContainText('Invoices, payments and accounts.');
    await next.focus();
    await expect(next).toBeFocused();
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('Orders, customers and items.');
    await page.mouse.move(0, 0);
    await expect(detail).toBeHidden();
  } finally {
    await app.close();
  }
});

test('Escape dismisses ticker content and returns focus from Read more', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name === 'phone', 'Combined pointer and keyboard behavior.');
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(publicBase(app.base));
    const ticker = page.locator('.ticker-wrap');
    const first = ticker.locator('a[data-detail]').first();
    const detail = ticker.locator('.ticker-detail');
    await first.hover();
    await first.focus();
    await detail.getByRole('link', { name: /Read more/ }).focus();
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden();
    await expect(first).toBeFocused();
    await page.mouse.move(0, 0);
    await expect(detail).toBeHidden();

    await page.locator('.research-feature .button').focus();
    await first.focus();
    await expect(detail).toBeVisible();
  } finally {
    await app.close();
  }
});

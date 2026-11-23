import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

// Homepage, the Danish homepage, each product page and contact.
// Lighthouse already measures category scores, including accessibility, in the
// search-visibility workflow. This check fails the pull-request suite on WCAG
// 2.0/2.1 A and AA violations. Phone repeats the same markup, so it runs on desktop.
const pages = ['', 'da/', 'products/workslip/', 'products/tradey/', 'products/shippy/', 'products/producey/', 'contact/', 'cases/dansk-auto-logik/'];
const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');

function described(violations) {
  return violations.map(violation => `${violation.id} (${violation.impact}): ${violation.nodes.map(node => node.target.join(' ')).join('; ')}`);
}

test.describe('axe on the homepage, product pages and contact', () => {
  for (const path of pages) {
    test(`/${path} has no WCAG A or AA violations`, async ({ page, context }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'Axe runs once per page on desktop.');
      const app = await startSite();
      try {
        await prepareContext(context, app.base);
        // Measure the resting page. A fade-in would otherwise be read as invisible text.
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.goto(publicBase(app.base) + path, { waitUntil: 'domcontentloaded' });
        const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
        expect(described(results.violations)).toEqual([]);
      } finally {
        await app.close();
      }
    });
  }
});

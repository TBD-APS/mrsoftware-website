import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

// SAS-624: tables have named regions, real column headers that read as headers, zebra rows, and
// every column can be reached on a phone. The validation tables scroll inside their region, with an
// edge shadow while more columns are off screen. The status services stack into cards
// (tests/ux/status-language.pw.mjs covers that layout).
const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const ink = 'rgb(24, 21, 19)';

async function expectHeaderRow(table) {
  const style = await table.locator('thead th').first().evaluate(node => {
    const cell = getComputedStyle(node);
    return { color: cell.color, weight: Number(cell.fontWeight), border: cell.borderBottomWidth };
  });
  expect(style).toEqual({ color: ink, weight: 600, border: '2px' });
  await expect(table.locator('thead th:not([scope="col"])')).toHaveCount(0);
  // Even body rows are striped; odd rows stay on the paper.
  const [odd, even] = await table.locator('tbody tr').evaluateAll(rows => rows.slice(0, 2).map(row => getComputedStyle(row).backgroundColor));
  expect(odd).toBe('rgba(0, 0, 0, 0)');
  expect(even).not.toBe(odd);
}

for (const language of ['en', 'da']) {
  const prefix = language === 'da' ? 'da/' : '';

  test(`${language}: validation tables are named, and every column of the test landscape can be reached`, async ({ page, context }, testInfo) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.goto(publicBase(app.base) + prefix + 'sikkerhed-og-dataprivatliv/saadan-validerer-vi-os-selv/');
      const regions = page.locator('.table-wrap');
      await expect(regions).toHaveCount(6);
      const names = await regions.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
      expect(names.filter(name => !name || /^(?:Table|Tabel)$/.test(name))).toEqual([]);
      expect(new Set(names).size).toBe(6);
      for (const region of await regions.all()) {
        await expect(region).toHaveAttribute('role', 'region');
        await expect(region).toHaveAttribute('tabindex', '0');
        await expectHeaderRow(region.locator('table'));
      }

      const landscape = page.getByRole('region', { name: language === 'da' ? '.NET-testprojekter (xUnit)' : '.NET (xUnit) test projects' });
      await expect(landscape.getByRole('columnheader')).toHaveText(language === 'da'
        ? ['Projekt', 'Tests', 'Kan springes over', 'Dækker']
        : ['Project', 'Tests', 'Skippable', 'Covers']);
      // Number headers sit over their right-aligned numbers.
      expect(await landscape.locator('thead th').evaluateAll(cells => cells.map(cell => getComputedStyle(cell).textAlign))).toEqual(['left', 'right', 'right', 'left']);

      if (testInfo.project.name === 'phone') {
        // Wider than the phone: the region scrolls rather than the page, and shows an edge while it can.
        expect(await landscape.evaluate(node => node.scrollWidth - node.clientWidth)).toBeGreaterThan(0);
        expect(await landscape.evaluate(node => getComputedStyle(node).backgroundAttachment)).toMatch(/^local, local, scroll, scroll/);
        // The keyboard reaches the last column.
        await landscape.focus();
        for (let step = 0; step < 8; step += 1) await page.keyboard.press('ArrowRight');
        await expect.poll(() => landscape.evaluate(node => node.scrollWidth - node.clientWidth - node.scrollLeft)).toBeLessThanOrEqual(1);
        const last = await landscape.locator('thead th').last().evaluate(cell => {
          const region = cell.closest('.table-wrap').getBoundingClientRect();
          const box = cell.getBoundingClientRect();
          return { left: box.left - region.left, right: region.right - box.right };
        });
        expect(last.left).toBeGreaterThanOrEqual(0);
        expect(last.right).toBeGreaterThanOrEqual(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    } finally {
      await app.close();
    }
  });

  test(`${language}: the status services table has real column headers and zebra rows`, async ({ page, context }) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.goto(publicBase(app.base) + prefix + 'status/');
      const services = page.getByRole('region', { name: language === 'da' ? 'Overvågede tjenester' : 'Monitored services' });
      await expect(services.getByRole('columnheader')).toHaveText(language === 'da'
        ? ['Tjeneste', 'Slutpunkt', 'Hvad det beviser']
        : ['Service', 'Endpoint', 'What it proves']);
      await expectHeaderRow(services.locator('table'));
    } finally {
      await app.close();
    }
  });
}

import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

for (const [language, missingRuntime] of [['en', false], ['da', false], ['da', true]]) {
  test(`${language}${missingRuntime ? ' without the locale script' : ''}: service results and completion stay in the selected language`, async ({ page, context }, info) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      if (missingRuntime) await context.route('**/js/site-locale.da.js', route => route.abort());
      let failures = false;
      await context.route(/\/ping(?:\.json)?$|\/api\/saassy\/health$|^https:\/\/www\.mrsoftware\.dk\/$/, route => {
        const url = new URL(route.request().url());
        if (failures && url.hostname === 'dev.mrsoftware.dk') return route.abort();
        const status = failures && url.pathname.endsWith('/health') ? 503 : 200;
        return route.fulfill({ status, headers: { 'Access-Control-Allow-Origin': '*' }, contentType: 'application/json', body: '{"status":"ok"}' });
      });
      const base = app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
      for (const failed of [false, true]) {
        failures = failed;
        await page.goto(base + (language === 'da' ? 'da/' : '') + 'status/');
        const last = page.locator('#last-check');
        const count = failed ? '2/4' : '4/4';
        await expect(last).toHaveText(language === 'da'
          ? new RegExp(`^Seneste kontrol: .* ${count} tjenester svarede korrekt\\.$`)
          : new RegExp(`^Last check: .* ${count} services responded correctly\\.$`));
        await expect(page.locator('#svc-mrsoftware .value')).toHaveText('OK');
        await expect(page.locator('#svc-www .value')).toHaveText('OK');
        for (const id of ['saassy', 'dev']) await expect(page.locator(`#svc-${id} .value`)).toHaveText(failed ? (language === 'da' ? 'Nede' : 'Down') : 'OK');
        if (failed) {
          await expect(page.locator('#svc-dev .label')).toContainText(language === 'da' ? 'ping kan ikke nås' : 'probe unreachable');
          await expect(page.locator('#svc-saassy .label')).toContainText(language === 'da' ? 'statuskontrol HTTP 503' : 'health HTTP 503');
        }
      }
      // Every monitored service remains readable without panning a table on a phone.
      const table = page.locator('.table-wrap');
      expect(await table.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
      if (info.project.name === 'phone') {
        const labels = page.locator('.status-field-label');
        await expect(labels).toHaveText(Array(4).fill(language === 'da'
          ? ['Tjeneste', 'Slutpunkt', 'Hvad det beviser']
          : ['Service', 'Endpoint', 'What it proves']).flat());
        const viewport = page.viewportSize();
        for (const width of [320, 390, 639, 640, 768]) {
          await page.setViewportSize({ width, height: viewport.height });
          expect(await table.evaluate(node => node.scrollWidth - node.clientWidth), `${width}px table`).toBeLessThanOrEqual(1);
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${width}px page`).toBeLessThanOrEqual(1);
          for (const label of await labels.all()) {
            if (width <= 639) await expect(label).toBeVisible();
            else await expect(label).toBeHidden();
          }
        }
        await page.setViewportSize(viewport);
      }
      await info.attach(`status-${language}-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally { await app.close(); }
  });
}

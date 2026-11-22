import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

for (const language of ['en', 'da']) {
  test(`${language}: service results and completion stay in the selected language`, async ({ page, context }, info) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
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
      await info.attach(`status-${language}-${info.project.name}`, { body: await page.screenshot(), contentType: 'image/png' });
    } finally { await app.close(); }
  });
}

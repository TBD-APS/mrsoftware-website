import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

const publicBase = base => base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const reference = '11111111-1111-4111-8111-111111111111';

test('Book a demo posts one enquiry and shows the receipt', async ({ page, context }) => {
  const app = await startSite();
  const seen = [];
  try {
    await prepareContext(context, app.base);
    await page.route('https://demos.mrsoftware.dk/api/enquiries', async route => {
      const request = route.request();
      const origin = request.headers().origin;
      if (request.method() === 'OPTIONS') {
        await route.fulfill({ status: 204, headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'POST',
          'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With',
        } });
        return;
      }
      seen.push({ method: request.method(), headers: request.headers(), body: request.postDataJSON() });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': origin },
        body: JSON.stringify({ received: true, reference }),
      });
    });
    await page.goto(publicBase(app.base) + 'contact/#book-demo');
    const form = page.locator('#book-demo-form');
    await expect(form).toBeInViewport();
    await form.getByRole('button', { name: 'Book a demo' }).click();
    await expect(page.locator('#book-demo-result')).toBeHidden();
    expect(seen).toEqual([]);

    await page.locator('#book-company').fill('North Quay');
    await page.locator('#book-name').fill('Ada Prospect');
    await page.locator('#book-email').fill('ada@example.test');
    await page.locator('#book-product').selectOption('shippy');
    await page.locator('#book-message').fill('A short walkthrough of one shipment.');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Book a demo' }).click();
    await expect(page.locator('#book-demo-result')).toContainText(reference);
    await expect(form).not.toHaveAttribute('aria-busy', 'true');
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe('POST');
    expect(seen[0].headers['x-requested-with']).toBe('MRSoftware');
    expect(seen[0].headers['content-type']).toContain('application/json');
    expect(Object.keys(seen[0].body).sort()).toEqual(['company', 'email', 'message', 'name', 'packageId', 'product', 'requestId', 'website']);
    expect(seen[0].body).toMatchObject({ company: 'North Quay', name: 'Ada Prospect', email: 'ada@example.test', product: 'shippy', packageId: '', message: 'A short walkthrough of one shipment.', website: '' });
    expect(seen[0].body.requestId).toMatch(/^[0-9a-f-]{36}$/i);

    await page.goto(publicBase(app.base));
    await expect(page.locator('.hero-actions').getByRole('link', { name: 'Book a demo' })).toHaveAttribute('href', '/contact/#book-demo');
    await expect(page.locator('.nav .button-primary')).toHaveAttribute('href', '#contact');
  } finally {
    await app.close();
  }
});

test('A failed booking ends the busy state and keeps the email path', async ({ page, context }) => {
  const app = await startSite();
  try {
    await prepareContext(context, app.base);
    await page.route('https://demos.mrsoftware.dk/api/enquiries', route => route.fulfill({
      status: 503,
      contentType: 'application/json',
      headers: { 'Access-Control-Allow-Origin': route.request().headers().origin },
      body: JSON.stringify({ error: 'Sales storage is unavailable. Please try again later.' }),
    }));
    await page.goto(publicBase(app.base) + 'contact/#book-demo');
    const form = page.locator('#book-demo-form');
    await page.locator('#book-company').fill('North Quay');
    await page.locator('#book-name').fill('Ada Prospect');
    await page.locator('#book-email').fill('ada@example.test');
    await page.locator('#book-product').selectOption('tradey');
    await form.getByRole('checkbox').check();
    await form.getByRole('button', { name: 'Book a demo' }).click();
    await expect(page.locator('#book-demo-result')).toContainText('Sales storage is unavailable');
    await expect(form).not.toHaveAttribute('aria-busy', 'true');
    await expect(form.getByRole('button', { name: 'Book a demo' })).toBeEnabled();
    await expect(page.getByRole('link', { name: 'Email us' })).toHaveAttribute('href', /^mailto:wp@mrsoftware\.dk\?/);
  } finally {
    await app.close();
  }
});

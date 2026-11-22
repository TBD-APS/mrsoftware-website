import { test, expect } from '@playwright/test';
import { startSite } from '../../tools/ux-site.mjs';
import { prepareContext } from './fixtures.mjs';

// Journeys: arrive without a video download (0 actions), watch/pause the
// illustration (1 action each), and play it without JavaScript (1 action).
const entries = [
  { path: '', heading: 'The work comes first.', description: /6-second animation, without sound/ },
  { path: 'da/', heading: 'Arbejdet kommer først.', description: /6 sekunder, uden lyd/ },
];
const base = app => app.base.replace('dashboard.mrsoftware.dk', 'mrsoftware.dk');
const mediaRequests = page => {
  const requests = [];
  page.on('request', request => { if (/\/assets\/workflow\/.*\.mp4$/.test(new URL(request.url()).pathname)) requests.push(request); });
  return requests;
};
const playControl = async video => {
  const box = await video.boundingBox();
  expect(box, 'The video player has a rendered frame').not.toBeNull();
  await video.click({ position: { x: 32, y: box.height - 28 } });
};

for (const entry of entries) {
  test(`${entry.path || '/'}: the illustration stays below the fold and loads only on play`, async ({ page, context }) => {
    const app = await startSite();
    try {
      await prepareContext(context, app.base);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const requests = mediaRequests(page);
      await page.goto(base(app) + entry.path, { waitUntil: 'networkidle' });
      const section = page.locator('#workflow');
      const video = section.locator('video');
      await expect(section.getByRole('heading', { name: entry.heading, exact: true })).toBeVisible();
      await expect(video).not.toBeInViewport();
      expect(requests).toHaveLength(0);
      await video.scrollIntoViewIfNeeded();
      await page.waitForLoadState('networkidle');
      expect(requests).toHaveLength(0);
      const before = await video.boundingBox();
      await playControl(video);
      await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0);
      expect(requests.length).toBeGreaterThan(0);
      await expect(video).toHaveJSProperty('paused', false);
      await video.press('Space');
      await expect(video).toHaveJSProperty('paused', true);
      const after = await video.boundingBox();
      expect(Math.abs(after.height - before.height)).toBeLessThanOrEqual(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
      await expect(video).toHaveAccessibleDescription(entry.description);
    } finally { await app.close(); }
  });
}

test('The animation works without JavaScript and exposes a direct fallback', async ({ browser, page }) => {
  const app = await startSite();
  let context;
  try {
    context = await browser.newContext({ javaScriptEnabled: false, viewport: page.viewportSize() });
    await prepareContext(context, app.base);
    const noScript = await context.newPage();
    await noScript.emulateMedia({ reducedMotion: 'reduce' });
    const requests = mediaRequests(noScript);
    await noScript.goto(base(app) + '#workflow', { waitUntil: 'networkidle' });
    expect(requests).toHaveLength(0);
    const video = noScript.locator('#workflow video');
    await expect(video).toBeInViewport();
    await playControl(video);
    await expect.poll(() => video.evaluate(node => node.currentTime)).toBeGreaterThan(0);
    await expect(noScript.getByRole('link', { name: 'Open the animation' })).toHaveAttribute('href', await video.getAttribute('src'));
  } finally {
    try { await context?.close(); }
    finally { await app.close(); }
  }
});

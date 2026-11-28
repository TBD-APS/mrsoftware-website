import { readFile } from 'node:fs/promises';
import { test, expect } from './fixtures.mjs';
import { startCommercialSite } from '../helpers/commercial-http.mjs';
import { HttpError } from '../../commercial/server/validation.mjs';

const api = '/api/backoffice/youtube';
const videoId = 'M3r2XDceM6A';
const shortLink = 'https://youtu.be/' + videoId;
const watchLink = 'https://www.youtube.com/watch?v=' + videoId;

test('YouTube draft, preview, metadata export, edit and link receipt work in the browser', async ({ page }) => {
  let providerCalls = 0;
  const site = await startCommercialSite({ inspectYouTube: async id => {
    expect(id).toBe(videoId);
    if (++providerCalls === 1) throw new HttpError(422, 'YouTube could not verify this video.');
    return { title: 'Field team walkthrough', channel: 'MR Software' };
  } });
  const listUrl = site.privateBase + 'backoffice/youtube/';
  try {
    await page.goto(listUrl);
    await expect(page.getByText('No drafts yet.', { exact: false })).toBeVisible();
    await page.getByRole('link', { name: 'New YouTube draft' }).click();
    await expect(page.getByRole('button', { name: 'Download saved metadata' })).toHaveCount(0);
    await page.getByLabel('Video title').fill('How field teams use Workslip');
    await page.getByLabel('Video description').fill('Short demo.\nBook a demo next.');
    await page.getByLabel('Tags', { exact: true }).fill('workslip, field work');
    await page.getByLabel('Product', { exact: true }).selectOption('Workslip');
    await expect(page.getByRole('heading', { name: 'How field teams use Workslip' })).toBeVisible();
    await expect(page.getByText('Tags: workslip, field work', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Save YouTube draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Edit YouTube draft');
    const [created] = (await site.call('GET', api)).body.items;
    const draftUrl = listUrl + '?id=' + created.id;
    await expect(page).toHaveURL(draftUrl);
    await page.reload();
    await expect(page.getByLabel('Video title')).toHaveValue(created.title);
    await expect(page.getByLabel('Product', { exact: true })).toHaveValue('Workslip');
    await page.getByLabel('YouTube video link').fill(shortLink);
    await page.getByLabel('Video description').fill(' Updated description. ');
    await page.getByRole('button', { name: 'Save YouTube draft' }).click();
    await expect(page.getByRole('status')).toContainText('Draft saved');
    await expect(page.getByLabel('YouTube video link')).toHaveValue(shortLink);
    await expect(page.getByLabel('Video description')).toHaveValue('Updated description.');
    expect(providerCalls).toBe(0);
    await expect(page.getByRole('link', { name: 'Open YouTube Studio' })).toHaveAttribute('href', 'https://studio.youtube.com/');
    const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download saved metadata' }).click()]);
    expect(file.suggestedFilename()).toBe('youtube-video-metadata.txt');
    expect(await readFile(await file.path(), 'utf8')).toBe('Title\nHow field teams use Workslip\n\nDescription\nUpdated description.\n\nTags\nworkslip, field work\n');
    const check = page.getByRole('button', { name: 'Check YouTube link' });
    await check.click();
    await expect(page.getByRole('alert')).toContainText('YouTube could not verify this video.');
    await expect(check).toBeEnabled();
    expect((await site.call('GET', api + '/' + created.id)).body.item.verification).toBeNull();
    await check.click();
    await expect(page.getByRole('status')).toContainText('Nothing was uploaded or published');
    await expect(page.getByRole('link', { name: 'Open checked video' })).toHaveAttribute('href', watchLink);
    expect(providerCalls).toBe(2);
    await page.getByRole('link', { name: 'All YouTube drafts' }).click();
    await page.getByRole('link', { name: created.title }).click();
    await expect(page).toHaveURL(draftUrl);
    await expect(page.getByRole('link', { name: 'Open checked video' })).toBeVisible();
    const saved = (await site.call('GET', api + '/' + created.id)).body.item;
    await site.call('PUT', api + '/' + created.id, { title: saved.title, description: 'An edit elsewhere.', tags: saved.tags, product: saved.product, revision: saved.revision });
    await page.getByLabel('Video description').fill('My unsaved copy');
    await page.getByRole('button', { name: 'Save YouTube draft' }).click();
    await expect(page.getByRole('alert')).toContainText('This draft changed elsewhere');
    await expect(page.getByLabel('Video description')).toHaveValue('My unsaved copy');
    await expect(page.getByRole('button', { name: 'Save YouTube draft' })).toBeEnabled();
  } finally { await site.close(); }
});

test('Content Creator gives an explicit recovery path when its asset fails', async ({ page, app }) => {
  await page.route('https://unpkg.com/**', route => route.abort());
  await page.goto(app.privateBase + 'backoffice/youtube/');
  await page.getByRole('button', { name: 'Open Content Creator' }).click();
  await expect(page.getByRole('status')).toContainText('Content Creator could not load');
  await expect(page.locator('elevenlabs-convai')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Reload and try again' })).toBeVisible();
  await page.getByRole('link', { name: 'Reload and try again' }).click();
  await expect(page.getByRole('button', { name: 'Open Content Creator' })).toBeEnabled();
  await expect(page.getByRole('link', { name: 'New YouTube draft' })).toBeVisible();
});

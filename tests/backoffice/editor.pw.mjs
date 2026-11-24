import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const repo = new URL('../..', import.meta.url);

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address();
      probe.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function start(root) {
  const port = await freePort();
  const child = spawn(process.execPath, [
    'node_modules/vite/bin/vite.js',
    '--config', 'backoffice/vite.config.js',
    '--host', '127.0.0.1',
    '--port', String(port),
    '--strictPort',
  ], {
    cwd: new URL(repo).pathname,
    env: { ...process.env, LINKS_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  const ready = new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', chunk => {
      buffer += chunk;
      const match = buffer.match(/READY (http:\/\/127\.0\.0\.1:\d+)/);
      if (match) resolve(match[1]);
    });
    child.stderr.on('data', chunk => { buffer += chunk; });
    child.on('exit', code => reject(new Error(`backoffice exited ${code}: ${buffer}`)));
  });
  return { child, ready };
}

test('a page link is added, saved, and still there after reload', async ({ page }, info) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const root = await mkdtemp(join(tmpdir(), 'site-links-'));
  await mkdir(join(root, 'data'), { recursive: true });
  const original = await readFile(new URL('../../data/links.json', import.meta.url));
  await writeFile(join(root, 'data/links.json'), original);
  const { child, ready } = await start(root);
  try {
    const base = await ready;
    await page.goto(base);
    await expect(page.getByRole('heading', { level: 1, name: 'Links between pages' })).toBeVisible();
    await page.getByRole('link', { name: 'The offer', exact: true }).click();
    await expect(page).toHaveURL(/page=the-offer$/);
    await expect(page.locator('.link-editor-preview').getByRole('link', { name: /The job/ })).toHaveAttribute('href', '/stories/the-job/');
    await page.getByRole('searchbox', { name: 'Find a page' }).fill('Roadmap');
    await page.getByRole('button', { name: 'Add Roadmap', exact: true }).click();
    await expect(page.getByText('Added Roadmap.')).toBeVisible();
    await page.getByRole('button', { name: 'Save links' }).click();
    await expect(page.getByText('Saved. Publish the site for readers to see these links.')).toBeVisible();
    await page.reload();
    await expect(page.locator('.link-editor-preview').getByRole('link', { name: /Roadmap/ })).toHaveAttribute('href', '/roadmap/');
    const saved = JSON.parse(await readFile(join(root, 'data/links.json'), 'utf8'));
    assertHas(saved, 'the-offer', 'roadmap');
    expect(saved.sitemapPages).toEqual(JSON.parse(original.toString()).sitemapPages);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (info.project.name === 'phone') {
      const box = await page.getByRole('button', { name: 'Save links' }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
});

function assertHas(graph, fromId, toId) {
  if (!graph.links[fromId].some(link => link.toId === toId)) throw new Error(`${fromId} does not link to ${toId}`);
}

test('homepage content saves, survives reload and rejects an older tab without losing newer edits', async ({ page, context }, info) => {
  const root = await mkdtemp(join(tmpdir(), 'site-cta-'));
  await mkdir(join(root, 'data'));
  for (const file of ['data/links.json', 'data/site-content.json', 'index.html']) {
    await writeFile(join(root, file), await readFile(new URL(file, repo)));
  }
  const { child, ready } = await start(root);
  try {
    const base = await ready;
    await page.goto(base);
    await expect(page.getByLabel('Heading', { exact: true })).toBeVisible();
    const olderTab = await context.newPage();
    await olderTab.goto(base);
    await expect(olderTab.getByLabel('Heading', { exact: true })).toBeVisible();
    await page.getByLabel('Heading', { exact: true }).fill('Keep the newest heading');
    await page.getByRole('button', { name: 'Save homepage CTA' }).click();
    await expect(page.getByText('Saved. Homepage CTA updated in index.html.')).toBeVisible();
    const savedScreenshot = info.outputPath('cta-saved.png');
    await page.locator('section').first().screenshot({ path: savedScreenshot });
    await info.attach('Saved homepage content', { path: savedScreenshot, contentType: 'image/png' });
    await olderTab.getByLabel('Heading', { exact: true }).fill('Stale heading');
    await olderTab.getByRole('button', { name: 'Save homepage CTA' }).click();
    await expect(olderTab.getByText('Someone else changed this content. Reload the page before saving again.')).toBeVisible();
    await expect(olderTab.getByRole('button', { name: 'Save homepage CTA' })).toBeEnabled();
    const conflictScreenshot = info.outputPath('cta-conflict.png');
    await olderTab.locator('section').first().screenshot({ path: conflictScreenshot });
    await info.attach('Older edit rejected', { path: conflictScreenshot, contentType: 'image/png' });
    await olderTab.reload();
    await expect(olderTab.getByLabel('Heading', { exact: true })).toHaveValue('Keep the newest heading');
    await olderTab.getByLabel('Primary button href (mailto or URL)', { exact: true }).fill('javascript:alert(1)');
    await olderTab.getByRole('button', { name: 'Save homepage CTA' }).click();
    await expect(olderTab.getByText('Use a page link, https, http, mailto or tel URL for each button.')).toBeVisible();
    await expect(olderTab.getByRole('button', { name: 'Save homepage CTA' })).toBeEnabled();
    const saved = JSON.parse(await readFile(join(root, 'data/site-content.json'), 'utf8'));
    expect(saved.homepageCta.heading).toBe('Keep the newest heading');
    expect(saved.homepageCta.primaryHref).toMatch(/^mailto:/);
    expect(await readFile(join(root, 'index.html'), 'utf8')).toContain('Keep the newest heading');
    await olderTab.close();
    await page.route('**/api/site-content', route => route.fulfill({ status: 503, body: 'Unavailable' }));
    await page.reload();
    await expect(page.getByRole('alert')).toHaveText('Homepage content could not be loaded.');
    await expect(page.locator('[aria-busy="true"]')).toHaveCount(0);
  } finally {
    try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
  }
});

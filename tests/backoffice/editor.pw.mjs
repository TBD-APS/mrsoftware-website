import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const repo = new URL('../..', import.meta.url);

function start(root) {
  const child = spawn(process.execPath, ['tools/link-backoffice.mjs'], {
    cwd: new URL(repo).pathname,
    env: { ...process.env, LINKS_ROOT: root },
    stdio: ['ignore', 'pipe', 'pipe'],
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
  await writeFile(join(root, 'data/links.json'), await readFile(new URL('../../data/links.json', import.meta.url)));
  const { child, ready } = start(root);
  try {
    const base = await ready;
    await page.goto(base);
    await expect(page.getByRole('heading', { level: 1, name: 'Links between pages' })).toBeVisible();
    await page.getByRole('link', { name: 'The offer', exact: true }).click();
    await expect(page).toHaveURL(/page=the-offer$/);
    await expect(page.locator('.link-editor-preview').getByRole('link', { name: /The job/ })).toHaveAttribute('href', '/stories/the-job/');
    await page.getByRole('searchbox', { name: 'Find a page' }).fill('Roadmap');
    await page.getByRole('button', { name: 'Add Roadmap' }).click();
    await expect(page.getByText('Added Roadmap.')).toBeVisible();
    await page.getByRole('button', { name: 'Save links' }).click();
    await expect(page.getByText('Saved. Publish the site for readers to see these links.')).toBeVisible();
    await page.reload();
    await expect(page.locator('.link-editor-preview').getByRole('link', { name: /Roadmap/ })).toHaveAttribute('href', '/roadmap/');
    const saved = JSON.parse(await readFile(join(root, 'data/links.json'), 'utf8'));
    assertHas(saved, 'the-offer', 'roadmap');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    if (info.project.name === 'phone') {
      const box = await page.getByRole('button', { name: 'Save links' }).boundingBox();
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(errors).toEqual([]);
  } finally {
    child.kill();
  }
});

function assertHas(graph, fromId, toId) {
  if (!graph.links[fromId].some(link => link.toId === toId)) throw new Error(`${fromId} does not link to ${toId}`);
}

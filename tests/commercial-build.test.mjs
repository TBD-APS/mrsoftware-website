import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicDependencies } from '../tools/build-commercial.mjs';
import { productRoutes } from '../commercial/src/data/scenarios.mjs';

async function graph(t, html) {
  const root = await mkdtemp(path.join(tmpdir(), 'commercial-dependencies-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const save = async (file, body) => { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, body); };
  for (const route of productRoutes('workslip')) await save(route + 'index.html', route === '/workslip/' ? html : '<html></html>');
  await save('/workslip/manifest.webmanifest', '{"icons":[]}');
  await save('/_astro/entry.js', 'import "./nested.js";');
  await save('/_astro/nested.js', 'export const ready = true;');
  await save('/_astro/theme.css', 'body { color: black; }');
  await save('/workslip/icons/example.png', 'image');
  return root;
}

test('public graph follows HTML tag, attribute and rel names regardless of case', async t => {
  const root = await graph(t, `<ScRiPt SrC = '/_astro/entry.js'></ScRiPt><LINK REL='alternate StyleSheet' HREF=/_astro/theme.css><IMG SRC="/workslip/icons/example.png"><a HREF='/workslip/icons/example.png' DOWNLOAD>Label</a>`);
  const found = await publicDependencies('workslip', root);
  for (const entry of ['/_astro/entry.js', '/_astro/nested.js', '/_astro/theme.css', '/workslip/icons/example.png']) assert.ok(found.includes(entry), `${entry} must be in the public dependency graph`);
});

test('mixed-case HTML cannot hide a private dependency from the public graph guard', async t => {
  const root = await graph(t, `<SCRIPT SRC='/backoffice/private.js'></SCRIPT>`);
  await assert.rejects(publicDependencies('workslip', root), /Public page depends on private asset/);
});

test('nested private pages protect their transitive bundles on the public demo host', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'commercial-private-graph-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const dist = path.join(root, 'dist');
  const save = async (file, body) => { const target = path.join(dist, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, body); };

  await save('index.html', '<script src="/_astro/shared.js"></script>');
  await save('backoffice/index.html', '<script src="/_astro/sales.js"></script>');
  await save('backoffice/youtube/index.html', '<script src="/_astro/youtube.js"></script>');
  await save('backoffice/newsletter/index.html', '<link rel="stylesheet" href="/_astro/newsletter.css">');
  await save('_astro/shared.js', 'export const shared = true;');
  await save('_astro/sales.js', 'import "./shared.js";');
  await save('_astro/youtube.js', 'import "./shared.js"; import("./private-video.js");');
  await save('_astro/private-video.js', 'export const video = true;');
  await save('_astro/newsletter.css', 'body { background: url(./letter.svg); }');
  await save('_astro/letter.svg', '<svg xmlns="http://www.w3.org/2000/svg" />');

  const output = path.join(root, 'policy.json');
  const { writeCommercialAssetPolicy } = await import('../tools/commercial-asset-policy.mjs');
  await writeCommercialAssetPolicy(dist, output);
  const { protectedAssets } = JSON.parse(await readFile(output, 'utf8'));
  assert.deepEqual(protectedAssets, [
    '/_astro/letter.svg', '/_astro/newsletter.css', '/_astro/private-video.js', '/_astro/sales.js', '/_astro/youtube.js',
    '/backoffice/index.html', '/backoffice/newsletter/index.html', '/backoffice/youtube/index.html',
  ]);
});

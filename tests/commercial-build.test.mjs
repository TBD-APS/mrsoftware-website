import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
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

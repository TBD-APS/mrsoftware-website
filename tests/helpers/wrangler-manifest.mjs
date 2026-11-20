import assert from 'node:assert/strict';
import { readFile, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Wrangler does not export its upload-manifest builder. Expose the exact helper
// from an ephemeral copy of the pinned bundle, without editing the dependency or
// invoking a CLI command/network call. An SDK upgrade requires a deliberate review.
export async function wranglerAssetManifest(directory) {
  const entry = require.resolve('wrangler');
  const pkg = JSON.parse(await readFile(path.join(path.dirname(entry), '../package.json'), 'utf8'));
  assert.equal(pkg.version, '4.153.0', 'Review the internal Wrangler manifest adapter when upgrading');
  const source = await readFile(entry, 'utf8');
  assert.ok(source.includes('buildAssetManifest =') && source.includes('var init_assets5 ='), 'Wrangler manifest adapter changed');
  const copy = path.join(path.dirname(entry), `manifest-test-${crypto.randomUUID()}.cjs`);
  try {
    await writeFile(copy, source + '\nmodule.exports.__uploadManifest = directory => { init_assets5(); return buildAssetManifest(directory); };\n');
    const manifest = await require(copy).__uploadManifest(directory);
    return manifest;
  } finally {
    delete require.cache[copy];
    await rm(copy, { force: true });
  }
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { elevenLabsWidgetRelease } from '../commercial/src/scripts/sales/vendor/elevenlabs-public-widget.mjs';

test('Content Creator uses the exact Boney browser source and versioned provider bytes', async () => {
  const path = '../commercial/src/scripts/sales/vendor/elevenlabs-public-widget.mjs';
  const hash = createHash('sha256').update(await readFile(new URL(path, import.meta.url))).digest('hex');
  assert.equal(hash, 'ff9fce53b5ff3063867d078d404fbe4b38793c3629be3590a6f0d0d1c9c0d039');
  assert.equal(elevenLabsWidgetRelease.url, 'https://unpkg.com/@elevenlabs/convai-widget-embed@0.28.0/dist/index.js');
  assert.match(elevenLabsWidgetRelease.integrity, /^sha384-[A-Za-z0-9+/]{64}$/);
});

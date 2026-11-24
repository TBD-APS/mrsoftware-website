import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const skip = new Set(['node_modules', 'vendor', '.commercial-dist', '.git']);

async function htmlFiles(dir, found = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await htmlFiles(full, found);
    else if (entry.name.endsWith('.html')) found.push(full);
  }
  return found;
}

test('public HTML uses one MR Software address, plus Datatilsynet', async () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const files = await htmlFiles(root);
  assert.ok(files.length > 10);
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    for (const match of text.matchAll(email)) {
      const address = match[0].toLowerCase();
      const where = `${path.relative(root, file)} uses ${address}`;
      if (address.endsWith('@mrsoftware.dk')) assert.equal(address, 'wp@mrsoftware.dk', where);
      if (address.endsWith('@datatilsynet.dk')) assert.equal(address, 'dt@datatilsynet.dk', where);
    }
  }
});

test('the contact call to action keeps its subject line', async () => {
  const contact = await readFile(new URL('../contact/index.html', import.meta.url), 'utf8');
  assert.match(contact, /mailto:wp@mrsoftware\.dk\?subject=/);
});

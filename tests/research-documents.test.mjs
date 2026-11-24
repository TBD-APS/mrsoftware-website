import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const papers = [
  'saassy-medical-platform-research-paper.pdf',
  'donor-network-consolidation-research-paper.pdf',
];

for (const paper of papers) {
  test(`${paper} is a public PDF without local file references`, async () => {
    const body = await readFile(fileURLToPath(new URL(`../research/${paper}`, import.meta.url)));
    assert.equal(body.subarray(0, 4).toString(), '%PDF');
    assert.equal(body.includes('file://'), false, 'PDF must not expose local file links');
    assert.equal(body.includes('/Users/'), false, 'PDF must not expose local filesystem paths');
  });
}

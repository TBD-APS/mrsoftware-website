import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { verifyContentModule } from '../tools/verify-content-module.mjs';

test('the content package is the original archive from an exact green Boney main run', async () => {
  const result = await verifyContentModule();
  assert.equal(result.ci.headSha, result.source.commit);
  assert.equal(result.artifact.version, '0.1.0');
});

test('substituted content bytes and candidate CI evidence cannot be admitted', async t => {
  const root = await mkdtemp(join(tmpdir(), 'content-admission-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'vendor/boney'), { recursive: true });
  for (const file of ['package.json', 'package-lock.json', 'vendor/boney/content-manifest.json', 'vendor/boney/content-admission.json', 'vendor/boney/mr-software-content-0.1.0.tgz']) {
    await writeFile(join(root, file), await readFile(new URL('../' + file, import.meta.url)));
  }
  await verifyContentModule(root);
  await writeFile(join(root, 'vendor/boney/mr-software-content-0.1.0.tgz'), 'substituted');
  await assert.rejects(verifyContentModule(root), /integrity/);
  const ci = JSON.parse(await readFile(join(root, 'vendor/boney/content-admission.json'), 'utf8'));
  ci.branch = 'candidate'; await writeFile(join(root, 'vendor/boney/content-admission.json'), JSON.stringify(ci));
  await assert.rejects(verifyContentModule(root), /green producer main/);
});

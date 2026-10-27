import test from 'node:test';
import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unpackSnapshot } from '../tools/dashboard-snapshot.mjs';

const value = { data: { snapshotAt: 'synthetic', projects: [{ completed: 1, remaining: 2 }], portfolio: { completed: 1, remaining: 2 } }, graphs: { repositories: [{ id: 'synthetic' }] } };
const json = JSON.stringify(value);
const archive = gzipSync(json).toString('base64');
const digest = createHash('sha256').update(json).digest('hex');

test('materializes only the approved private snapshot with private file modes', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'snapshot-test-'));
  try {
    const dir = await unpackSnapshot({ archive, digest, parent });
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'data.json'), 'utf8')), value.data);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'graphs.json'), 'utf8')), value.graphs);
    assert.equal((await stat(join(dir, 'data.json'))).mode & 0o777, 0o600);
    assert.equal((await stat(dir)).mode & 0o777, 0o700);
  } finally { await rm(parent, { recursive: true, force: true }); }
});
for (const [name, input] of Object.entries({
  missing: {}, malformed: { archive: '*not-base64*', digest },
  oversized: { archive: 'A'.repeat(180001), digest },
  'wrong digest': { archive, digest: 'a'.repeat(64) },
  'invalid gzip': { archive: Buffer.from('invalid').toString('base64'), digest },
  'decompression bomb': { archive: gzipSync('x'.repeat(9 * 1024 * 1024)).toString('base64'), digest },
  'invalid snapshot shape': { archive: gzipSync('{}').toString('base64'), digest: createHash('sha256').update('{}').digest('hex') },
})) {
  test(`refuses ${name} without disclosing snapshot content`, async () => {
    await assert.rejects(unpackSnapshot(input), error => !error.message.includes('synthetic') && /snapshot/i.test(error.message));
  });
}

test('CLI packs and reassembles multiple secret parts without logging their content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'snapshot-roundtrip-'));
  try {
    const source = join(root, 'reviewed'); await mkdir(source);
    const data = { ...value.data, syntheticPadding: randomBytes(60000).toString('hex') };
    await writeFile(join(source, 'data.json'), JSON.stringify(data));
    await writeFile(join(source, 'graphs.json'), JSON.stringify(value.graphs));
    const output = join(root, 'archive');
    const packed = spawnSync(process.execPath, ['tools/dashboard-snapshot.mjs', 'pack', source, output], { encoding: 'utf8' });
    assert.equal(packed.status, 0, packed.stderr); assert.ok(!packed.stdout.includes(data.syntheticPadding));
    const parts = await Promise.all([1, 2, 3].map(n => readFile(join(output, `part-${n}`), 'utf8').catch(() => '')));
    assert.ok(parts[0].length === 45000 && parts[1].length > 0);
    const githubEnv = join(root, 'github-env');
    const env = { RUNNER_TEMP: root, GITHUB_ENV: githubEnv, MR_SOFTWARE_DASHBOARD_SHA256: await readFile(join(output, 'sha256'), 'utf8') };
    parts.forEach((part, i) => { env[`MR_SOFTWARE_DASHBOARD_SNAPSHOT_${i + 1}`] = part; });
    const unpacked = spawnSync(process.execPath, ['tools/dashboard-snapshot.mjs', 'unpack'], { env, encoding: 'utf8' });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    const dir = (await readFile(githubEnv, 'utf8')).trim().slice('DASHBOARD_SNAPSHOT_DIR='.length);
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'data.json'), 'utf8')), data);
    delete env.MR_SOFTWARE_DASHBOARD_SNAPSHOT_1;
    assert.notEqual(spawnSync(process.execPath, ['tools/dashboard-snapshot.mjs', 'unpack'], { env }).status, 0);
    const unsafe = spawnSync(process.execPath, ['tools/dashboard-snapshot.mjs', 'pack', source, '.local/unsafe-archive'], { encoding: 'utf8' });
    assert.notEqual(unsafe.status, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

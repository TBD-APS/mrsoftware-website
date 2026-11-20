import test from 'node:test';
import assert from 'node:assert/strict';

const module = await import('../tools/cloudflare-visibility.mjs').catch(() => ({}));
const version = '22222222-2222-4222-8222-222222222222';
const env = { CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_API_TOKEN: 'synthetic-token' };
const missing = () => Response.json({ success: false, errors: [{ code: 100146 }] }, { status: 404 });

test('uploaded version visibility uses bounded GETs and waits only for the exact missing-version response', async () => {
  const delays = [], methods = [];
  let reads = 0;
  await module.waitForWorkerVersion(env, 'mrsoftware-commercial', version, { pause: async ms => { delays.push(ms); }, request: async (url, options) => {
    assert.ok(url.endsWith('/versions/' + version));
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    methods.push(options.method);
    return ++reads < 3 ? missing() : Response.json({ success: true, result: { id: version } });
  } });
  assert.deepEqual(methods, ['GET', 'GET', 'GET']);
  assert.deepEqual(delays, [1000, 3000]);
});

test('permanent invisibility is bounded and other version errors fail immediately', async () => {
  const waits = [];
  let reads = 0;
  await assert.rejects(module.waitForWorkerVersion(env, 'mrsoftware-commercial', version, { request: async () => { reads++; return missing(); }, pause: async ms => { waits.push(ms); } }), /not visible/);
  assert.equal(reads, 11);
  assert.equal(waits.length, 10);
  assert.equal(waits.reduce((sum, ms) => sum + ms, 0), 209000);
  for (const response of [Response.json({ success: false }, { status: 403 }), Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 }), Response.json({ success: true, result: { id: 'wrong-version' } })]) {
    let pauses = 0;
    await assert.rejects(module.waitForWorkerVersion(env, 'mrsoftware-commercial', version, { request: async () => response, pause: async () => { pauses++; } }));
    assert.equal(pauses, 0);
  }
});

test('deployment confirmation tolerates only the preceding deployment and never an unexpected version or split', async () => {
  let reads = 0, pauses = 0;
  const expected = { id: 'new', versions: [{ version_id: version, percentage: 100 }] };
  const options = { previousId: 'old', deploymentId: 'new', versionId: version, pause: async () => { pauses++; } };
  const confirmed = await module.confirmWorkerDeployment({ ...options, read: async () => [++reads < 3 ? { id: 'old' } : expected] });
  assert.deepEqual(confirmed, expected);
  assert.equal(reads, 3);
  assert.equal(pauses, 2);
  for (const current of [{ id: 'other' }, { id: 'new', versions: [{ version_id: version, percentage: 50 }] }, { id: 'new', versions: [{ version_id: 'wrong-version', percentage: 100 }] }]) {
    let waits = 0;
    await assert.rejects(module.confirmWorkerDeployment({ ...options, read: async () => [current], pause: async () => { waits++; } }));
    assert.equal(waits, 0);
  }
  let waits = 0;
  await assert.rejects(module.confirmWorkerDeployment({ ...options, read: async () => [{ id: 'old' }], pause: async () => { waits++; } }), /did not confirm/);
  assert.equal(waits, 10);
});

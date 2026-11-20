import test from 'node:test';
import assert from 'node:assert/strict';

const { createCommercialDeployment } = await import('../tools/deploy-commercial.mjs');
const version = '22222222-2222-4222-8222-222222222222';
const deployment = '33333333-3333-4333-8333-333333333333';
const env = { GITHUB_ACTIONS: 'true', CLOUDFLARE_ACCOUNT_ID: '9dd0c66615faab3122f01b14ebe3bbdd', CLOUDFLARE_API_TOKEN: 'synthetic-token', GITHUB_SHA: 'b'.repeat(40) };
const confirmation = () => ({ id: deployment, strategy: 'percentage', versions: [{ version_id: version, percentage: 100 }] });

test('commercial promotion sends one exact deployment POST without another CLI version lookup', async () => {
  const calls = [];
  const result = await createCommercialDeployment(env, version, { request: async (url, options) => {
    calls.push({ url, options });
    return Response.json({ success: true, result: confirmation() });
  } });
  assert.equal(result.id, deployment);
  assert.equal(calls.length, 1);
  const { url, options } = calls[0];
  assert.equal(url, `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/mrsoftware-commercial/deployments`);
  assert.equal(options.method, 'POST');
  assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
  assert.equal(options.headers['Content-Type'], 'application/json');
  assert.equal(options.redirect, 'error');
  assert.ok(options.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(options.body), { strategy: 'percentage', versions: [{ version_id: version, percentage: 100 }], annotations: { 'workers/message': `GitHub main ${env.GITHUB_SHA}` } });
});

test('commercial promotion rejects missing Action credentials, wrong account and malformed versions before any POST', async () => {
  for (const [settings, id] of [
    [{ ...env, GITHUB_ACTIONS: '' }, version], [{ ...env, CLOUDFLARE_API_TOKEN: '' }, version],
    [{ ...env, CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32) }, version], [{ ...env, GITHUB_SHA: 'bad' }, version],
    [env, 'bad-id'],
  ]) {
    let calls = 0;
    await assert.rejects(async () => createCommercialDeployment(settings, id, { request: async () => { calls++; throw Error('No request with invalid context'); } }));
    assert.equal(calls, 0);
  }
});

test('rejected or ambiguous deployment confirmations never repeat the POST', async () => {
  for (const response of [
    Response.json({ success: false, errors: [{ code: 100146 }] }, { status: 404 }),
    Response.json({ success: false }, { status: 403 }), Response.json({ success: false }, { status: 500 }),
    Response.json({ success: false, result: confirmation() }),
    Response.json({ success: true, result: { ...confirmation(), id: 'invalid' } }),
    Response.json({ success: true, result: { ...confirmation(), strategy: 'other' } }),
    Response.json({ success: true, result: { ...confirmation(), versions: [{ version_id: deployment, percentage: 100 }] } }),
    Response.json({ success: true, result: { ...confirmation(), versions: [{ version_id: version, percentage: 50 }, { version_id: deployment, percentage: 50 }] } }),
    new Response('invalid json'),
  ]) {
    let calls = 0;
    await assert.rejects(async () => createCommercialDeployment(env, version, { request: async () => { calls++; return response; } }));
    assert.equal(calls, 1);
  }
});

test('a lost deployment response never repeats a potentially committed POST', async () => {
  let writes = 0;
  await assert.rejects(async () => createCommercialDeployment(env, version, { request: async () => { writes++; throw Error('Synthetic response lost'); } }), /response lost/);
  assert.equal(writes, 1);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHmac, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { withElevenLabsWebhook, elevenLabsPath } from '../elevenlabs-webhook.mjs';

const secret = 'synthetic-webhook-secret';
const payload = timestamp => JSON.stringify({ type: 'post_call_transcription', event_timestamp: timestamp,
  data: { conversation_id: 'synthetic-call', tenant_id: 'attacker', transcript: [{ message: 'Private synthetic æøå' }] } });
const sign = (body, timestamp = Math.floor(Date.now() / 1000)) => `t=${timestamp},v0=${createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex')}`;
const handle = withElevenLabsWebhook(() => new Response('Existing company or Access handler', { status: 200 }));
const request = (body, signature = sign(body), host = 'mrsoftware.dk') => new Request(`https://${host}${elevenLabsPath}?tenantId=attacker`, {
  method: 'POST', body, headers: { 'Content-Type': 'application/json', 'ElevenLabs-Signature': signature }
});
const schema = await readFile(new URL('../migrations/elevenlabs/0001_inbox.sql', import.meta.url), 'utf8');

test('The installed archive is pinned to the clean producer CI artifact and its original integrity', async () => {
  const receipt = JSON.parse(await readFile(new URL('../vendor/boney/elevenlabs-manifest.json', import.meta.url), 'utf8'));
  const lock = JSON.parse(await readFile(new URL('../package-lock.json', import.meta.url), 'utf8'));
  const artifact = receipt.artifacts[0];
  assert.equal(receipt.source.repository, 'https://github.com/TBD-APS/boney');
  assert.match(receipt.source.commit, /^[0-9a-f]{40}$/);
  assert.equal(receipt.source.releaseEligible, true); assert.equal(receipt.source.dirty, false);
  assert.ok(Number.isSafeInteger(receipt.ci.runId) && Number.isSafeInteger(receipt.ci.artifactId));
  assert.equal(artifact.id, '@mr-software/elevenlabs'); assert.equal(artifact.version, '0.1.0');
  assert.equal(artifact.file, 'mr-software-elevenlabs-0.1.0.tgz');
  const archive = await readFile(new URL('../vendor/boney/' + artifact.file, import.meta.url));
  assert.equal('sha512-' + createHash('sha512').update(archive).digest('base64'), artifact.integrity);
  assert.equal(lock.packages['node_modules/@mr-software/elevenlabs'].integrity, artifact.integrity);
});

async function harness(t) {
  const mf = new Miniflare(convertV4MiniflareOptions({ modules: true, compatibilityDate: '2026-09-02',
    script: 'export default { fetch() { return new Response("synthetic D1 host"); } }', d1Databases: ['ELEVENLABS_INBOX'] }));
  t.after(() => mf.dispose());
  const database = await mf.getD1Database('ELEVENLABS_INBOX');
  for (const statement of schema.split(';').map(sql => sql.trim()).filter(Boolean)) await database.prepare(statement).run();
  return { database, env: { ELEVENLABS_INBOX: database, ELEVENLABS_WEBHOOK_ENABLED: 'true', ELEVENLABS_MODULE_VERSION: '0.1.0', ELEVENLABS_WEBHOOK_SECRET: secret } };
}

test('Installed Boney package writes concurrent redeliveries once to real local D1 under the trusted scope', async t => {
  const { database, env } = await harness(t);
  const body = payload(Math.floor(Date.now() / 1000));
  const responses = await Promise.all(Array.from({ length: 8 }, () => handle(request(body), env)));
  assert.ok(responses.every(result => result.status === 200));
  const statuses = await Promise.all(responses.map(response => response.json()));
  assert.equal(statuses.filter(result => result.status === 'accepted').length, 1);
  assert.equal(statuses.filter(result => result.status === 'duplicate').length, 7);
  const row = await database.prepare('SELECT *, count(*) AS total FROM elevenlabs_inbox').first();
  assert.equal(row.total, 1);
  assert.equal(row.tenant_id, 'mr-software'); assert.equal(row.application_id, 'mrsoftware-website');
  assert.equal(row.connection_id, 'elevenlabs-main'); assert.equal(row.payload, body);
  const redelivery = await handle(request(body, sign(body, Math.floor(Date.now() / 1000) + 1)), env);
  assert.equal(redelivery.status, 200); assert.deepEqual(await redelivery.json(), { status: 'duplicate' });
});

test('Wrong keys, modified bodies and stale signatures never enter the durable inbox', async t => {
  const { database, env } = await harness(t);
  const body = payload(Math.floor(Date.now() / 1000));
  for (const req of [request(body, 'forged'), request(body + ' ', sign(body)), request(body, sign(body, 1))]) {
    const response = await handle(req, env);
    assert.equal(response.status, 401); assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.doesNotMatch(await response.text(), /synthetic|Private/);
  }
  assert.equal((await handle(request(body), { ...env, ELEVENLABS_WEBHOOK_SECRET: 'another-account' })).status, 401);
  assert.equal((await database.prepare('SELECT count(*) AS total FROM elevenlabs_inbox').first()).total, 0);
});

test('Default-off, missing keys/bindings, incompatible grants and database failures remain retryable', async t => {
  const { env, database } = await harness(t);
  const body = payload(Math.floor(Date.now() / 1000));
  for (const override of [{ ELEVENLABS_WEBHOOK_ENABLED: 'false' }, { ELEVENLABS_WEBHOOK_SECRET: undefined }, { ELEVENLABS_INBOX: undefined }, { ELEVENLABS_MODULE_VERSION: '0.2.0' }]) {
    const response = await handle(request(body), { ...env, ...override });
    assert.equal(response.status, 503);
  }
  assert.equal((await database.prepare('SELECT count(*) AS total FROM elevenlabs_inbox').first()).total, 0);
  await database.prepare('DROP TABLE elevenlabs_inbox').run();
  const failed = await handle(request(body), env);
  assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { status: 'inbox_unavailable' });
});

test('Only the exact company callback is public; other routes retain company and Access handling', async () => {
  for (const host of ['dashboard.mrsoftware.dk', 'mrsoftware.rasmusvm6.workers.dev', 'attacker.example']) {
    assert.equal((await handle(request('{}', 'forged', host), {})).status, 404);
  }
  assert.equal((await handle(new Request('https://mrsoftware.dk' + elevenLabsPath), {})).status, 405);
  assert.equal(await (await handle(new Request('https://mrsoftware.dk/'), {})).text(), 'Existing company or Access handler');
  assert.equal(await (await handle(new Request('https://dashboard.mrsoftware.dk/_development/'), {})).text(), 'Existing company or Access handler');
});

test('Host migration matches the installed Boney schema and the release grants the pinned module', async () => {
  const require = createRequire(import.meta.url);
  assert.equal(schema, await readFile(require.resolve('@mr-software/elevenlabs/inbox.sql'), 'utf8'));
  const config = JSON.parse(await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8'));
  assert.equal(config.vars.ELEVENLABS_WEBHOOK_ENABLED, 'true');
  assert.equal(config.vars.ELEVENLABS_MODULE_VERSION, '0.1.0');
  assert.equal(config.d1_databases[0].binding, 'ELEVENLABS_INBOX');
  const ignored = await readFile(new URL('../.assetsignore', import.meta.url), 'utf8');
  for (const path of ['vendor/**', 'migrations/**', 'elevenlabs-webhook.mjs']) assert.ok(ignored.split('\n').includes(path));
});

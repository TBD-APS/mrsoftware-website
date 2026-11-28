import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { elevenCreative } from '../commercial/server/youtube-media.mjs';

const root = '/api/backoffice/youtube';
const draft = { title: 'Test internal video', description: '', tags: '', product: 'Workslip' };

test('media is saved privately, bound to a draft revision and never submitted twice', async t => {
  const sent = [];
  const outputs = new Map();
  const storage = {
    async put(key, file) { outputs.set(key, file); },
    async get(key) { return outputs.has(key) ? { body: outputs.get(key).stream() } : null; },
  };
  const app = await createCommercialHarness(t, { mediaProvider: () => ({
    async start(kind, prompt) {
      sent.push([kind, prompt]);
      if (prompt === 'ambiguous') throw new Error('Unknown outcome');
      return 'provider-test';
    },
    async check() { return { status: 'completed' }; },
    async download(kind) { return new Blob([kind === 'image' ? 'test-png-bytes' : 'test-mp4-bytes']); },
  }) });
  assert.equal((await app.call('GET', root + '/' + crypto.randomUUID() + '/media')).body.available, false);
  app.env.YOUTUBE_MEDIA = storage;
  const created = (await app.call('POST', root, draft)).body.item;
  const endpoint = root + '/' + created.id + '/media';
  const payload = { requestId: crypto.randomUUID(), kind: 'image', prompt: 'Clean thumbnail', revision: created.revision };
  assert.equal((await app.call('POST', endpoint, payload, { host: app.env.DEMO_HOST })).status, 404);
  assert.equal((await app.call('POST', endpoint, payload, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  assert.equal((await app.call('POST', endpoint, payload, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await app.call('POST', endpoint, { ...payload, revision: 99 })).status, 409);
  assert.equal(sent.length, 0);
  const results = await Promise.all([app.call('POST', endpoint, payload), app.call('POST', endpoint, payload)]);
  assert.ok(results.every(r => [200, 202].includes(r.status) && r.body.job.id === payload.requestId));
  assert.equal(sent.length, 1);
  assert.equal((await app.call('POST', endpoint, { ...payload, requestId: crypto.randomUUID() })).status, 409);
  const jobUrl = endpoint + '/' + payload.requestId;
  assert.equal((await app.call('GET', jobUrl)).body.job.state, 'completed');
  const file = await app.request('GET', jobUrl + '/file');
  assert.equal(file.status, 200);
  assert.equal(file.headers.get('Content-Type'), 'image/png');
  assert.match(file.headers.get('Cache-Control'), /no-store/);
  assert.equal(await file.text(), 'test-png-bytes');
  assert.equal((await app.call('GET', endpoint)).body.jobs.length, 1);
  const other = (await app.call('POST', root, draft)).body.item;
  assert.equal((await app.call('GET', root + '/' + other.id + '/media/' + payload.requestId + '/file')).status, 404);
  const uncertain = { ...payload, requestId: crypto.randomUUID(), kind: 'video', prompt: 'ambiguous' };
  assert.equal((await app.call('POST', endpoint, uncertain)).body.job.state, 'uncertain');
  assert.equal((await app.call('POST', endpoint, { ...uncertain, requestId: crypto.randomUUID() })).status, 409);
  assert.equal(sent.length, 2);
});

test('ElevenLabs adapter sends only the reviewed prompt and fixed generation settings', async () => {
  const calls = [];
  const provider = elevenCreative({ ELEVEN_CREATIVE_API_KEY: 'fixture' }, async (url, init) => {
    calls.push({ url: String(url), init });
    if (init.method === 'POST') return Response.json({ id: 'provider-test', status: 'pending' });
    if (String(url).startsWith('https://storage.googleapis.com/')) return new Response('safe-bytes', { headers: { 'Content-Type': 'video/mp4' } });
    return Response.json({ id: 'provider-test', status: 'completed', content_url: 'https://storage.googleapis.com/media/file?signature=x', content_mime_type: 'video/mp4' });
  });
  const id = await provider.start('video', 'Four-second B-roll');
  assert.deepEqual(JSON.parse(calls[0].init.body), { model_id: 'veo-3.1-fast-generate-001', aspect_ratio: '16:9', duration_secs: 4, resolution: '720p', generate_audio: false, prompt: 'Four-second B-roll' });
  assert.equal(calls[0].url, 'https://api.elevenlabs.io/v1/flows/video');
  const result = await provider.check('video', id);
  await assert.rejects(provider.download('video', { ...result, content_url: 'https://storage.googleapis.com.example/file' }));
  assert.equal(await (await provider.download('video', result)).text(), 'safe-bytes');
  assert.equal(calls[2].init.headers, undefined);
  assert.equal(calls[2].init.redirect, 'error');
});

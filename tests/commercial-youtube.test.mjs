import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { inspectYouTubeVideo, youtubeVideoId } from '../commercial/server/youtube.mjs';

const endpoint = '/api/backoffice/youtube';
const videoId = 'M3r2XDceM6A';
const videoUrl = 'https://www.youtube.com/watch?v=' + videoId;
const draft = { title: 'How field teams use Workslip', description: 'Short demo.\nBook a demo next.', tags: 'workslip, field work', product: 'Workslip' };
const allowed = { title: 'Field team walkthrough', channel: 'MR Software' };

test('YouTube checks only canonical links, and throws out arbitrary hosts, paths and schemes', () => {
  for (const url of [videoUrl + '&t=2', 'https://youtu.be/' + videoId + '?foo=1', 'https://m.youtube.com/shorts/' + videoId, 'https://youtube.com/live/' + videoId]) assert.equal(youtubeVideoId(url), videoId);
  for (const url of [
    'https://youtube.com.example/watch?v=' + videoId, 'https://127.0.0.1/watch?v=' + videoId,
    'http://youtu.be/' + videoId, 'https://user:pass@youtu.be/' + videoId,
    'https://youtu.be:444/' + videoId, 'https://www.youtube.com/watch?v=' + videoId + '&v=' + videoId,
    'https://www.youtube.com/watch?list=' + videoId, 'https://youtu.be/' + videoId + '/somewhere',
  ]) assert.throws(() => youtubeVideoId(url), { status: 400 }, url);
});

test('oEmbed reads first-party metadata without following redirects or returning HTML', async () => {
  const result = await inspectYouTubeVideo(videoId, { request: async (url, init) => {
    assert.equal(url.origin, 'https://www.youtube.com');
    assert.equal(url.pathname, '/oembed');
    assert.equal(url.searchParams.get('url'), videoUrl);
    assert.equal(url.searchParams.get('format'), 'json');
    assert.equal(init.redirect, 'error');
    assert.ok(init.signal);
    return Response.json({ type: 'video', provider_name: 'YouTube', title: allowed.title, author_name: allowed.channel, html: '<iframe src="ignored">' });
  } });
  assert.deepEqual(result, allowed);
  await assert.rejects(inspectYouTubeVideo(videoId, { request: async () => new Response('Not found', { status: 404 }) }), { status: 422 });
  await assert.rejects(inspectYouTubeVideo(videoId, { request: async () => new Response('timeout', { status: 503 }) }), { status: 503 });
  await assert.rejects(inspectYouTubeVideo(videoId, { request: async () => Response.json({ type: 'video', provider_name: 'Other' }) }), { status: 503 });
  await assert.rejects(inspectYouTubeVideo(videoId, { request: async () => Response.json({ type: 'video', provider_name: 'YouTube', title: 'x'.repeat(40_000) }) }), { status: 503 });
});

test('signed-in staff can save, edit, reload and check a YouTube draft through D1; no public or cross-origin calls', async t => {
  let providerCalls = 0;
  const app = await createCommercialHarness(t, { inspectYouTube: async id => { providerCalls++; assert.equal(id, videoId); return allowed; }, clock: () => new Date('2030-11-27T10:00:00Z') });
  assert.equal((await app.call('GET', endpoint, undefined, { host: app.env.DEMO_HOST })).status, 404);
  assert.equal((await app.call('GET', endpoint, undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  assert.equal((await app.call('POST', endpoint, draft, { headers: { Origin: 'https://other.example' } })).status, 403);
  assert.equal((await app.call('POST', endpoint, { ...draft, verification: allowed })).status, 400);
  const created = await app.call('POST', endpoint, draft);
  assert.equal(created.status, 201);
  assert.match(created.headers.get('Cache-Control'), /no-store/);
  assert.equal(created.body.item.revision, 1);
  assert.equal(created.body.item.verification, null);
  const id = created.body.item.id;
  const path = endpoint + '/' + id;
  assert.deepEqual((await app.call('GET', path)).body.item, created.body.item);
  assert.deepEqual((await app.call('GET', endpoint)).body.items, [created.body.item]);
  assert.equal((await app.call('PUT', path, { ...draft, revision: 2 })).status, 409);
  const edited = await app.call('PUT', path, { ...draft, description: 'Edited copy', revision: 1 });
  assert.equal(edited.body.item.description, 'Edited copy');
  assert.equal(edited.body.item.revision, 2);
  assert.equal((await app.call('POST', path + '/check', { videoUrl, revision: 1 })).status, 409);
  assert.equal((await app.call('POST', path + '/check', { videoUrl: 'https://private.example', revision: 2 })).status, 400);
  assert.equal(providerCalls, 0);
  const checked = await app.call('POST', path + '/check', { videoUrl, revision: 2 });
  assert.equal(checked.status, 200);
  assert.equal(checked.body.item.revision, 3);
  assert.deepEqual(checked.body.item.verification, { ...allowed, videoId, url: videoUrl, checkedAt: '2030-11-27T10:00:00.000Z' });
  assert.equal(providerCalls, 1);
  assert.deepEqual((await app.call('GET', path)).body.item, checked.body.item);
  assert.equal((await app.call('DELETE', path)).status, 405);
  const row = await app.db.prepare('SELECT updated_by FROM sales_youtube_drafts WHERE id = ?').bind(id).first();
  assert.equal(row.updated_by, 'synthetic-owner');
  assert.equal(checked.body.item.updated_by, undefined);
});

test('a failed provider check cannot write an as-verified receipt', async t => {
  const app = await createCommercialHarness(t, { inspectYouTube: id => inspectYouTubeVideo(id, { request: async () => new Response('Private', { status: 403 }) }) });
  const { body: { item } } = await app.call('POST', endpoint, draft);
  const path = endpoint + '/' + item.id;
  const failed = await app.call('POST', path + '/check', { videoUrl, revision: 1 });
  assert.equal(failed.status, 422);
  assert.deepEqual((await app.call('GET', path)).body.item, item);
});

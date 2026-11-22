import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { createDashboardHandler } from '../dashboard/handler.mjs';

const handle = createDashboardHandler({ files: {}, verifyAccess: async () => false });

test('Workflow media uses content fingerprints and stays within the download budget', async () => {
  const directory = new URL('../assets/workflow/', import.meta.url);
  const names = await readdir(directory);
  assert.equal(names.length, 2, 'Ship one compatible video and one poster');
  for (const extension of ['mp4', 'webp']) {
    const name = names.find(name => name.endsWith('.' + extension));
    assert.ok(name, extension + ' is present');
    const bytes = await readFile(new URL(name, directory));
    const fingerprint = createHash('sha256').update(bytes).digest('hex').slice(0, 12);
    assert.equal(name, `workflow.${fingerprint}.${extension}`, 'Changed bytes need a new immutable cache key');
    assert.ok(bytes.length < (extension === 'mp4' ? 450_000 : 60_000), extension + ' download budget');
  }
});

test('Workflow playback keeps range requests, partial responses and cache validators intact', async () => {
  for (const [extension, contentType] of [['mp4', 'video/mp4'], ['webp', 'image/webp']]) {
    for (const [method, status] of [['GET', 200], ['HEAD', 200], ['GET', 206], ['GET', 304]]) {
      const headers = { ...(status !== 200 || method === 'HEAD' ? { Range: 'bytes=0-255' } : {}), 'If-None-Match': '"media-hash"' };
      const response = await handle(new Request(`https://mrsoftware.dk/assets/workflow/workflow.012345abcdef.${extension}`, { method, headers }), {
        ASSETS: { fetch: request => {
          assert.equal(request.method, method);
          assert.equal(request.headers.get('Range'), headers.Range ?? null);
          assert.equal(request.headers.get('If-None-Match'), headers['If-None-Match']);
          return new Response(method === 'HEAD' || status === 304 ? null : 'media bytes', {
            status, headers: { 'Content-Type': contentType, 'Content-Range': 'bytes 0-255/294000', 'Accept-Ranges': 'bytes', ETag: '"media-hash"', 'CF-Cache-Status': 'HIT' },
          });
        } },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
      assert.equal(response.headers.get('Content-Range'), 'bytes 0-255/294000');
      assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
      assert.equal(response.headers.get('ETag'), '"media-hash"');
      assert.equal(response.headers.get('CF-Cache-Status'), 'HIT');
      assert.equal(response.headers.get('Content-Type'), contentType);
      assert.equal(await response.text(), method === 'HEAD' || status === 304 ? '' : 'media bytes');
    }
  }
});

test('Safari video probes and seeks receive the requested bytes when the asset binding returns the full file', async () => {
  const bytes = new TextEncoder().encode('0123456789');
  for (const [range, expectedRange, expectedBody] of [
    ['bytes=0-1', 'bytes 0-1/10', '01'],
    ['bytes=3-6', 'bytes 3-6/10', '3456'],
    ['bytes=8-', 'bytes 8-9/10', '89'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=8-999', 'bytes 8-9/10', '89'],
  ]) {
    const response = await handle(new Request('https://mrsoftware.dk/assets/workflow/workflow.012345abcdef.mp4', { headers: { Range: range } }), {
      ASSETS: { fetch: () => new Response(bytes, { headers: { 'Content-Type': 'video/mp4', 'Content-Length': '10', ETag: '"media-hash"', 'CF-Cache-Status': 'HIT' } }) },
    });
    assert.equal(response.status, 206, range);
    assert.equal(response.headers.get('Content-Range'), expectedRange);
    assert.equal(response.headers.get('Content-Length'), String(expectedBody.length));
    assert.equal(response.headers.get('Accept-Ranges'), 'bytes');
    assert.equal(response.headers.get('ETag'), '"media-hash"');
    assert.equal(response.headers.get('CF-Cache-Status'), 'HIT');
    assert.equal(response.headers.get('Cache-Control'), 'public, max-age=31536000, immutable');
    assert.equal(await response.text(), expectedBody);
  }
});

test('Video ranges handle unsatisfiable requests and changed validators without slicing unrelated assets', async () => {
  for (const [path, method, range, ifRange, expectedStatus, expectedBody] of [
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=10-', null, 416, ''],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=-0', null, 416, ''],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=6-3', null, 200, '0123456789'],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=0-1,5-6', null, 200, '0123456789'],
    ['workflow.012345abcdef.mp4', 'GET', 'invalid', null, 200, '0123456789'],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=0-1', '"previous-hash"', 200, '0123456789'],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=0-1', 'W/"media-hash"', 200, '0123456789'],
    ['workflow.012345abcdef.mp4', 'GET', 'bytes=0-1', '"media-hash"', 206, '01'],
    ['workflow.012345abcdef.mp4', 'HEAD', 'bytes=0-1', null, 200, ''],
    ['workflow.012345abcdef.webp', 'GET', 'bytes=0-1', null, 200, '0123456789'],
    ['other.mp4', 'GET', 'bytes=0-1', null, 200, '0123456789'],
  ]) {
    const response = await handle(new Request('https://mrsoftware.dk/assets/workflow/' + path, { method, headers: { Range: range, ...(ifRange ? { 'If-Range': ifRange } : {}) } }), {
      ASSETS: { fetch: () => new Response(method === 'HEAD' ? null : '0123456789', { headers: { 'Content-Length': '10', ETag: '"media-hash"' } }) },
    });
    assert.equal(response.status, expectedStatus, [path, method, range, ifRange].join(' '));
    assert.equal(await response.text(), expectedBody);
    if (expectedStatus === 416) {
      assert.equal(response.headers.get('Content-Range'), 'bytes */10');
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
});

test('Date-based If-Range only returns partial video when Last-Modified matches', async () => {
  const modified = 'Sun, 22 Nov 2026 20:00:00 GMT';
  for (const [ifRange, lastModified, expectedStatus] of [
    [modified, modified, 206],
    [`W/"${modified}"`, modified, 200],
    ['Sun, 22 Nov 2026 19:00:00 GMT', modified, 200],
    ['Sun, 22 Nov 2026 21:00:00 GMT', modified, 200],
    [modified, null, 200],
    ['invalid date', modified, 200],
  ]) {
    const response = await handle(new Request('https://mrsoftware.dk/assets/workflow/workflow.012345abcdef.mp4', { headers: { Range: 'bytes=0-1', 'If-Range': ifRange } }), {
      ASSETS: { fetch: () => new Response('0123456789', { headers: { ETag: '"media-hash"', ...(lastModified ? { 'Last-Modified': lastModified } : {}) } }) },
    });
    assert.equal(response.status, expectedStatus, [ifRange, lastModified].join(' '));
    assert.equal(await response.text(), expectedStatus === 206 ? '01' : '0123456789');
    assert.equal(response.headers.get('Last-Modified'), lastModified);
  }
});

test('Video cache policy leaves errors, mutable paths, unrelated files and writes unchanged', async () => {
  for (const [pathname, method, status] of [
    ['/assets/workflow/workflow.012345abcdef.mp4', 'GET', 404],
    ['/assets/workflow/workflow.012345abcdef.mp4', 'GET', 500],
    ['/assets/workflow/workflow.012345abcdef.mp4', 'POST', 200],
    ['/assets/workflow/workflow.mp4', 'GET', 200],
    ['/assets/workflow/other.012345abcdef.mp4', 'GET', 200],
    ['/assets/workflow/workflow.012345abcdef.html', 'GET', 200],
    ['/da/', 'GET', 200],
  ]) {
    const response = await handle(new Request('https://mrsoftware.dk' + pathname, { method }), {
      ASSETS: { fetch: () => new Response('unchanged', { status, headers: { 'Cache-Control': 'no-cache' } }) },
    });
    assert.equal(response.headers.get('Cache-Control'), 'no-cache', pathname);
  }
});

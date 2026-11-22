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
      const headers = { Range: 'bytes=0-255', 'If-None-Match': '"media-hash"' };
      const response = await handle(new Request(`https://mrsoftware.dk/assets/workflow/workflow.012345abcdef.${extension}`, { method, headers }), {
        ASSETS: { fetch: request => {
          assert.equal(request.method, method);
          assert.equal(request.headers.get('Range'), headers.Range);
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

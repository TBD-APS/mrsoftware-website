import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyRelease, REPOSITORY } from '../tools/release-eligibility.mjs';

const sha = 'a'.repeat(40);
const context = { repository: REPOSITORY, ref: 'refs/heads/main', sha, event: 'push' };
const pull = () => ({ number: 12, merged: true, merged_at: '2026-10-26T12:00:00Z', merge_commit_sha: sha, merged_by: { id: 31623093 }, base: { ref: 'main', repo: { full_name: REPOSITORY } } });
function api(pr = pull(), head = sha) {
  return async path => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: head } };
    if (path.includes('/commits/')) return [{ number: 12 }];
    if (path.endsWith('/pulls/12')) return pr;
    throw Error('Unexpected API request');
  };
}

test('accepts the exact current main commit merged by Rasmus', async () => {
  assert.deepEqual(await verifyRelease(context, api()), { repository: REPOSITORY, sha, pullRequest: 12, mergerId: 31623093 });
});
for (const [name, patch] of Object.entries({ branch: { ref: 'refs/heads/topic' }, repository: { repository: 'someone/other' }, sha: { sha: '../main' }, event: { event: 'pull_request' } })) {
  test(`refuses an invalid ${name} before making API requests`, async () => {
    await assert.rejects(verifyRelease({ ...context, ...patch }, async () => { assert.fail('must not request API'); }));
  });
}
for (const [name, mutate] of Object.entries({
  'another merger': p => { p.merged_by.id = 123; },
  'a login impersonating Rasmus': p => { p.merged_by = { id: 123, login: 'rasm105k' }; },
  'an unmerged PR': p => { p.merged = false; },
  'a different merge SHA': p => { p.merge_commit_sha = 'b'.repeat(40); },
  'a different base branch': p => { p.base.ref = 'release'; },
  'a different base repository': p => { p.base.repo.full_name = 'someone/other'; },
  'a mismatched PR association': p => { p.number = 13; },
})) {
  test(`refuses ${name}`, async () => { const p = pull(); mutate(p); await assert.rejects(verifyRelease(context, api(p))); });
}
test('refuses a stale main revision', async () => { await assert.rejects(verifyRelease(context, api(pull(), 'b'.repeat(40)))); });
test('refuses a direct push without an associated PR', async () => {
  const request = api();
  await assert.rejects(verifyRelease(context, path => path.includes('/commits/') ? [] : request(path)));
});
test('refuses ambiguous or truncated PR association evidence', async () => {
  const request = api();
  await assert.rejects(verifyRelease(context, path => path.includes('/commits/') ? Array.from({ length: 100 }, (_, i) => ({ number: i + 1 })) : request(path)));
});
test('refuses API errors and main moving during verification', async () => {
  await assert.rejects(verifyRelease(context, async () => { throw Error('HTTP 403'); }));
  let reads = 0; const request = api();
  await assert.rejects(verifyRelease(context, path => path.endsWith('/git/ref/heads/main') && ++reads > 1 ? { object: { sha: 'b'.repeat(40) } } : request(path)));
});

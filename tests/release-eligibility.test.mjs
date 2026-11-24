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
test('accepts owner-merged evidence from the renamed repository without relying on redirects', async () => {
  const renamedRepository = 'TBD-APS/mrsoftware.dk';
  const pr = pull();
  pr.base.repo.full_name = renamedRepository;
  const request = api(pr);
  const result = await verifyRelease({ ...context, repository: renamedRepository }, path => {
    assert.ok(path.startsWith('/repos/TBD-APS/mrsoftware.dk/'), 'evidence must use the canonical repository endpoint');
    return request(path);
  });
  assert.deepEqual(result, { repository: renamedRepository, sha, pullRequest: 12, mergerId: 31623093 });
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

function nativeStack() {
  const membership = { id: 55, number: 42, base: { ref: 'main' }, size: 2 };
  const member = (number, position, baseRef, headRef, mergeSha) => ({
    ...pull(), number, merge_commit_sha: mergeSha,
    base: { ref: baseRef, repo: { full_name: REPOSITORY } },
    head: { ref: headRef, repo: { full_name: REPOSITORY } },
    stack: { ...membership, position },
  });
  const lower = member(11, 1, 'main', 'prerequisite', 'b'.repeat(40));
  const upper = member(12, 2, 'prerequisite', 'photograph', sha);
  const stack = { id: 55, number: 42, base: { ref: 'main' }, open: false, pull_requests: [{ number: 11 }, { number: 12 }] };
  const comparison = { status: 'ahead', base_commit: { sha: lower.merge_commit_sha }, merge_base_commit: { sha: lower.merge_commit_sha } };
  let mainReads = 0;
  const fixture = { lower, upper, stack, comparison, moveMain: false, failStack: false };
  fixture.request = async path => {
    if (path.endsWith('/git/ref/heads/main')) return { object: { sha: fixture.moveMain && ++mainReads > 1 ? 'c'.repeat(40) : sha } };
    if (path.endsWith('/pulls/11')) return fixture.lower;
    if (path.endsWith('/pulls/12')) return fixture.upper;
    if (path.endsWith('/stacks/42')) { if (fixture.failStack) throw Error('HTTP 403'); return fixture.stack; }
    if (path.includes('/compare/')) return fixture.comparison;
    if (path.endsWith(`/commits/${sha}/pulls?per_page=100`)) return [{ number: 12 }];
    throw Error('Unexpected API request: ' + path);
  };
  return fixture;
}

test('accepts a complete native stack merged by Rasmus onto exact current main', async () => {
  const fixture = nativeStack();
  assert.deepEqual(await verifyRelease(context, fixture.request), { repository: REPOSITORY, sha, pullRequest: 12, mergerId: 31623093 });
});

test('preserves direct main evidence when an older stack shares one final merge SHA', async () => {
  const request = api();
  const upper = { ...pull(), number: 13, base: { ...pull().base, ref: 'prerequisite' } };
  const result = await verifyRelease(context, path => {
    if (path.includes('/commits/')) return [{ number: 12 }, { number: 13 }];
    if (path.endsWith('/pulls/13')) return upper;
    return request(path);
  });
  assert.equal(result.pullRequest, 12);
});

test('refuses ambiguous direct main merges instead of choosing stack evidence', async () => {
  const request = api();
  await assert.rejects(verifyRelease(context, path => {
    if (path.includes('/commits/')) return [{ number: 12 }, { number: 13 }];
    if (path.endsWith('/pulls/13')) return { ...pull(), number: 13 };
    return request(path);
  }));
});

for (const [name, mutate] of Object.entries({
  'missing membership': f => { delete f.upper.stack; },
  'another stack base': f => { f.upper.stack.base = { ref: 'release' }; },
  'a non-top stack member': f => { f.upper.stack.position = 1; },
  'an invalid stack number': f => { f.upper.stack.number = '../main'; },
  'a missing stack record': f => { f.stack = null; },
  'a mismatched stack record': f => { f.stack.id = 56; },
  'an open stack': f => { f.stack.open = true; },
  'another recorded stack target': f => { f.stack.base.ref = 'release'; },
  'a truncated member list': f => { f.stack.pull_requests.pop(); },
  'duplicate members': f => { f.stack.pull_requests[0].number = 12; },
  'a different top member': f => { f.stack.pull_requests[1].number = 13; },
  'a missing member': f => { f.lower = null; },
  'an unmerged prerequisite': f => { f.lower.merged = false; },
  'a prerequisite merged by someone else': f => { f.lower.merged_by = { id: 123 }; },
  'a prerequisite in another repository': f => { f.lower.base.repo.full_name = 'someone/other'; },
  'a foreign head repository': f => { f.upper.head.repo.full_name = 'someone/other'; },
  'a different member stack': f => { f.lower.stack.id = 56; },
  'an invalid member position': f => { f.lower.stack.position = 2; },
  'an invalid prerequisite merge SHA': f => { f.lower.merge_commit_sha = '../main'; },
  'a broken branch chain': f => { f.lower.head.ref = 'unrelated'; },
  'a divergent commit chain': f => { f.comparison.status = 'diverged'; },
  'an unrelated comparison base': f => { f.comparison.base_commit.sha = 'c'.repeat(40); },
  'an unrelated merge base': f => { f.comparison.merge_base_commit.sha = 'c'.repeat(40); },
  'a denied stack evidence request': f => { f.failStack = true; },
  'main moving during stack verification': f => { f.moveMain = true; },
})) test('refuses native stack evidence with ' + name, async () => {
  const fixture = nativeStack(); mutate(fixture);
  await assert.rejects(verifyRelease(context, fixture.request));
});

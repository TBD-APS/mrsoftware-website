import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { checkPullRequest, inspectBranches, createBranchReport, readPullRequests, run } from '../tools/repository-baseline.mjs';

const repository = 'TBD-APS/mrsoftware-website';
const body = 'Explain the change and its validation.';
test('title gate accepts numbered stacks and typed maintenance titles', () => {
  for (const title of ['[locator 1/1] Add the location finder', '[contact-map 2/3] Add the fallback link', '[Chore] Update dependencies', '[Fix] Keep contact details visible']) {
    assert.deepEqual(checkPullRequest({ title, body }), []);
  }
});
test('title gate rejects invalid positions, blank subjects and multiline input', () => {
  for (const title of ['', 'Add map', '[Unknown] Add map', '[Fix]   ', '[locator 2/1] Add map', '[locator 0/1] Add map',
    '[locator 1/0] Add map', '[locator 1/1] lower case', '[locator 1/1] Add map.', '[Fix] Map\ninjected', '[Fix] Map\rinjected']) {
    assert.throws(() => checkPullRequest({ title, body }), undefined, title);
  }
});
test('short titles and missing bodies remain warnings', () => {
  assert.equal(checkPullRequest({ title: '[Fix] Map', body: ' ' }).length, 2);
});
test('title CLI reads event data without executing title text', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'website-title-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const event = path.join(root, 'event.json');
  const marker = path.join(root, 'executed');
  await writeFile(event, JSON.stringify({ pull_request: { title: `[Fix] Treat $(touch ${marker}) as text`, body } }));
  await run('title', { GITHUB_EVENT_NAME: 'pull_request', GITHUB_EVENT_PATH: event }, root);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  await assert.rejects(run('title', { GITHUB_EVENT_NAME: 'push', GITHUB_EVENT_PATH: event }, root));
});

async function history(t) {
  const root = await mkdtemp(path.join(tmpdir(), 'website-branches-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' } }).trim();
  git('init', '-b', 'main'); git('config', 'user.name', 'Website tests'); git('config', 'user.email', 'tests@example.invalid');
  const commit = async (message, files) => {
    for (const [name, content] of Object.entries(files)) await writeFile(path.join(root, name), content);
    git('add', '.'); git('commit', '-m', message); return git('rev-parse', 'HEAD');
  };
  const initial = await commit('Initial', { '.gitignore': '.local/\n', 'base.txt': 'base\n', 'edited.txt': 'base\n' });
  const squashed = await commit('Feature branch', { 'feature.txt': 'feature\n' });
  git('update-ref', 'refs/remotes/origin/squashed', squashed);
  git('switch', '--detach', initial);
  const conflict = await commit('Conflicting work', { 'edited.txt': 'branch\n' });
  git('update-ref', 'refs/remotes/origin/conflict', conflict);
  git('switch', '--detach', initial);
  const stale = await commit('Unmerged work', { 'topic.txt': 'topic\n' });
  git('update-ref', 'refs/remotes/origin/stale', stale);
  git('switch', 'main');
  git('reset', '--hard', initial);
  const main = await commit('Squashed feature and later main work', { 'feature.txt': 'feature\n', 'edited.txt': 'main\n', 'odd\tname\nfile.txt': 'main\n' });
  git('update-ref', 'refs/remotes/origin/main', main);
  const current = await commit('Current work', { 'current.txt': 'current\n' });
  git('update-ref', 'refs/remotes/origin/current', current);
  git('switch', '--detach', main);
  const unrelated = git('commit-tree', `${initial}^{tree}`, '-m', 'Unrelated history');
  git('update-ref', 'refs/remotes/origin/unrelated', unrelated);
  git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  return { root, git, squashed, main };
}

test('content audit detects squash merges, new work, conflicts and unrelated history without changing refs or files', async t => {
  const { root, git } = await history(t);
  const before = { refs: git('show-ref'), status: git('status', '--porcelain'), index: git('write-tree') };
  const rows = inspectBranches(root, Date.parse('2026-10-30T12:00:00Z'));
  const byName = Object.fromEntries(rows.map(row => [row.name, row]));
  assert.equal(byName.squashed.verdict, 'MERGED');
  assert.equal(byName.current.verdict, 'CURRENT');
  assert.equal(byName.stale.verdict, 'STALE');
  assert.equal(byName.conflict.verdict, 'STALE');
  assert.equal(byName.unrelated.verdict, 'UNRELATED');
  assert.ok(byName.stale.behind > 0);
  assert.ok(byName.stale.untouchedFilesDifferentFromMain > 0);
  assert.ok(byName.stale.mainOnlyLines > 0);
  assert.equal(rows.some(row => ['main', 'HEAD'].includes(row.name)), false);
  assert.deepEqual({ refs: git('show-ref'), status: git('status', '--porcelain'), index: git('write-tree') }, before);
});
test('hygiene keeps protected, open, young, reused and unproven branches', () => {
  const merged = { sha: 'a'.repeat(40), verdict: 'MERGED', ageDays: 10 };
  const names = ['main', 'master', 'production', 'release-1', 'release/1', 'safety/save', 'backup/save', 'open', 'eligible'];
  const rows = names.map(name => ({ ...merged, name }));
  rows.push({ ...merged, name: 'young', ageDays: 1 }, { ...merged, name: 'future', ageDays: 0 },
    { ...merged, name: 'reused', verdict: 'CURRENT' }, { ...merged, name: 'unknown', verdict: 'UNRELATED' });
  const pulls = [{ state: 'open', head: { ref: 'open' } },
    { state: 'closed', merged_at: '2026-01-02', head: { ref: 'eligible', sha: merged.sha, repo: { full_name: repository } } }];
  const report = createBranchReport(rows, pulls);
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.candidates.map(row => row.name), ['eligible']);
  assert.match(report.candidates[0].reason, /Merged PR head/);
  assert.throws(() => createBranchReport(rows, [{ state: 'open', head: null }]));
  assert.throws(() => createBranchReport(rows, pulls, -1));
});
test('content-equivalent candidates do not require a merge commit or a same-named fork PR', () => {
  const branch = { name: 'squashed', sha: 'a'.repeat(40), verdict: 'MERGED', ageDays: 2 };
  const fork = { state: 'closed', merged_at: '2026-01-02', head: { ref: branch.name, sha: branch.sha, repo: { full_name: 'example/fork' } } };
  const report = createBranchReport([branch], [fork]);
  assert.equal(report.candidates[0].reason, 'Content already in main');
});
test('GitHub reads paginate using GET only and fail closed on errors or malformed results', async () => {
  const calls = [];
  const page = Array.from({ length: 100 }, () => ({ state: 'closed' }));
  const pulls = await readPullRequests('synthetic-token', async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => calls.length === 1 ? page : [{ state: 'open', head: { ref: 'keep' } }] };
  });
  assert.equal(pulls.length, 101);
  assert.equal(calls.length, 2);
  for (const call of calls) { assert.equal(call.options.method, 'GET'); assert.equal(call.options.redirect, 'error'); assert.ok(call.url.startsWith(`https://api.github.com/repos/${repository}/pulls?`)); }
  await assert.rejects(readPullRequests('', () => assert.fail('No request without a token')));
  await assert.rejects(readPullRequests('synthetic-token', async () => ({ ok: false, status: 403 })), /HTTP 403/);
  await assert.rejects(readPullRequests('synthetic-token', async () => ({ ok: true, json: async () => ({}) })), /Invalid/);
});
test('audit CLI refuses non-scheduled, off-main and other-repository contexts before network access', async () => {
  const env = { GITHUB_EVENT_NAME: 'schedule', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main' };
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/topic' }, { GITHUB_REPOSITORY: 'example/other' }]) {
    await assert.rejects(run('audit', { ...env, ...patch }), /only runs/);
  }
});

test('scheduled audit writes the complete read-only report without changing branches or the working tree', async t => {
  const { root, git } = await history(t);
  const before = { refs: git('show-ref'), status: git('status', '--porcelain'), index: git('write-tree') };
  const summary = path.join(root, '.local', 'baseline-summary.md');
  const calls = [];
  await run('audit', { GITHUB_EVENT_NAME: 'schedule', GITHUB_REPOSITORY: repository, GITHUB_REF: 'refs/heads/main',
    GH_TOKEN: 'synthetic-token', GITHUB_STEP_SUMMARY: summary }, root, {
    now: Date.parse('2026-10-30T12:00:00Z'),
    fetcher: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => [] }; },
  });
  const report = JSON.parse(await readFile(path.join(root, '.local/baseline/branches.json'), 'utf8'));
  assert.equal(report.readOnly, true);
  assert.deepEqual(report.candidates.map(branch => branch.name), ['squashed']);
  assert.match(await readFile(path.join(root, '.local/baseline/candidates.tsv'), 'utf8'), /^branch\tsha\treason\nsquashed\t/);
  assert.match(await readFile(summary, 'utf8'), /No branches were deleted/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'GET');
  assert.deepEqual({ refs: git('show-ref'), status: git('status', '--porcelain'), index: git('write-tree') }, before);
});

test('baseline workflow keeps read-only credentials, pinned actions and excluded report output', async () => {
  const workflow = await readFile(new URL('../.github/workflows/saasy-baseline.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^permissions:\n  contents: read\n  pull-requests: read$/m);
  assert.doesNotMatch(workflow, /write-all|(?:contents|pull-requests|actions|id-token): write|secrets\.|pull_request_target/);
  const uses = [...workflow.matchAll(/^\s*(?:-\s*)?uses:\s*(\S+)/gm)].map(match => match[1]);
  assert.ok(uses.length > 0);
  for (const action of uses) assert.match(action, /^actions\/(checkout|setup-node|upload-artifact)@[a-f0-9]{40}$/);
  assert.match(workflow, /types: \[opened, reopened, synchronize, edited\]/);
  assert.match(workflow, /cron: '31 3 \* \* 0'/);
  const ignored = await readFile(new URL('../.assetsignore', import.meta.url), 'utf8');
  assert.ok(ignored.split('\n').includes('.local/**'));
  assert.ok(ignored.split('\n').includes('tools/**'));
});

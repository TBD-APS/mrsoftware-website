import { spawnSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repository = 'TBD-APS/mrsoftware-website';
const base = 'refs/remotes/origin/main';
const remote = 'refs/remotes/origin/';
const day = 86_400_000;

export function checkPullRequest({ title, body = '' }) {
  if (typeof title !== 'string' || /[\r\n]/.test(title)) throw Error('Use a single-line PR title.');
  const typed = /^\[(Bug|Fix|Feature|Improvement|Docs|Refactor|Infra|Security|Release|Hotfix|Chore|Test)\] (.*\S.*)$/.test(title);
  const stack = title.match(/^\[([a-z][a-z0-9]*(?:-[a-z0-9]+)*) ([1-9]\d*)\/([1-9]\d*)\] ([A-Z].*\S|[A-Z])$/);
  const validStack = stack && Number.isSafeInteger(Number(stack[2])) && Number.isSafeInteger(Number(stack[3]))
    && Number(stack[2]) <= Number(stack[3]) && !title.endsWith('.');
  if (!typed && !validStack) throw Error('Use [Type] Subject or [feature n/total] Subject with a valid stack position.');
  const warnings = [];
  if (title.length < 20) warnings.push('Use a more descriptive PR title.');
  if (typeof body !== 'string' || !body.trim()) warnings.push('Explain the change and its validation in the PR body.');
  return warnings;
}

function git(root, args, allowed = [0]) {
  const result = spawnSync('git', ['--no-pager', '-C', root, ...args], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.error || !allowed.includes(result.status)) throw Error(`Git audit failed at ${args[0]}.`);
  return { status: result.status, text: result.stdout.trimEnd() };
}

function differences(root, from, to) {
  const output = git(root, ['diff', '--no-ext-diff', '--no-textconv', '--no-renames', '--numstat', '-z', from, to, '--']).text;
  return output.split('\0').filter(Boolean).map(entry => {
    const fields = entry.match(/^(\d+|-)\t(\d+|-)\t([\s\S]+)$/);
    if (!fields) throw Error('Cannot parse the Git content audit.');
    return { path: fields[3], added: Number(fields[1]) || 0, removed: Number(fields[2]) || 0 };
  });
}

export function inspectBranches(root, now = Date.now()) {
  if (!Number.isFinite(now)) throw Error('Invalid audit time.');
  const mainTree = git(root, ['rev-parse', '--verify', `${base}^{tree}`]).text;
  const refs = git(root, ['for-each-ref', '--format=%(refname)%00%(symref)%00%(objectname)%00%(committerdate:unix)', remote]).text;
  return refs.split('\n').filter(Boolean).flatMap(line => {
    const [ref, symbolic, sha, timestamp] = line.split('\0');
    if (ref === base || symbolic) return [];
    if (!ref.startsWith(remote) || !/^[a-f0-9]{40,64}$/.test(sha) || !/^\d+$/.test(timestamp)) throw Error('Invalid remote branch metadata.');
    const branch = { name: ref.slice(remote.length), sha, ageDays: Math.max(0, Math.floor((now - Number(timestamp) * 1000) / day)) };
    const common = git(root, ['merge-base', base, ref], [0, 1]);
    if (common.status === 1) return [{ ...branch, verdict: 'UNRELATED' }];
    const changed = differences(root, common.text, ref);
    const delta = differences(root, base, ref);
    const merge = git(root, ['merge-tree', '--write-tree', base, ref], [0, 1]);
    const alreadyPresent = changed.length === 0 || (merge.status === 0 && merge.text.split('\n')[0] === mainTree);
    const containsMain = git(root, ['merge-base', '--is-ancestor', base, ref], [0, 1]).status === 0;
    const [behind, ahead] = git(root, ['rev-list', '--left-right', '--count', `${base}...${ref}`]).text.split(/\s+/).map(Number);
    const touched = new Set(changed.map(file => file.path));
    const untouched = delta.filter(file => !touched.has(file.path));
    return [{ ...branch, verdict: alreadyPresent ? 'MERGED' : containsMain ? 'CURRENT' : 'STALE', ahead, behind,
      introducedFiles: changed.length, addedLines: changed.reduce((n, file) => n + file.added, 0),
      removedLines: changed.reduce((n, file) => n + file.removed, 0), filesDifferentFromMain: delta.length,
      untouchedFilesDifferentFromMain: untouched.length, mainOnlyLines: untouched.reduce((n, file) => n + file.removed, 0) }];
  });
}

export function createBranchReport(branches, pulls, minAgeDays = 2) {
  if (!Number.isSafeInteger(minAgeDays) || minAgeDays < 0) throw Error('The minimum age must be a non-negative whole number.');
  const open = new Set(pulls.filter(pr => pr.state === 'open').map(pr => {
    if (typeof pr.head?.ref !== 'string') throw Error('Cannot identify every open PR branch.');
    return pr.head.ref;
  }));
  const merged = new Set(pulls.filter(pr => pr.merged_at && pr.head?.repo?.full_name === repository)
    .map(pr => `${pr.head.ref}:${pr.head.sha}`));
  const protectedName = name => /^(main|master|production)$|^(release-|release\/|safety\/|backup\/)/.test(name);
  const rows = branches.map(branch => {
    const preserve = protectedName(branch.name) ? 'Protected branch' : open.has(branch.name) ? 'Open pull request'
      : branch.ageDays < minAgeDays ? 'Recently updated' : branch.verdict !== 'MERGED' ? 'Unmerged or unproven content' : null;
    return { ...branch, candidate: preserve === null, reason: preserve
      ?? (merged.has(`${branch.name}:${branch.sha}`) ? 'Merged PR head; content already in main' : 'Content already in main') };
  });
  return { readOnly: true, base: 'origin/main', minAgeDays, branches: rows, candidates: rows.filter(branch => branch.candidate) };
}

export async function readPullRequests(token, fetcher = fetch) {
  if (!token) throw Error('A read-only GitHub token is required for the audit.');
  const pulls = [];
  for (let page = 1; page <= 1000; page += 1) {
    const response = await fetcher(`https://api.github.com/repos/${repository}/pulls?state=all&per_page=100&page=${page}`, {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28' },
    });
    if (!response.ok) throw Error(`Cannot read all pull requests (HTTP ${response.status}).`);
    const items = await response.json();
    if (!Array.isArray(items) || items.some(pr => !pr || !['open', 'closed'].includes(pr.state))) throw Error('Invalid pull request response.');
    pulls.push(...items);
    if (items.length < 100) return pulls;
  }
  throw Error('Pull request pagination exceeded the audit limit.');
}

export async function run(command, env = process.env, root = process.cwd(), { fetcher = fetch, now = Date.now() } = {}) {
  if (command === 'title') {
    if (env.GITHUB_EVENT_NAME !== 'pull_request' || !env.GITHUB_EVENT_PATH) throw Error('A pull request event is required.');
    const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, 'utf8'));
    const warnings = checkPullRequest(event.pull_request ?? {});
    for (const warning of warnings) process.stderr.write(`Warning: ${warning}\n`);
    return;
  }
  if (command !== 'audit' || env.GITHUB_EVENT_NAME !== 'schedule' || env.GITHUB_REPOSITORY !== repository
    || env.GITHUB_REF !== 'refs/heads/main') throw Error('The branch audit only runs for this repository on the main schedule.');
  const pulls = await readPullRequests(env.GH_TOKEN, fetcher);
  const report = { generatedAt: new Date(now).toISOString(), ...createBranchReport(inspectBranches(root, now), pulls) };
  const output = path.join(root, '.local', 'baseline');
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'branches.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(path.join(output, 'candidates.tsv'), 'branch\tsha\treason\n' + report.candidates.map(branch => `${branch.name}\t${branch.sha}\t${branch.reason}\n`).join(''));
  if (env.GITHUB_STEP_SUMMARY) await appendFile(env.GITHUB_STEP_SUMMARY,
    `## Branch hygiene\n\n${report.branches.length} branches audited; ${report.candidates.length} cleanup candidates.\n\n` +
    'Read-only snapshot. Protected, open, recent and unproven branches are preserved. No branches were deleted. Recheck head SHAs before any cleanup.\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  run(process.argv[2]).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}

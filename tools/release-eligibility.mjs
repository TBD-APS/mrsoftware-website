import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'TBD-APS/mrsoftware.dk';
const MERGER_ID = 31623093;
const SHA = /^[a-f0-9]{40}$/;
const positiveInteger = value => Number.isSafeInteger(value) && value > 0;

function ownerMerged(pr) {
  return pr?.merged === true && !!pr.merged_at && SHA.test(pr.merge_commit_sha ?? '')
    && pr.base?.repo?.full_name === REPOSITORY && pr.merged_by?.id === MERGER_ID;
}

async function ownerMergedStack(pr, base, request) {
  const membership = pr.stack;
  if (!membership || membership.base?.ref !== 'main' || !positiveInteger(membership.id)
    || !positiveInteger(membership.number) || !positiveInteger(membership.size)
    || membership.size < 2 || membership.size > 100 || membership.position !== membership.size) return false;
  const stack = await request(`${base}/stacks/${membership.number}`);
  if (stack?.id !== membership.id || stack.number !== membership.number || stack.base?.ref !== 'main'
    || stack.open !== false || !Array.isArray(stack.pull_requests)
    || stack.pull_requests.length !== membership.size) return false;
  const numbers = stack.pull_requests.map(member => member?.number);
  if (numbers.some(number => !positiveInteger(number)) || new Set(numbers).size !== numbers.length
    || numbers.at(-1) !== pr.number) return false;
  let previous;
  for (const [index, number] of numbers.entries()) {
    const member = number === pr.number ? pr : await request(`${base}/pulls/${number}`);
    const entry = member?.stack;
    if (member?.number !== number || !ownerMerged(member) || member.head?.repo?.full_name !== REPOSITORY
      || typeof member.head?.ref !== 'string' || !member.head.ref || member.base.ref !== (previous?.head.ref ?? 'main')
      || entry?.id !== membership.id || entry.number !== membership.number || entry.base?.ref !== 'main'
      || entry.size !== membership.size || entry.position !== index + 1) return false;
    if (previous && previous.merge_commit_sha !== member.merge_commit_sha) {
      const comparison = await request(`${base}/compare/${previous.merge_commit_sha}...${member.merge_commit_sha}`);
      if (comparison?.status !== 'ahead' || comparison.base_commit?.sha !== previous.merge_commit_sha
        || comparison.merge_base_commit?.sha !== previous.merge_commit_sha) return false;
    }
    previous = member;
  }
  return true;
}

async function github(path) {
  if (!process.env.GH_TOKEN) throw Error('A read-only GitHub token is required to verify the release');
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
    redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`GitHub evidence request failed (HTTP ${response.status})`);
  return response.json();
}

export async function verifyRelease(context = {
  repository: process.env.GITHUB_REPOSITORY, ref: process.env.GITHUB_REF,
  sha: process.env.GITHUB_SHA, event: process.env.GITHUB_EVENT_NAME,
}, request = github) {
  const { repository, ref, sha, event } = context;
  if (repository !== REPOSITORY || ref !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(sha ?? '') || !['push', 'workflow_dispatch'].includes(event)) {
    throw Error('Production requires a main push or manual main run in this repository');
  }
  const base = `/repos/${REPOSITORY}`;
  const requireCurrentMain = async () => {
    const main = await request(`${base}/git/ref/heads/main`);
    if (main?.object?.sha !== sha) throw Error('The release SHA is not current main');
  };
  await requireCurrentMain();
  const associated = await request(`${base}/commits/${sha}/pulls?per_page=100`);
  if (!Array.isArray(associated) || !associated.length || associated.length >= 100) throw Error('Complete merged PR evidence is required');
  const candidates = [];
  for (const number of new Set(associated.map(p => p.number))) {
    if (!Number.isSafeInteger(number) || number < 1) throw Error('Invalid PR association evidence');
    const pr = await request(`${base}/pulls/${number}`);
    if (pr?.number === number && ownerMerged(pr) && pr.merge_commit_sha === sha) candidates.push(pr);
  }
  // Native stack merges keep the upper PR's intermediate base branch. Corroborate
  // GitHub's main-targeting stack, every owner merge and its commit ancestry.
  const matches = candidates.filter(pr => pr.base.ref === 'main').map(pr => pr.number);
  if (!matches.length) for (const pr of candidates) {
    if (await ownerMergedStack(pr, base, request)) matches.push(pr.number);
  }
  if (matches.length !== 1) throw Error('The exact release commit must come from one PR merged by Rasmus');
  await requireCurrentMain();
  return { repository: REPOSITORY, sha, pullRequest: matches[0], mergerId: MERGER_ID };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRelease().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

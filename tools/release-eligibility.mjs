import { pathToFileURL } from 'node:url';

export const REPOSITORY = 'TBD-APS/mrsoftware-website';
const MERGER_ID = 31623093;

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
  const matches = [];
  for (const number of new Set(associated.map(p => p.number))) {
    if (!Number.isSafeInteger(number) || number < 1) throw Error('Invalid PR association evidence');
    const pr = await request(`${base}/pulls/${number}`);
    if (pr?.number === number && pr.merged === true && pr.merged_at && pr.merge_commit_sha === sha && pr.base?.ref === 'main' && pr.base?.repo?.full_name === REPOSITORY && pr.merged_by?.id === MERGER_ID) {
      matches.push(pr.number);
    }
  }
  if (matches.length !== 1) throw Error('The exact release commit must come from one PR merged by Rasmus');
  await requireCurrentMain();
  return { repository: REPOSITORY, sha, pullRequest: matches[0], mergerId: MERGER_ID };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  verifyRelease().then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error.message); process.exitCode = 1; });
}

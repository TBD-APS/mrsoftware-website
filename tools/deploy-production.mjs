import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { verifyRelease } from './release-eligibility.mjs';

const WORKER = 'mrsoftware';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;

async function deployments(env) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${WORKER}/deployments`, {
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` }, redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw Error(`Cloudflare deployment read failed (HTTP ${response.status})`);
  const body = await response.json();
  if (!body.success || !Array.isArray(body.result?.deployments)) throw Error('Cloudflare deployment evidence is incomplete');
  return body.result.deployments;
}

async function wrangler(args) {
  const directory = await mkdtemp(join(process.env.RUNNER_TEMP || tmpdir(), 'wrangler-receipt-'));
  const output = join(directory, 'output.jsonl');
  try {
    const child = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
      env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_SEND_METRICS: 'false' }, stdio: 'inherit',
    });
    if (child.error || child.status !== 0) throw Error('Wrangler did not confirm completion; inspect the provider before retrying');
    return (await readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function productionSmoke(request = fetch) {
  const results = [];
  for (const [url, statuses] of [
    ['https://mrsoftware.dk/', [200]],
    ['https://www.mrsoftware.dk/', [301, 302, 307, 308]],
    ['https://mrsoftware.dk/_development/data.js', [404]],
    ['https://dashboard.mrsoftware.dk/_development/data.js', [302, 303, 401, 403]],
  ]) {
    const response = await request(url, { redirect: 'manual', signal: AbortSignal.timeout(15000), headers: { 'Cache-Control': 'no-cache' } });
    if (!statuses.includes(response.status)) throw Error(`Production smoke failed for ${url} (HTTP ${response.status})`);
    if (url === 'https://mrsoftware.dk/' && !(await response.text()).includes('MR Software')) throw Error('Company homepage content check failed');
    if (url === 'https://www.mrsoftware.dk/' && new URL(response.headers.get('location'), url).origin !== 'https://mrsoftware.dk') throw Error('The www redirect must retain the company origin');
    results.push({ url, status: response.status });
  }
  return results;
}

export async function deployProduction(env = process.env, {
  authorize = verifyRelease, readDeployments = () => deployments(env), run = wrangler,
  smoke = productionSmoke, receiptPath = '.local/release-receipt.json',
} = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.CLOUDFLARE_API_TOKEN?.trim() || !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.DASHBOARD_SNAPSHOT_DIR) {
    throw Error('Production requires the release Action, environment credentials and an approved private snapshot');
  }
  const eligibility = await authorize();
  const previous = (await readDeployments())[0];
  if (!previous?.id || !previous.versions?.length || !previous.versions.every(v => UUID.test(v.version_id) && Number.isFinite(v.percentage))) throw Error('A concrete rollback version is required before upload');
  const receipt = { repository: 'TBD-APS/mrsoftware-website', sha: env.GITHUB_SHA, pullRequest: eligibility.pullRequest,
    runUrl: `https://github.com/TBD-APS/mrsoftware-website/actions/runs/${env.GITHUB_RUN_ID}`, attempt: env.GITHUB_RUN_ATTEMPT,
    previousDeploymentId: previous.id, previousVersions: previous.versions, state: 'prepared' };
  await mkdir(dirname(receiptPath), { recursive: true });
  const save = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await save();
  try {
    receipt.state = 'uploading'; await save();
    const uploaded = await run(['versions', 'upload', '--keep-vars', '--tag', env.GITHUB_SHA, '--message', `GitHub main ${env.GITHUB_SHA}`]);
    const uploads = uploaded.filter(x => x.type === 'version-upload' && x.worker_name === WORKER && UUID.test(x.version_id));
    if (uploads.length !== 1) throw Error('Wrangler did not identify one uploaded mrsoftware version');
    receipt.versionId = uploads[0].version_id; receipt.state = 'uploaded'; await save();
    await authorize();
    receipt.state = 'deploying'; await save();
    const deployed = await run(['versions', 'deploy', `${receipt.versionId}@100%`, '--yes', '--message', `GitHub main ${env.GITHUB_SHA}`]);
    const confirmation = deployed.filter(x => x.type === 'version-deploy' && x.worker_name === WORKER && x.deployment_id);
    if (confirmation.length !== 1) throw Error('Wrangler did not confirm the deployment');
    receipt.deploymentId = confirmation[0].deployment_id; await save();
    const current = (await readDeployments())[0];
    if (current?.id !== receipt.deploymentId || current.versions?.length !== 1 || current.versions[0].version_id !== receipt.versionId || current.versions[0].percentage !== 100) throw Error('The provider did not confirm 100% traffic on the exact uploaded version');
    receipt.smoke = await smoke(); receipt.state = 'verified'; await save();
    return receipt;
  } catch (error) {
    receipt.state = 'uncertain'; await save();
    throw Error(`${error.message}. No automatic retry or rollback was performed; inspect the receipt and provider state first`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployProduction().then(r => console.log(`Verified release ${r.sha}, version ${r.versionId}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

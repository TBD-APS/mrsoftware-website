import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { verifyRelease } from './release-eligibility.mjs';
import { commercialReadiness } from './commercial-readiness.mjs';
import { waitForWorkerVersion, confirmWorkerDeployment } from './cloudflare-visibility.mjs';

const WORKER = 'mrsoftware';
const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const VERSION_NOT_VISIBLE = /100146|could not be found/i;
export const DEPLOY_VISIBILITY_ATTEMPTS = 5;
export const DEPLOY_VISIBILITY_WAIT_MS = 2000;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
      encoding: 'utf8', env: { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_SEND_METRICS: 'false' }, stdio: ['inherit', 'pipe', 'pipe'],
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error || child.status !== 0) {
      const error = Error('Wrangler did not confirm completion; inspect the provider before retrying');
      error.detail = `${child.stdout ?? ''}\n${child.stderr ?? ''}`;
      throw error;
    }
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

function versionNotVisible(error) {
  return VERSION_NOT_VISIBLE.test(`${error?.detail ?? ''}\n${error?.message ?? ''}`);
}

export async function deployProduction(env = process.env, {
  authorize = verifyRelease, readDeployments = () => deployments(env), run = wrangler,
  waitForVersion = versionId => waitForWorkerVersion(env, WORKER, versionId),
  smoke = productionSmoke, readiness = commercialReadiness, sleep = delay, receiptPath = '.local/release-receipt.json',
} = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.CLOUDFLARE_API_TOKEN?.trim() || !/^[a-f0-9]{32}$/.test(env.CLOUDFLARE_ACCOUNT_ID ?? '') || !env.DASHBOARD_SNAPSHOT_DIR) {
    throw Error('Production requires the release Action, environment credentials and an approved private snapshot');
  }
  const eligibility = await authorize();
  await readiness();
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
    await waitForVersion(receipt.versionId);
    await authorize();
    receipt.state = 'deploying'; await save();
    const deployArgs = ['versions', 'deploy', `${receipt.versionId}@100%`, '--yes', '--message', `GitHub main ${env.GITHUB_SHA}`];
    let deployed;
    for (let attempt = 1; attempt <= DEPLOY_VISIBILITY_ATTEMPTS; attempt++) {
      receipt.deployAttempts = attempt; await save();
      try {
        deployed = await run(deployArgs);
        break;
      } catch (error) {
        if (attempt === DEPLOY_VISIBILITY_ATTEMPTS || !versionNotVisible(error)) throw error;
        await sleep(DEPLOY_VISIBILITY_WAIT_MS);
      }
    }
    const confirmation = deployed.filter(x => x.type === 'version-deploy' && x.worker_name === WORKER && x.deployment_id);
    if (confirmation.length !== 1) throw Error('Wrangler did not confirm the deployment');
    receipt.deploymentId = confirmation[0].deployment_id; await save();
    await confirmWorkerDeployment({ read: readDeployments, previousId: previous.id, deploymentId: receipt.deploymentId, versionId: receipt.versionId, pause: sleep });
    receipt.smoke = await smoke(); receipt.state = 'verified'; await save();
    return receipt;
  } catch (error) {
    receipt.state = 'uncertain'; await save();
    const waited = (receipt.deployAttempts ?? 0) > 1;
    const note = waited
      ? `${error.message}. Stopped after ${receipt.deployAttempts} attempts on the same uploaded version. No rollback was performed; inspect the receipt and provider state first`
      : `${error.message}. No automatic retry or rollback was performed; inspect the receipt and provider state first`;
    throw Error(note);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployProduction().then(r => console.log(`Verified release ${r.sha}, version ${r.versionId}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

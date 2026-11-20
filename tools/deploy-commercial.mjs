import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { verifyRelease } from './release-eligibility.mjs';
import { commercialPreflight, commercialWorker, readCommercialDeployments, UUID } from './commercial-release-config.mjs';
import { commercialReadiness } from './commercial-readiness.mjs';
import { waitForWorkerVersion, confirmWorkerDeployment, visibilityPause } from './cloudflare-visibility.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
async function wrangler(args) {
  const directory = await mkdtemp(path.join(process.env.RUNNER_TEMP || tmpdir(), 'commercial-wrangler-'));
  const output = path.join(directory, 'output.jsonl');
  try {
    const env = { ...process.env, WRANGLER_OUTPUT_FILE_PATH: output, WRANGLER_SEND_METRICS: 'false' };
    delete env.NO_COLOR; delete env.FORCE_COLOR;
    const child = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], { env, stdio: 'inherit' });
    if (child.error || child.status !== 0) throw Error('Wrangler did not confirm completion');
    return (await readFile(output, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function deployCommercial(env = process.env, {
  authorize = verifyRelease, preflight = commercialPreflight, readDeployments = () => readCommercialDeployments(env), run = wrangler,
  waitForVersion = versionId => waitForWorkerVersion(env, commercialWorker, versionId), sleep = visibilityPause,
  smoke = () => commercialReadiness(fetch, { assetPropagation: true }), receiptPath = '.local/commercial-release-receipt.json', configPath = '.local/wrangler-commercial-release.json',
} = {}) {
  if (env.GITHUB_ACTIONS !== 'true' || !env.CLOUDFLARE_API_TOKEN?.trim() || !/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '')) throw Error('Commercial production requires the approved release Action and credentials');
  const eligibility = await authorize();
  const prepared = await preflight(env);
  const config = structuredClone(prepared.config);
  config.main = path.resolve(root, config.main);
  config.assets.directory = path.resolve(root, config.assets.directory);
  for (const database of config.d1_databases) database.migrations_dir = path.resolve(root, database.migrations_dir);
  delete config.$schema;
  const receipt = { worker: commercialWorker, repository: 'TBD-APS/mrsoftware-website', sha: env.GITHUB_SHA, pullRequest: eligibility.pullRequest,
    runUrl: `https://github.com/TBD-APS/mrsoftware-website/actions/runs/${env.GITHUB_RUN_ID}`, attempt: env.GITHUB_RUN_ATTEMPT,
    rollback: prepared.initial ? 'unavailable-initial-release' : 'previous-commercial-version', previousDeploymentId: prepared.previous?.id ?? null,
    previousVersions: prepared.previous?.versions ?? null, state: 'prepared' };
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await mkdir(path.dirname(configPath), { recursive: true });
  const save = () => writeFile(receiptPath, JSON.stringify(receipt, null, 2), { mode: 0o600 });
  await save();
  try {
    await writeFile(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
    const common = ['--config', configPath, '--experimental-provision=false'];
    if (prepared.initial) {
      await authorize();
      receipt.state = 'deploying'; await save();
      const output = await run(['deploy', ...common, '--tag', env.GITHUB_SHA, '--message', `GitHub main ${env.GITHUB_SHA}`]);
      const releases = output.filter(item => item.type === 'deploy' && item.worker_name === commercialWorker && UUID.test(item.version_id));
      if (releases.length !== 1) throw Error('Wrangler did not confirm one initial commercial version');
      receipt.versionId = releases[0].version_id;
    } else {
      receipt.state = 'uploading'; await save();
      const output = await run(['versions', 'upload', ...common, '--tag', env.GITHUB_SHA, '--message', `GitHub main ${env.GITHUB_SHA}`]);
      const versions = output.filter(item => item.type === 'version-upload' && item.worker_name === commercialWorker && UUID.test(item.version_id));
      if (versions.length !== 1) throw Error('Wrangler did not identify one uploaded commercial version');
      receipt.versionId = versions[0].version_id; receipt.state = 'uploaded'; await save();
      await waitForVersion(receipt.versionId);
      await authorize();
      receipt.state = 'deploying'; await save();
      const deployment = await run(['versions', 'deploy', `${receipt.versionId}@100%`, ...common, '--yes', '--message', `GitHub main ${env.GITHUB_SHA}`]);
      const confirmation = deployment.filter(item => item.type === 'version-deploy' && item.worker_name === commercialWorker && item.deployment_id);
      if (confirmation.length !== 1) throw Error('Wrangler did not confirm the commercial deployment');
      receipt.deploymentId = confirmation[0].deployment_id;
    }
    await save();
    const current = await confirmWorkerDeployment({ read: readDeployments, previousId: prepared.previous?.id ?? null, deploymentId: receipt.deploymentId, versionId: receipt.versionId, pause: sleep });
    receipt.deploymentId = current.id;
    receipt.smoke = await smoke(); receipt.state = 'verified'; await save();
    return receipt;
  } catch (error) {
    receipt.state = 'uncertain'; await save();
    throw Error(`${error.message}. No automatic retry or rollback was performed; inspect the commercial receipt and provider before any further action`);
  } finally { await rm(configPath, { force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  deployCommercial().then(receipt => console.log(`Verified commercial release ${receipt.sha}, version ${receipt.versionId}`)).catch(error => { console.error(error.message); process.exitCode = 1; });
}

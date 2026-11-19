import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deployProduction } from '../tools/deploy-production.mjs';

const databaseId = '33333333-3333-4333-8333-333333333333';
const applicationId = '44444444-4444-4444-8444-444444444444';
const next = '22222222-2222-4222-8222-222222222222';
const previous = '11111111-1111-4111-8111-111111111111';
const releaseEnv = { GITHUB_ACTIONS: 'true', GITHUB_SHA: 'b'.repeat(40), CLOUDFLARE_ACCOUNT_ID: '9dd0c66615faab3122f01b14ebe3bbdd', CLOUDFLARE_API_TOKEN: 'synthetic-token', COMMERCIAL_D1_DATABASE_ID: databaseId, COMMERCIAL_ACCESS_APP_ID: applicationId, COMMERCIAL_ACCESS_ISSUER: 'https://release-fixture.cloudflareaccess.com', COMMERCIAL_ACCESS_AUDIENCE: 'a'.repeat(64), COMMERCIAL_ALLOWED_EMAILS: 'owner@synthetic-company.dk', COMMERCIAL_RELEASE_MODE: 'initial' };
const tables = ['sales_catalog', 'sales_customers', 'sales_events', 'sales_enquiries', 'sales_enquiry_limits', 'sales_opportunities', 'sales_quotes'];
async function implementation(name, file = 'deploy-commercial.mjs') {
  const module = await import('../tools/' + file).catch(() => ({}));
  assert.equal(typeof module[name], 'function', `${name} must guard the commercial release`);
  return module[name];
}

function cloudflareRead(env, patch = {}) {
  return async (url, options) => {
    const endpoint = new URL(url).pathname;
    let result;
    if (endpoint.endsWith(`/d1/database/${databaseId}`)) result = { uuid: databaseId, name: 'mrsoftware-sales' };
    else if (endpoint.endsWith('/query')) {
      assert.equal(options.method, 'POST');
      assert.match(JSON.parse(options.body).sql, /^SELECT /);
      result = [{ success: true, results: tables.map(name => ({ name })) }];
    } else if (endpoint.endsWith(`/access/apps/${applicationId}`)) result = { id: applicationId, type: 'self_hosted', domain: 'backoffice.mrsoftware.dk', aud: env.COMMERCIAL_ACCESS_AUDIENCE };
    else if (endpoint.endsWith('/policies')) result = [{ decision: 'allow', include: [{ email: { email: env.COMMERCIAL_ALLOWED_EMAILS } }], exclude: [], require: [] }];
    else if (endpoint.endsWith('/settings')) return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
    else assert.fail(`Unexpected preflight endpoint ${endpoint}`);
    return Response.json({ success: true, result: patch[endpoint.split('/').at(-1)] ?? result });
  };
}

test('commercial preflight requires deployment-owned real settings and verified dedicated D1/Access resources', async () => {
  const preflight = await implementation('commercialPreflight', 'commercial-release-config.mjs');
  for (const key of ['CLOUDFLARE_ACCOUNT_ID', 'COMMERCIAL_D1_DATABASE_ID', 'COMMERCIAL_ACCESS_APP_ID', 'COMMERCIAL_ACCESS_ISSUER', 'COMMERCIAL_ACCESS_AUDIENCE', 'COMMERCIAL_ALLOWED_EMAILS']) {
    let requests = 0;
    await assert.rejects(preflight({ ...releaseEnv, [key]: '' }, { request: async () => { requests++; assert.fail('No provider request with missing settings'); } }));
    assert.equal(requests, 0);
  }
  const prepared = await preflight(releaseEnv, { request: cloudflareRead(releaseEnv) });
  assert.equal(prepared.config.name, 'mrsoftware-commercial');
  assert.equal(prepared.config.d1_databases[0].database_id, databaseId);
  assert.equal(prepared.config.vars.ACCESS_AUDIENCE, 'a'.repeat(64));
  assert.equal(prepared.initial, true);
  assert.equal(prepared.previous, null);
  for (const patch of [
    { [applicationId]: { id: applicationId, type: 'self_hosted', domain: 'dashboard.mrsoftware.dk', aud: releaseEnv.COMMERCIAL_ACCESS_AUDIENCE } },
    { policies: [{ decision: 'bypass', include: [{ everyone: {} }] }] },
    { policies: [{ decision: 'allow', include: [{ email: { email: 'unknown@example.test' } }] }] },
    { query: [{ success: true, results: [] }] },
    { [databaseId]: { uuid: databaseId, name: 'another-product' } },
  ]) await assert.rejects(preflight(releaseEnv, { request: cloudflareRead(releaseEnv, patch) }));
  await assert.rejects(preflight(releaseEnv, { request: async (url, options) => url.endsWith('/settings') ? Response.json({ success: true, result: { bindings: [] } }) : cloudflareRead(releaseEnv)(url, options) }), /already exists/);
});

async function commercialFixture(t, changes = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'commercial-release-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const writes = []; let deployments = 0;
  const deps = {
    authorize: async () => ({ pullRequest: 12, sha: releaseEnv.GITHUB_SHA }),
    preflight: async () => ({ config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [{ migrations_dir: 'commercial/migrations' }] }, initial: true, previous: null }),
    run: async args => {
      writes.push(args);
      if (args[0] === 'deploy') return [{ type: 'deploy', worker_name: 'mrsoftware-commercial', version_id: next }];
      if (args[1] === 'upload') return [{ type: 'version-upload', worker_name: 'mrsoftware-commercial', version_id: next }];
      return [{ type: 'version-deploy', worker_name: 'mrsoftware-commercial', deployment_id: 'new' }];
    },
    readDeployments: async () => { deployments++; return [{ id: 'new', versions: [{ version_id: next, percentage: 100 }] }]; },
    smoke: async () => [{ url: 'https://demos.mrsoftware.dk/api/catalog', status: 200 }],
    receiptPath: join(dir, 'receipt.json'), configPath: join(dir, 'config.json'), ...changes,
  };
  return { writes, deps, deploymentReads: () => deployments };
}

test('initial commercial release is explicit and never borrows the company rollback version', async t => {
  const deploy = await implementation('deployCommercial');
  const f = await commercialFixture(t);
  const receipt = await deploy(releaseEnv, f.deps);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][0], 'deploy');
  assert.equal(receipt.rollback, 'unavailable-initial-release');
  assert.equal(receipt.previousVersions, null);
  assert.equal(receipt.versionId, next);
  assert.equal(receipt.state, 'verified');
  assert.doesNotMatch(await readFile(f.deps.receiptPath, 'utf8'), /synthetic-token|owner@/);
  await assert.rejects(readFile(f.deps.configPath), /ENOENT/);
});

test('an update deploys only the exact uploaded commercial version after a second owner/main check', async t => {
  const deploy = await implementation('deployCommercial');
  const calls = [];
  const f = await commercialFixture(t, {
    authorize: async () => { calls.push('authorize'); return { pullRequest: 12 }; },
    preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
  });
  const receipt = await deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps);
  assert.equal(receipt.previousVersions[0].version_id, previous);
  assert.equal(f.writes[0][1], 'upload');
  assert.equal(f.writes[1][1], 'deploy');
  assert.ok(f.writes[1].includes(next + '@100%'));
  assert.equal(calls.length, 2);
});

test('commercial release refuses failed eligibility/preflight and never retries an uncertain write', async t => {
  const deploy = await implementation('deployCommercial');
  for (const failing of ['authorize', 'preflight', 'run']) {
    const f = await commercialFixture(t);
    let attempts = 0;
    f.deps[failing] = async () => { attempts++; throw Error('Synthetic failure'); };
    await assert.rejects(deploy(releaseEnv, f.deps));
    assert.equal(attempts, 1);
    assert.equal(f.writes.length, 0);
    if (failing === 'run') assert.equal(JSON.parse(await readFile(f.deps.receiptPath, 'utf8')).state, 'uncertain');
  }
});

test('website release checks commercial readiness before any website upload', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'website-readiness-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let writes = 0;
  const env = { GITHUB_ACTIONS: 'true', CLOUDFLARE_API_TOKEN: 'synthetic-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), DASHBOARD_SNAPSHOT_DIR: '/synthetic/private', GITHUB_SHA: 'b'.repeat(40) };
  await assert.rejects(deployProduction(env, {
    authorize: async () => ({ pullRequest: 12 }),
    readiness: async () => { throw Error('Commercial app is not ready'); },
    readDeployments: async () => [{ id: 'old', versions: [{ version_id: '11111111-1111-4111-8111-111111111111', percentage: 100 }] }],
    run: async () => { writes++; throw Error('An upload must not be attempted'); },
    receiptPath: join(dir, 'receipt.json'),
  }), /Commercial app is not ready/);
  assert.equal(writes, 0);
});

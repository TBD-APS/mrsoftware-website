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
    else if (endpoint.endsWith('/policies')) result = [{ decision: 'allow', include: env.COMMERCIAL_ALLOWED_EMAILS.split(',').map(email => ({ email: { email: email.trim().toLowerCase() } })), exclude: [], require: [] }];
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

test('commercial preflight releases every confirmed sales user and accepts policy order differences', async () => {
  const preflight = await implementation('commercialPreflight', 'commercial-release-config.mjs');
  const env = { ...releaseEnv, COMMERCIAL_ALLOWED_EMAILS: ' Owner@Synthetic-Company.dk, SALES@synthetic-company.dk ' };
  const policies = [{ decision: 'allow', include: [{ email: { email: 'sales@synthetic-company.dk' } }, { email: { email: 'owner@synthetic-company.dk' } }], exclude: [], require: [] }];
  const prepared = await preflight(env, { request: cloudflareRead(env, { policies }) });
  assert.equal(prepared.config.vars.ALLOWED_EMAILS, 'owner@synthetic-company.dk,sales@synthetic-company.dk');
});

test('duplicate Access selectors cannot hide a missing confirmed sales user', async () => {
  const preflight = await implementation('commercialPreflight', 'commercial-release-config.mjs');
  const env = { ...releaseEnv, COMMERCIAL_ALLOWED_EMAILS: 'owner@synthetic-company.dk,sales@synthetic-company.dk' };
  for (const duplicate of ['owner@synthetic-company.dk', 'OWNER@synthetic-company.dk']) {
    const policies = [{ decision: 'allow', include: [{ email: { email: 'owner@synthetic-company.dk' } }, { email: { email: duplicate } }], exclude: [], require: [] }];
    await assert.rejects(preflight(env, { request: cloudflareRead(env, { policies }) }), /exactly the confirmed sales logins/);
  }
});

test('multi-user release refuses incomplete, broader and malformed Access policies', async () => {
  const preflight = await implementation('commercialPreflight', 'commercial-release-config.mjs');
  const env = { ...releaseEnv, COMMERCIAL_ALLOWED_EMAILS: 'owner@synthetic-company.dk,sales@synthetic-company.dk' };
  const owner = { email: { email: 'owner@synthetic-company.dk' } }, sales = { email: { email: 'sales@synthetic-company.dk' } };
  for (const change of [
    { include: [owner] },
    { include: [owner, sales, { email: { email: 'unknown@synthetic-company.dk' } }] },
    { include: [owner, { email_domain: { domain: 'synthetic-company.dk' } }] },
    { include: [owner, { everyone: {} }] },
    { include: [owner, { email: { email: 'sales@synthetic-company.dk', extra: true } }] },
    { include: [owner, null] },
    { exclude: {} },
    { require: [{ everyone: {} }] },
  ]) {
    const policies = [{ decision: 'allow', include: [owner, sales], exclude: [], require: [], ...change }];
    await assert.rejects(preflight(env, { request: cloudflareRead(env, { policies }) }));
  }
});

test('release user configuration rejects duplicate, empty, oversized and synthetic login lists before provider reads', async () => {
  const preflight = await implementation('commercialPreflight', 'commercial-release-config.mjs');
  for (const emails of [
    'owner@synthetic-company.dk,OWNER@synthetic-company.dk',
    'owner@synthetic-company.dk,',
    ',owner@synthetic-company.dk',
    'owner@synthetic-company.dk,,sales@synthetic-company.dk',
    'owner@synthetic-company.dk,invalid',
    'owner@synthetic-company.dk,unknown@example.test',
    'x'.repeat(245) + '@synthetic-company.dk',
    Array.from({ length: 51 }, (_, index) => `user${index}@synthetic-company.dk`).join(','),
  ]) {
    let reads = 0;
    await assert.rejects(preflight({ ...releaseEnv, COMMERCIAL_ALLOWED_EMAILS: emails }, { request: async () => { reads++; throw Error('No provider request with invalid users'); } }));
    assert.equal(reads, 0);
  }
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
    deployVersion: async id => { writes.push(['api-deploy', id]); return { id: 'new' }; },
    readDeployments: async () => { deployments++; return [{ id: 'new', versions: [{ version_id: next, percentage: 100 }] }]; },
    waitForVersion: async () => {},
    sleep: async () => {},
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
  assert.deepEqual(f.writes[1], ['api-deploy', next]);
  assert.equal(calls.length, 2);
});

test('commercial release waits for its uploaded version before rechecking main and moving traffic once', async t => {
  const deploy = await implementation('deployCommercial');
  const order = [];
  const f = await commercialFixture(t, {
    authorize: async () => { order.push('authorize'); return { pullRequest: 12 }; },
    waitForVersion: async id => { assert.equal(id, next); order.push('visible'); },
    preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
  });
  const run = f.deps.run;
  f.deps.run = async args => { order.push(args[1]); return run(args); };
  const promote = f.deps.deployVersion;
  f.deps.deployVersion = async id => { order.push('deploy'); return promote(id); };
  await deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps);
  assert.deepEqual(order, ['authorize', 'upload', 'visible', 'authorize', 'deploy']);
});

test('commercial release rechecks stale provider reads without repeating an upload or deployment', async t => {
  const deploy = await implementation('deployCommercial');
  let reads = 0;
  const f = await commercialFixture(t, {
    preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
    readDeployments: async () => [{ id: ++reads < 3 ? 'old' : 'new', versions: [{ version_id: reads < 3 ? previous : next, percentage: 100 }] }],
  });
  const receipt = await deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps);
  assert.equal(receipt.state, 'verified');
  assert.equal(reads, 3);
  assert.equal(f.writes.length, 2);
});

test('a deployment acknowledgement cannot verify wrong, split or unrelated provider traffic', async t => {
  const deploy = await implementation('deployCommercial');
  for (const current of [
    { id: 'new', versions: [{ version_id: previous, percentage: 100 }] },
    { id: 'new', versions: [{ version_id: next, percentage: 50 }, { version_id: previous, percentage: 50 }] },
    { id: 'other', versions: [{ version_id: next, percentage: 100 }] },
  ]) {
    const f = await commercialFixture(t, {
      preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
      readDeployments: async () => [current],
    });
    await assert.rejects(deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps), /unexpected deployment or traffic split/);
    assert.equal(f.writes.length, 2);
    const receipt = JSON.parse(await readFile(f.deps.receiptPath, 'utf8'));
    assert.equal(receipt.state, 'uncertain');
    assert.equal(receipt.deploymentId, 'new');
    assert.equal(receipt.versionId, next);
  }
});

test('an ambiguous commercial API promotion leaves rollback evidence and never retries traffic or uploads', async t => {
  const deploy = await implementation('deployCommercial');
  let promotions = 0;
  const f = await commercialFixture(t, {
    preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
    deployVersion: async id => { assert.equal(id, next); promotions++; throw Error('Synthetic response lost'); },
  });
  await assert.rejects(deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps), /No automatic retry or rollback/);
  assert.equal(promotions, 1);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1], 'upload');
  const receipt = JSON.parse(await readFile(f.deps.receiptPath, 'utf8'));
  assert.equal(receipt.state, 'uncertain');
  assert.equal(receipt.versionId, next);
  assert.equal(receipt.previousVersions[0].version_id, previous);
  assert.equal(receipt.deploymentId, undefined);
});

test('main moving while the uploaded version becomes visible prevents the commercial deployment POST', async t => {
  const deploy = await implementation('deployCommercial');
  let authorizations = 0, promotions = 0, visible = false;
  const f = await commercialFixture(t, {
    authorize: async () => { if (++authorizations === 2) { assert.equal(visible, true); throw Error('Main moved'); } return { pullRequest: 12 }; },
    preflight: async () => ({ initial: false, previous: { id: 'old', versions: [{ version_id: previous, percentage: 100 }] }, config: { name: 'mrsoftware-commercial', main: 'commercial/worker.mjs', assets: { directory: '.commercial-dist' }, d1_databases: [] } }),
    waitForVersion: async () => { visible = true; },
    deployVersion: async () => { promotions++; throw Error('No traffic change after main moves'); },
  });
  await assert.rejects(deploy({ ...releaseEnv, COMMERCIAL_RELEASE_MODE: 'update' }, f.deps), /Main moved/);
  assert.equal(promotions, 0);
  assert.equal(f.writes.length, 1);
  assert.equal(JSON.parse(await readFile(f.deps.receiptPath, 'utf8')).versionId, next);
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

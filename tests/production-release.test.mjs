import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deployProduction, productionSmoke } from '../tools/deploy-production.mjs';

const previous = '11111111-1111-4111-8111-111111111111';
const next = '22222222-2222-4222-8222-222222222222';
const env = { GITHUB_ACTIONS: 'true', CLOUDFLARE_API_TOKEN: 'synthetic-token', CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), DASHBOARD_SNAPSHOT_DIR: '/synthetic/private', GITHUB_SHA: 'b'.repeat(40), GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1' };

async function fixture(change = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'release-test-'));
  const calls = []; let deployed = false;
  const deps = {
    authorize: async () => { calls.push('authorize'); return { pullRequest: 12, sha: env.GITHUB_SHA }; },
    readDeployments: async () => [{ id: deployed ? 'new-deployment' : 'deployment', versions: [{ version_id: deployed ? next : previous, percentage: 100 }] }],
    run: async args => {
      calls.push(args[1]);
      if (args[1] === 'upload') return [{ type: 'version-upload', worker_name: 'mrsoftware', version_id: next }];
      deployed = true;
      return [{ type: 'version-deploy', worker_name: 'mrsoftware', deployment_id: 'new-deployment' }];
    },
    smoke: async () => [{ url: 'https://mrsoftware.dk/', status: 200 }],
    receiptPath: join(dir, 'receipt.json'), ...change,
  };
  return { deps, calls, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

test('records rollback evidence before deploying only the uploaded immutable version', async () => {
  const f = await fixture();
  try {
    const receipt = await deployProduction(env, f.deps);
    assert.equal(receipt.versionId, next);
    assert.equal(receipt.previousVersions[0].version_id, previous);
    assert.equal(receipt.state, 'verified');
    assert.deepEqual(f.calls, ['authorize', 'upload', 'authorize', 'deploy']);
    assert.ok(!(await readFile(f.deps.receiptPath, 'utf8')).includes('synthetic-token'));
  } finally { await f.cleanup(); }
});
test('missing credentials or private input prevents any upload', async () => {
  for (const key of ['GITHUB_ACTIONS', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'DASHBOARD_SNAPSHOT_DIR']) {
    const f = await fixture();
    try { await assert.rejects(deployProduction({ ...env, [key]: '' }, f.deps)); assert.deepEqual(f.calls, []); }
    finally { await f.cleanup(); }
  }
});
test('authorization failure prevents any Cloudflare write', async () => {
  const f = await fixture({ authorize: async () => { throw Error('Wrong merger'); } });
  try { await assert.rejects(deployProduction(env, f.deps)); assert.deepEqual(f.calls, []); }
  finally { await f.cleanup(); }
});
test('an uncertain upload is not retried or followed by deploy', async () => {
  let writes = 0;
  const f = await fixture({ run: async () => { writes++; throw Error('Timeout'); } });
  try {
    await assert.rejects(deployProduction(env, f.deps)); assert.equal(writes, 1);
    const r = JSON.parse(await readFile(f.deps.receiptPath, 'utf8'));
    assert.equal(r.state, 'uncertain'); assert.equal(r.previousVersions[0].version_id, previous);
  } finally { await f.cleanup(); }
});
test('wrong-worker upload output and stale authorization after upload cannot deploy', async () => {
  for (const wrongOutput of [true, false]) {
    let authorizations = 0; let writes = 0;
    const f = await fixture({
      authorize: async () => { if (++authorizations === 2) throw Error('Main moved'); return { sha: env.GITHUB_SHA }; },
      run: async () => { writes++; return [{ type: 'version-upload', worker_name: wrongOutput ? 'wrong' : 'mrsoftware', version_id: next }]; },
    });
    try { await assert.rejects(deployProduction(env, f.deps)); assert.equal(writes, 1); }
    finally { await f.cleanup(); }
  }
});
test('a failed live-version check never triggers an automatic rollback', async () => {
  const f = await fixture({ readDeployments: async () => [{ id: 'unchanged', versions: [{ version_id: previous, percentage: 100 }] }] });
  try { await assert.rejects(deployProduction(env, f.deps)); assert.equal(f.calls.filter(x => x === 'deploy').length, 1); }
  finally { await f.cleanup(); }
});

test('smoke rejects exposed private data and an off-origin company redirect', async () => {
  for (const mode of ['private', 'redirect']) {
    await assert.rejects(productionSmoke(async url => {
      if (url === 'https://mrsoftware.dk/') return new Response('MR Software');
      if (url.includes('www.')) return new Response(null, { status: 301, headers: { location: mode === 'redirect' ? 'https://someone.invalid/' : 'https://mrsoftware.dk/' } });
      return new Response(null, { status: mode === 'private' ? 200 : 404 });
    }));
  }
});

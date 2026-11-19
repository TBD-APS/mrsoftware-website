import { execFileSync, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const script = fileURLToPath(new URL('../tools/propose-roadmap.sh', import.meta.url));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

test('proposes only the generated page and can resume after a branch push without creating another branch', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'roadmap-proposal-'));
  try {
    const remote = join(dir, 'remote.git');
    const seed = join(dir, 'seed');
    const bin = join(dir, 'bin');
    const log = join(dir, 'proposed');
    await mkdir(seed);
    await mkdir(bin);
    git(dir, 'init', '--bare', '--initial-branch=main', remote);
    git(seed, 'init', '--initial-branch=main');
    await mkdir(join(seed, 'roadmap'));
    await writeFile(join(seed, 'roadmap/index.html'), 'before\n');
    await writeFile(join(seed, 'app.txt'), 'outside scope\n');
    git(seed, 'add', '.');
    git(seed, '-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-m', 'Main');
    git(seed, 'push', remote, 'main');
    const sha = git(seed, 'rev-parse', 'HEAD');

    await writeFile(join(bin, 'gh'), `#!/bin/sh
case "$1:$2" in
  api:repos/TBD-APS/mrsoftware-website/git/ref/heads/main) echo "$MOCK_MAIN" ;;
  api:--paginate) if [ "${'\$'}{MOCK_OPEN:-}" ]; then echo 123; fi ;;
  pr:list) ;;
  pr:create) cat > "$MOCK_LOG"; exit "${'\$'}{MOCK_CREATE_CODE:-0}" ;;
  *) exit 99 ;;
esac
`, { mode: 0o700 });
    const env = { ...process.env, PATH: `${bin}:${process.env.PATH}`, GH_TOKEN: 'fake', GITHUB_ACTIONS: 'true',
      GITHUB_REPOSITORY: 'TBD-APS/mrsoftware-website', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, MOCK_MAIN: sha, MOCK_LOG: log };
    async function run(name, overrides = {}, extraChange = false) {
      const cwd = join(dir, name);
      git(dir, 'clone', '--quiet', remote, cwd);
      await writeFile(join(cwd, 'roadmap/index.html'), 'after\n');
      if (extraChange) await writeFile(join(cwd, 'app.txt'), 'unauthorized change\n');
      return spawnSync('bash', [script], { cwd, env: { ...env, ...overrides }, encoding: 'utf8' });
    }

    assert.notEqual((await run('unrelated', {}, true)).status, 0);
    assert.notEqual((await run('stale', { MOCK_MAIN: 'moved' })).status, 0);
    assert.equal(git(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads'), 'refs/heads/main');
    assert.notEqual((await run('missing-pr', { MOCK_CREATE_CODE: '1' })).status, 0);
    const branch = git(remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/roadmap-code-sync-*');
    assert.match(branch, /^refs\/heads\/roadmap-code-sync-/);
    const proposal = git(remote, 'rev-parse', branch);
    assert.equal(git(remote, 'diff', '--name-only', sha, proposal), 'roadmap/index.html');
    const recovery = await run('retry-pr');
    assert.equal(recovery.status, 0, recovery.stderr);
    assert.equal(git(remote, 'rev-parse', branch), proposal);
    assert.match(await readFile(log, 'utf8'), /normal website release flow/);
    const pending = await run('pending', { MOCK_OPEN: 'yes' });
    assert.equal(pending.status, 0, pending.stderr);
    assert.match(pending.stdout, /already awaiting review/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

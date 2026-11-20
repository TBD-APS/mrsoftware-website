import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('development server accepts host and port and serves the research page', async () => {
  const child = spawn(process.execPath, ['tools/dev-server.mjs', '--host', '127.0.0.1', '--port', '0'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  let errors = '';
  let timer;
  try {
    child.stdout.on('data', chunk => { output += chunk.toString(); });
    child.stderr.on('data', chunk => { errors += chunk.toString(); });
    const address = await Promise.race([
      new Promise((resolve, reject) => {
        child.stdout.on('data', () => {
          const match = output.match(/http:\/\/localhost:(\d+)\//);
          if (match) resolve(match[0]);
        });
        child.once('exit', code => reject(new Error(`Server exited ${code}: ${errors}`)));
      }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`No ready address: ${output} ${errors}`)), 10_000); }),
    ]);
    const response = await fetch(new URL('research/', address));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Evidence before authority\./);
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
});

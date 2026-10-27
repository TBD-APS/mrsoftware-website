import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

const CHUNK_SIZE = 45000;
const MAX_ARCHIVE = CHUNK_SIZE * 4;
const MAX_JSON = 8 * 1024 * 1024;
const sha256 = value => createHash('sha256').update(value).digest('hex');

export async function unpackSnapshot({ archive, digest, parent = tmpdir() } = {}) {
  let snapshot;
  try {
    if (typeof archive !== 'string' || !archive.length || archive.length > MAX_ARCHIVE || !/^[a-f0-9]{64}$/.test(digest ?? '')) throw Error();
    const bytes = Buffer.from(archive, 'base64');
    if (bytes.toString('base64') !== archive) throw Error();
    const json = gunzipSync(bytes, { maxOutputLength: MAX_JSON });
    if (sha256(json) !== digest) throw Error();
    snapshot = JSON.parse(json);
    if (!snapshot.data?.snapshotAt || !Array.isArray(snapshot.data.projects) || !snapshot.data.projects.length || !Array.isArray(snapshot.graphs?.repositories) || !snapshot.graphs.repositories.length) throw Error();
  } catch { throw Error('Private dashboard snapshot is absent, invalid, oversized or does not match its approved SHA-256'); }
  await mkdir(parent, { recursive: true });
  const directory = await mkdtemp(join(parent, 'mrsoftware-dashboard-'));
  try {
    await writeFile(join(directory, 'data.json'), JSON.stringify(snapshot.data), { mode: 0o600, flag: 'wx' });
    await writeFile(join(directory, 'graphs.json'), JSON.stringify(snapshot.graphs), { mode: 0o600, flag: 'wx' });
    return directory;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

async function main() {
  const [operation, source, output] = process.argv.slice(2);
  if (operation === 'pack' && source && output) {
    const target = relative(resolve(dirname(fileURLToPath(import.meta.url)), '..'), resolve(output));
    if (!target || (!target.startsWith('..' + '/') && !isAbsolute(target))) throw Error('Archive output must be outside the public repository');
    const snapshot = { data: JSON.parse(await readFile(join(source, 'data.json'), 'utf8')), graphs: JSON.parse(await readFile(join(source, 'graphs.json'), 'utf8')) };
    const json = JSON.stringify(snapshot);
    const archive = gzipSync(json).toString('base64');
    const digest = sha256(json);
    const check = await unpackSnapshot({ archive, digest });
    await rm(check, { recursive: true, force: true });
    await mkdir(output, { mode: 0o700 });
    const chunks = Math.ceil(archive.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) await writeFile(join(output, `part-${i + 1}`), archive.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE), { mode: 0o600, flag: 'wx' });
    await writeFile(join(output, 'sha256'), digest, { mode: 0o600, flag: 'wx' });
    console.log(`Private archive written in ${chunks} parts. Approved SHA-256: ${digest}`);
  } else if (operation === 'unpack' && process.env.GITHUB_ENV) {
    const parts = [1, 2, 3, 4].map(n => process.env[`MR_SOFTWARE_DASHBOARD_SNAPSHOT_${n}`] || '');
    if (!parts[0] || parts.some((part, index) => part.length > CHUNK_SIZE || (part && parts.slice(0, index).some(value => !value)))) throw Error('Invalid snapshot parts');
    const directory = await unpackSnapshot({ archive: parts.join(''), digest: process.env.MR_SOFTWARE_DASHBOARD_SHA256, parent: process.env.RUNNER_TEMP });
    await appendFile(process.env.GITHUB_ENV, `DASHBOARD_SNAPSHOT_DIR=${directory}\n`);
    console.log('Prepared the approved private snapshot in runner temporary storage');
  } else { throw Error('Use pack SOURCE_DIRECTORY NEW_ARCHIVE_DIRECTORY, or unpack inside the release Action'); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('Private snapshot preparation failed; no snapshot content was logged'); process.exitCode = 1; });
}

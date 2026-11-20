import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export async function verifyContentModule(root = fileURLToPath(new URL('..', import.meta.url))) {
  const directory = join(root, 'vendor/boney');
  const [manifest, ci, lock, pkg] = await Promise.all([
    readFile(join(directory, 'content-manifest.json'), 'utf8').then(JSON.parse),
    readFile(join(directory, 'content-admission.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'package-lock.json'), 'utf8').then(JSON.parse),
    readFile(join(root, 'package.json'), 'utf8').then(JSON.parse),
  ]);
  const source = manifest.source;
  if (manifest.kind !== 'boney-package-artifacts' || source?.repository !== 'https://github.com/TBD-APS/boney'
    || !/^[a-f0-9]{40}$/.test(source.commit) || !/^[a-f0-9]{64}$/.test(source.treeSha256) || source.dirty !== false || source.releaseEligible !== true) {
    throw Error('Content requires an original clean Boney artifact manifest');
  }
  if (ci.repository !== 'TBD-APS/boney' || ci.branch !== 'main' || ci.event !== 'push' || ci.conclusion !== 'success' || ci.headSha !== source.commit
    || !Number.isSafeInteger(ci.runId) || ci.runId <= 0 || !Number.isSafeInteger(ci.artifactId) || ci.artifactId <= 0
    || ci.url !== `https://github.com/TBD-APS/boney/actions/runs/${ci.runId}`) throw Error('Content admission requires the exact green producer main run');
  const selected = manifest.artifacts?.filter(item => item.id === '@mr-software/content' && item.dependency === false);
  if (selected?.length !== 1 || selected[0].ecosystem !== 'npm' || selected[0].version !== '0.1.0' || selected[0].file !== 'npm/mr-software-content-0.1.0.tgz') throw Error('Expected one original content 0.1.0 archive');
  const artifact = selected[0], name = 'mr-software-content-0.1.0.tgz';
  const bytes = await readFile(join(directory, name));
  const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
  const entry = lock.packages?.['node_modules/@mr-software/content'];
  if (integrity !== artifact.integrity || entry?.integrity !== integrity || entry?.version !== '0.1.0'
    || pkg.devDependencies?.['@mr-software/content'] !== `file:vendor/boney/${name}`) throw Error('Content archive integrity or consumer pin differs');
  return { source, ci, artifact };
}

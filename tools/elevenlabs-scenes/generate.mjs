// Generates the SAS-587 product scenes through the ElevenLabs Image API (POST /v1/flows/image, then poll GET).
// Usage: ELEVENLABS_API_KEY=... node tools/elevenlabs-scenes/generate.mjs <outdir> [name ...]
// The key is read from the environment only. tools/** is excluded from the published site by .assetsignore.
// Writes <name>.png per scene. Failed generations are not charged (ElevenLabs docs).
import { readFile, writeFile } from 'node:fs/promises';

const key = process.env.ELEVENLABS_API_KEY;
if (!key) { console.error('ELEVENLABS_API_KEY is not set.'); process.exit(2); }
const [out = '.', ...only] = process.argv.slice(2);
const scenes = JSON.parse(await readFile(new URL('./scenes.json', import.meta.url), 'utf8'))
  .filter(scene => !only.length || only.includes(scene.name));
const api = 'https://api.elevenlabs.io/v1/flows/image';
const headers = { 'xi-api-key': key, 'Content-Type': 'application/json' };

for (const scene of scenes) {
  const created = await fetch(api, { method: 'POST', headers, body: JSON.stringify(scene.request) });
  const body = await created.json();
  if (!created.ok) { console.error(scene.name, created.status, JSON.stringify(body)); process.exitCode = 1; continue; }
  let result = body;
  for (let tries = 0; result.status === 'pending' || result.status === 'generating'; tries += 1) {
    if (tries > 150) { console.error(scene.name, 'gave up after 5 minutes', result.id); break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
    result = await (await fetch(`${api}/${result.id}`, { headers })).json();
  }
  if (result.status !== 'completed') { console.error(scene.name, JSON.stringify(result)); process.exitCode = 1; continue; }
  const image = await fetch(result.content_url);
  await writeFile(`${out}/${scene.name}.png`, Buffer.from(await image.arrayBuffer()));
  console.log(scene.name, result.id, result.content_mime_type);
}

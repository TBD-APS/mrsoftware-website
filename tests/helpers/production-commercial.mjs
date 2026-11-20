import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { unstable_getMiniflareWorkerOptions } from 'wrangler';
import { generateKeyPair, exportJWK, SignJWT } from 'jose';

const root = path.resolve(new URL('../..', import.meta.url).pathname);
export async function productionCommercial(t, { allowedEmails = 'owner@example.test' } = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), 'commercial-worker-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const configPath = path.join(root, 'wrangler.commercial.jsonc');
  const childEnv = { ...process.env, WRANGLER_SEND_METRICS: 'false' };
  for (const name of ['NO_COLOR', 'FORCE_COLOR', 'CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL']) delete childEnv[name];
  execFileSync(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'deploy', '--dry-run', '--config', configPath, '--outdir', path.join(directory, 'bundle'), '--experimental-provision=false'], { cwd: root, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const script = (await readdir(path.join(directory, 'bundle'))).find(name => name.endsWith('.js'));
  const { workerOptions } = unstable_getMiniflareWorkerOptions(configPath);
  const { privateKey, publicKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), alg: 'RS256', kid: 'production-test' };
  const outboundService = async request => {
    assertOutbound(request.url);
    return Response.json({ keys: [jwk] });
  };
  const settings = { DEMO_HOST: 'demos.mrsoftware.dk', BACKOFFICE_HOST: 'backoffice.mrsoftware.dk', ACCESS_ISSUER: 'https://commercial-test.cloudflareaccess.com', ACCESS_AUDIENCE: 'synthetic-commercial-audience', ALLOWED_EMAILS: allowedEmails };
  const mf = new Miniflare(convertV4MiniflareOptions({ rootPath: path.join(directory, 'bundle'), compatibilityDate: workerOptions.compatibilityDate, assets: workerOptions.assets, scriptPath: path.join(directory, 'bundle', script), modules: true, bindings: settings, outboundService, d1Databases: ['DB'] }));
  t.after(() => mf.dispose());
  const db = await mf.getD1Database('DB');
  const sql = await readFile(path.join(root, 'commercial/migrations/0001_sales.sql'), 'utf8');
  await db.batch(sql.split(';').map(s => s.trim()).filter(Boolean).map(s => db.prepare(s)));
  const token = (claims = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ iss: settings.ACCESS_ISSUER, aud: settings.ACCESS_AUDIENCE, sub: 'synthetic-owner', email: 'owner@example.test', iat: now, exp: now + 3600, ...claims }).setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(privateKey);
  };
  return { mf, db, token, request: (route, { host = settings.DEMO_HOST, jwt, method = 'GET' } = {}) => mf.dispatchFetch(`https://${host}${route}`, { method, redirect: 'manual', headers: jwt ? { 'Cf-Access-Jwt-Assertion': jwt } : {} }) };
}
function assertOutbound(url) {
  if (url !== 'https://commercial-test.cloudflareaccess.com/cdn-cgi/access/certs') throw Error('Unexpected production-test network request');
}

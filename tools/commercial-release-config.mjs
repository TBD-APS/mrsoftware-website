import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { audience as dashboardAudience } from '../dashboard/access.mjs';

export const commercialWorker = 'mrsoftware-commercial';
export const commercialAccount = '9dd0c66615faab3122f01b14ebe3bbdd';
export const UUID = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const root = fileURLToPath(new URL('../', import.meta.url));
// Every table from the approved commercial migrations; a release stops until all exist.
const tables = ['sales_catalog', 'sales_customers', 'sales_events', 'sales_enquiries', 'sales_enquiry_limits', 'sales_opportunities', 'sales_quotes', 'sales_website_checks', 'sales_firecrawl_usage', 'sales_youtube_drafts', 'newsletter_campaigns', 'newsletter_subscribers'];

export function commercialSettings(env) {
  const value = name => (env[name] ?? '').trim();
  const databaseId = value('COMMERCIAL_D1_DATABASE_ID');
  const applicationId = value('COMMERCIAL_ACCESS_APP_ID');
  const audience = value('COMMERCIAL_ACCESS_AUDIENCE');
  const issuer = value('COMMERCIAL_ACCESS_ISSUER');
  const emails = value('COMMERCIAL_ALLOWED_EMAILS').toLowerCase().split(',').map(email => email.trim());
  if (env.CLOUDFLARE_ACCOUNT_ID !== commercialAccount || !env.CLOUDFLARE_API_TOKEN?.trim()) throw Error('The approved Cloudflare account and release credentials are required');
  if (!UUID.test(databaseId) || /^0+-0+-0+-0+-0+$/.test(databaseId) || !UUID.test(applicationId) || /^0+-0+-0+-0+-0+$/.test(applicationId)) throw Error('Approved dedicated D1 and Access application ids are required');
  if (!/^[a-f0-9]{64}$/.test(audience) || audience === dashboardAudience || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) throw Error('A dedicated commercial Access audience and issuer are required');
  if (!emails.length || emails.length > 50 || new Set(emails).size !== emails.length || emails.some(email => email.length > 254 || !/^[^\s@,]+@[^\s@,]+\.[a-z]{2,}$/.test(email) || /\.(?:test|invalid|example)$|@example\.(?:com|net|org)$/.test(email))) throw Error('Configure 1–50 unique confirmed sales logins in deployment settings');
  if (!['initial', 'update'].includes(env.COMMERCIAL_RELEASE_MODE)) throw Error('Choose an explicit initial or update commercial release');
  const mediaBucket = value('COMMERCIAL_YOUTUBE_MEDIA_BUCKET');
  if (mediaBucket && mediaBucket !== 'mrsoftware-youtube-media') throw Error('Use the dedicated private YouTube media bucket');
  return { databaseId, applicationId, audience, issuer, emails, mediaBucket };
}

export async function cloudflareRead(env, endpoint, { request = fetch, query, missingWorker = false } = {}) {
  const response = await request(`https://api.cloudflare.com/client/v4${endpoint}`, {
    method: query ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, ...(query ? { 'Content-Type': 'application/json' } : {}) },
    ...(query ? { body: JSON.stringify({ sql: query }) } : {}),
  });
  const body = await response.json();
  if (missingWorker && response.status === 404 && body.success === false && body.errors?.length === 1 && body.errors[0].code === 10007) return null;
  if (!response.ok || body.success !== true || body.result == null) throw Error(`Commercial provider evidence is unavailable (HTTP ${response.status})`);
  return body.result;
}

export async function readCommercialDeployments(env, request = fetch) {
  const result = await cloudflareRead(env, `/accounts/${commercialAccount}/workers/scripts/${commercialWorker}/deployments`, { request });
  if (!Array.isArray(result.deployments)) throw Error('Commercial deployment evidence is incomplete');
  return result.deployments;
}

export async function commercialPreflight(env = process.env, { request = fetch } = {}) {
  const settings = commercialSettings(env);
  const config = JSON.parse(await readFile(path.join(root, 'wrangler.commercial.jsonc'), 'utf8'));
  if (config.name !== commercialWorker || config.main !== 'commercial/worker.mjs' || config.assets?.directory !== '.commercial-dist' || config.assets.run_worker_first !== true || config.workers_dev !== false || config.preview_urls !== false || config.routes?.length !== 2 || !config.routes.every(route => route.custom_domain === true && ['demos.mrsoftware.dk', 'backoffice.mrsoftware.dk'].includes(route.pattern)) || new Set(config.routes.map(route => route.pattern)).size !== 2 || config.d1_databases?.length !== 1 || config.d1_databases[0].binding !== 'DB') throw Error('Commercial release configuration does not match the isolated application');
  const base = `/accounts/${commercialAccount}`;
  const read = (endpoint, options) => cloudflareRead(env, endpoint, { request, ...options });
  const database = await read(`${base}/d1/database/${settings.databaseId}`);
  if (database.uuid !== settings.databaseId || database.name !== 'mrsoftware-sales') throw Error('The approved dedicated sales database is required');
  const requiredTables = settings.mediaBucket ? [...tables, 'sales_youtube_media'] : tables;
  if (settings.mediaBucket) {
    if (!env.ELEVEN_CREATIVE_API_KEY?.trim()) throw Error('The protected ElevenLabs Image & Video key is required');
    for (const kind of ['image', 'video']) {
      const response = await request(`https://api.elevenlabs.io/v1/flows/${kind}?page_size=1`, {
        method: 'GET', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(10_000),
        headers: { 'xi-api-key': env.ELEVEN_CREATIVE_API_KEY.trim() },
      });
      await response.body?.cancel();
      if (!response.ok) throw Error(`ElevenLabs did not authorize the ${kind} API read (HTTP ${response.status})`);
    }
    const bucket = await read(`${base}/r2/buckets/${settings.mediaBucket}`);
    if (bucket.name !== settings.mediaBucket) throw Error('The dedicated private media bucket is unavailable');
    config.r2_buckets = [{ binding: 'YOUTUBE_MEDIA', bucket_name: settings.mediaBucket }];
  }
  const schema = await read(`${base}/d1/database/${settings.databaseId}/query`, { query: `SELECT name FROM sqlite_schema WHERE type = 'table' AND name IN (${requiredTables.map(name => `'${name}'`).join(', ')})` });
  if (!Array.isArray(schema) || schema.length !== 1 || schema[0].success !== true || !Array.isArray(schema[0].results) || requiredTables.some(name => !schema[0].results.some(row => row.name === name))) throw Error('Apply the approved sales migrations (commercial/migrations) before releasing');
  const application = await read(`${base}/access/apps/${settings.applicationId}`);
  if (application.id !== settings.applicationId || application.type !== 'self_hosted' || application.domain !== 'backoffice.mrsoftware.dk' || application.aud !== settings.audience) throw Error('The dedicated backoffice Access application does not match release settings');
  const policies = await read(`${base}/access/apps/${settings.applicationId}/policies`);
  const policy = Array.isArray(policies) && policies.length === 1 ? policies[0] : null;
  const policyEmails = Array.isArray(policy?.include) ? policy.include.map(rule => {
    if (!rule || Object.keys(rule).length !== 1 || !rule.email || Object.keys(rule.email).length !== 1 || typeof rule.email.email !== 'string') return null;
    return rule.email.email.toLowerCase();
  }) : [];
  if (policy?.decision !== 'allow' || policyEmails.length !== settings.emails.length || new Set(policyEmails).size !== settings.emails.length || policyEmails.some(email => !settings.emails.includes(email)) || [policy?.exclude ?? [], policy?.require ?? []].some(rules => !Array.isArray(rules) || rules.length)) throw Error('Access must allow exactly the confirmed sales logins without bypass policies');
  const existing = await read(`${base}/workers/scripts/${commercialWorker}/settings`, { missingWorker: true });
  const initial = env.COMMERCIAL_RELEASE_MODE === 'initial';
  if (initial && existing) throw Error('The commercial Worker already exists; inspect the collision before changing release mode');
  let previous = null;
  if (!initial) {
    if (!existing || !Array.isArray(existing.bindings) || !existing.bindings.some(binding => binding.name === 'DB' && binding.type === 'd1' && binding.id === settings.databaseId) || !existing.bindings.some(binding => binding.name === 'DEMO_HOST' && binding.text === 'demos.mrsoftware.dk') || !existing.bindings.some(binding => binding.name === 'BACKOFFICE_HOST' && binding.text === 'backoffice.mrsoftware.dk')) throw Error('The existing Worker is not the approved commercial application');
    previous = (await readCommercialDeployments(env, request))[0];
    if (!previous?.id || !previous.versions?.length || !previous.versions.every(v => UUID.test(v.version_id) && Number.isFinite(v.percentage) && v.percentage >= 0 && v.percentage <= 100) || previous.versions.reduce((sum, v) => sum + v.percentage, 0) !== 100) throw Error('A concrete commercial rollback version is required for an update');
  }
  config.account_id = commercialAccount;
  config.d1_databases[0].database_id = settings.databaseId;
  config.vars = { DEMO_HOST: 'demos.mrsoftware.dk', BACKOFFICE_HOST: 'backoffice.mrsoftware.dk', ACCESS_ISSUER: settings.issuer, ACCESS_AUDIENCE: settings.audience, ALLOWED_EMAILS: settings.emails.join(',') };
  return { config, initial, previous };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  commercialPreflight().then(() => console.log('Commercial resource preflight verified; no resources changed')).catch(error => { console.error(error.message); process.exitCode = 1; });
}

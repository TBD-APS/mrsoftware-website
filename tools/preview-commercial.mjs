import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startCommercialSite } from '../tests/helpers/commercial-http.mjs';
import { customerInput, opportunityInput, quoteInput } from '../tests/helpers/commercial.mjs';
import { wrapCommercialApplication } from '../commercial/server/assets.mjs';

// Local executable only: no environment setting can select this identity in the
// production entrypoint. The reused fixture binds exclusively to IPv4 loopback.
export async function startCommercialPreview() {
  const root = fileURLToPath(new URL('../.commercial-dist/', import.meta.url));
  const assetOverrides = new Map();
  for (const file of await readdir(root, { recursive: true })) {
    if (!file.endsWith('.html')) continue;
    const html = await readFile(path.join(root, file), 'utf8');
    const banner = '<p data-local-preview role="note" style="margin:0;padding:8px 16px;font:14px system-ui;border-bottom:1px solid currentColor">Local preview · Synthetic examples · Changes end when this preview stops.</p>';
    const pathname = '/' + file.split(path.sep).join('/').replace(/index\.html$/, '');
    assetOverrides.set(pathname, html.replace(/(<body\b[^>]*>)/i, '$1' + banner));
  }
  const site = await startCommercialSite({ root, assetOverrides, verifyIdentity: async () => ({ sub: 'synthetic-preview-owner', email: 'preview-owner@example.test' }) });
  try {
    site.env.ALLOWED_EMAILS = 'preview-owner@example.test';
    const original = { fetch: site.app.fetch.bind(site.app) };
    site.app.fetch = wrapCommercialApplication(original).fetch;
    const customer = await site.call('POST', '/api/backoffice/customers', { ...customerInput, name: 'Local preview customer', contacts: [{ name: 'Preview contact', email: 'contact@example.test', phone: '+45 12345678' }], notes: 'Synthetic sales note: no real customer.' });
    if (customer.status !== 201) throw Error('Could not seed the local preview customer');
    const opportunity = await site.call('POST', '/api/backoffice/opportunities', opportunityInput(customer.body.item.id, { title: 'Local preview rollout', nextFollowUp: '2020-11-19' }));
    const quote = await site.call('POST', '/api/backoffice/quotes', quoteInput(customer.body.item.id, { opportunityId: opportunity.body.item.id, setupMinor: 125050 }));
    if (opportunity.status !== 201 || quote.status !== 201) throw Error('Could not seed local preview sales');
    return site;
  } catch (error) { await site.close(); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const site = await startCommercialPreview();
  console.log(`Local preview · synthetic examples\nDemos: ${site.base}\nPrices: ${site.base}pricing/\nPrivate Today: ${site.privateBase}\nLoopback only. Ctrl+C stops the preview and discards its sample sales records.`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await site.close(); };
  process.once('SIGINT', close); process.once('SIGTERM', close);
}

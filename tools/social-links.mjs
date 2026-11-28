import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { escapeHtml } from '../js/linking.js';

// Icons from Feather (MIT): 24px grid, 2px stroke, drawn in the link's text colour.
// The label is what screen readers announce; the Danish pages translate it through data/locales.
export const networks = {
  linkedin: {
    name: 'LinkedIn', hosts: ['linkedin.com'],
    icon: '<path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/>',
  },
  youtube: {
    name: 'YouTube', hosts: ['youtube.com'],
    icon: '<path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z"/><polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02"/>',
  },
  facebook: {
    name: 'Facebook', hosts: ['facebook.com'],
    icon: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
  },
  instagram: {
    name: 'Instagram', hosts: ['instagram.com'],
    icon: '<rect x="2" y="2" width="20" height="20" rx="5" ry="5"/><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"/><line x1="17.5" y1="6.5" x2="17.51" y2="6.5"/>',
  },
  github: {
    name: 'GitHub', hosts: ['github.com'],
    icon: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  },
};

export const listLabel = 'MR Software on social media';
export const linkLabel = network => `MR Software on ${networks[network].name} (opens in a new tab)`;

export function checkAccounts(accounts) {
  if (!Array.isArray(accounts)) throw new Error('data/social-links.json needs an "accounts" list.');
  const seen = new Set();
  for (const { network, href } of accounts) {
    if (!Object.hasOwn(networks, network)) throw new Error(`Unknown social network: ${network}. Use one of ${Object.keys(networks).join(', ')}.`);
    if (seen.has(network)) throw new Error(`Add ${networks[network].name} once.`);
    seen.add(network);
    let url;
    try { url = new URL(href); } catch { throw new Error(`Use a full https address for ${networks[network].name}.`); }
    const onNetwork = networks[network].hosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !onNetwork) {
      throw new Error(`Use an https address on ${networks[network].hosts[0]} for ${networks[network].name}.`);
    }
  }
  return accounts;
}

// An empty list renders nothing, so the footer looks as before until a profile is added.
export function renderSocialLinks(accounts) {
  if (!checkAccounts(accounts).length) return '';
  const items = accounts.map(({ network, href }) => `<li><a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(linkLabel(network))}">`
    + `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${networks[network].icon}</svg></a></li>`);
  return `<ul aria-label="${escapeHtml(listLabel)}">${items.join('')}</ul>`;
}

export async function readSocialAccounts(root) {
  const file = resolve(root instanceof URL ? fileURLToPath(root) : root, 'data/social-links.json');
  try { return checkAccounts(JSON.parse(await readFile(file, 'utf8')).accounts); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}

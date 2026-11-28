import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { graph } from '../js/site-links.js';
import { renderLinkSlots } from '../tools/prerender-links.mjs';
import { checkAccounts, linkLabel, listLabel, networks, readSocialAccounts, renderSocialLinks } from '../tools/social-links.mjs';
import { loadDanish } from '../tools/build-locales.mjs';

// Placeholder profile used only to exercise the renderer; it is not a company account.
const fixture = [{ network: 'linkedin', href: 'https://www.linkedin.com/company/example-fixture/?a=1&b=2' }];

test('the checked-in social profile list is valid and already in the footer before scripts run', async () => {
  const accounts = await readSocialAccounts(new URL('..', import.meta.url));
  if (!accounts.length) assert.equal(renderSocialLinks(accounts), '', 'An empty list shows nothing');
  // Danish pages are generated from these by npm run check:locales.
  for (const file of ['../index.html', '../contact/index.html']) {
    const html = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.ok(html.includes(`<div class="footer-social" data-social-links>${renderSocialLinks(accounts)}</div></div>`), `${file}: run npm run build:links`);
  }
});

test('a social profile renders as an accessible icon link that opens in a new tab', () => {
  const html = renderSocialLinks(fixture);
  assert.match(html, /^<ul aria-label="MR Software on social media"><li><a /);
  assert.match(html, /href="https:\/\/www\.linkedin\.com\/company\/example-fixture\/\?a=1&amp;b=2"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer" aria-label="MR Software on LinkedIn \(opens in a new tab\)"/);
  assert.match(html, /<svg [^>]*aria-hidden="true" focusable="false">/);
  const source = '<footer><div class="footer-social" data-social-links><p>Old</p></div><p>Keep this</p></footer>';
  const result = renderLinkSlots(source, graph, fixture);
  assert.ok(result.includes(`data-social-links>${html}</div><p>Keep this</p>`));
  assert.equal(renderLinkSlots(result, graph, fixture), result);
  assert.equal(renderLinkSlots(result, graph, []), '<footer><div class="footer-social" data-social-links></div><p>Keep this</p></footer>');
});

test('social profiles must be https addresses on their own network, once each', () => {
  assert.throws(() => checkAccounts({}), /needs an "accounts" list/);
  assert.throws(() => checkAccounts([{ network: 'myspace', href: 'https://myspace.com/x' }]), /Unknown social network/);
  for (const href of ['http://www.linkedin.com/company/x', 'https://linkedin.com.example/x', 'https://evil.example/linkedin.com', 'https://user@linkedin.com/x', 'linkedin.com/company/x']) {
    assert.throws(() => checkAccounts([{ network: 'linkedin', href }]), /address/, href);
  }
  assert.throws(() => checkAccounts([...fixture, ...fixture]), /Add LinkedIn once/);
});

test('every social label already has a Danish translation', async () => {
  const { dictionary } = await loadDanish(new URL('..', import.meta.url).pathname);
  for (const text of [listLabel, ...Object.keys(networks).map(linkLabel)]) assert.ok(dictionary[text], `Missing Danish translation: ${text}`);
});

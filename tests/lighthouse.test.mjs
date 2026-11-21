import assert from 'node:assert/strict';
import test from 'node:test';
import { budgets, summarize, violations } from '../tools/lighthouse.mjs';

const result = () => ({ categories: Object.fromEntries(Object.keys(budgets).map(key => [key, { score: 1 }])), audits: {} });

test('missing categories and runtime failures cannot produce a passing Lighthouse gate', () => {
  assert.throws(() => summarize({ ...result(), runtimeError: { code: 'NO_FCP' } }), /did not complete/);
  for (const score of [undefined, null, NaN, -1, 1.1]) {
    const input = result(); input.categories.seo.score = score;
    assert.throws(() => summarize(input), /invalid Lighthouse category: seo/);
  }
  assert.ok(violations({ scores: {} }).length > 0);
});

test('a completed audit enforces each category budget and keeps useful failure identifiers', () => {
  const input = result();
  input.categories.performance.score = 0.89;
  input.audits['color-contrast'] = { score: 0, title: 'Text has insufficient contrast', details: { items: [{ snippet: 'page content' }] } };
  const report = summarize(input);
  assert.deepEqual(violations(report), ['performance: 0.89; minimum 0.9']);
  assert.deepEqual(report.failedAudits, [{ id: 'color-contrast', title: 'Text has insufficient contrast', score: 0 }]);
  assert.deepEqual(violations(summarize(result())), []);
});

test('stored summaries exclude request headers, cookies, source snippets, full URLs and raw traces', () => {
  const input = { ...result(), requestedUrl: 'https://example.invalid/private-query', networkRequests: [{ headers: { example: 'do-not-copy' } }], trace: { marker: 'do-not-copy' } };
  input.audits.example = { score: 0, title: 'A failed audit', details: { items: [{ snippet: 'do-not-copy' }] } };
  const output = JSON.stringify(summarize(input));
  assert.doesNotMatch(output, /do-not-copy|example\.invalid|headers|snippet|trace/);
});

test('failures retain selectors and query-free source identity for diagnosis', () => {
  const input = result();
  input.audits.example = { score: 0, title: 'Example failure', details: { items: [
    { node: { type: 'node', selector: '.hero .lead', snippet: 'do-not-copy' } },
    { sourceLocation: { type: 'source-location', url: 'https://static.example.test/script.js?example=do-not-copy', line: 7 } },
    { sourceLocation: { type: 'source-location', url: 'https://example.test/cdn-cgi/challenge-platform/do-not-copy/main.js?example=do-not-copy', line: 0 } },
  ] } };
  const report = summarize(input);
  assert.deepEqual(report.failedAudits[0].nodes, ['.hero .lead']);
  assert.deepEqual(report.failedAudits[0].sources, [{ host: 'static.example.test', file: 'script.js', line: 7 },
    { host: 'example.test', file: 'main.js', line: 0, component: 'cloudflare-challenge' }]);
  assert.doesNotMatch(JSON.stringify(report), /do-not-copy|https:|snippet/);
});

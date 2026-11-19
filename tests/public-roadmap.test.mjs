import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fetchIssueStates, renderRoadmap, syncRoadmap } from '../tools/sync-public-roadmap.mjs';

const template = '<main>\n    <!-- public-features:start -->\n    <!-- public-features:end -->\n</main>\n';
const entry = (id, number) => ({
  id, source: { issue: `SAS-${number}` }, title: `Public ${id}`, summary: 'Customer-facing summary',
});
const pack = (id, name, features) => ({ id, name, features });
const state = (type, other = {}) => ({ archivedAt: null, state: { type }, ...other });

test('moves a newly completed feature within its package and updates both counts', () => {
  const feature = entry('container-tracking', 1);
  const registry = [pack('shippy', 'Shippy', [feature])];
  const issues = new Map([[feature.source.issue, state('started')]]);
  const before = renderRoadmap(template, registry, issues);
  assert.match(before, /0 developed · 1 in the pipeline/);
  assert.match(before, /id="package-shippy"[\s\S]*id="container-tracking"[\s\S]*In development/);
  issues.set(feature.source.issue, state('completed'));
  const after = renderRoadmap(before, registry, issues);
  assert.match(after, /1 developed · 0 in the pipeline/);
  assert.match(after, /id="package-shippy"[\s\S]*id="container-tracking"[\s\S]*>Developed</);
  assert.equal(after.match(/id="container-tracking"/g)?.length, 1);
  assert.equal(renderRoadmap(after, registry, issues), after);
});

test('shows repository features alongside tracked work without exposing source paths', () => {
  const crm = { ...entry('company-directory', 1), source: { path: 'docs/crm.md', stage: 'developed' } };
  const planned = { ...entry('machine-start', 2), source: { path: 'docs/machine.md', stage: 'planned' } };
  const tracking = entry('container-tracking', 3);
  const registry = [pack('boney', 'Boney', [planned, crm]), pack('shippy', 'Shippy', [tracking])];
  const output = renderRoadmap(template, registry, new Map([[tracking.source.issue, state('started')]]));
  assert.match(output, /href="#package-boney"[\s\S]*1 developed · 1 in the pipeline/);
  assert.match(output, /href="#package-shippy"[\s\S]*0 developed · 1 in the pipeline/);
  assert.match(output, /id="package-boney"[\s\S]*id="company-directory"[\s\S]*id="machine-start"[\s\S]*id="package-shippy"[\s\S]*id="container-tracking"/);
  assert.doesNotMatch(output, /docs\/|SAS-/);
});

test('lists active work before planned work, escapes public text and publishes no private Linear fields', () => {
  const planned = entry('planned', 1);
  const started = { ...entry('underway', 2), title: '<b>Terminal & journeys</b>', summary: 'A truck’s visit with "gate-in".' };
  const canceled = entry('canceled', 3);
  const archived = entry('archived', 4);
  const duplicate = entry('duplicate', 5);
  const triage = entry('triage', 6);
  const features = [planned, started, canceled, archived, duplicate, triage];
  const issues = new Map([
    [planned.source.issue, state('backlog')],
    [started.source.issue, state('started', { description: 'internal-status-note', title: 'private-title' })],
    [canceled.source.issue, state('canceled')],
    [archived.source.issue, state('completed', { archivedAt: '2026-11-19T00:00:00Z' })],
    [duplicate.source.issue, state('duplicate')],
    [triage.source.issue, state('triage')],
  ]);
  const output = renderRoadmap(template, [pack('shippy', 'Shippy', features)], issues);
  assert.match(output, /&lt;b&gt;Terminal &amp; journeys&lt;\/b&gt;/);
  assert.match(output, /In development[\s\S]*id="planned"[\s\S]*Planned/);
  assert.doesNotMatch(output, /SAS-|internal-status-note|private-title|id="(?:canceled|archived|duplicate|triage)"|<b>/);
});

test('requests only the identifiers and state fields from Linear, using GraphQL variables', async () => {
  const ids = ['SAS-12', 'SAS-36'];
  const result = await fetchIssueStates(ids, 'test-key', async (url, options) => {
    assert.equal(url, 'https://api.linear.app/graphql');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'test-key');
    assert.equal(options.redirect, 'error');
    const { variables, query } = JSON.parse(options.body);
    assert.deepEqual(variables, { key0: ids[0], key1: ids[1] });
    assert.match(query, /item0: issue\(id: \$key0\) \{ identifier archivedAt state \{ type \} \}/);
    assert.doesNotMatch(query, /title|description|SAS-12/);
    return Response.json({ data: {
      item0: { identifier: ids[0], ...state('completed') },
      item1: { identifier: ids[1], ...state('unstarted') },
    } });
  });
  assert.equal(result.get(ids[1]).state.type, 'unstarted');
});

test('rejects partial reads and unavailable issues', async () => {
  for (const reply of [
    { data: { item0: { identifier: 'SAS-1' } }, errors: [{ message: 'private error' }] },
    { data: { item0: null } },
    { data: { item0: { identifier: 'SAS-2' } } },
  ]) {
    await assert.rejects(fetchIssueStates(['SAS-1'], 'test-key', async () => Response.json(reply)), error => {
      assert.doesNotMatch(error.message, /private error|test-key/);
      return true;
    });
  }
  await assert.rejects(fetchIssueStates(['SAS-1'], undefined), /LINEAR_ROADMAP_TOKEN/);
});

test('fails without overwriting the last public snapshot when a state cannot be mapped', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'public-roadmap-test-'));
  try {
    const registryPath = join(dir, 'features.json');
    const roadmapPath = join(dir, 'roadmap.html');
    const feature = entry('terminal-visits', 1);
    await writeFile(registryPath, JSON.stringify([pack('roady', 'Roady', [feature])]));
    await writeFile(roadmapPath, template);
    await assert.rejects(syncRoadmap({
      registryPath, roadmapPath, loadIssues: async () => new Map([[feature.source.issue, state('unknown')]]),
    }), /unsupported Linear state/);
    assert.equal(await readFile(roadmapPath, 'utf8'), template);
    const ready = { registryPath, roadmapPath, loadIssues: async ids => {
      assert.deepEqual(ids, [feature.source.issue]);
      return new Map([[feature.source.issue, state('completed')]]);
    } };
    assert.equal(await syncRoadmap(ready), true);
    assert.equal(await syncRoadmap(ready), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('refuses duplicate feature anchors and ambiguous output regions', () => {
  const one = entry('terminal-visits', 1);
  assert.throws(() => renderRoadmap(template, [pack('roady', 'Roady', [one, entry(one.id, 2)])], new Map()), /distinct URL ID/);
  assert.throws(() => renderRoadmap(template, [pack('roady', 'Roady', [{ ...one, privateNote: 'not public' }])], new Map()), /public feature/);
  assert.throws(() => renderRoadmap(template.repeat(2), [], new Map()), /one public feature region/);
});

test('keeps all eight approved packages in the public inventory', async () => {
  const inventory = JSON.parse(await readFile(new URL('../tools/public-features.json', import.meta.url), 'utf8'));
  const packages = new Set(inventory.map(item => item.id));
  for (const id of ['authy', 'boney', 'greeny', 'mr-saassy', 'roady', 'shippy', 'tradey', 'zavn']) {
    assert.ok(packages.has(id), `Missing package ${id}`);
  }
  for (const id of ['workslip', 'mrsoftware-website', 'donor-trust-network', 'auktionshus-watch']) {
    assert.ok(!packages.has(id), `Excluded package ${id}`);
  }
  assert.ok(inventory.every(item => item.features.length > 0));
});

import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fetchIssueStates, renderRoadmap, syncRoadmap } from '../tools/sync-public-roadmap.mjs';

const template = '<main>\n    <!-- public-features:start -->\n    <!-- public-features:end -->\n</main>\n';
const entry = (id, number) => ({
  id, issue: `SAS-${number}`, product: 'Shippy', title: `Public ${id}`, summary: 'Customer-facing summary',
});
const state = (type, other = {}) => ({ archivedAt: null, state: { type }, ...other });

test('moves a newly completed feature out of the pipeline and keeps its shared address', () => {
  const feature = entry('container-tracking', 1);
  const registry = [feature];
  const issues = new Map([[feature.issue, state('started')]]);
  const before = renderRoadmap(template, registry, issues);
  assert.match(before, /id="in-the-pipeline"[\s\S]*id="container-tracking"[\s\S]*In development/);
  issues.set(feature.issue, state('completed'));
  const after = renderRoadmap(before, registry, issues);
  assert.match(after, /id="developed"[\s\S]*id="container-tracking"[\s\S]*id="in-the-pipeline"/);
  assert.equal(after.match(/id="container-tracking"/g)?.length, 1);
  assert.equal(renderRoadmap(after, registry, issues), after);
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
    [planned.issue, state('backlog')],
    [started.issue, state('started', { description: 'internal-status-note', title: 'private-title' })],
    [canceled.issue, state('canceled')],
    [archived.issue, state('completed', { archivedAt: '2026-11-19T00:00:00Z' })],
    [duplicate.issue, state('duplicate')],
    [triage.issue, state('triage')],
  ]);
  const output = renderRoadmap(template, features, issues);
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
    await writeFile(registryPath, JSON.stringify([feature]));
    await writeFile(roadmapPath, template);
    await assert.rejects(syncRoadmap({
      registryPath, roadmapPath, loadIssues: async () => new Map([[feature.issue, state('unknown')]]),
    }), /unsupported Linear state/);
    assert.equal(await readFile(roadmapPath, 'utf8'), template);
    const ready = { registryPath, roadmapPath, loadIssues: async () => new Map([[feature.issue, state('completed')]]) };
    assert.equal(await syncRoadmap(ready), true);
    assert.equal(await syncRoadmap(ready), false);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('refuses duplicate feature anchors and ambiguous output regions', () => {
  const one = entry('terminal-visits', 1);
  assert.throws(() => renderRoadmap(template, [one, entry(one.id, 2)], new Map()), /distinct URL ID/);
  assert.throws(() => renderRoadmap(template, [{ ...one, privateNote: 'not public' }], new Map()), /public feature/);
  assert.throws(() => renderRoadmap(template.repeat(2), [], new Map()), /one public feature region/);
});

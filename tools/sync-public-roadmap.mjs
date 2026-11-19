import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const registry = new URL('public-features.json', import.meta.url);
const roadmap = new URL('../roadmap/index.html', import.meta.url);
const start = '<!-- public-features:start -->';
const end = '<!-- public-features:end -->';
const stateLabels = new Map([
  ['completed', 'Developed'],
  ['started', 'In development'],
  ['unstarted', 'Planned'],
  ['backlog', 'Planned'],
  ['triage', null],
  ['canceled', null],
  ['duplicate', null],
]);
const escape = value => value.replace(/[&<>"']/g, part => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[part]);

function validateFeatures(features) {
  if (!Array.isArray(features)) throw Error('The public feature registry must be an array');
  const ids = new Set();
  const issues = new Set();
  for (const feature of features) {
    if (!feature || Object.keys(feature).length !== 5 || typeof feature.id !== 'string'
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(feature.id)
      || ['developed', 'in-the-pipeline', 'main', 'main-nav'].includes(feature.id) || ids.has(feature.id)
      || typeof feature.issue !== 'string' || !/^[A-Z][A-Z0-9]*-[1-9][0-9]*$/.test(feature.issue) || issues.has(feature.issue)) {
      throw Error('Every public feature needs a distinct URL ID and Linear issue identifier');
    }
    if ([feature.product, feature.title, feature.summary].some(value =>
      typeof value !== 'string' || value === '' || value.trim() !== value || /[\u0000-\u001f\u007f]/u.test(value))) {
      throw Error(`Invalid public copy for ${feature.id}`);
    }
    ids.add(feature.id);
    issues.add(feature.issue);
  }
}

export async function fetchIssueStates(identifiers, token, request = fetch) {
  if (identifiers.length && !token?.trim()) throw Error('Set LINEAR_ROADMAP_TOKEN to an approved Linear read key');
  const result = new Map();
  for (let offset = 0; offset < identifiers.length; offset += 20) {
    const batch = identifiers.slice(offset, offset + 20);
    const variables = Object.fromEntries(batch.map((id, index) => [`key${index}`, id]));
    const declarations = batch.map((_, index) => `$key${index}: String!`).join(', ');
    const fields = batch.map((_, index) => `item${index}: issue(id: $key${index}) { identifier archivedAt state { type } }`).join('\n');
    const response = await request('https://api.linear.app/graphql', {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: `query PublicRoadmap(${declarations}) { ${fields} }`, variables }),
      signal: AbortSignal.timeout(15_000),
      redirect: 'error',
    });
    if (!response.ok) throw Error(`Linear roadmap read failed (HTTP ${response.status})`);
    const { data, errors } = await response.json();
    if (!data || errors?.length) throw Error('Linear did not return a complete roadmap response');
    for (const [index, id] of batch.entries()) {
      const issue = data[`item${index}`];
      if (issue?.identifier !== id) throw Error('A configured roadmap issue could not be verified');
      result.set(id, issue);
    }
  }
  return result;
}

export function renderRoadmap(html, features, issues) {
  validateFeatures(features);
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end);
  if (startAt < 0 || endAt < startAt || html.indexOf(start, startAt + 1) >= 0 || html.indexOf(end, endAt + 1) >= 0) {
    throw Error('Expected one public feature region in the roadmap page');
  }
  const developed = [];
  const inProgress = [];
  const planned = [];
  for (const feature of features) {
    const issue = issues.get(feature.issue);
    if (!issue || !Object.hasOwn(issue, 'archivedAt') || !stateLabels.has(issue.state?.type)) {
      throw Error(`Missing or unsupported Linear state for ${feature.id}`);
    }
    const status = issue.archivedAt ? null : stateLabels.get(issue.state.type);
    if (!status) continue;
    const group = status === 'Developed' ? developed : status === 'In development' ? inProgress : planned;
    const displayState = status === 'Developed' ? '' : `\n          <span class="roadmap-stage">${status}</span>`;
    group.push(`        <li class="roadmap-feature" id="${feature.id}">
          <p class="roadmap-product">${escape(feature.product)}</p>
          <div>
            <h3>${escape(feature.title)}</h3>
            <p>${escape(feature.summary)}</p>
          </div>${displayState}
        </li>`);
  }
  const section = (id, title, items, empty) => `    <section class="roadmap-section" aria-labelledby="${id}">
      <h2 id="${id}">${title}</h2>
${items.length
    ? `      <ul class="roadmap-list">\n${items.join('\n')}\n      </ul>`
    : `      <p>${empty}</p>`}
    </section>`;
  const content = [
    section('developed', 'Developed', developed, 'No completed features are listed yet.'),
    section('in-the-pipeline', 'In the pipeline', [...inProgress, ...planned], 'No upcoming features are listed yet.'),
  ].join('\n\n');
  return html.slice(0, startAt + start.length) + '\n' + content + '\n    ' + html.slice(endAt);
}

export async function syncRoadmap({ loadIssues = fetchIssueStates, token = process.env.LINEAR_ROADMAP_TOKEN,
  registryPath = registry, roadmapPath = roadmap } = {}) {
  const [input, html] = await Promise.all([readFile(registryPath, 'utf8'), readFile(roadmapPath, 'utf8')]);
  const features = JSON.parse(input);
  validateFeatures(features);
  const issues = await loadIssues(features.map(feature => feature.issue), token);
  const next = renderRoadmap(html, features, issues);
  if (next === html) return false;
  await writeFile(roadmapPath, next);
  return true;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  syncRoadmap().then(changed => console.log(changed ? 'Public roadmap updated' : 'Public roadmap already current')).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

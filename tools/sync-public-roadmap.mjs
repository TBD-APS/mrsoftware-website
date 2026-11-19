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

const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const issueId = /^[A-Z][A-Z0-9]*-[1-9][0-9]*$/;
const repositoryPath = /^(?:[A-Za-z0-9_@.-]+\/)*[A-Za-z0-9_@.-]+$/;
const publicText = value => typeof value === 'string' && value.trim() === value
  && value.length > 0 && !/[\u0000-\u001f\u007f]/u.test(value);

function collectIssueIds(packages) {
  if (!Array.isArray(packages)) throw Error('The public package registry must be an array');
  const packageIds = new Set();
  const featureIds = new Set(['main', 'main-nav']);
  const issues = new Set();
  for (const item of packages) {
    if (!item || Object.keys(item).length !== 3 || typeof item.id !== 'string'
      || !slug.test(item.id) || packageIds.has(item.id) || !publicText(item.name) || !Array.isArray(item.features)) {
      throw Error('Every public package needs a distinct ID, name and feature list');
    }
    packageIds.add(item.id);
    featureIds.add(`package-${item.id}`);
  }
  for (const { features } of packages) {
    for (const feature of features) {
      if (!feature || Object.keys(feature).length !== 4 || typeof feature.id !== 'string'
        || !slug.test(feature.id) || featureIds.has(feature.id) || !publicText(feature.title) || !publicText(feature.summary)) {
        throw Error('Every public feature needs a distinct URL ID, title and summary');
      }
      featureIds.add(feature.id);
      const { source } = feature;
      if (source && Object.keys(source).length === 1 && typeof source.issue === 'string'
        && issueId.test(source.issue) && !issues.has(source.issue)) {
        issues.add(source.issue);
      } else if (!source || Object.keys(source).length !== 2 || !['developed', 'planned'].includes(source.stage)
        || typeof source.path !== 'string' || !repositoryPath.test(source.path)
        || source.path.split('/').some(part => part === '.' || part === '..')) {
        throw Error(`Expected a unique Linear issue or a reviewed repository source for ${feature.id}`);
      }
    }
  }
  return [...issues];
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

function featureStatus({ id, source }, issues) {
  if (source.stage) return source.stage === 'developed' ? 'Developed' : 'Planned';
  const issue = issues.get(source.issue);
  if (!issue || !Object.hasOwn(issue, 'archivedAt') || !stateLabels.has(issue.state?.type)) {
    throw Error(`Missing or unsupported Linear state for ${id}`);
  }
  return issue.archivedAt ? null : stateLabels.get(issue.state.type);
}

function packageSections(packages, issues) {
  const links = [];
  const sections = [];
  for (const { id, name, features } of packages) {
    const anchor = `package-${id}`;
    const groups = { Developed: [], 'In development': [], Planned: [] };
    for (const feature of features) {
      const status = featureStatus(feature, issues);
      if (status) groups[status].push(`        <li class="roadmap-feature" id="${feature.id}">
          <div>
            <h3>${escape(feature.title)}</h3>
            <p>${escape(feature.summary)}</p>
          </div>
          <span class="roadmap-stage">${status}</span>
        </li>`);
    }
    const developed = groups.Developed.length;
    const pending = groups['In development'].length + groups.Planned.length;
    const rows = [...groups.Developed, ...groups['In development'], ...groups.Planned];
    links.push(`        <li><a href="#${anchor}"><span>${escape(name)}</span>
          <span class="roadmap-count">${developed} developed · ${pending} in the pipeline</span></a></li>`);
    sections.push(`    <section class="roadmap-section" aria-labelledby="${anchor}">
      <h2 id="${anchor}">${escape(name)}</h2>
${rows.length
    ? `      <ul class="roadmap-list">\n${rows.join('\n')}\n      </ul>`
    : '      <p>No features are listed yet.</p>'}
    </section>`);
  }
  return `    <nav class="roadmap-packages" aria-label="Packages">
      <ul>
${links.join('\n')}
      </ul>
    </nav>

${sections.join('\n\n')}`;
}

export function renderRoadmap(html, packages, issues) {
  collectIssueIds(packages);
  const startAt = html.indexOf(start);
  const endAt = html.indexOf(end);
  if (startAt < 0 || endAt < startAt || html.indexOf(start, startAt + 1) >= 0 || html.indexOf(end, endAt + 1) >= 0) {
    throw Error('Expected one public feature region in the roadmap page');
  }
  return html.slice(0, startAt + start.length) + '\n' + packageSections(packages, issues) + '\n    ' + html.slice(endAt);
}

export async function syncRoadmap({ loadIssues = fetchIssueStates, token = process.env.LINEAR_ROADMAP_TOKEN,
  registryPath = registry, roadmapPath = roadmap } = {}) {
  const [input, html] = await Promise.all([readFile(registryPath, 'utf8'), readFile(roadmapPath, 'utf8')]);
  const packages = JSON.parse(input);
  const issues = await loadIssues(collectIssueIds(packages), token);
  const next = renderRoadmap(html, packages, issues);
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

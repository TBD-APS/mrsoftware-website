// Synthetic CI data. The production packer always requires a reviewed snapshot.
const snapshotAt = '2026-10-24T10:00:00Z';
function stats(completed, remaining) {
  return { completed, remaining, total: completed + remaining, inProgress: 0, ready: 0, backlog: remaining, canceled: 0, duplicates: 0, removed: 0, archivedOpen: 0,
    series: Array.from({ length: 31 }, (_, i) => ({ date: new Date(Date.UTC(2026, 8, 24 + i)).toISOString().slice(0, 10), completed, remaining, removed: 0, created: 0 })) };
}
export const data = { workspace: 'Test workspace', snapshotAt, historyCapturedAt: snapshotAt, timezone: 'Europe/Copenhagen',
  projects: ['MR SAASy', 'Tradey', 'Workslip', 'Sample 4', 'Sample 5', 'Sample 6'].map((name, i) => ({ id: 'project-' + i, name, sourceName: name, url: 'https://example.invalid/project/' + i, ...stats(i === 0 ? 2 : i === 1 ? 1 : 0, i === 0 ? 3 : i === 1 ? 4 : 0) })),
  portfolio: stats(3, 7), coverage: { allPagesRead: true, sourceProjects: 6, sourceIssues: 10, includedIssues: 10, deletedIssues: 0, archivedProjects: 0, stateSpans: 10 } };
export const graphs = { capturedAt: snapshotAt, method: 'Synthetic CI graph', repositories: ['mr-saasy', 'tradey'].map(id => {
  const main = id === 'tradey' ? 'src/server.mjs' : 'src/main.js';
  const files = [main, 'src/shared.js'].map(path => ({ id: path, path, name: path.split('/').at(-1), degree: 1, nodes: 1, symbols: [{ label: 'example', line: 1 }], url: 'https://example.invalid/source/' + path }));
  return { id, name: id === 'tradey' ? 'Tradey' : 'MR SAASy', repository: 'sample/' + id, commit: '1234567', files, defaultFile: main, links: [{ source: main, target: 'src/shared.js', count: 1, relations: { imports: 1 }, inferred: false }], engine: 'Synthetic CI graph', indexedAt: snapshotAt, totalNodes: 2, totalRelationships: 1, scope: 'Synthetic CI graph.', mappedNodes: 2, mappedRelationships: 1, unlocatedNodes: 0 };
}) };

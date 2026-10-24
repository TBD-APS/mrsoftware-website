import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const source = process.argv[2] || process.env.DASHBOARD_SNAPSHOT_DIR;
if (!source) throw new Error('Pass the reviewed private snapshot directory. No sample data is used for deployment.');
const dataText = await readFile(resolve(source, 'data.json'), 'utf8');
const graphsText = await readFile(resolve(source, 'graphs.json'), 'utf8');
const data = JSON.parse(dataText), graphs = JSON.parse(graphsText);
if (!data.snapshotAt || !data.projects?.length || !graphs.repositories?.length) throw new Error('Snapshot is incomplete');
if (data.projects.reduce((n, p) => n + p.completed, 0) !== data.portfolio.completed || data.projects.reduce((n, p) => n + p.remaining, 0) !== data.portfolio.remaining) throw new Error('Portfolio and project counts do not reconcile');
await mkdir('.local', { recursive: true });
const files = Object.fromEntries(await Promise.all(['index.html', 'app.js', 'code-graph.js', 'styles.css'].map(async name => [name, await readFile(resolve('dashboard', name), 'utf8')])));
files['data.js'] = 'window.MR_SOFTWARE_DATA = ' + JSON.stringify(data) + ';';
files['graphs.js'] = 'window.MR_SOFTWARE_GRAPHS = ' + JSON.stringify(graphs) + ';';
await writeFile('.local/private-dashboard.json', JSON.stringify({ kind: 'private-snapshot', snapshotAt: data.snapshotAt, files }));
await writeFile('.local/dashboard-provenance.json', JSON.stringify({ snapshotAt: data.snapshotAt, taskSha256: createHash('sha256').update(dataText).digest('hex'), graphSha256: createHash('sha256').update(graphsText).digest('hex') }, null, 2));
console.log('Prepared the private snapshot for the Worker bundle; no data was added to static assets.');

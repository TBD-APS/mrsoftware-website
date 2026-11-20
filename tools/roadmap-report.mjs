import { parseFragment } from 'parse5';
import { sha256 } from '@mr-software/content';

const start = '<!-- public-features:start -->', end = '<!-- public-features:end -->';
const attribute = (node, name) => node.attrs?.find(item => item.name === name)?.value;
const hasClass = (node, name) => attribute(node, 'class')?.split(/\s+/).includes(name);
function descendants(node, predicate) {
  const found = [];
  for (const child of node.childNodes ?? []) { if (predicate(child)) found.push(child); found.push(...descendants(child, predicate)); }
  return found;
}
const text = node => node.nodeName === '#text' ? node.value : (node.childNodes ?? []).map(text).join('');

export function roadmapReport(html, { at } = {}) {
  const from = html.indexOf(start), to = html.indexOf(end);
  if (from < 0 || to <= from || html.indexOf(start, from + 1) >= 0 || html.indexOf(end, to + 1) >= 0) throw Error('Expected one reviewed public roadmap region');
  const published = html.slice(from + start.length, to), document = parseFragment(published);
  const sections = descendants(document, node => hasClass(node, 'roadmap-section'));
  if (!sections.length) throw Error('The public roadmap has no product sections');
  const labels = new Set(), featureIds = new Set();
  const rows = sections.map(section => {
    const heading = descendants(section, node => node.tagName === 'h2');
    if (heading.length !== 1) throw Error('Every public roadmap product needs one heading');
    const product = text(heading[0]).trim();
    if (!product || labels.has(product)) throw Error('Public product names must be unique'); labels.add(product);
    const record = { product, products: 1, developed: 0, development: 0, planned: 0, pipeline: 0 };
    for (const feature of descendants(section, node => hasClass(node, 'roadmap-feature'))) {
      const id = attribute(feature, 'id'), stages = descendants(feature, node => hasClass(node, 'roadmap-stage'));
      if (!id || featureIds.has(id) || stages.length !== 1) throw Error('Every published feature needs one unique identity and stage'); featureIds.add(id);
      const stage = { Developed: 'developed', 'In development': 'development', Planned: 'planned' }[text(stages[0]).trim()];
      if (!stage) throw Error('Unknown public roadmap stage'); record[stage]++;
    }
    record.pipeline = record.development + record.planned;
    return record;
  });
  return {
    version: 1, id: 'public-roadmap', title: 'Roadmap overview', period: 'Published feature counts', synthetic: false,
    source: { name: 'MR Software public roadmap', version: `roadmap-${sha256(published).slice(0, 12)}`, at, url: 'https://mrsoftware.dk/roadmap/#roadmap-packages' },
    locale: 'en-GB', timezone: 'Europe/Copenhagen',
    datasets: { products: { columns: { product: 'string', products: 'number', developed: 'number', development: 'number', planned: 'number', pipeline: 'number' }, rows } },
    blocks: [
      ...[['products', 'Packages'], ['developed', 'Developed'], ['development', 'In development'], ['planned', 'Planned']].map(([field, title]) => ({ type: 'metric', id: field, title, dataset: 'products', field, format: 'integer' })),
      ...[['developed', 'Developed by package'], ['pipeline', 'In the pipeline by package']].map(([measure, title]) => ({ type: 'chart', id: `${measure}-by-package`, title, dataset: 'products', kind: 'bar', orientation: 'horizontal', category: 'product', measure, categoryTitle: 'Package', measureTitle: 'Published features' })),
      { type: 'table', id: 'counts', title: 'Counts behind the graphs', dataset: 'products', groupBy: 'product', groupTitle: 'Package', fields: [['developed', 'Developed'], ['development', 'In development'], ['planned', 'Planned']].map(([field, title]) => ({ field, title, format: 'integer' })) },
      { type: 'text', id: 'meaning', title: 'What these counts mean', text: 'Developed features are implemented. Availability varies by product and setup. The pipeline combines features in development and planned features. These counts describe the published roadmap; they are not a measure of customer activation or percentage complete.' },
    ],
  };
}

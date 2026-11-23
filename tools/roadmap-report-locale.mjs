import { deflateRawSync, inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');

const labels = new Map(Object.entries({
  'Roadmap overview': 'Roadmapoverblik',
  'Published feature counts': 'Offentliggjorte antal funktioner',
  'MR Software public roadmap': 'MR Softwares offentlige roadmap',
  Packages: 'Pakker', Developed: 'Udviklet', 'In development': 'Under udvikling', Planned: 'Planlagt',
  'Developed by package': 'Udviklet pr. pakke', 'In the pipeline by package': 'På vej pr. pakke',
  Package: 'Pakke', 'Published features': 'Offentliggjorte funktioner',
  'Counts behind the graphs': 'Tallene bag graferne', 'What these counts mean': 'Hvad tallene betyder',
  'Developed features are implemented. Availability varies by product and setup. The pipeline combines features in development and planned features. These counts describe the published roadmap; they are not a measure of customer activation or percentage complete.':
    'Udviklede funktioner er implementeret. Tilgængeligheden varierer efter produkt og opsætning. På vej omfatter funktioner under udvikling og planlagte funktioner. Tallene beskriver det offentliggjorte roadmap; de er ikke et mål for kundeaktivering eller færdiggørelsesprocent.',
}));
const translate = text => {
  if (!labels.has(text)) throw Error(`Missing Danish roadmap report label: ${text}`);
  return labels.get(text);
};
const columnLabels = Object.freeze({ product: 'Produkt', products: 'Pakker', developed: 'Udviklet', development: 'Under udvikling', planned: 'Planlagt', pipeline: 'På vej' });

/** Translate presentation labels, preserving the authoritative data and source revision. */
export function danishRoadmapReport(input) {
  const report = structuredClone(input);
  report.locale = 'da-DK';
  report.title = translate(report.title);
  report.period = translate(report.period);
  report.source.name = translate(report.source.name);
  const source = new URL(report.source.url);
  if (source.origin !== 'https://mrsoftware.dk' || source.pathname !== '/roadmap/') throw Error('Unexpected roadmap source URL');
  source.pathname = '/da/roadmap/';
  report.source.url = source.href;
  for (const block of report.blocks) {
    for (const field of ['title', 'categoryTitle', 'measureTitle', 'groupTitle', 'text']) {
      if (block[field] !== undefined) block[field] = translate(block[field]);
    }
    for (const field of block.fields ?? []) field.title = translate(field.title);
  }
  return report;
}

/** The renderer's chrome is presentation, outside its immutable JSON snapshot. */
export function danishRenderedRoadmap(rendered) {
  if (rendered.report.locale !== 'da-DK' || sha256(rendered.json) !== rendered.hash) throw Error('Expected an intact Danish report snapshot');
  const chrome = value => value
    .replaceAll('aria-label="Report downloads"', 'aria-label="Rapportdownloads"')
    .replaceAll('>Source</a>', '>Kilde</a>')
    .replaceAll('No data in this snapshot.', 'Ingen data i dette øjebliksbillede.')
    .replaceAll(' · EXAMPLE DATA', ' · EKSEMPELDATA')
    .replaceAll('aria-roledescription="group mark container"', 'aria-roledescription="gruppe"')
    .replaceAll('aria-roledescription="rect mark container"', 'aria-roledescription="søjlegruppe"')
    .replaceAll('aria-roledescription="axis"', 'aria-roledescription="akse"')
    .replaceAll('aria-roledescription="bar"', 'aria-roledescription="søjle"')
    .replace(/([XY])-axis titled '([^']*)' for a linear scale with values from ([^ ]+) to ([^"]+)/g,
      "$1-akse med titlen '$2' på en lineær skala med værdier fra $3 til $4")
    .replace(/([XY])-axis titled '([^']*)' for a discrete scale with (\d+) values: ([^"]+)/g,
      (_, axis, title, count, values) => `${axis}-akse med titlen '${title}' på en diskret skala med ${count} værdier: ${values.replace(', ending with ', ', slutter med ')}`);
  const charts = Object.freeze(rendered.charts.map(chart => Object.freeze({ ...chart, svg: chart.svg ? chrome(chart.svg) : null })));
  return Object.freeze({ ...rendered, charts, fragment: chrome(rendered.fragment), html: chrome(rendered.html) });
}

export function danishRoadmapCsv(dataset, toCsv) {
  // CSV headers are display labels; keep the input/snapshot's machine field IDs.
  const fields = Object.keys(dataset.columns);
  if (fields.some(field => !Object.hasOwn(columnLabels, field))) throw Error('Unknown roadmap CSV field');
  const header = fields.map(field => `"${columnLabels[field]}"`).join(';');
  return toCsv(dataset).replace(/^(\uFEFF)[^\r\n]*/, (_, bom) => bom + header);
}

// Office 0.1.0 hardcodes a few display labels. Adapt only generated OpenXML
// presentation strings, never data, identifiers, source versions or snapshot hashes.
const officeLabels = new Map(Object.entries({
  Report: 'Rapport', Period: 'Periode', Source: 'Kilde', 'Source version': 'Kildeversion',
  'Source time': 'Kildetidspunkt', 'Snapshot SHA-256': 'Øjebliksbillede SHA-256',
  'Synthetic data': 'Syntetiske data', Yes: 'Ja', No: 'Nej',
  'No data in this snapshot.': 'Ingen data i dette øjebliksbillede.',
  'Click to edit Master text styles': 'Klik for at redigere masterens teksttypografier',
  'Second level': 'Andet niveau', 'Third level': 'Tredje niveau', 'Fourth level': 'Fjerde niveau', 'Fifth level': 'Femte niveau',
  ...columnLabels,
}));
const xmlEscape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

function localizeXml(name, xml, kind) {
  if (kind === 'xlsx') {
    // Text cells contain both metadata and raw dataset header labels.
    if (/^xl\/(?:sharedStrings\.xml|worksheets\/sheet\d+\.xml)$/.test(name)) {
      xml = xml.replace(/(<(?:\w+:)?t(?:\s[^>]*)?>)([^<]*)(<\/(?:\w+:)?t>)/g,
        (all, open, text, close) => officeLabels.has(text) ? open + xmlEscape(officeLabels.get(text)) + close : all);
    }
    // Sheet names also appear in native chart formulas. Update both together.
    if (name === 'xl/workbook.xml') xml = xml.replace(/(<sheet\b[^>]*\bname=")Report("[^>]*>)/g, '$1Rapport$2')
      .replace(/(<sheet\b[^>]*\bname=")Chart (\d+)("[^>]*>)/g, '$1Diagram $2$3');
    if (/^xl\/charts\/chart\d+\.xml$/.test(name)) xml = xml.replace(/'Chart (\d+)'!/g, "'Diagram $1'!");
  }
  if (name === 'docProps/core.xml') xml = xml.replace(/Content snapshot (?=[a-f0-9]{64}<)/g, 'Indholdsøjebliksbillede ');
  if (kind === 'pptx' && /^ppt\/.*\.xml$/.test(name)) {
    // PptxGenJS 4's text runs keep en-US despite the report/theme locale.
    xml = xml.replace(/\blang="[^"]*"/g, 'lang="da-DK"')
      .replace(/(<a:t>)([^<]*)(<\/a:t>)/g,
        (all, open, text, close) => officeLabels.has(text) ? open + xmlEscape(officeLabels.get(text)) + close : all);
  }
  if (kind === 'docx' && /^word\/.*\.xml$/.test(name)) {
    xml = xml.replace(/(<w:lang\b[^>]*\bw:val=")[^"]*(")/g, '$1da-DK$2');
  }
  if (kind === 'docx' && name === 'word/styles.xml' && !xml.includes('<w:lang ')) {
    // The admitted exporter emits this empty run-default element.
    if (!xml.includes('<w:rPrDefault/>')) throw Error('Unexpected Office default language structure');
    xml = xml.replace('<w:rPrDefault/>', '<w:rPrDefault><w:rPr><w:lang w:val="da-DK"/></w:rPr></w:rPrDefault>');
  }
  return xml;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Bounded ZIP adaptation for the admitted exporter's ordinary, non-ZIP64 files. */
export function danishOfficeExport(bytes, kind) {
  if (!['docx', 'xlsx', 'pptx'].includes(kind)) throw Error('Unsupported Office export');
  const input = Buffer.from(bytes), limit = 20_000_000;
  if (input.length > limit || input.length < 22) throw Error('Invalid Office archive size');
  let end = input.length - 22;
  while (end >= Math.max(0, input.length - 65557) && input.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0 || input.readUInt32LE(end) !== 0x06054b50) throw Error('Missing Office ZIP directory');
  const count = input.readUInt16LE(end + 10), centralSize = input.readUInt32LE(end + 12), centralStart = input.readUInt32LE(end + 16);
  if (count > 2000 || input.readUInt16LE(end + 4) || input.readUInt16LE(end + 6) || centralStart + centralSize !== end) throw Error('Unsupported Office ZIP directory');
  let cursor = centralStart, offset = 0, expanded = 0;
  const local = [], central = [], names = new Set();
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || input.readUInt32LE(cursor) !== 0x02014b50) throw Error('Invalid Office ZIP entry');
    const nameLength = input.readUInt16LE(cursor + 28), extraLength = input.readUInt16LE(cursor + 30), commentLength = input.readUInt16LE(cursor + 32);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > end) throw Error('Invalid Office ZIP entry length');
    const entry = Buffer.from(input.subarray(cursor, recordEnd)), name = entry.subarray(46, 46 + nameLength), path = name.toString('utf8');
    const flags = entry.readUInt16LE(8), method = entry.readUInt16LE(10), compressedSize = entry.readUInt32LE(20), size = entry.readUInt32LE(24), position = entry.readUInt32LE(42);
    if (names.has(path) || flags & 1 || ![0, 8].includes(method) || size > limit || position + 30 > centralStart || input.readUInt32LE(position) !== 0x04034b50) throw Error('Unsupported Office ZIP entry');
    names.add(path); expanded += size;
    if (expanded > 100_000_000) throw Error('Office ZIP expansion exceeds limit');
    const dataStart = position + 30 + input.readUInt16LE(position + 26) + input.readUInt16LE(position + 28);
    if (dataStart + compressedSize > centralStart) throw Error('Invalid Office ZIP data range');
    let data = input.subarray(dataStart, dataStart + compressedSize), outputSize = size, checksum = entry.readUInt32LE(16);
    if (path.endsWith('.xml')) {
      const plain = method === 8 ? inflateRawSync(data, { maxOutputLength: limit }) : data;
      if (plain.length !== size || crc32(plain) !== checksum) throw Error('Corrupt Office XML entry');
      const xml = plain.toString('utf8'), translated = localizeXml(path, xml, kind);
      if (translated !== xml) {
        const changed = Buffer.from(translated);
        outputSize = changed.length; checksum = crc32(changed);
        data = method === 8 ? deflateRawSync(changed) : changed;
      }
    }
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50); header.writeUInt16LE(entry.readUInt16LE(6), 4);
    header.writeUInt16LE(flags & ~8, 6); header.writeUInt16LE(method, 8);
    entry.copy(header, 10, 12, 16);
    header.writeUInt32LE(checksum, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(outputSize, 22);
    header.writeUInt16LE(nameLength, 26); header.writeUInt16LE(extraLength, 28);
    const extra = entry.subarray(46 + nameLength, 46 + nameLength + extraLength);
    local.push(header, name, extra, data);
    entry.writeUInt16LE(flags & ~8, 8); entry.writeUInt32LE(checksum, 16);
    entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(outputSize, 24); entry.writeUInt32LE(offset, 42);
    central.push(entry); offset += header.length + name.length + extra.length + data.length;
    cursor = recordEnd;
  }
  if (cursor !== end) throw Error('Office ZIP directory count differs');
  const directory = Buffer.concat(central), footer = Buffer.from(input.subarray(end));
  footer.writeUInt32LE(directory.length, 12); footer.writeUInt32LE(offset, 16);
  const output = Buffer.concat([...local, directory, footer]);
  if (output.length > limit) throw Error('Localized Office export exceeds limit');
  return output;
}

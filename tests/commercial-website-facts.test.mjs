import test from 'node:test';
import assert from 'node:assert/strict';
import { excludedDomains, pickPages, robotsAllows, safeWebsite, websiteFacts } from '../commercial/server/website-facts.mjs';
import { websiteSystems } from '../commercial/shared/lead-presets.mjs';

const home = 'https://www.lund-toemrer.dk/';
const about = 'https://www.lund-toemrer.dk/om-os';
const jobs = 'https://www.lund-toemrer.dk/job/toemrer';
const page = (url, kind, markdown = '', metadata = {}, statusCode = 200) => ({ url, kind, statusCode, markdown, metadata });
const facts = (pages, checkedAt = '2026-11-24T10:00:00.000Z') => websiteFacts({ cvr: '12345678', pages, checkedAt });

test('safeWebsite turns a CVR website into its homepage and refuses the rest', () => {
  assert.equal(safeWebsite('www.lund-toemrer.dk')?.href, home);
  assert.equal(safeWebsite('http://Lund-Toemrer.dk/kontakt')?.href, 'http://lund-toemrer.dk/');
  assert.equal(safeWebsite('https://lund-toemrer.dk/')?.href, 'https://lund-toemrer.dk/');
  assert.equal(safeWebsite(' lund-toemrer.dk/?a=1#x ')?.href, 'https://lund-toemrer.dk/');
  for (const value of ['', null, undefined, 'ftp://x.dk', 'https://10.0.0.1/', '192.168.1.1', 'https://[::1]/', 'localhost', 'https://user:pw@lund-toemrer.dk/',
    'https://www.facebook.com/lund', 'linkedin.com/company/x', 'https://shop.krak.dk/', 'https://lund-toemrer.dk:8443/']) {
    assert.equal(safeWebsite(value), null, String(value));
  }
  assert.deepEqual(excludedDomains, ['linkedin.com', 'facebook.com', 'instagram.com', 'youtube.com', 'google.com', 'krak.dk', 'degulesider.dk', 'proff.dk', 'cvrapi.dk', 'virk.dk', 'jobindex.dk', 'trustpilot.dk', 'wikipedia.org']);
});

test('pickPages takes the first about and jobs link on the same host', () => {
  const links = ['https://www.facebook.com/lund', 'https://andet-firma.dk/om-os', 'https://lund-toemrer.dk/om-os', jobs, 'https://www.lund-toemrer.dk/karriere', 'mailto:info@lund-toemrer.dk'];
  assert.deepEqual(pickPages(new URL(home), links), { about: 'https://lund-toemrer.dk/om-os', jobs });
  assert.deepEqual(pickPages(new URL(home), ['/about-us', '/job']), { about: null, jobs: 'https://www.lund-toemrer.dk/job' });
  assert.deepEqual(pickPages(new URL(home), ['https://www.lund-toemrer.dk/virksomheden/', 'https://www.lund-toemrer.dk/ledige-stillinger']), { about: 'https://www.lund-toemrer.dk/virksomheden/', jobs: 'https://www.lund-toemrer.dk/ledige-stillinger' });
  assert.deepEqual(pickPages(new URL(home), []), { about: null, jobs: null });
  assert.deepEqual(pickPages(new URL(home), ['https://www.lund-toemrer.dk/jobsamtale-tips', 'https://www.lund-toemrer.dk/', 42]), { about: null, jobs: null });
});

test('robotsAllows follows Disallow and Allow rules for every user agent', () => {
  assert.equal(robotsAllows('User-agent: *\nDisallow: /', '/'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /om-os', '/om-os'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /om-os', '/job'), true);
  assert.equal(robotsAllows('User-agent: Googlebot\nDisallow: /', '/'), true);
  assert.equal(robotsAllows('', '/'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /\nAllow: /job', '/job/toemrer'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow:\n', '/'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/files/a.pdf'), false);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /*.pdf$', '/files/a.pdfx'), true);
  assert.equal(robotsAllows('User-agent: *\nDisallow: /a+b(c)', '/a+b(c)/d'), false);
  assert.equal(robotsAllows('# comment\nUser-agent: bingbot\nUser-agent: *\nDisallow: /om-os # private\n\nUser-agent: other\nDisallow: /', '/om-os/team'), false);
});

test('websiteFacts keeps the description word for word and names systems with the page that names them', () => {
  const result = facts([
    page(home, 'home', 'Vi registrerer timer i Apacta. Apacta hjælper os.', { description: '  Tømrer i Aarhus siden 2014.\n Vi bygger tage og altaner. ' }),
    page(about, 'about', 'Vi bruger e-conomic og Apacta.'),
  ]);
  assert.equal(result.cvr, '12345678');
  assert.equal(result.description, 'Tømrer i Aarhus siden 2014. Vi bygger tage og altaner.');
  assert.deepEqual(result.systems, [{ name: 'Apacta', url: home }, { name: 'e-conomic', url: about }]);
  assert.deepEqual(result.pages, [{ url: home, status: 200 }, { url: about, status: 200 }]);
  assert.equal(result.checkedAt, '2026-11-24T10:00:00.000Z');
  assert.equal(result.jobsPage, null);
});

test('websiteFacts falls back to ogDescription and cuts long text at 300 characters', () => {
  const words = Array.from({ length: 80 }, (_, index) => `ord${index}`).join(' ');
  const result = facts([page(home, 'home', '', { ogDescription: words })]);
  assert.ok(result.description.length <= 300);
  assert.ok(result.description.endsWith('…'));
  assert.ok(words.startsWith(result.description.slice(0, -1)));
  assert.match(result.description, /ord\d+…$/);
  assert.equal(facts([page(home, 'home', '', {})]).description, null);
});

test('websiteFacts drops a description with an email address or phone number', () => {
  for (const description of ['Ring 12 34 56 78', 'Skriv til jens@lund-toemrer.dk', 'Kontakt +45 12345678', 'Tlf. 86123456']) {
    assert.equal(facts([page(home, 'home', '', { description })]).description, null, description);
  }
  assert.equal(facts([page(home, 'home', '', { description: 'Grundlagt 2014' })]).description, 'Grundlagt 2014');
});

test('system names match whole words only, ignoring case', () => {
  const names = markdown => facts([page(home, 'home', markdown)]).systems.map(system => system.name);
  assert.deepEqual(names('vi bruger apacta'), ['Apacta']);
  assert.deepEqual(names('Apactaen er god'), []);
  assert.deepEqual(names('Vi kører SAP  Business\nOne'), ['SAP Business One']);
  assert.deepEqual(names('E-Komplet og EKomplet'), ['E-Komplet']);
  assert.deepEqual(names('EKomplet'), []);
  assert.deepEqual(names('Se apacta.com'), ['Apacta']);
  assert.ok(Object.values(websiteSystems).flat().includes('Ordrestyring'));
});

test('jobsPage is set only when the jobs page loaded', () => {
  assert.equal(facts([page(home, 'home'), page(jobs, 'jobs')]).jobsPage, jobs);
  assert.equal(facts([page(home, 'home'), page(jobs, 'jobs', '', {}, 404)]).jobsPage, null);
});

test('websiteFacts never returns page text', () => {
  const sentence = 'Vores mester Jens Hansen svarer altid på mail.';
  const result = facts([page(home, 'home', `${sentence} Vi bruger Apacta.`, { description: 'Tømrer i Aarhus.' })]);
  assert.doesNotMatch(JSON.stringify(result), /Jens Hansen|svarer altid/);
  assert.deepEqual(Object.keys(result).sort(), ['checkedAt', 'cvr', 'description', 'jobsPage', 'pages', 'systems']);
});

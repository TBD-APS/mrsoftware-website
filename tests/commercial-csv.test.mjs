import test from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../commercial/server/csv.mjs';
import { createCommercialHarness } from './helpers/commercial.mjs';
import { HttpError } from '../commercial/server/validation.mjs';

const today = () => new Date().toISOString().slice(0, 10);
const rowsOf = text => text.replace(/^﻿/, '').split('\r\n').filter(Boolean);

test('csv escapes separators, quotes, line breaks and formulas', () => {
  const csv = toCsv([{ header: 'Name', value: row => row }], ['Lund; Søn', 'Say "hi"', 'two\nlines', '=HYPERLINK("x")', '-5', 'Ærø']);
  assert.equal(csv, '﻿Name\r\n"Lund; Søn"\r\n"Say ""hi"""\r\n"two\nlines"\r\n"\'=HYPERLINK(""x"")"\r\n\'-5\r\nÆrø\r\n');
});

test('csv writes empty cells for missing values and guards tab, carriage return, plus and at', () => {
  const columns = [{ header: 'A', value: row => row.a }, { header: 'B', value: row => row.b }];
  assert.equal(toCsv(columns, [{ a: null, b: undefined }, { a: 0, b: '\tx' }, { a: '+45 1', b: '@sum' }, { a: 'x\ry', b: '\rz' }]),
    '﻿A;B\r\n;\r\n0;\'\tx\r\n\'+45 1;\'@sum\r\n"x\ry";"\'\rz"\r\n');
});

async function download(harness, path, options) {
  const response = await harness.request('GET', path, undefined, options);
  return { response, text: await response.text() };
}

test('leads.csv returns the search as an attachment and records the download outside the activity window', async t => {
  const harness = await createCommercialHarness(t);
  const { response, text } = await download(harness, '/api/backoffice/leads.csv?product=workslip&regions=1082');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Content-Type'), 'text/csv; charset=utf-8');
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="leads-${today()}.csv"`);
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  const rows = rowsOf(text);
  assert.equal(rows[0], 'Company;CVR;Industry code;Industry;Employees;Address;Postcode;City;Website;Phone;Score;Reason;LinkedIn search');
  assert.equal(rows[1], 'Lund Tømrer ApS;12345678;433200;Tømrerforretninger;10–19;Søndergade 1;8000;Aarhus C;www.lund-toemrer.dk;;100;Tømrerforretninger (433200), 10–19 employees, Aarhus C, founded 2014, website listed;https://www.linkedin.com/search/results/companies/?keywords=Lund%20T%C3%B8mrer%20ApS');
  assert.equal(rows.length, 3);
  const events = (await harness.db.prepare('SELECT document FROM sales_events').all()).results.map(row => JSON.parse(row.document));
  const exports = events.filter(event => event.recordType === 'export');
  assert.deepEqual(exports.map(event => [event.operation, event.details]), [['downloaded', { kind: 'leads', count: 2 }]]);
  const state = await harness.call('GET', '/api/backoffice/state');
  assert.ok(!state.body.events.some(event => event.recordType === 'export'));
});

test('leads.csv validates like the search and never turns a failing register into an empty file', async t => {
  const harness = await createCommercialHarness(t);
  assert.equal((await harness.call('GET', '/api/backoffice/leads.csv?product=workslip')).status, 400);
  const failing = await createCommercialHarness(t, { cvrClient: () => ({ search: async () => { throw new HttpError(502, 'The company register did not answer. Try again in a moment.'); }, company: async () => null }) });
  const response = await failing.call('GET', '/api/backoffice/leads.csv?product=workslip&regions=1082');
  assert.equal(response.status, 502);
  assert.equal(response.body.error, 'The company register did not answer. Try again in a moment.');
});

test('customers.csv needs Access and lists CVR, contacts and record links', async t => {
  const harness = await createCommercialHarness(t);
  assert.equal((await harness.call('GET', '/api/backoffice/customers.csv', undefined, { omitHeaders: ['Cf-Access-Jwt-Assertion'] })).status, 401);
  const { customer } = (await harness.call('POST', '/api/backoffice/leads', { cvr: '23456789', product: 'workslip', nextFollowUp: '2030-11-20' })).body;
  await harness.call('POST', '/api/backoffice/customers', { name: '=Formula Ltd', contacts: [{ name: 'Ana', email: 'ana@example.test', phone: '' }, { name: 'Bo', email: '', phone: '+45 1' }], notes: 'Line one\nline two' });
  const { response, text } = await download(harness, '/api/backoffice/customers.csv');
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="customers-${today()}.csv"`);
  const rows = rowsOf(text);
  assert.equal(rows[0], 'Company;CVR;Contact names;Contact emails;Contact phones;Notes;Record link');
  assert.ok(rows.includes(`Holm Byg A/S;23456789;;kontakt@holm-byg.example;'+45 22222222;${customer.notes.includes(';') ? '"' + customer.notes + '"' : customer.notes};https://backoffice.mrsoftware.dk/backoffice/?view=customer&id=${customer.id}`), rows.join('\n'));
  assert.match(text, /\r\n'=Formula Ltd;;Ana, Bo;ana@example\.test;'\+45 1;"Line one\nline two";https:\/\/backoffice\.mrsoftware\.dk\/backoffice\/\?view=customer&id=/);
});

test('opportunities.csv lists each opportunity with its company, stage and follow-up', async t => {
  const harness = await createCommercialHarness(t);
  const { opportunity } = (await harness.call('POST', '/api/backoffice/leads', { cvr: '23456789', product: 'workslip', nextFollowUp: '2030-11-20' })).body;
  const { response, text } = await download(harness, '/api/backoffice/opportunities.csv');
  assert.equal(response.headers.get('Content-Disposition'), `attachment; filename="opportunities-${today()}.csv"`);
  assert.deepEqual(rowsOf(text), ['Title;Company;Product;Stage;Next follow-up;Notes;Record link', `Workslip lead;Holm Byg A/S;Workslip;Lead;2030-11-20;;https://backoffice.mrsoftware.dk/backoffice/?view=opportunity&id=${opportunity.id}`]);
});

test('downloads answer only GET', async t => {
  const harness = await createCommercialHarness(t);
  for (const path of ['/api/backoffice/leads.csv?product=workslip&regions=1082', '/api/backoffice/customers.csv', '/api/backoffice/opportunities.csv']) {
    assert.equal((await harness.call('POST', path, {})).status, 405, path);
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { employeeBands, leadPresets, allowedCompanyForms } from '../commercial/shared/lead-presets.mjs';
import { municipalities, regions } from '../commercial/shared/municipalities.mjs';
import { municipalityCodes, scoreLead } from '../commercial/server/lead-scoring.mjs';

const carpenter = (overrides = {}) => ({
  cvr: '12345678', name: 'Lund Tømrer ApS', industryCode: '433200', industryText: 'Tømrerforretninger', secondaryCodes: [],
  companyForm: 'APS', employees: 'ANTAL_10_19', address: 'Søndergade 1', postcode: '8000', city: 'Aarhus C', municipalityCode: '751',
  founded: '2014-03-01', website: 'www.lund-toemrer.dk', phone: '', email: '', protected: false, active: true, ...overrides,
});

test('a carpenter with 10–19 staff in the Workslip sweet spot scores 100', () => {
  assert.deepEqual(scoreLead(carpenter(), leadPresets.workslip, '2026-11-24'), {
    score: 100,
    reason: 'Tømrerforretninger (433200), 10–19 employees, Aarhus C, founded 2014, website listed',
  });
});

test('only a secondary industry match, adjacent size, young and no contact scores 35', () => {
  const company = carpenter({ industryCode: '471100', industryText: 'Supermarkeder', secondaryCodes: ['433200'], employees: 'ANTAL_2_4', founded: '2025-06-01', website: '', phone: '' });
  assert.deepEqual(scoreLead(company, leadPresets.workslip, '2026-11-24'), {
    score: 35,
    reason: 'Supermarkeder (471100), 2–4 employees, Aarhus C, founded 2025',
  });
});

test('a company founded exactly two years ago gets the age points', () => {
  assert.equal(scoreLead(carpenter({ founded: '2024-11-24', website: '' }), leadPresets.workslip, '2026-11-24').score, 90);
  assert.equal(scoreLead(carpenter({ founded: '2024-11-25', website: '' }), leadPresets.workslip, '2026-11-24').score, 75);
});

test('a missing employee band and founding date add no points and no text', () => {
  assert.deepEqual(scoreLead(carpenter({ employees: null, founded: null, website: '', phone: '+45 12345678' }), leadPresets.workslip, '2026-11-24'), {
    score: 55,
    reason: 'Tømrerforretninger (433200), Aarhus C, phone listed',
  });
});

test('no industry match scores no industry points', () => {
  assert.equal(scoreLead(carpenter({ industryCode: '620100', secondaryCodes: [] }), leadPresets.workslip, '2026-11-24').score, 55);
});

test('every preset uses known bands, cites a product page and has numeric code prefixes', () => {
  const bands = new Set(employeeBands.map(band => band.code));
  assert.deepEqual(Object.keys(leadPresets).sort(), ['shippy', 'tradey', 'workslip']);
  for (const preset of Object.values(leadPresets)) {
    assert.match(preset.source, /^https:\/\/mrsoftware\.dk\/products\/(workslip|tradey|shippy)\/$/);
    assert.ok(preset.codes.length > 0 && preset.codes.every(code => /^\d{2,6}$/.test(code)));
    for (const code of [...preset.sweetSpot, ...preset.adjacent]) assert.ok(bands.has(code), code);
    assert.equal(preset.sweetSpot.filter(code => preset.adjacent.includes(code)).length, 0);
  }
  assert.ok(!allowedCompanyForms.some(form => /ENK|enkelt/i.test(form)));
});

test('municipalityCodes expands Midtjylland and drops unknown codes', () => {
  const codes = municipalityCodes(['1082'], ['999', '101']);
  assert.ok(codes.includes('751'));
  assert.ok(codes.includes('101'));
  assert.ok(!codes.includes('999'));
  assert.deepEqual(codes, [...codes].sort());
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(municipalities.length, 98);
  assert.equal(regions.length, 5);
  assert.deepEqual(municipalityCodes(['1234'], []), []);
});

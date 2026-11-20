import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, loadState, materialPath, publicOrigin, stateKey } from '../commercial/src/data/scenarios.mjs';
import { enquiryContext, moneyLabel } from '../commercial/src/data/pricing.mjs';
import { initialCatalog } from '../commercial/shared/catalog.mjs';

test('only a known material code or exact public/current-origin URL can navigate', () => {
  const target = '/workslip/materials/mat-101/';
  assert.equal(materialPath(' mat-101 ', 'http://127.0.0.1:4000'), target);
  assert.equal(materialPath(publicOrigin + target, 'http://127.0.0.1:4000'), target);
  assert.equal(materialPath('http://127.0.0.1:4000' + target, 'http://127.0.0.1:4000'), target);
  for (const value of ['https://demos.mrsoftware.dk.evil.test' + target, 'javascript:alert(1)', '//demos.mrsoftware.dk' + target, 'https://user@demos.mrsoftware.dk' + target, publicOrigin + target + '?next=/backoffice/', publicOrigin + '/backoffice/', publicOrigin + target + '#x', 'MAT-102']) assert.equal(materialPath(value, 'http://127.0.0.1:4000'), null, value);
});

test('corrupt, oversized and unavailable browser progress recover to seeded data', () => {
  assert.notEqual(stateKey('workslip'), stateKey('tradey'));
  const storage = value => ({ getItem: () => value });
  assert.deepEqual(loadState('workslip', storage('{broken')).state, initialState('workslip'));
  assert.deepEqual(loadState('workslip', storage(JSON.stringify({ ...initialState('workslip'), quantity: -10 }))).state, initialState('workslip'));
  assert.deepEqual(loadState('workslip', storage(JSON.stringify({ ...initialState('workslip'), history: Array(101).fill('entry') }))).state, initialState('workslip'));
  assert.equal(loadState('workslip', { getItem() { throw new Error('Storage unavailable'); } }).persistent, false);
});

test('package context is allowlisted and DKK amounts retain integer minor units', () => {
  assert.deepEqual(enquiryContext('?product=tradey&package=workslip-core', initialCatalog), { product: 'tradey', packageId: '' });
  assert.deepEqual(enquiryContext('?product=%3Cscript%3E&package=%3Cimg%3E', initialCatalog), { product: 'workslip', packageId: '' });
  assert.equal(moneyLabel(89900), 'DKK 899');
  assert.equal(moneyLabel(89950), 'DKK 899.50');
  assert.equal(moneyLabel(null), 'Let’s agree a price');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { minorUnits } from '../commercial/src/scripts/sales/dom.mjs';

test('quote and catalogue amount entry preserves minor units and bounds agreed overrides', () => {
  assert.equal(minorUnits('1250.50', 'Monthly price'), 125050);
  assert.equal(minorUnits('0', 'Monthly price'), 0);
  assert.equal(minorUnits('10000000.00', 'Monthly price'), 1000000000);
  assert.equal(minorUnits(' ', 'Monthly price', true), undefined);
  for (const value of ['', '-1', '1e3', '1.001', 'NaN', 'Infinity', '10000000.01', '9007199254740992']) assert.throws(() => minorUnits(value, 'Monthly price'), /Monthly price:/);
});

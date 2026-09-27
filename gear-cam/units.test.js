import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeBitDiameter } from './units.js';

test('bit diameter converts explicitly selected units to millimeters', () => {
  assert.deepEqual(normalizeBitDiameter(3, 'mm'), { mm: 3, inches: 3 / 25.4 });
  assert.deepEqual(normalizeBitDiameter(0.125, 'in'), { mm: 3.175, inches: 0.125 });
});

test('bit diameter requires units and catches the observed 0.125 mm mistake', () => {
  assert.throws(() => normalizeBitDiameter(3, ''), /millimeters or inches/);
  assert.throws(() => normalizeBitDiameter(0.125, 'mm'), /1\/8 in.*3\.175 mm/);
});


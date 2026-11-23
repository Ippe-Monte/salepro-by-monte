import assert from 'node:assert/strict';
import { test } from 'node:test';
import { baht, parseNonNegative, round2, totals } from './money.ts';

test('totals match the database trigger rules', () => {
  const t = totals([{ qty: 2, unit_price: 1500.5 }, { qty: 1, unit_price: 99.99 }], 100, 7);
  assert.equal(t.subtotal, 3100.99);
  assert.equal(t.vat, round2(((3100.99 - 100) * 7) / 100));
  assert.equal(t.total, round2(3000.99 + t.vat));
});

test('discount larger than subtotal clamps the base at zero', () => {
  const t = totals([{ qty: 1, unit_price: 50 }], 80, 7);
  assert.deepEqual(t, { subtotal: 50, vat: 0, total: 0 });
});

test('rounding of line totals happens per line', () => {
  const t = totals([{ qty: 3, unit_price: 0.335 }, { qty: 3, unit_price: 0.335 }], 0, 0);
  assert.equal(t.subtotal, round2(round2(3 * 0.335) * 2));
});

test('parseNonNegative', () => {
  assert.equal(parseNonNegative('12.5'), 12.5);
  assert.equal(parseNonNegative(''), null);
  assert.equal(parseNonNegative('-1'), null);
  assert.equal(parseNonNegative('abc'), null);
});

test('baht formats two decimals', () => {
  assert.match(baht(1234.5), /1,234\.50/);
});

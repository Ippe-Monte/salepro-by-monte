import assert from 'node:assert/strict';
import { test } from 'node:test';
import { monthGrid, shiftMonth, ymd } from './calendar.ts';
import { distanceKm, formatKm, legs } from './geo.ts';

test('monthGrid: Nov 2026 starts on Sunday and has 30 days', () => {
  const g = monthGrid(2026, 10);
  assert.equal(g[0]![0], 1);
  assert.equal(g.flat().filter((x) => x !== null).length, 30);
  assert.ok(g.every((w) => w.length === 7));
});
test('monthGrid: leading blanks for a month starting mid-week', () => {
  const g = monthGrid(2026, 11); // Dec 2026 starts Tuesday
  assert.deepEqual(g[0]!.slice(0, 3), [null, null, 1]);
});
test('shiftMonth wraps years', () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), { year: 2027, month0: 0 });
  assert.deepEqual(shiftMonth(2026, 0, -1), { year: 2025, month0: 11 });
  assert.equal(ymd(2026, 0, 5), '2026-01-05');
});
test('distanceKm: Bangkok to Chiang Mai is about 580 km', () => {
  const d = distanceKm({ lat: 13.7563, lng: 100.5018 }, { lat: 18.7883, lng: 98.9853 });
  assert.ok(d > 570 && d < 590, String(d));
  assert.equal(distanceKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 }), 0);
});
test('formatKm and legs', () => {
  assert.equal(formatKm(0.85), '850 ม.');
  assert.equal(formatKm(12.34), '12 กม.');
  assert.equal(formatKm(2.345), '2.3 กม.');
  const a = { lat: 13.7, lng: 100.5 }; const b = { lat: 13.8, lng: 100.5 };
  const l = legs([a, b, null, a]);
  assert.equal(l[0], null); assert.ok((l[1] as number) > 10); assert.equal(l[2], null); assert.equal(l[3], null);
});

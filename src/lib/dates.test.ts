import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addMinutes, dayKey, groupByDay, hhmm, overlaps, parseLocal } from './dates.ts';

test('parseLocal accepts valid and rejects invalid dates', () => {
  const d = parseLocal('2026-11-24', '09:30');
  assert.ok(d);
  assert.equal(dayKey(d as Date), '2026-11-24');
  assert.equal(hhmm(d as Date), '09:30');
  assert.equal(parseLocal('2026-02-30', '09:00'), null);
  assert.equal(parseLocal('2026-13-01', '09:00'), null);
  assert.equal(parseLocal('2026-11-24', '25:00'), null);
  assert.equal(parseLocal('24/11/2026', '09:00'), null);
  assert.equal(parseLocal('2026-11-24', '9:05')?.getMinutes(), 5);
});

test('overlaps is half-open: back-to-back visits do not overlap', () => {
  const a = parseLocal('2026-11-24', '09:00') as Date;
  const b = addMinutes(a, 60);
  const c = addMinutes(b, 60);
  assert.equal(overlaps(a, b, b, c), false);
  assert.equal(overlaps(a, c, b, c), true);
  assert.equal(overlaps(a, b, a, b), true);
});

test('groupByDay sorts days and items', () => {
  const mk = (s: string) => ({ starts_at: (parseLocal(s.slice(0, 10), s.slice(11)) as Date).toISOString(), s });
  const g = groupByDay([mk('2026-11-25 10:00'), mk('2026-11-24 15:00'), mk('2026-11-24 09:00')]);
  assert.deepEqual(g.map((x) => x.day), ['2026-11-24', '2026-11-25']);
  assert.deepEqual(g[0]?.items.map((i) => i.s), ['2026-11-24 09:00', '2026-11-24 15:00']);
});

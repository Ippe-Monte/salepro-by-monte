import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildNotices, signature } from './notifications.ts';

test('buildNotices keeps only non-zero alerts in a fixed order', () => {
  const n = buildNotices({ visits_today: 2, overdue_jobs: 0, invoices_overdue: 1, low_stock: 3 }, 0);
  assert.deepEqual(n.map((x) => x.key), ['visits_today', 'invoices_overdue', 'low_stock']);
  assert.equal(buildNotices(null, 5).length, 0);
  assert.equal(buildNotices({}, 1)[0]!.key, 'visits_tomorrow');
});
test('signature changes when counts change', () => {
  const a = signature(buildNotices({ visits_today: 1 }, 0));
  const b = signature(buildNotices({ visits_today: 2 }, 0));
  assert.notEqual(a, b);
  assert.equal(signature([]), '');
});

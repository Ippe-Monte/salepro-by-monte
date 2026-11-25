import assert from 'node:assert/strict';
import { test } from 'node:test';
import { growth, jobBuckets, salesByMonth, sinceOf } from './dashboard.ts';
import type { PipelineRow } from './pipeline.ts';

const now = new Date('2026-11-25T10:00:00Z');
test('sales are summed per month and cancelled invoices are ignored', () => {
  const r = salesByMonth([
    { total: 1000, issue_date: '2026-11-02', status: 'issued' }, { total: 500, issue_date: '2026-11-20', status: 'paid' },
    { total: 700, issue_date: '2026-10-05', status: 'paid' }, { total: 999, issue_date: '2026-11-07', status: 'cancelled' }, { total: 50, issue_date: '2025-01-01', status: 'paid' },
  ], now, 3);
  assert.deepEqual(r, [{ key: '2026-09', total: 0 }, { key: '2026-10', total: 700 }, { key: '2026-11', total: 1500 }]);
});
test('growth against the previous month', () => {
  assert.equal(growth(1500, 1000), 50); assert.equal(growth(500, 1000), -50); assert.equal(growth(10, 0), null);
});
const base: PipelineRow = { ticket_id: 't', quote_id: null, quote_no: null, quote_status: null, quote_total: null, do_id: null, do_no: null, do_status: null,
  dn_id: null, dn_no: null, dn_status: null, inv_id: null, inv_no: null, inv_status: null, inv_total: null, inv_due: null };
test('every ticket falls in exactly one bucket and the percentages follow the total', () => {
  const tk = [
    { id: 'a', status: 'open', created_at: '2026-11-01' }, { id: 'b', status: 'in_progress', created_at: '2026-11-02' }, { id: 'c', status: 'in_progress', created_at: '2026-11-03' },
    { id: 'd', status: 'done', created_at: '2026-11-04' }, { id: 'e', status: 'cancelled', created_at: '2026-11-05' }, { id: 'old', status: 'open', created_at: '2025-01-01' },
  ];
  const pipe = { b: { ...base, quote_id: 'q', quote_status: 'sent' }, c: { ...base, quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'ready' } };
  const b = Object.fromEntries(jobBuckets(tk, pipe, sinceOf('month', now)).map((x) => [x.key, x]));
  assert.equal(b.new.count, 1); assert.equal(b.quote.count, 1); assert.equal(b.do.count, 1); assert.equal(b.done.count, 1); assert.equal(b.cancelled.count, 1);
  assert.equal(b.new.pct, 20);
  assert.equal(Object.values(b).reduce((a, x) => a + x.count, 0), 5);
  assert.equal(jobBuckets(tk, pipe, null).reduce((a, x) => a + x.count, 0), 6);
});

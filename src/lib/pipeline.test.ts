import assert from 'node:assert/strict';
import { test } from 'node:test';
import { nextAction, stepOf, subOf, summarize, type PipelineRow } from './pipeline.ts';

const base: PipelineRow = { ticket_id: 't', quote_id: null, quote_no: null, quote_status: null, quote_total: null, do_id: null, do_no: null, do_status: null,
  dn_id: null, dn_no: null, dn_status: null, inv_id: null, inv_no: null, inv_status: null, inv_total: null, inv_due: null };
const row = (o: Partial<PipelineRow>): PipelineRow => ({ ...base, ...o });

test('a job without documents is at step 1 and the next move is a quotation', () => {
  assert.equal(subOf(undefined), 'open');
  assert.equal(subOf(base), 'open');
  assert.deepEqual(nextAction(base), { kind: 'make_quote' });
});
test('each document moves the job one step on', () => {
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'draft' })), 'quote_draft');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'sent' })), 'quote_sent');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted' })), 'quote_ok');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'ready' })), 'do_prep');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'dispatched' })), 'do_ship');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'delivered', dn_id: 'n', dn_status: 'issued' })), 'dn_wait');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'delivered', dn_id: 'n', dn_status: 'received' })), 'dn_done');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', inv_id: 'i', inv_status: 'issued' })), 'inv_wait');
  assert.equal(subOf(row({ quote_id: 'q', quote_status: 'accepted', inv_id: 'i', inv_status: 'paid' })), 'inv_paid');
});
test('step numbers follow the five-step order', () => {
  assert.deepEqual((['open', 'quote_sent', 'do_ship', 'dn_done', 'inv_paid'] as const).map(stepOf), [1, 2, 3, 4, 5]);
});
test('next action tells what to do next', () => {
  assert.deepEqual(nextAction(row({ quote_id: 'q', quote_status: 'accepted' })), { kind: 'make_do', quoteId: 'q' });
  assert.deepEqual(nextAction(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'delivered' })), { kind: 'make_dn', doId: 'd' });
  assert.deepEqual(nextAction(row({ quote_id: 'q', quote_status: 'accepted', do_id: 'd', do_status: 'dispatched' })), { kind: 'open_do' });
  assert.deepEqual(nextAction(row({ quote_id: 'q', quote_status: 'accepted', dn_id: 'n', dn_status: 'received', do_id: 'd', do_status: 'delivered' })), { kind: 'make_invoice', quoteId: 'q' });
  assert.equal(nextAction(row({ quote_id: 'q', quote_status: 'accepted', inv_id: 'i', inv_status: 'paid' })), null);
});
test('summary counts jobs per sub-status', () => {
  const s = summarize([{ sub: 'open' }, { sub: 'open' }, { sub: 'quote_sent' }]);
  assert.equal(s.open, 2); assert.equal(s.quote_sent, 1); assert.equal(s.inv_paid, 0);
});

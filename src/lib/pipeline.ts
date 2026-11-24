/** Job-ticket process flow: 1 Job -> 2 quotation -> 3 DO -> 4 delivery note -> 5 invoice. */
export type PipelineRow = {
  ticket_id: string;
  quote_id: string | null; quote_no: string | null; quote_status: string | null; quote_total: number | null;
  do_id: string | null; do_no: string | null; do_status: string | null;
  dn_id: string | null; dn_no: string | null; dn_status: string | null;
  inv_id: string | null; inv_no: string | null; inv_status: string | null; inv_total: number | null; inv_due: string | null;
};

export type Sub =
  | 'open' | 'quote_draft' | 'quote_sent' | 'quote_ok' | 'do_prep' | 'do_ship' | 'dn_wait' | 'dn_done' | 'inv_wait' | 'inv_paid';

export const STEPS = [
  { n: 1, label: 'รับงาน', subs: ['open'] },
  { n: 2, label: 'ใบเสนอราคา', subs: ['quote_draft', 'quote_sent', 'quote_ok'] },
  { n: 3, label: 'DO', subs: ['do_prep', 'do_ship'] },
  { n: 4, label: 'ใบส่งของ', subs: ['dn_wait', 'dn_done'] },
  { n: 5, label: 'Invoice', subs: ['inv_wait', 'inv_paid'] },
] as const;

export const SUB_LABEL: Record<Sub, string> = {
  open: 'รับงานแล้ว รอออกใบเสนอราคา',
  quote_draft: 'ใบเสนอราคาเป็นร่าง',
  quote_sent: 'ส่งใบเสนอราคาแล้ว รอลูกค้าตอบ',
  quote_ok: 'ลูกค้าตกลง รอออก DO',
  do_prep: 'DO เตรียมของ/รอจัดส่ง',
  do_ship: 'DO ออกจัดส่งแล้ว รอใบส่งของ',
  dn_wait: 'ออกใบส่งของแล้ว รอลูกค้าเซ็นรับ',
  dn_done: 'ลูกค้ารับของแล้ว รอออก Invoice',
  inv_wait: 'ออก Invoice แล้ว รอชำระเงิน',
  inv_paid: 'ชำระเงินแล้ว',
};

/** Where a job is in the flow, from the latest live document of each step. */
export function subOf(p: PipelineRow | undefined | null): Sub {
  if (!p) return 'open';
  if (p.inv_status === 'paid') return 'inv_paid';
  if (p.inv_status === 'issued') return 'inv_wait';
  if (p.dn_status === 'received') return 'dn_done';
  if (p.dn_status === 'issued') return 'dn_wait';
  if (p.do_status === 'dispatched' || p.do_status === 'delivered') return 'do_ship';
  if (p.do_status) return 'do_prep';
  if (p.quote_status === 'accepted') return 'quote_ok';
  if (p.quote_status === 'sent') return 'quote_sent';
  if (p.quote_status === 'draft') return 'quote_draft';
  return 'open';
}

export function stepOf(sub: Sub): number {
  return STEPS.find((s) => (s.subs as readonly string[]).includes(sub))?.n ?? 1;
}

/** What the person should do next on this job (null when nothing is left to do). */
export type Next =
  | { kind: 'make_quote' } | { kind: 'open_quote'; id: string } | { kind: 'make_do'; quoteId: string } | { kind: 'open_do' }
  | { kind: 'make_dn'; doId: string } | { kind: 'open_dn'; id: string } | { kind: 'make_invoice'; quoteId: string } | { kind: 'open_invoice'; id: string }
  | { kind: 'wait_receipt' } | null;

export function nextAction(p: PipelineRow | undefined | null): Next {
  const sub = subOf(p);
  if (!p || sub === 'open') return { kind: 'make_quote' };
  if (sub === 'quote_draft' || sub === 'quote_sent') return { kind: 'open_quote', id: p.quote_id as string };
  if (sub === 'quote_ok') return { kind: 'make_do', quoteId: p.quote_id as string };
  if (sub === 'do_prep') return { kind: 'open_do' };
  if (sub === 'do_ship') return p.do_status === 'delivered' ? { kind: 'make_dn', doId: p.do_id as string } : { kind: 'open_do' };
  if (sub === 'dn_wait') return { kind: 'open_dn', id: p.dn_id as string };
  if (sub === 'dn_done') return { kind: 'make_invoice', quoteId: p.quote_id as string };
  if (sub === 'inv_wait') return { kind: 'open_invoice', id: p.inv_id as string };
  return null;
}

/** Counts of open jobs per sub-status, for the summary strip. */
export function summarize(rows: { sub: Sub }[]): Record<Sub, number> {
  const out = { open: 0, quote_draft: 0, quote_sent: 0, quote_ok: 0, do_prep: 0, do_ship: 0, dn_wait: 0, dn_done: 0, inv_wait: 0, inv_paid: 0 } as Record<Sub, number>;
  for (const r of rows) out[r.sub] += 1;
  return out;
}

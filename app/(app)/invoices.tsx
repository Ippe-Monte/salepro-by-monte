import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { dayKey } from '@/lib/dates';
import { loadDocContext, loadThumbs, defaultSettings, type DocContext, type Img } from '@/lib/docmeta';
import { friendly } from '@/lib/errors';
import { baht } from '@/lib/money';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { DocPaper, printPaper } from '@/ui/DocPaper';
import { dateLocale } from '@/i18n';

type Inv = {
  id: string; doc_no: string; quotation_id: string; customer_id: string; address_id: string | null; status: 'issued' | 'paid' | 'cancelled'; issue_date: string; credit_days: number;
  due_date: string; discount: number; vat_rate: number; subtotal: number; vat_amount: number; total: number; note: string | null; paid_at: string | null; pay_note: string | null; cancel_reason: string | null;
};
type It = { id: string; invoice_id: string; product_id: string | null; line_no: number; description: string; qty: number; unit: string; unit_price: number; line_total: number };
type C = { id: string; name: string; tax_id: string | null; phone: string | null };
type A = { id: string; address_line: string; subdistrict: string | null; district: string | null; province: string | null; postal_code: string | null };
type Q = { id: string; doc_no: string; customer_id: string };
type P = { id: string; sku: string };

const STATUS = { issued: 'รอชำระ', paid: 'ชำระแล้ว', cancelled: 'ยกเลิก' } as const;
const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');
const addr = (a?: A) => (a ? [a.address_line, a.subdistrict, a.district, a.province, a.postal_code].filter(Boolean).join(' ') : '');

export default function Invoices() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const org = current?.org;
  const editable = canEdit('invoices', current?.role);
  const [rows, setRows] = useState<Inv[]>([]);
  const [items, setItems] = useState<It[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [addrs, setAddrs] = useState<A[]>([]);
  const [quotes, setQuotes] = useState<Q[]>([]);
  const [prods, setProds] = useState<P[]>([]);
  const [ctx, setCtx] = useState<DocContext>({ settings: defaultSettings('invoice'), branding: null, logo: null });
  const [thumbs, setThumbs] = useState<Record<string, Img>>({});
  const [filter, setFilter] = useState<'all' | Inv['status']>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [pickQ, setPickQ] = useState('');
  const [text, setText] = useState({ note: '', pay: '', reason: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const today = dayKey(new Date());

  const load = useCallback(async () => {
    if (!orgId) return;
    const [iv, it, c, a, q, p, x] = await Promise.all([
      neon.from('invoices').select('*').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('invoice_items').select('id,invoice_id,product_id,line_no,description,qty,unit,unit_price,line_total').eq('org_id', orgId).order('line_no'),
      neon.from('customers').select('id,name,tax_id,phone').eq('org_id', orgId),
      neon.from('customer_addresses').select('id,address_line,subdistrict,district,province,postal_code').eq('org_id', orgId),
      neon.from('quotations').select('id,doc_no,customer_id').eq('org_id', orgId).eq('status', 'accepted'),
      neon.from('products').select('id,sku').eq('org_id', orgId),
      loadDocContext(orgId, 'invoice'),
    ]);
    if ([iv, it, c, a, q, p].some((r) => r.error)) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null);
    setRows(iv.data as Inv[]); setItems(it.data as It[]); setCusts(c.data as C[]); setAddrs(a.data as A[]); setQuotes(q.data as Q[]); setProds(p.data as P[]); setCtx(x);
    if (x.settings.col_image) setThumbs(await loadThumbs(orgId, (it.data as It[]).map((r) => r.product_id ?? '')));
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const billable = quotes.filter((q) => !rows.some((r) => r.quotation_id === q.id && r.status !== 'cancelled'));
  const shown = useMemo(() => rows.filter((r) => filter === 'all' || r.status === filter), [rows, filter]);
  const unpaid = rows.filter((r) => r.status === 'issued');
  const overdue = unpaid.filter((r) => r.due_date < today);
  const custOf = (id: string) => custs.find((c) => c.id === id);

  async function act(fn: string, args: Record<string, unknown>, after?: () => void) {
    if (busy) return;
    setBusy(true);
    const { error } = await neon.rpc(fn, args);
    setBusy(false);
    if (error) return setErr(friendly(error));
    setErr(null); after?.(); await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>อินวอยซ์</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <Card><Body tone="muted">ค้างชำระ</Body><Body>{baht(unpaid.reduce((s, r) => s + r.total, 0))} บาท</Body></Card>
          <Card><Body tone="muted">เกินกำหนด</Body><Body tone={overdue.length ? 'danger' : undefined}>{overdue.length} ใบ</Body></Card>
        </View>
        {editable ? (
          <Card>
            <Body>ออกอินวอยซ์จากใบเสนอราคาที่ลูกค้าตกลง</Body>
            {billable.length === 0 ? <Body tone="muted">ไม่มีใบเสนอราคาที่รอออกอินวอยซ์</Body> : (
              <>
                <Chips value={pickQ} onPick={setPickQ} options={billable.map((q) => ({ v: q.id, label: `${q.doc_no} · ${custOf(q.customer_id)?.name ?? ''}` }))} />
                <Field label="หมายเหตุ (ถ้ามี)" value={text.note} onChangeText={(v) => setText({ ...text, note: v })} />
                <Button title="ออกอินวอยซ์" busy={busy} onPress={() => pickQ ? void act('issue_invoice', { p_quotation: pickQ, p_note: text.note.trim() || null }, () => { setPickQ(''); setText({ ...text, note: '' }); }) : setErr('เลือกใบเสนอราคาก่อน')} />
              </>
            )}
          </Card>
        ) : null}
        <Chips value={filter} onPick={setFilter} options={[{ v: 'all', label: 'ทั้งหมด' }, { v: 'issued', label: 'รอชำระ' }, { v: 'paid', label: 'ชำระแล้ว' }, { v: 'cancelled', label: 'ยกเลิก' }]} />
        {shown.length === 0 ? <Empty>ยังไม่มีอินวอยซ์</Empty> : null}
        {shown.map((r) => {
          const c = custOf(r.customer_id);
          const open = sel === r.id;
          const late = r.status === 'issued' && r.due_date < today;
          return (
            <Card key={r.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body>{r.doc_no}</Body>
                <Pill text={late ? 'เกินกำหนด' : STATUS[r.status]} tone={r.status === 'paid' ? 'ok' : r.status === 'cancelled' ? 'muted' : late ? 'danger' : 'warn'} />
              </View>
              <Body tone="muted">{c?.name} · ครบกำหนด {fmt(r.due_date)}</Body>
              <Body>{baht(r.total)} บาท</Body>
              <Button title={open ? 'ซ่อนเอกสาร' : 'เปิดเอกสาร'} variant="ghost" onPress={() => setSel(open ? null : r.id)} />
              {open && org ? (
                <View>
                  <DocPaper
                    ctx={ctx} org={org} docNo={r.doc_no} date={fmt(r.issue_date)}
                    party={{ label: 'ลูกค้า', name: c?.name ?? '', lines: [addr(addrs.find((a) => a.id === r.address_id)), c?.tax_id ? `เลขผู้เสียภาษี ${c.tax_id}` : ''].filter(Boolean) }}
                    meta={[['ครบกำหนดชำระ', fmt(r.due_date)], ['เครดิต', `${r.credit_days} วัน`]]}
                    items={items.filter((x) => x.invoice_id === r.id).map((x) => ({ code: prods.find((p) => p.id === x.product_id)?.sku, desc: x.description, qty: x.qty, unit: x.unit, price: x.unit_price, total: x.line_total, image: x.product_id ? thumbs[x.product_id] : null }))}
                    totals={{ subtotal: r.subtotal, discount: r.discount, vat: r.vat_amount, vatRate: r.vat_rate, total: r.total }}
                    note={r.note}
                    extra={r.status === 'paid' ? [`ชำระแล้วเมื่อ ${fmt(r.paid_at)}${r.pay_note ? ` — ${r.pay_note}` : ''}`] : r.status === 'cancelled' ? [`ยกเลิก${r.cancel_reason ? `: ${r.cancel_reason}` : ''}`] : undefined}
                  />
                  <Button title="พิมพ์ / บันทึกเป็น PDF" variant="ghost" onPress={printPaper} />
                  {editable && r.status === 'issued' ? (
                    <View>
                      <Field label="หมายเหตุการชำระ (เช่น โอนเข้าบัญชี)" value={text.pay} onChangeText={(v) => setText({ ...text, pay: v })} />
                      <Button title="บันทึกว่าชำระแล้ว" busy={busy} onPress={() => void act('mark_invoice_paid', { p_invoice: r.id, p_note: text.pay.trim() || null }, () => setText({ ...text, pay: '' }))} />
                      <Field label="เหตุผลที่ยกเลิก" value={text.reason} onChangeText={(v) => setText({ ...text, reason: v })} />
                      <Button title="ยกเลิกอินวอยซ์" variant="danger" busy={busy} onPress={() => void act('cancel_invoice', { p_invoice: r.id, p_reason: text.reason.trim() || null }, () => setText({ ...text, reason: '' }))} />
                    </View>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

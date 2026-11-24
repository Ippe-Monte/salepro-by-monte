import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { baht, parseNonNegative, totals } from '@/lib/money';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { DocPaper, printPaper } from '@/ui/DocPaper';
import { defaultSettings, loadDocContext, type DocContext } from '@/lib/docmeta';
import { colors } from '@/ui/theme';
import { SegTabs } from '@/ui/SegTabs';

type Q = { id: string; doc_no: string; customer_id: string; status: string; valid_until: string | null; discount: number; vat_rate: number; subtotal: number; vat_amount: number; total: number; note: string | null };
type It = { id: string; line_no: number; description: string; qty: number; unit: string; unit_price: number; line_total: number };
type C = { id: string; name: string };
type P = { id: string; sku: string; name: string; unit: string; price: number };

const STATUS: Record<string, string> = { draft: 'ร่าง', sent: 'ส่งแล้ว', accepted: 'ลูกค้าตกลง', rejected: 'ลูกค้าปฏิเสธ', expired: 'หมดอายุ', cancelled: 'ยกเลิก' };
const NEXT: Record<string, string[]> = { draft: ['sent', 'cancelled'], sent: ['accepted', 'rejected', 'expired', 'cancelled'], accepted: [], rejected: [], expired: [], cancelled: [] };
const tone = (s: string) => (s === 'accepted' ? 'ok' : s === 'rejected' || s === 'cancelled' || s === 'expired' ? 'danger' : s === 'sent' ? 'warn' : 'muted') as 'ok' | 'danger' | 'warn' | 'muted';

export default function Quotes() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const org = current?.org;
  const [ctx, setCtx] = useState<DocContext>({ settings: defaultSettings('quote'), branding: null, logo: null });
  useEffect(() => { if (orgId) void loadDocContext(orgId, 'quote').then(setCtx); }, [orgId]);
  const editable = canEdit('quotes', current?.role);
  const [rows, setRows] = useState<Q[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [prods, setProds] = useState<P[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [items, setItems] = useState<It[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [newCust, setNewCust] = useState('');
  const [it, setIt] = useState({ desc: '', qty: '1', unit: 'ชิ้น', price: '', product: '' });
  const [hdr, setHdr] = useState({ discount: '', vat: '', valid: '' });
  const [pq, setPq] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    const [q, c, p] = await Promise.all([
      neon.from('quotations').select('id,doc_no,customer_id,status,valid_until,discount,vat_rate,subtotal,vat_amount,total,note').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('customers').select('id,name').eq('org_id', orgId).is('archived_at', null).order('name'),
      neon.from('products').select('id,sku,name,unit,price').eq('org_id', orgId).is('archived_at', null).order('name'),
    ]);
    if (q.error || c.error || p.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setRows(q.data as Q[]); setCusts(c.data as C[]); setProds(p.data as P[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function loadItems(id: string) {
    const { data } = await neon.from('quotation_items').select('id,line_no,description,qty,unit,unit_price,line_total').eq('quotation_id', id).order('line_no');
    setItems((data ?? []) as It[]);
  }
  async function open(q: Q) {
    if (sel === q.id) return setSel(null);
    setSel(q.id); setHdr({ discount: String(q.discount), vat: String(q.vat_rate), valid: q.valid_until ?? '' }); await loadItems(q.id);
  }

  async function create() {
    if (!orgId || !newCust) return setErr('เลือกลูกค้า');
    const { data, error } = await neon.from('quotations').insert({ org_id: orgId, customer_id: newCust }).select('id').single();
    if (error) return setErr(friendly(error));
    setErr(null); setNewCust(''); await load(); if (data) { setSel(data.id); setHdr({ discount: '0', vat: '7', valid: '' }); setItems([]); }
  }

  async function addItem(q: Q) {
    if (!orgId) return;
    const qty = parseNonNegative(it.qty); const price = parseNonNegative(it.price);
    if (!it.desc.trim()) return setErr('กรอกรายการสินค้า');
    if (qty === null || qty <= 0) return setErr('จำนวนต้องมากกว่า 0');
    if (price === null) return setErr('ราคาต้องเป็นตัวเลขไม่ติดลบ');
    const { error } = await neon.from('quotation_items').insert({ org_id: orgId, quotation_id: q.id, product_id: it.product || null, line_no: items.length + 1, description: it.desc.trim(), qty, unit: it.unit.trim() || 'ชิ้น', unit_price: price });
    if (error) return setErr(friendly(error));
    setIt({ desc: '', qty: '1', unit: 'ชิ้น', price: '', product: '' }); setErr(null); await loadItems(q.id); await load();
  }
  async function delItem(q: Q, id: string) {
    const { error } = await neon.from('quotation_items').delete().eq('id', id);
    if (error) return setErr(friendly(error));
    await loadItems(q.id); await load();
  }
  async function saveHeader(q: Q) {
    const discount = parseNonNegative(hdr.discount) ?? 0; const vat = parseNonNegative(hdr.vat);
    if (vat === null || vat > 100) return setErr('VAT ต้องอยู่ระหว่าง 0-100');
    if (hdr.valid && !/^\d{4}-\d{2}-\d{2}$/.test(hdr.valid)) return setErr('วันหมดอายุต้องเป็นรูปแบบ ปปปป-ดด-วว');
    const { error } = await neon.from('quotations').update({ discount, vat_rate: vat, valid_until: hdr.valid || null }).eq('id', q.id);
    if (error) return setErr(friendly(error));
    setErr(null); await load();
  }
  async function move(q: Q, status: string) {
    const { error } = await neon.from('quotations').update({ status }).eq('id', q.id);
    if (error) return setErr(friendly(error));
    setErr(null); await load();
  }

  const pick = prods.filter((p) => pq.trim() && (p.name.toLowerCase().includes(pq.trim().toLowerCase()) || p.sku.toLowerCase().includes(pq.trim().toLowerCase()))).slice(0, 6);
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <SegTabs tabs={[{ href: '/quotes', label: 'ใบเสนอราคา' }, { href: '/invoices', label: 'อินวอยซ์' }]} active="/quotes" />
        <Title>ใบเสนอราคา</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        {editable ? (
          <Card>
            <Body>สร้างใบเสนอราคาใหม่ — เลือกลูกค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {custs.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setNewCust(c.id)}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: newCust === c.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <Button title="สร้างใบเสนอราคา" onPress={create} />
          </Card>
        ) : null}
        {rows.length === 0 ? <Empty>ยังไม่มีใบเสนอราคา</Empty> : null}
        {rows.map((q) => {
          const live = sel === q.id && q.status === 'draft' ? totals(items.map((i) => ({ qty: i.qty, unit_price: i.unit_price })), parseNonNegative(hdr.discount) ?? 0, parseNonNegative(hdr.vat) ?? 0) : null;
          return (
            <Card key={q.id}>
              <Pressable accessibilityRole="button" onPress={() => void open(q)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{q.doc_no} · {custs.find((c) => c.id === q.customer_id)?.name ?? '-'}</Text>
                <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginTop: 4 }}>
                  <Pill text={STATUS[q.status] ?? q.status} tone={tone(q.status)} />
                  <Body tone="muted">รวม {baht(q.total)} บาท</Body>
                </View>
              </Pressable>
              {sel === q.id ? (
                <View style={{ marginTop: 10 }}>
                  {items.map((i) => (
                    <View key={i.id} style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingVertical: 4 }}>
                      <Body>{i.line_no}. {i.description} × {i.qty} {i.unit} @ {baht(i.unit_price)}</Body>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Body>{baht(i.line_total)}</Body>
                        {editable && q.status === 'draft' ? <Pressable accessibilityRole="button" onPress={() => void delItem(q, i.id)}><Text style={{ color: colors.danger }}>ลบ</Text></Pressable> : null}
                      </View>
                    </View>
                  ))}
                  {items.length === 0 ? <Body tone="muted">ยังไม่มีรายการ</Body> : null}
                  <View style={{ borderTopColor: colors.border, borderTopWidth: 1, marginTop: 8, paddingTop: 8 }}>
                    <Body tone="muted">ยอดรวม {baht(live?.subtotal ?? q.subtotal)} · ส่วนลด {baht(q.discount)} · VAT {q.vat_rate}% {baht(live?.vat ?? q.vat_amount)}</Body>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>รวมสุทธิ {baht(live?.total ?? q.total)} บาท</Text>
                  </View>
                  {editable && q.status === 'draft' ? (
                    <View style={{ marginTop: 10 }}>
                      <Field label="ค้นหาสินค้าเพื่อเติมรายการ" value={pq} onChangeText={setPq} />
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {pick.map((p) => (
                          <Pressable key={p.id} accessibilityRole="button" onPress={() => { setIt({ desc: p.name, qty: it.qty || '1', unit: p.unit, price: String(p.price), product: p.id }); setPq(''); }}
                            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.accent }}>
                            <Text style={{ color: colors.accent }}>{p.sku} {p.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Field label="รายการ" value={it.desc} onChangeText={(v) => setIt({ ...it, desc: v, product: '' })} />
                      <Field label="จำนวน" value={it.qty} onChangeText={(v) => setIt({ ...it, qty: v })} keyboardType="decimal-pad" />
                      <Field label="หน่วย" value={it.unit} onChangeText={(v) => setIt({ ...it, unit: v })} />
                      <Field label="ราคาต่อหน่วย" value={it.price} onChangeText={(v) => setIt({ ...it, price: v })} keyboardType="decimal-pad" />
                      <Button title="เพิ่มรายการ" variant="ghost" onPress={() => addItem(q)} />
                      <Field label="ส่วนลด (บาท)" value={hdr.discount} onChangeText={(v) => setHdr({ ...hdr, discount: v })} keyboardType="decimal-pad" />
                      <Field label="VAT %" value={hdr.vat} onChangeText={(v) => setHdr({ ...hdr, vat: v })} keyboardType="decimal-pad" />
                      <Field label="ใช้ได้ถึง (ปปปป-ดด-วว)" value={hdr.valid} onChangeText={(v) => setHdr({ ...hdr, valid: v })} />
                      <Button title="บันทึกส่วนลด/VAT" variant="ghost" onPress={() => saveHeader(q)} />
                    </View>
                  ) : null}
                  {editable && (NEXT[q.status] ?? []).length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                      {(NEXT[q.status] ?? []).map((s) => (
                        <Pressable key={s} accessibilityRole="button" onPress={() => void move(q, s)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: s === 'cancelled' ? colors.danger : colors.accent }}>
                          <Text style={{ color: s === 'cancelled' ? colors.danger : colors.accent }}>{s === 'sent' ? 'ส่งให้ลูกค้า' : `→ ${STATUS[s]}`}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {org ? (
                    <>
                      <DocPaper
                        ctx={ctx} org={org} docNo={q.doc_no} date={new Date().toLocaleDateString('th-TH')}
                        party={{ label: 'ลูกค้า', name: custs.find((c) => c.id === q.customer_id)?.name ?? '', lines: [] }}
                        meta={q.valid_until ? [['ยืนราคาถึง', q.valid_until]] : ctx.settings.validity_days ? [['ยืนราคา', `${ctx.settings.validity_days} วัน`]] : []}
                        items={items.map((x) => ({ desc: x.description, qty: x.qty, unit: x.unit, price: x.unit_price, total: x.line_total }))}
                        totals={{ subtotal: q.subtotal, discount: q.discount, vat: q.vat_amount, vatRate: q.vat_rate, total: q.total }}
                        note={q.note}
                      />
                      <Button title="พิมพ์ / บันทึกเป็น PDF" variant="ghost" onPress={printPaper} />
                    </>
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

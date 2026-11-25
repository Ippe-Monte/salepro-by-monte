import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { dayKey } from '@/lib/dates';
import { friendly } from '@/lib/errors';
import { directionsLink, mapsLink, nearestOrder, type Coords } from '@/lib/geo';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type D = {
  id: string; doc_no: string; quotation_id: string | null; customer_id: string; zone_id: string | null; status: string; planned_date: string | null; driver: string | null; vehicle: string | null;
  route_seq: number | null; ship_address: string | null; ship_lat: number | null; ship_lng: number | null; contact_name: string | null; contact_phone: string | null;
};
type It = { id: string; order_id: string; description: string; qty: number; unit: string };
type C = { id: string; name: string };
type A = { id: string; customer_id: string; is_default: boolean; label: string };
type Z = { id: string; code: string; name: string };
type P = { id: string; sku: string; name: string; unit: string };
type Q = { id: string; doc_no: string; customer_id: string; status: string };

const STATUS: Record<string, string> = { draft: 'ร่าง', ready: 'พร้อมส่ง (จองสต็อกแล้ว)', dispatched: 'ออกจัดส่ง', delivered: 'ส่งสำเร็จ', cancelled: 'ยกเลิก' };
const tone = (s: string) => (s === 'delivered' ? 'ok' : s === 'cancelled' ? 'danger' : s === 'dispatched' ? 'warn' : 'muted') as 'ok' | 'danger' | 'warn' | 'muted';
const pt = (d: D): Coords | null => (d.ship_lat !== null && d.ship_lng !== null ? { lat: d.ship_lat, lng: d.ship_lng } : null);

export default function Delivery() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('delivery', current?.role);
  const [rows, setRows] = useState<D[]>([]);
  const [items, setItems] = useState<It[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [addrs, setAddrs] = useState<A[]>([]);
  const [zones, setZones] = useState<Z[]>([]);
  const [prods, setProds] = useState<P[]>([]);
  const [quotes, setQuotes] = useState<Q[]>([]);
  const [date, setDate] = useState(dayKey(new Date()));
  const { quote: quoteParam } = useLocalSearchParams<{ quote?: string }>();
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ customer: '', zone: '', product: '', qty: '1' });
  const [draftItems, setDraftItems] = useState<{ product_id: string; description: string; qty: number; unit: string }[]>([]);
  const [edit, setEdit] = useState<Record<string, { driver: string; vehicle: string }>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    const [d, i, c, a, z, p, q] = await Promise.all([
      neon.from('delivery_orders').select('id,doc_no,quotation_id,customer_id,zone_id,status,planned_date,driver,vehicle,route_seq,ship_address,ship_lat,ship_lng,contact_name,contact_phone').eq('org_id', orgId).order('route_seq', { nullsFirst: false }),
      neon.from('delivery_order_items').select('id,order_id,description,qty,unit').eq('org_id', orgId),
      neon.from('customers').select('id,name').eq('org_id', orgId).is('archived_at', null).order('name'),
      neon.from('customer_addresses').select('id,customer_id,is_default,label').eq('org_id', orgId),
      neon.from('delivery_zones').select('id,code,name').eq('org_id', orgId).order('code'),
      neon.from('products').select('id,sku,name,unit').eq('org_id', orgId).is('archived_at', null).order('name'),
      neon.from('quotations').select('id,doc_no,customer_id,status').eq('org_id', orgId).eq('status', 'accepted'),
    ]);
    if ([d, i, c, a, z, p, q].some((r) => r.error)) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null);
    setRows(d.data as D[]); setItems(i.data as It[]); setCusts(c.data as C[]); setAddrs(a.data as A[]); setZones(z.data as Z[]); setProds(p.data as P[]); setQuotes(q.data as Q[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function createDO(fromQuote?: Q) {
    if (!orgId) return;
    const customer = fromQuote?.customer_id ?? f.customer;
    if (!customer) return setErr('เลือกลูกค้า');
    const list = addrs.filter((a) => a.customer_id === customer);
    const addr = list.find((a) => a.is_default) ?? list[0];
    if (!addr) return setErr('ลูกค้านี้ยังไม่มีที่อยู่ — เพิ่มที่อยู่ในเมนูลูกค้าก่อน');
    let lines = draftItems;
    if (fromQuote) {
      const { data, error } = await neon.from('quotation_items').select('product_id,description,qty,unit').eq('quotation_id', fromQuote.id);
      if (error) return setErr(friendly(error));
      const all = (data ?? []) as { product_id: string | null; description: string; qty: number; unit: string }[];
      const withProduct = all.filter((x) => x.product_id);
      if (withProduct.length < all.length) setErr(`ข้าม ${all.length - withProduct.length} รายการที่ไม่ได้ผูกกับสินค้า (ตัดสต็อกไม่ได้)`);
      lines = withProduct.map((x) => ({ product_id: x.product_id as string, description: x.description, qty: x.qty, unit: x.unit }));
    }
    if (lines.length === 0) return setErr('เพิ่มรายการสินค้าอย่างน้อย 1 รายการ');
    const { data, error } = await neon.from('delivery_orders').insert({ org_id: orgId, customer_id: customer, address_id: addr.id, quotation_id: fromQuote?.id ?? null, zone_id: f.zone || null, planned_date: date }).select('id').single();
    if (error || !data) return setErr(friendly(error));
    const { error: e2 } = await neon.from('delivery_order_items').insert(lines.map((l) => ({ org_id: orgId, order_id: data.id, ...l })));
    if (e2) return setErr(friendly(e2));
    // Issuing a DO reserves the stock straight away.
    const { error: e3 } = await neon.rpc('mark_do_ready', { p_do: data.id });
    if (e3) { setDraftItems([]); await load(); return setErr(`${friendly(e3)} — DO ถูกสร้างเป็นร่างแล้ว กดพร้อมส่งอีกครั้งเมื่อมีของ`); }
    setDraftItems([]); if (!fromQuote) setErr(null); await load();
  }

  async function act(fn: string, id: string) {
    const { error } = await neon.rpc(fn, { p_do: id });
    if (error) return setErr(friendly(error));
    setErr(null); await load();
  }
  async function savePlan(d: D) {
    const e = edit[d.id]; if (!e) return;
    const { error } = await neon.from('delivery_orders').update({ driver: e.driver.trim() || null, vehicle: e.vehicle.trim() || null }).eq('id', d.id);
    if (error) return setErr(friendly(error)); setErr(null); await load();
  }
  async function autoOrder(list: D[]) {
    const ordered = nearestOrder(null, list.map((d) => ({ d, coords: pt(d) })));
    for (let n = 0; n < ordered.length; n++) {
      const row = ordered[n]; if (!row) continue;
      const { error } = await neon.from('delivery_orders').update({ route_seq: n + 1 }).eq('id', row.d.id);
      if (error) return setErr(friendly(error));
    }
    setErr(null); await load();
  }

  const waiting = quotes.filter((q) => !rows.some((d) => d.quotation_id === q.id && d.status !== 'cancelled'));
  const fromJob = quoteParam ? waiting.find((q) => q.id === String(quoteParam)) : undefined;

  const plan = useMemo(() => {
    const day = rows.filter((r) => r.planned_date === date && r.status !== 'cancelled');
    const byZone = new Map<string, D[]>();
    for (const r of day) byZone.set(r.zone_id ?? '', [...(byZone.get(r.zone_id ?? '') ?? []), r]);
    return [...byZone.entries()].map(([zid, list]) => ({ zone: zones.find((z) => z.id === zid), list: [...list].sort((a, b) => (a.route_seq ?? 9999) - (b.route_seq ?? 9999)) }));
  }, [rows, date, zones]);

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ใบส่งของ (DO) และแผนจัดส่ง</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Field label="วันที่จัดส่ง (ปปปป-ดด-วว)" value={date} onChangeText={setDate} />
        {editable && fromJob ? (
          <Card>
            <Body>ออก DO จาก Job Ticket → ใบเสนอราคา {fromJob.doc_no}</Body>
            <Body tone="muted">{custs.find((c) => c.id === fromJob.customer_id)?.name ?? ''} · วันที่จัดส่ง {date}</Body>
            <Button title="สร้าง DO จากใบเสนอราคานี้" onPress={() => createDO(fromJob)} />
          </Card>
        ) : null}
        {editable ? (
          <Card>
            <Body>สร้าง DO</Body>
            {waiting.length > 0 ? (
              <View style={{ marginBottom: 8 }}>
                <Body tone="muted">จากใบเสนอราคาที่ลูกค้าตกลง</Body>
                {waiting.map((q) => <Button key={q.id} title={`${q.doc_no} · ${custs.find((c) => c.id === q.customer_id)?.name ?? ''}`} variant="ghost" onPress={() => createDO(q)} />)}
              </View>
            ) : null}
            <Body tone="muted">หรือสร้างเอง — ลูกค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {custs.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setF({ ...f, customer: c.id })}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: f.customer === c.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <Body tone="muted">โซน (ถ้าไม่เลือก ใช้โซนของที่อยู่ลูกค้า)</Body>
            <Chips value={f.zone} options={[{ v: '', label: 'อัตโนมัติ' }, ...zones.map((z) => ({ v: z.id, label: z.name }))]} onPick={(v) => setF({ ...f, zone: v })} />
            <Body tone="muted">สินค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {prods.map((p) => (
                <Pressable key={p.id} accessibilityRole="button" onPress={() => setF({ ...f, product: p.id })}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: f.product === p.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{p.sku}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="จำนวน" value={f.qty} onChangeText={(v) => setF({ ...f, qty: v })} keyboardType="decimal-pad" />
            <Button title="เพิ่มรายการ" variant="ghost" onPress={() => {
              const p = prods.find((x) => x.id === f.product); const n = Number(f.qty);
              if (!p) return setErr('เลือกสินค้า'); if (!Number.isFinite(n) || n <= 0) return setErr('จำนวนต้องมากกว่า 0');
              setDraftItems([...draftItems, { product_id: p.id, description: p.name, qty: n, unit: p.unit }]); setErr(null);
            }} />
            {draftItems.map((l, n) => <Body key={n} tone="muted">{l.description} × {l.qty} {l.unit}</Body>)}
            <Button title="สร้าง DO" onPress={() => createDO()} />
          </Card>
        ) : null}

        {plan.length === 0 ? <Empty>ไม่มี DO ที่วางแผนไว้ในวันที่นี้</Empty> : null}
        {plan.map(({ zone, list }) => (
          <View key={zone?.id ?? 'none'}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
              <Text style={{ color: colors.accent, fontWeight: '700' }}>{zone ? `โซน ${zone.code} · ${zone.name}` : 'ยังไม่ระบุโซน'} ({list.length} จุด)</Text>
              {editable ? <Pressable accessibilityRole="button" onPress={() => void autoOrder(list)}><Text style={{ color: colors.accent }}>เรียงตามระยะใกล้</Text></Pressable> : null}
            </View>
            {list.map((d, n) => {
              const p = pt(d); const mine = items.filter((x) => x.order_id === d.id);
              const e = edit[d.id] ?? { driver: d.driver ?? '', vehicle: d.vehicle ?? '' };
              return (
                <Card key={d.id}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{d.route_seq ?? n + 1}. {d.doc_no} · {custs.find((c) => c.id === d.customer_id)?.name ?? '-'}</Text>
                  <Body tone="muted">{d.ship_address}</Body>
                  {d.contact_name || d.contact_phone ? <Body tone="muted">ติดต่อ {d.contact_name ?? ''} {d.contact_phone ?? ''}</Body> : null}
                  <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6, flexWrap: 'wrap' }}>
                    <Pill text={STATUS[d.status] ?? d.status} tone={tone(d.status)} />
                    {!p ? <Pill text="ไม่มีพิกัด" tone="warn" /> : null}
                  </View>
                  {mine.map((x) => <Body key={x.id} tone="muted">• {x.description} × {x.qty} {x.unit}</Body>)}
                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 6 }}>
                    {p ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(mapsLink(p))}><Text style={{ color: colors.accent }}>แผนที่</Text></Pressable> : null}
                    {p ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(directionsLink(p))}><Text style={{ color: colors.accent }}>นำทาง</Text></Pressable> : null}
                  </View>
                  {editable && !['delivered', 'cancelled'].includes(d.status) ? (
                    <View style={{ marginTop: 8 }}>
                      <Field label="คนขับ" value={e.driver} onChangeText={(v) => setEdit({ ...edit, [d.id]: { ...e, driver: v } })} />
                      <Field label="ทะเบียนรถ" value={e.vehicle} onChangeText={(v) => setEdit({ ...edit, [d.id]: { ...e, vehicle: v } })} />
                      <Button title="บันทึกคนขับ/รถ" variant="ghost" onPress={() => savePlan(d)} />
                      {d.status === 'draft' ? <Button title="พร้อมส่ง (จองสต็อก)" onPress={() => act('mark_do_ready', d.id)} /> : null}
                      {d.status === 'ready' ? <Button title="ออกจัดส่ง (ตัดสต็อก)" onPress={() => act('dispatch_do', d.id)} /> : null}
                      {d.status === 'dispatched' ? <Button title="ส่งสำเร็จ" onPress={() => act('mark_do_delivered', d.id)} /> : null}
                      {['draft', 'ready'].includes(d.status) ? <Button title="ยกเลิก DO" variant="danger" onPress={() => act('cancel_do', d.id)} /> : null}
                    </View>
                  ) : null}
                </Card>
              );
            })}
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen } from '@/ui/kit';
import { JobTabs } from '@/ui/SegTabs';
import { colors } from '@/ui/theme';

type D = { id: string; doc_no: string; customer_id: string; status: string; planned_date: string | null; driver: string | null; vehicle: string | null; ship_address: string | null };
type It = { id: string; order_id: string; description: string; qty: number; unit: string };
type C = { id: string; name: string };

const STATUS: Record<string, string> = { draft: 'ร่าง', ready: 'พร้อมส่ง (จองสต็อกแล้ว)', dispatched: 'ออกจัดส่ง', delivered: 'ส่งสำเร็จ', cancelled: 'ยกเลิก' };
const tone = (s: string) => (s === 'delivered' ? 'ok' : s === 'cancelled' ? 'danger' : s === 'dispatched' ? 'warn' : 'muted') as 'ok' | 'danger' | 'warn' | 'muted';
const PENDING = ['draft', 'ready', 'dispatched'];

/** DO list: view only. DOs are created from the Job Ticket loop (accepted quotation → "ออก DO"), never from this page. */
export default function Delivery() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('delivery', current?.role);
  const [rows, setRows] = useState<D[]>([]);
  const [items, setItems] = useState<It[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [filter, setFilter] = useState<'pending' | 'done' | 'all'>('pending');
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Record<string, { driver: string; vehicle: string }>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    const [d, i, c] = await Promise.all([
      neon.from('delivery_orders').select('id,doc_no,customer_id,status,planned_date,driver,vehicle,ship_address').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('delivery_order_items').select('id,order_id,description,qty,unit').eq('org_id', orgId),
      neon.from('customers').select('id,name').eq('org_id', orgId),
    ]);
    if (d.error || i.error || c.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setRows(d.data as D[]); setItems(i.data as It[]); setCusts(c.data as C[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

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

  const live = rows.filter((r) => r.status !== 'cancelled');
  const pending = live.filter((r) => PENDING.includes(r.status));
  const qtyOf = (list: D[]) => list.reduce((s, d) => s + items.filter((x) => x.order_id === d.id).reduce((a, x) => a + Number(x.qty), 0), 0);
  const shown = filter === 'pending' ? pending : filter === 'done' ? live.filter((r) => r.status === 'delivered') : live;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <JobTabs active="/delivery" />
        {err ? <Body tone="danger">{err}</Body> : null}
        <Card>
          <Text style={{ color: colors.text, fontWeight: '800' }}>DO ที่ออกแล้ว {live.length} ใบ · ค้างส่ง {pending.length} ใบ</Text>
          <Body tone="muted">จำนวนสินค้าที่ค้างส่ง {qtyOf(pending)} หน่วย · DO ออกได้จากหน้า Job Ticket เมื่อลูกค้าตกลงใบเสนอราคา</Body>
        </Card>
        <Chips value={filter} options={[{ v: 'pending', label: `ค้างส่ง (${pending.length})` }, { v: 'done', label: 'ส่งแล้ว' }, { v: 'all', label: 'ทั้งหมด' }]} onPick={setFilter} />
        {shown.length === 0 ? <Empty>ไม่มีรายการ DO</Empty> : null}
        {shown.map((d) => {
          const mine = items.filter((x) => x.order_id === d.id);
          const e = edit[d.id] ?? { driver: d.driver ?? '', vehicle: d.vehicle ?? '' };
          return (
            <Card key={d.id}>
              <Text style={{ color: colors.text, fontWeight: '700' }}>{d.doc_no} · {custs.find((c) => c.id === d.customer_id)?.name ?? '-'}</Text>
              <Body tone="muted">{d.ship_address}</Body>
              <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6, flexWrap: 'wrap' }}>
                <Pill text={STATUS[d.status] ?? d.status} tone={tone(d.status)} />
              </View>
              {mine.map((x) => <Body key={x.id} tone="muted">• {x.description} × {x.qty} {x.unit}</Body>)}
              {editable && PENDING.includes(d.status) ? (
                <View style={{ marginTop: 8 }}>
                  <Field label="คนขับ" value={e.driver} onChangeText={(v) => setEdit({ ...edit, [d.id]: { ...e, driver: v } })} />
                  <Field label="ทะเบียนรถ" value={e.vehicle} onChangeText={(v) => setEdit({ ...edit, [d.id]: { ...e, vehicle: v } })} />
                  <Button title="บันทึกคนขับ/รถ" variant="ghost" onPress={() => savePlan(d)} />
                  {d.status === 'draft' ? <Button title="พร้อมส่ง (จองสต็อก)" onPress={() => act('mark_do_ready', d.id)} /> : null}
                  {d.status === 'dispatched' ? <Button title="ส่งสำเร็จ" onPress={() => act('mark_do_delivered', d.id)} /> : null}
                  {['draft', 'ready'].includes(d.status) ? <Button title="ยกเลิก DO" variant="danger" onPress={() => act('cancel_do', d.id)} /> : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

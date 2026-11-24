import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { loadDocContext, loadThumbs, defaultSettings, type DocContext, type Img } from '@/lib/docmeta';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { DocPaper, printPaper } from '@/ui/DocPaper';
import { dateLocale } from '@/i18n';

type N = { id: string; doc_no: string; order_id: string; status: 'issued' | 'received'; receiver_name: string | null; receiver_note: string | null; received_at: string | null; created_at: string };
type D = { id: string; doc_no: string; customer_id: string; status: string; ship_address: string | null; contact_name: string | null; contact_phone: string | null; planned_date: string | null; driver: string | null; vehicle: string | null };
type It = { id: string; order_id: string; product_id: string; description: string; qty: number; unit: string };
type C = { id: string; name: string; tax_id: string | null; phone: string | null };
type P = { id: string; sku: string };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: 'numeric' }) : '');

export default function DeliveryNotes() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const org = current?.org;
  const editable = canEdit('notes', current?.role);
  const [notes, setNotes] = useState<N[]>([]);
  const [dos, setDos] = useState<D[]>([]);
  const [items, setItems] = useState<It[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [prods, setProds] = useState<P[]>([]);
  const [ctx, setCtx] = useState<DocContext>({ settings: defaultSettings('delivery_note'), branding: null, logo: null });
  const [thumbs, setThumbs] = useState<Record<string, Img>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [rcv, setRcv] = useState({ name: '', note: '' });
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [n, d, i, c, p, x] = await Promise.all([
      neon.from('delivery_notes').select('id,doc_no,order_id,status,receiver_name,receiver_note,received_at,created_at').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('delivery_orders').select('id,doc_no,customer_id,status,ship_address,contact_name,contact_phone,planned_date,driver,vehicle').eq('org_id', orgId).in('status', ['dispatched', 'delivered']),
      neon.from('delivery_order_items').select('id,order_id,product_id,description,qty,unit').eq('org_id', orgId),
      neon.from('customers').select('id,name,tax_id,phone').eq('org_id', orgId),
      neon.from('products').select('id,sku').eq('org_id', orgId),
      loadDocContext(orgId, 'delivery_note'),
    ]);
    if ([n, d, i, c, p].some((r) => r.error)) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null);
    setNotes(n.data as N[]); setDos(d.data as D[]); setItems(i.data as It[]); setCusts(c.data as C[]); setProds(p.data as P[]);
    setCtx({ ...x, settings: { ...x.settings, show_prices: false } });
    if (x.settings.col_image) setThumbs(await loadThumbs(orgId, (i.data as It[]).map((r) => r.product_id)));
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const missing = dos.filter((d) => !notes.some((n) => n.order_id === d.id));
  const doOf = (id: string) => dos.find((d) => d.id === id);
  const custOf = (id: string) => custs.find((c) => c.id === id);

  async function issue(doId: string) {
    if (busy) return;
    setBusy(true);
    const { data, error } = await neon.rpc('issue_delivery_note', { p_do: doId });
    setBusy(false);
    if (error) return setErr(friendly(error));
    setErr(null); await load(); setSel((data as N | null)?.id ?? null);
  }
  async function receive(n: N) {
    if (busy) return;
    if (!rcv.name.trim()) return setErr('กรอกชื่อผู้รับของ');
    setBusy(true);
    const { error } = await neon.rpc('receive_delivery_note', { p_dn: n.id, p_receiver: rcv.name.trim(), p_note: rcv.note.trim() || null });
    setBusy(false);
    if (error) return setErr(friendly(error));
    setErr(null); setRcv({ name: '', note: '' }); await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ใบส่งของ</Title>
        <Body tone="muted">ใบส่งของติดไปกับสินค้า ลูกค้าตรวจรับและเซ็นรับ ออกได้เมื่อ DO ออกจัดส่งแล้ว</Body>
        {err ? <Body tone="danger">{err}</Body> : null}
        {missing.length > 0 ? (
          <Card>
            <Body>DO ที่ออกจัดส่งแล้ว ยังไม่มีใบส่งของ</Body>
            {missing.map((d) => (
              <View key={d.id} style={{ marginTop: 8 }}>
                <Body>{d.doc_no} · {custOf(d.customer_id)?.name}</Body>
                {editable ? <Button title="ออกใบส่งของ" variant="ghost" busy={busy} onPress={() => void issue(d.id)} /> : null}
              </View>
            ))}
          </Card>
        ) : null}
        {notes.length === 0 ? <Empty>ยังไม่มีใบส่งของ</Empty> : null}
        {notes.map((n) => {
          const d = doOf(n.order_id);
          const c = d ? custOf(d.customer_id) : undefined;
          const open = sel === n.id;
          const its = items.filter((x) => x.order_id === n.order_id);
          return (
            <Card key={n.id}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Body>{n.doc_no}</Body>
                <Pill text={n.status === 'received' ? 'รับของแล้ว' : 'รอลูกค้ารับของ'} tone={n.status === 'received' ? 'ok' : 'warn'} />
              </View>
              <Body tone="muted">{c?.name} · DO {d?.doc_no}</Body>
              <Button title={open ? 'ซ่อนเอกสาร' : 'เปิดเอกสาร'} variant="ghost" onPress={() => setSel(open ? null : n.id)} />
              {open && org ? (
                <View>
                  <DocPaper
                    ctx={ctx} org={org} docNo={n.doc_no} date={fmt(n.created_at)}
                    party={{ label: 'ส่งถึง', name: c?.name ?? '', lines: [d?.ship_address ?? '', [d?.contact_name, d?.contact_phone].filter(Boolean).join(' ')].filter(Boolean) }}
                    meta={[['อ้างอิง DO', d?.doc_no ?? ''], ['คนขับ', d?.driver ?? '-'], ['ทะเบียนรถ', d?.vehicle ?? '-']]}
                    items={its.map((x) => ({ code: prods.find((p) => p.id === x.product_id)?.sku, desc: x.description, qty: x.qty, unit: x.unit, image: thumbs[x.product_id] }))}
                    extra={n.status === 'received' ? [`รับสินค้าครบถ้วนโดย ${n.receiver_name} เมื่อ ${fmt(n.received_at)}${n.receiver_note ? ` — ${n.receiver_note}` : ''}`] : ['ผู้รับโปรดตรวจนับสินค้าและลงนามรับ']}
                  />
                  <Button title="พิมพ์ / บันทึกเป็น PDF" variant="ghost" onPress={printPaper} />
                  {editable && n.status === 'issued' ? (
                    <View>
                      <Field label="ชื่อผู้รับของ (ลูกค้า)" value={rcv.name} onChangeText={(v) => setRcv({ ...rcv, name: v })} />
                      <Field label="หมายเหตุการรับของ" value={rcv.note} onChangeText={(v) => setRcv({ ...rcv, note: v })} />
                      <Button title="บันทึกว่าลูกค้ารับของแล้ว" busy={busy} onPress={() => void receive(n)} />
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { loadThumbs, type Img } from '@/lib/docmeta';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { DbImage } from '@/ui/DbImage';
import { Body, Button, Card, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { AddToggle, ConfirmTrash } from '@/ui/ListBits';
import { ProductFiles } from '@/ui/ProductFiles';
import { ProductImages } from '@/ui/ProductImages';
import { colors } from '@/ui/theme';

type P = { id: string; sku: string; name: string; unit: string; price: number; cost: number; min_qty: number; archived_at: string | null };
const EMPTY = { sku: '', name: '', unit: 'ชิ้น', price: '', cost: '', min: '' };

export default function Products() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('products', current?.role);
  const [rows, setRows] = useState<P[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, Img>>({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [open, setOpen] = useState<string | null>(null);
  const [ed, setEd] = useState({ name: '', unit: '', price: '', min: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await neon.from('products').select('id,sku,name,unit,price,cost,min_qty,archived_at').eq('org_id', orgId).order('name');
    if (error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); const list = data as P[]; setRows(list);
    setThumbs(await loadThumbs(orgId, list.filter((r) => !r.archived_at).slice(0, 60).map((r) => r.id)));
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return rows.filter((r) => !r.archived_at && (!t || r.name.toLowerCase().includes(t) || r.sku.toLowerCase().includes(t)));
  }, [rows, q]);

  const num = (s: string) => (s.trim() === '' ? 0 : Number(s));
  async function add() {
    if (!orgId) return;
    if (!f.sku.trim() || !f.name.trim()) return setErr('กรอกรหัสสินค้าและชื่อสินค้า');
    const price = num(f.price); const cost = num(f.cost); const min = num(f.min);
    if ([price, cost, min].some((n) => !Number.isFinite(n) || n < 0)) return setErr('ราคา ต้นทุน และ Safety Stock ต้องเป็นตัวเลขไม่ติดลบ');
    const { data, error } = await neon.from('products').insert({ org_id: orgId, sku: f.sku.trim(), name: f.name.trim(), unit: f.unit.trim() || 'ชิ้น', price, cost, min_qty: min }).select('id').single();
    if (error) return setErr(error.code === '23505' ? 'รหัสสินค้านี้ถูกใช้แล้ว' : friendly(error));
    setF(EMPTY); setErr(null); setAdding(false); await load();
    if (data) setOpen(data.id); // go straight to the new product so images and datasheet can be added
  }
  function pick(p: P) {
    if (open === p.id) return setOpen(null);
    setOpen(p.id); setEd({ name: p.name, unit: p.unit, price: String(p.price), min: String(p.min_qty) });
  }
  async function saveEdit(id: string) {
    const price = num(ed.price); const min = num(ed.min);
    if (!ed.name.trim()) return setErr('กรอกชื่อสินค้า');
    if ([price, min].some((n) => !Number.isFinite(n) || n < 0)) return setErr('ราคาและ Safety Stock ต้องเป็นตัวเลขไม่ติดลบ');
    const { error } = await neon.from('products').update({ name: ed.name.trim(), unit: ed.unit.trim() || 'ชิ้น', price, min_qty: min }).eq('id', id);
    if (error) return setErr(friendly(error));
    setErr(null); await load();
  }
  async function archive(id: string) {
    const { error } = await neon.from('products').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) return setErr(friendly(error));
    setOpen(null); setErr(null); await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>สินค้า</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        {editable ? <AddToggle open={adding} onToggle={() => setAdding(!adding)} label="เพิ่มสินค้า" /> : null}
        {editable && adding ? (
          <Card>
            <Body>ลงทะเบียนสินค้า (เพิ่มรูปและ Datasheet ได้หลังบันทึก)</Body>
            <Field label="รหัสสินค้า (SKU)" value={f.sku} onChangeText={(v) => setF({ ...f, sku: v })} autoCapitalize="characters" />
            <Field label="ชื่อสินค้า" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Field label="หน่วย" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} />
            <Field label="ราคาขาย" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} keyboardType="decimal-pad" />
            <Field label="ต้นทุน" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} keyboardType="decimal-pad" />
            <Field label="Safety Stock (จำนวนขั้นต่ำ)" value={f.min} onChangeText={(v) => setF({ ...f, min: v })} keyboardType="decimal-pad" />
            <Button title="บันทึกสินค้า" onPress={add} />
          </Card>
        ) : null}
        <Field label="ค้นหา (ชื่อหรือรหัส)" value={q} onChangeText={setQ} />
        {shown.length === 0 ? <Empty>ยังไม่มีสินค้า</Empty> : null}
        {shown.map((p) => {
          const isOpen = open === p.id;
          const th = thumbs[p.id];
          return (
            <Card key={p.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Pressable accessibilityRole="button" onPress={() => pick(p)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  {th ? <DbImage data={th.data} mime={th.mime} size={52} /> : <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.border }} />}
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name}</Text>
                    <Text style={{ color: colors.muted }}>{p.sku} · {p.price.toLocaleString()} / {p.unit}</Text>
                  </View>
                </Pressable>
                {editable ? <ConfirmTrash label="ลบสินค้า" onConfirm={() => void archive(p.id)} /> : null}
              </View>
              {isOpen ? (
                <View style={{ marginTop: 12 }}>
                  <Pill text={`Safety Stock ${p.min_qty}`} tone={p.min_qty > 0 ? 'warn' : 'muted'} />
                  {orgId ? <ProductImages orgId={orgId} productId={p.id} editable={editable} /> : null}
                  {orgId ? <ProductFiles orgId={orgId} productId={p.id} editable={editable} /> : null}
                  {editable ? (
                    <View style={{ marginTop: 12 }}>
                      <Body>แก้ไขข้อมูลสินค้า</Body>
                      <Field label="ชื่อสินค้า" value={ed.name} onChangeText={(v) => setEd({ ...ed, name: v })} />
                      <Field label="หน่วย" value={ed.unit} onChangeText={(v) => setEd({ ...ed, unit: v })} />
                      <Field label="ราคาขาย" value={ed.price} onChangeText={(v) => setEd({ ...ed, price: v })} keyboardType="decimal-pad" />
                      <Field label="Safety Stock" value={ed.min} onChangeText={(v) => setEd({ ...ed, min: v })} keyboardType="decimal-pad" />
                      <Button title="บันทึกการแก้ไข" onPress={() => void saveEdit(p.id)} />
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

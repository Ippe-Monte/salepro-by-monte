import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { ProductImages } from '@/ui/ProductImages';
import { colors } from '@/ui/theme';

type P = { id: string; sku: string; name: string; unit: string; price: number; cost: number; min_qty: number; archived_at: string | null };

export default function Products() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('products', current?.role);
  const [rows, setRows] = useState<P[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ sku: '', name: '', unit: 'ชิ้น', price: '', cost: '', min: '' });
  const [edit, setEdit] = useState<{ id: string; min: string } | null>(null);
  const [imgOpen, setImgOpen] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await neon.from('products').select('id,sku,name,unit,price,cost,min_qty,archived_at').eq('org_id', orgId).order('name');
    if (error) setErr('โหลดข้อมูลไม่สำเร็จ'); else { setErr(null); setRows(data as P[]); }
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
    const { error } = await neon.from('products').insert({ org_id: orgId, sku: f.sku.trim(), name: f.name.trim(), unit: f.unit.trim() || 'ชิ้น', price, cost, min_qty: min });
    if (error) return setErr(error.code === '23505' ? 'รหัสสินค้านี้ถูกใช้แล้ว' : friendly(error));
    setF({ sku: '', name: '', unit: 'ชิ้น', price: '', cost: '', min: '' }); setErr(null); await load();
  }
  async function saveMin() {
    if (!edit) return;
    const n = Number(edit.min);
    if (!Number.isFinite(n) || n < 0) return setErr('Safety Stock ต้องเป็นตัวเลขไม่ติดลบ');
    const { error } = await neon.from('products').update({ min_qty: n }).eq('id', edit.id);
    if (error) return setErr(friendly(error));
    setEdit(null); setErr(null); await load();
  }
  async function archive(id: string) {
    const { error } = await neon.from('products').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) setErr(friendly(error)); else await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>สินค้า</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Field label="ค้นหา (ชื่อหรือรหัส)" value={q} onChangeText={setQ} />
        {editable ? (
          <Card>
            <Body>ลงทะเบียนสินค้า</Body>
            <Field label="รหัสสินค้า (SKU)" value={f.sku} onChangeText={(v) => setF({ ...f, sku: v })} autoCapitalize="characters" />
            <Field label="ชื่อสินค้า" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Field label="หน่วย" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} />
            <Field label="ราคาขาย" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} keyboardType="decimal-pad" />
            <Field label="ต้นทุน" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} keyboardType="decimal-pad" />
            <Field label="Safety Stock (จำนวนขั้นต่ำ)" value={f.min} onChangeText={(v) => setF({ ...f, min: v })} keyboardType="decimal-pad" />
            <Button title="เพิ่มสินค้า" onPress={add} />
          </Card>
        ) : null}
        {shown.length === 0 ? <Empty>ยังไม่มีสินค้า</Empty> : null}
        {shown.map((p) => (
          <Card key={p.id}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name}</Text>
            <Body tone="muted">{p.sku} · ราคา {p.price.toLocaleString()} / {p.unit}</Body>
            {edit?.id === p.id ? (
              <>
                <Field label="Safety Stock" value={edit.min} onChangeText={(v) => setEdit({ id: p.id, min: v })} keyboardType="decimal-pad" />
                <Button title="บันทึก" onPress={saveMin} />
              </>
            ) : <Pill text={`Safety Stock ${p.min_qty}`} tone={p.min_qty > 0 ? 'warn' : 'muted'} />}
            {editable && edit?.id !== p.id ? (
              <Pressable accessibilityRole="button" onPress={() => setEdit({ id: p.id, min: String(p.min_qty) })}><Text style={{ color: colors.accent, marginTop: 6 }}>แก้ Safety Stock</Text></Pressable>
            ) : null}
            <Pressable accessibilityRole="button" onPress={() => setImgOpen(imgOpen === p.id ? null : p.id)}><Text style={{ color: colors.accent, marginTop: 6 }}>{imgOpen === p.id ? 'ซ่อนรูปสินค้า' : 'รูปสินค้า'}</Text></Pressable>
            {imgOpen === p.id && orgId ? <ProductImages orgId={orgId} productId={p.id} editable={editable} /> : null}
            {editable ? <Pressable accessibilityRole="button" onPress={() => void archive(p.id)}><Text style={{ color: colors.danger, marginTop: 6 }}>เลิกใช้สินค้า</Text></Pressable> : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

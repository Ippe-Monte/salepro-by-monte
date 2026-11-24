import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

type L = { product_id: string; sku: string; name: string; unit: string; min_qty: number; on_hand: number; reserved: number; available: number; is_low: boolean; archived_at: string | null };
type M = { id: string; kind: string; on_hand_delta: number; reserved_delta: number; on_hand_after: number; note: string | null; created_at: string };

const KIND_LABEL: Record<string, string> = { receive: 'รับเข้า', issue: 'ตัดจ่าย', adjust: 'ปรับยอด', reserve: 'จอง', release: 'ปล่อยจอง' };

export default function Stock() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('stock', current?.role);
  const [rows, setRows] = useState<L[]>([]);
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [moves, setMoves] = useState<M[]>([]);
  const [mode, setMode] = useState<'receive' | 'adjust'>('receive');
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await neon.from('stock_levels').select('product_id,sku,name,unit,min_qty,on_hand,reserved,available,is_low,archived_at').eq('org_id', orgId).order('name');
    if (error) setErr('โหลดข้อมูลไม่สำเร็จ'); else { setErr(null); setRows((data as L[]).filter((r) => !r.archived_at)); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function loadMoves(id: string) {
    const { data } = await neon.from('stock_movements').select('id,kind,on_hand_delta,reserved_delta,on_hand_after,note,created_at').eq('product_id', id).order('created_at', { ascending: false }).limit(20);
    setMoves((data ?? []) as M[]);
  }
  async function pick(id: string) {
    setQty(''); setNote('');
    if (sel === id) return setSel(null);
    setSel(id); await loadMoves(id);
  }

  async function submit(productId: string) {
    if (!orgId) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || qty.trim() === '') return setErr('กรอกจำนวนเป็นตัวเลข');
    const res = mode === 'receive'
      ? await neon.rpc('receive_stock', { p_org: orgId, p_product: productId, p_qty: n, p_note: note.trim() || null })
      : await neon.rpc('adjust_stock', { p_org: orgId, p_product: productId, p_new_on_hand: n, p_note: note.trim() });
    if (res.error) {
      const m = res.error.message ?? '';
      return setErr(m.includes('insufficient') ? 'ยอดคงเหลือไม่พอ (ต้องไม่ต่ำกว่ายอดที่จองไว้)' : m.includes('note required') ? 'การปรับยอดต้องใส่เหตุผล' : m.includes('invalid quantity') ? 'จำนวนไม่ถูกต้อง' : friendly(res.error));
    }
    setErr(null); setQty(''); setNote(''); await load(); await loadMoves(productId);
  }

  const shown = rows.filter((r) => filter === 'all' || r.is_low);
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>สต็อก</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Chips value={filter} options={[{ v: 'all', label: 'ทั้งหมด' }, { v: 'low', label: `ต่ำกว่า Safety Stock (${rows.filter((r) => r.is_low).length})` }]} onPick={setFilter} />
        {shown.length === 0 ? <Empty>{filter === 'low' ? 'ไม่มีสินค้าที่ต่ำกว่า Safety Stock' : 'ยังไม่มีสินค้า'}</Empty> : null}
        {shown.map((r) => (
          <Card key={r.product_id}>
            <Pressable accessibilityRole="button" onPress={() => void pick(r.product_id)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: colors.text, fontWeight: '700', flex: 1 }}>{r.name}</Text>
                {r.is_low ? <Pill text="ต่ำกว่า Safety" tone="danger" /> : null}
              </View>
              <Body tone="muted">{r.sku} · คงเหลือ {r.on_hand} · จอง {r.reserved} · ใช้ได้ {r.available} {r.unit} · Safety {r.min_qty}</Body>
            </Pressable>
            {sel === r.product_id ? (
              <View style={{ marginTop: 10 }}>
                {editable ? (
                  <>
                    <Chips value={mode} options={[{ v: 'receive', label: 'รับเข้า' }, { v: 'adjust', label: 'ปรับยอดนับจริง' }]} onPick={setMode} />
                    <Field label={mode === 'receive' ? 'จำนวนที่รับเข้า' : 'ยอดนับจริงใหม่'} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                    <Field label={mode === 'adjust' ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ'} value={note} onChangeText={setNote} />
                    <Button title="บันทึก" onPress={() => submit(r.product_id)} />
                  </>
                ) : null}
                <Body>ประวัติล่าสุด</Body>
                {moves.length === 0 ? <Body tone="muted">ยังไม่มีความเคลื่อนไหว</Body> : null}
                {moves.map((m) => (
                  <Body key={m.id} tone="muted">
                    {new Date(m.created_at).toLocaleDateString(dateLocale())} · {KIND_LABEL[m.kind] ?? m.kind} {m.on_hand_delta !== 0 ? (m.on_hand_delta > 0 ? '+' : '') + m.on_hand_delta : `จอง ${m.reserved_delta > 0 ? '+' : ''}${m.reserved_delta}`} → {m.on_hand_after}{m.note ? ` · ${m.note}` : ''}
                  </Body>
                ))}
              </View>
            ) : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

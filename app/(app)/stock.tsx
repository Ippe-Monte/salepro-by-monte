import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit, canManageStock } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Icon } from '@/ui/Icon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen } from '@/ui/kit';
import { TitleAdd } from '@/ui/ListBits';
import { SegTabs } from '@/ui/SegTabs';
import { ProductFiles } from '@/ui/ProductFiles';
import { ProductImages } from '@/ui/ProductImages';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

type L = { product_id: string; sku: string; name: string; unit: string; min_qty: number; on_hand: number; reserved: number; available: number; is_low: boolean; archived_at: string | null };
type M = { id: string; kind: string; on_hand_delta: number; reserved_delta: number; on_hand_after: number; note: string | null; created_at: string };

const KIND_LABEL: Record<string, string> = { receive: 'รับเข้า', issue: 'ตัดจ่าย', adjust: 'ปรับยอด', reserve: 'จอง', release: 'ปล่อยจอง' };
type Mode = 'receive' | 'issue' | 'adjust';

export default function Stock() {
  const router = useRouter();
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canManageStock(current); // quantity actions: owner/admin/warehouse or granted "stock manager"
  const prodEditable = canEdit('products', current?.role);
  const [rows, setRows] = useState<L[]>([]);
  const [filter, setFilter] = useState<'all' | 'low'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const [act, setAct] = useState<{ id: string; mode: Mode } | null>(null);
  const [moves, setMoves] = useState<M[]>([]);
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await neon.from('stock_levels').select('product_id,sku,name,unit,min_qty,on_hand,reserved,available,is_low,archived_at').eq('org_id', orgId).order('name');
    if (error) setErr('โหลดข้อมูลไม่สำเร็จ'); else { setErr(null); const list = (data as L[]).filter((r) => !r.archived_at); setRows(list); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function loadMoves(id: string) {
    const { data } = await neon.from('stock_movements').select('id,kind,on_hand_delta,reserved_delta,on_hand_after,note,created_at').eq('product_id', id).order('created_at', { ascending: false }).limit(20);
    setMoves((data ?? []) as M[]);
  }
  async function pick(id: string) {
    if (sel === id) return setSel(null);
    setSel(id); await loadMoves(id);
  }
  function startAct(id: string, mode: Mode) {
    setQty(''); setNote(''); setErr(null);
    setAct(act?.id === id && act.mode === mode ? null : { id, mode });
  }

  async function submit(productId: string, mode: Mode) {
    if (!orgId) return;
    const n = Number(qty);
    if (!Number.isFinite(n) || qty.trim() === '') return setErr('กรอกจำนวนเป็นตัวเลข');
    const res = mode === 'receive'
      ? await neon.rpc('receive_stock', { p_org: orgId, p_product: productId, p_qty: n, p_note: note.trim() || null })
      : mode === 'issue'
      ? await neon.rpc('issue_stock', { p_org: orgId, p_product: productId, p_qty: n, p_note: note.trim() || null })
      : await neon.rpc('adjust_stock', { p_org: orgId, p_product: productId, p_new_on_hand: n, p_note: note.trim() });
    if (res.error) {
      const m = res.error.message ?? '';
      return setErr(m.includes('insufficient') ? 'ยอดคงเหลือไม่พอ (ตัดออกได้ไม่เกินยอดที่ไม่ได้จอง)' : m.includes('note required') ? 'การปรับยอดต้องใส่เหตุผล' : m.includes('invalid quantity') ? 'จำนวนไม่ถูกต้อง' : friendly(res.error));
    }
    setErr(null); setQty(''); setNote(''); setAct(null); await load(); if (sel === productId) await loadMoves(productId);
  }

  const shown = rows.filter((r) => filter === 'all' || r.is_low);
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <SegTabs active="/stock" tabs={[{ href: '/stock', label: 'สต็อก' }, { href: '/products', label: 'รายละเอียดสินค้า' }]} />
        <TitleAdd title="สต็อก" show={prodEditable} open={false} onToggle={() => router.push({ pathname: '/products', params: { add: '1' } } as never)} label="สินค้า" />
        {err ? <Body tone="danger">{err}</Body> : null}
        <Chips value={filter} options={[{ v: 'all', label: 'ทั้งหมด' }, { v: 'low', label: `ต่ำกว่า Safety Stock (${rows.filter((r) => r.is_low).length})` }]} onPick={setFilter} />
        {shown.length === 0 ? <Empty>{filter === 'low' ? 'ไม่มีสินค้าที่ต่ำกว่า Safety Stock' : 'ยังไม่มีสินค้า'}</Empty> : (
          <View style={{ flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 8, marginTop: 8 }}>
            <Text style={{ flex: 1, color: colors.muted, fontSize: 12, fontWeight: '700' }}>รหัส / สินค้า</Text>
            {['คงเหลือ', 'จอง', 'ใช้ได้'].map((h) => <Text key={h} style={{ width: 56, textAlign: 'right', color: colors.muted, fontSize: 12, fontWeight: '700' }}>{h}</Text>)}
          </View>
        )}
        {shown.map((r) => {
          const here = act?.id === r.product_id ? act.mode : null;
          return (
            <Card key={r.product_id}>
              <Pressable accessibilityRole="button" onPress={() => void pick(r.product_id)} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{r.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{r.sku} · {r.unit} · Safety {r.min_qty}</Text>
                  {r.is_low ? <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Pill text="ต่ำกว่า Safety" tone="danger" /></View> : null}
                </View>
                <Text style={{ width: 56, textAlign: 'right', color: r.is_low ? colors.danger : colors.text, fontWeight: '800' }}>{r.on_hand}</Text>
                <Text style={{ width: 56, textAlign: 'right', color: colors.muted }}>{r.reserved}</Text>
                <Text style={{ width: 56, textAlign: 'right', color: colors.text }}>{r.available}</Text>
              </Pressable>
              {editable && sel === r.product_id ? (
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  {([['receive', 'plus', 'เพิ่ม'], ['issue', 'x', 'ลด'], ['adjust', 'pencil', 'ปรับยอด']] as const).map(([m, ic, label]) => (
                    <Pressable key={m} accessibilityRole="button" onPress={() => startAct(r.product_id, m)}
                      style={{ flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', minHeight: 42, borderRadius: 10, borderWidth: 1, borderColor: here === m ? colors.primary : colors.border, backgroundColor: here === m ? colors.selected : 'transparent' }}>
                      <Icon name={ic} size={16} color={colors.text} /><Text style={{ color: colors.text, fontWeight: '600' }}>{label}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {here ? (
                <View style={{ marginTop: 8 }}>
                  <Field label={here === 'receive' ? 'จำนวนที่รับเข้า' : here === 'issue' ? 'จำนวนที่เบิกออก' : 'ยอดนับจริงใหม่'} value={qty} onChangeText={setQty} keyboardType="decimal-pad" />
                  <Field label={here === 'adjust' ? 'เหตุผล (จำเป็น)' : 'หมายเหตุ'} value={note} onChangeText={setNote} />
                  <Button title="บันทึก" onPress={() => submit(r.product_id, here)} />
                </View>
              ) : null}
              {sel === r.product_id ? (
                <View style={{ marginTop: 12 }}>
                  {orgId ? <ProductImages orgId={orgId} productId={r.product_id} editable={prodEditable} /> : null}
                  {orgId ? <ProductFiles orgId={orgId} productId={r.product_id} editable={prodEditable} /> : null}
                  <Text style={{ color: colors.text, fontWeight: '700', marginTop: 12 }}>ประวัติล่าสุด</Text>
                  {moves.length === 0 ? <Body tone="muted">ยังไม่มีความเคลื่อนไหว</Body> : null}
                  {moves.map((m) => (
                    <Body key={m.id} tone="muted">
                      {new Date(m.created_at).toLocaleDateString(dateLocale())} · {KIND_LABEL[m.kind] ?? m.kind} {m.on_hand_delta !== 0 ? (m.on_hand_delta > 0 ? '+' : '') + m.on_hand_delta : `จอง ${m.reserved_delta > 0 ? '+' : ''}${m.reserved_delta}`} → {m.on_hand_after}{m.note ? ` · ${m.note}` : ''}
                    </Body>
                  ))}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

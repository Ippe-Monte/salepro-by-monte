import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/auth/roles';
import { baht } from '@/lib/money';
import { neon } from '@/lib/neon';
import { Body, Card, Pill, Screen, Title } from '@/ui/kit';
import { Logo } from '@/ui/Logo';
import { colors, gradients, type GradientName } from '@/ui/theme';

type S = {
  low_stock: number; open_jobs: number; overdue_jobs: number; quotes_open_value: number; quotes_won_30d: number;
  visits_today: number; visits_week: number; do_pending: number; do_in_transit: number;
  invoices_unpaid_value: number; invoices_overdue: number; dn_waiting: number;
};
type Low = { product_id: string; sku: string; name: string; available: number; min_qty: number; unit: string };

function Tile({ label, value, grad, to }: { label: string; value: string; grad: GradientName; to?: string }) {
  const router = useRouter();
  const g = gradients[grad];
  return (
    <Pressable accessibilityRole="button" disabled={!to} onPress={() => to && router.push(to as never)} style={{ flexBasis: '47%', flexGrow: 1 }}>
      <LinearGradient colors={[g[0], g[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 16, minHeight: 92, justifyContent: 'space-between' }}>
        <Text style={{ color: '#ffffffdd', fontSize: 13 }}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{value}</Text>
      </LinearGradient>
    </Pressable>
  );
}

function Bars({ rows }: { rows: { label: string; value: number; color: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      {rows.map((r) => (
        <View key={r.label}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>{r.label}</Text>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{r.value}</Text>
          </View>
          <View style={{ height: 10, borderRadius: 5, backgroundColor: colors.border, marginTop: 4 }}>
            <View style={{ height: 10, borderRadius: 5, width: `${(r.value / max) * 100}%`, backgroundColor: r.color }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function Dashboard() {
  const { profile, current } = useAuth();
  const orgId = current?.org_id;
  const [s, setS] = useState<S | null>(null);
  const [low, setLow] = useState<Low[]>([]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [a, b] = await Promise.all([
      neon.rpc('dashboard_summary', { p_org: orgId }),
      neon.from('stock_levels').select('product_id,sku,name,available,min_qty,unit').eq('org_id', orgId).eq('is_low', true).is('archived_at', null).order('available').limit(5),
    ]);
    if (a.error || b.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setS(a.data as S); setLow(b.data as Low[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <Screen>
      <ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <Logo size={52} />
          <View style={{ flexShrink: 1 }}>
            <Title>{current?.org.name ?? 'SALEPRO by MONTE'}</Title>
            <Body tone="muted">สวัสดี {profile?.display_name || profile?.email}{current ? ` · ${ROLE_LABEL[current.role]}` : ''}</Body>
          </View>
        </View>
        {err ? <Body tone="danger">{err}</Body> : null}
        {s ? (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
              <Tile label="นัดเข้าพบวันนี้" value={String(s.visits_today)} grad="blue" to="/visits" />
              <Tile label="ใบเสนอราคารอตอบ (บาท)" value={baht(s.quotes_open_value)} grad="purple" to="/quotes" />
              <Tile label="ปิดได้ 30 วัน (บาท)" value={baht(s.quotes_won_30d)} grad="green" to="/quotes" />
              <Tile label="อินวอยซ์ค้างชำระ (บาท)" value={baht(s.invoices_unpaid_value)} grad={s.invoices_overdue > 0 ? 'red' : 'orange'} to="/invoices" />
            </View>
            <Card>
              <Body>ภาพรวมงานที่ต้องทำ</Body>
              <Bars rows={[
                { label: 'Job ที่ยังเปิด', value: s.open_jobs, color: colors.primary },
                { label: 'Job เกินกำหนด', value: s.overdue_jobs, color: colors.danger },
                { label: 'นัดเข้าพบ 7 วัน', value: s.visits_week, color: colors.accent },
                { label: 'DO รอจัดส่ง', value: s.do_pending, color: '#f59e0b' },
                { label: 'DO ระหว่างจัดส่ง', value: s.do_in_transit, color: '#7c3aed' },
                { label: 'ใบส่งของรอลูกค้ารับ', value: s.dn_waiting, color: '#059669' },
                { label: 'อินวอยซ์เกินกำหนด', value: s.invoices_overdue, color: colors.danger },
                { label: 'สินค้าต่ำกว่า Safety Stock', value: s.low_stock, color: '#ea580c' },
              ]} />
            </Card>
          </>
        ) : null}
        {low.length > 0 ? (
          <Card>
            <Body>สินค้าที่ต้องสั่งเพิ่ม</Body>
            {low.map((l) => (
              <View key={l.product_id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
                <Body tone="muted">{l.sku} {l.name}</Body>
                <Pill text={`ใช้ได้ ${l.available} / Safety ${l.min_qty}`} tone="danger" />
              </View>
            ))}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

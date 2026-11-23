import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/auth/roles';
import { baht } from '@/lib/money';
import { neon } from '@/lib/neon';
import { Body, Card, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type S = {
  low_stock: number; open_jobs: number; overdue_jobs: number; quotes_open_value: number; quotes_won_30d: number;
  visits_today: number; visits_week: number; do_pending: number; do_in_transit: number;
};
type Low = { product_id: string; sku: string; name: string; available: number; min_qty: number; unit: string };

function Kpi({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'warn' }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderColor: tone === 'danger' ? colors.danger : colors.border, borderWidth: 1, borderRadius: 14, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: tone === 'danger' ? colors.danger : colors.text, fontSize: 24, fontWeight: '700', marginTop: 4 }}>{value}</Text>
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
        <Title>{current?.org.name ?? 'SALEPRO by MONTE'}</Title>
        <Body tone="muted">สวัสดี {profile?.display_name || profile?.email}{current ? ` · ${ROLE_LABEL[current.role]}` : ''}</Body>
        {err ? <Body tone="danger">{err}</Body> : null}
        {s ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginVertical: 16 }}>
            <Kpi label="นัดเข้าพบวันนี้" value={String(s.visits_today)} />
            <Kpi label="นัดเข้าพบ 7 วัน" value={String(s.visits_week)} />
            <Kpi label="Job ที่ยังเปิด" value={String(s.open_jobs)} />
            <Kpi label="Job เกินกำหนด" value={String(s.overdue_jobs)} tone={s.overdue_jobs > 0 ? 'danger' : undefined} />
            <Kpi label="ใบเสนอราคารอตอบ (บาท)" value={baht(s.quotes_open_value)} />
            <Kpi label="ปิดได้ 30 วัน (บาท)" value={baht(s.quotes_won_30d)} />
            <Kpi label="DO รอจัดส่ง" value={String(s.do_pending)} />
            <Kpi label="DO ระหว่างจัดส่ง" value={String(s.do_in_transit)} />
            <Kpi label="สินค้าต่ำกว่า Safety Stock" value={String(s.low_stock)} tone={s.low_stock > 0 ? 'danger' : undefined} />
          </View>
        ) : null}
        {low.length > 0 ? (
          <Card>
            <Body>สินค้าที่ต้องสั่งเพิ่ม</Body>
            {low.map((l) => (
              <View key={l.product_id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
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

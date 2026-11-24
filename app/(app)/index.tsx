import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/auth/roles';
import { baht } from '@/lib/money';
import { neon } from '@/lib/neon';
import { growth, jobBuckets, salesByMonth, sinceOf, type Inv, type Tk } from '@/lib/dashboard';
import type { PipelineRow } from '@/lib/pipeline';
import { dateLocale } from '@/i18n';
import { Donut } from '@/ui/Donut';
import { Body, Card, Chips, Pill, Screen, Title } from '@/ui/kit';
import { OrgLogo } from '@/ui/OrgLogo';
import { colors, gradients, type GradientName } from '@/ui/theme';

// Baht sign written as an escape so it is not mistaken for translatable Thai text.
const BAHT = String.fromCharCode(0x0e3f);

type S = {
  low_stock: number; open_jobs: number; overdue_jobs: number; quotes_open_value: number; quotes_won_30d: number;
  visits_today: number; visits_week: number; do_pending: number; do_in_transit: number;
  invoices_unpaid_value: number; invoices_overdue: number; dn_waiting: number;
};
type Low = { product_id: string; sku: string; name: string; available: number; min_qty: number; unit: string };

function Tile({ label, value, grad, to, basis = '47%' }: { label: string; value: string; grad: GradientName; to?: string; basis?: string }) {
  const router = useRouter();
  const g = gradients[grad];
  return (
    <Pressable accessibilityRole="button" disabled={!to} onPress={() => to && router.push(to as never)} style={{ flexBasis: basis as `${number}%`, flexGrow: 1 }}>
      <LinearGradient colors={[g[0], g[1]]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 18, padding: 16, minHeight: 92, justifyContent: 'space-between' }}>
        <Text style={{ color: '#ffffffdd', fontSize: 13 }}>{label}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: '#fff', fontSize: 24, fontWeight: '800' }}>{value}</Text>
      </LinearGradient>
    </Pressable>
  );
}

export default function Dashboard() {
  const { profile, current } = useAuth();
  const orgId = current?.org_id;
  const [s, setS] = useState<S | null>(null);
  const [low, setLow] = useState<Low[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [tks, setTks] = useState<(Tk & { doc_no: string; title: string })[]>([]);
  const [pipe, setPipe] = useState<Record<string, PipelineRow>>({});
  const [evs, setEvs] = useState<{ id: string; ticket_id: string; kind: string; body: string | null; to_status: string | null; created_at: string }[]>([]);
  const [period, setPeriod] = useState<'30d' | 'month' | 'year' | 'all'>('30d');
  const wide = useWindowDimensions().width >= 768;

  const load = useCallback(async () => {
    if (!orgId) return;
    const since = new Date(Date.now() - 215 * 86400000).toISOString().slice(0, 10);
    const [a, b, iv, tk, pl, ev] = await Promise.all([
      neon.rpc('dashboard_summary', { p_org: orgId }),
      neon.from('stock_levels').select('product_id,sku,name,available,min_qty,unit').eq('org_id', orgId).eq('is_low', true).is('archived_at', null).order('available').limit(5),
      neon.from('invoices').select('total,issue_date,status').eq('org_id', orgId).gte('issue_date', since),
      neon.from('job_tickets').select('id,doc_no,title,status,created_at').eq('org_id', orgId),
      neon.from('job_pipeline').select('*').eq('org_id', orgId),
      neon.from('job_ticket_events').select('id,ticket_id,kind,body,to_status,created_at').eq('org_id', orgId).order('created_at', { ascending: false }).limit(6),
    ]);
    if (a.error || b.error || iv.error || tk.error || pl.error || ev.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setS(a.data as S); setLow(b.data as Low[]); setInvs(iv.data as Inv[]); setTks(tk.data as (Tk & { doc_no: string; title: string })[]);
    setPipe(Object.fromEntries((pl.data as PipelineRow[]).map((r) => [r.ticket_id, r]))); setEvs(ev.data as typeof evs);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const now = new Date();
  const months = salesByMonth(invs, now, 6);
  const thisM = months[months.length - 1]?.total ?? 0; const prevM = months[months.length - 2]?.total ?? 0;
  const gr = growth(thisM, prevM);
  const buckets = jobBuckets(tks, pipe, sinceOf(period, now));
  const totalJobs = buckets.reduce((a, b) => a + b.count, 0);
  const maxM = Math.max(1, ...months.map((m) => m.total));
  const mon = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString(dateLocale(), { month: 'short', timeZone: 'UTC' });
  const tkOf = (id: string) => tks.find((t) => t.id === id);

  const salesCard = (
    <Card>
      <Body tone="muted">ยอดขายเดือนนี้</Body>
      <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>{BAHT} {baht(thisM)}</Text>
      {gr === null ? <Body tone="muted">ยังไม่มีเดือนก่อนให้เทียบ</Body> : <Text style={{ color: gr >= 0 ? '#16a34a' : colors.danger, fontWeight: '700' }}>{gr >= 0 ? '▲' : '▼'} {Math.abs(gr)}% เทียบเดือนก่อน</Text>}
    </Card>
  );
  const pipeCard = (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>สถานะงานทั้งหมด</Text>
      </View>
      <Chips value={period} options={[{ v: '30d', label: '30 วัน' }, { v: 'month', label: 'เดือนนี้' }, { v: 'year', label: 'ปีนี้' }, { v: 'all', label: 'ทั้งหมด' }]} onPick={setPeriod} />
      <View style={{ alignItems: 'center', gap: 16, marginTop: 8 }}>
        <Donut slices={buckets.map((b) => ({ key: b.key, value: b.count, color: b.color }))} total={totalJobs} caption="Job Ticket" size={wide ? 190 : 170} />
        <View style={{ alignSelf: 'stretch', gap: 8 }}>
          {buckets.map((b) => (
            <View key={b.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: b.color }} />
              <Text style={{ color: colors.text, flex: 1, fontSize: 13 }}>{b.label}</Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 13 }}>{b.pct}%</Text>
              <Text style={{ color: colors.muted, fontSize: 12, minWidth: 22, textAlign: 'right' }}>{b.count}</Text>
            </View>
          ))}
          <Body tone="muted">รวม = จำนวน Job Ticket ที่เปิดในช่วงนี้</Body>
        </View>
      </View>
    </Card>
  );
  const barsCard = (
    <Card>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>ยอดขาย 6 เดือนล่าสุด</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 10, height: 150, marginTop: 12 }}>
        {months.map((m) => (
          <View key={m.key} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' }}>
            <Text style={{ color: colors.muted, fontSize: 10 }}>{m.total > 0 ? baht(m.total) : ''}</Text>
            <View style={{ width: '70%', height: Math.max(3, (m.total / maxM) * 110), backgroundColor: colors.primary, borderRadius: 6 }} />
            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{mon(m.key)}</Text>
          </View>
        ))}
      </View>
    </Card>
  );
  const recentCard = (
    <Card>
      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>ความเคลื่อนไหวล่าสุด</Text>
      {evs.length === 0 ? <Body tone="muted">ยังไม่มีความเคลื่อนไหว</Body> : null}
      {evs.map((e) => (
        <View key={e.id} style={{ marginTop: 8 }}>
          <Text style={{ color: colors.text, fontSize: 13 }}>{tkOf(e.ticket_id)?.doc_no ?? ''} · {tkOf(e.ticket_id)?.title ?? ''}</Text>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{e.kind === 'created' ? 'เปิดงาน' : e.kind === 'status' ? 'เปลี่ยนสถานะงาน' : e.body} · {new Date(e.created_at).toLocaleString(dateLocale())}</Text>
        </View>
      ))}
    </Card>
  );
  const lowCard = low.length > 0 ? (
    <Card>
      <Body>สินค้าที่ต้องสั่งเพิ่ม</Body>
      {low.map((l) => (
        <View key={l.product_id} style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 }}>
          <Body tone="muted">{l.sku} {l.name}</Body>
          <Pill text={`ใช้ได้ ${l.available} / Safety ${l.min_qty}`} tone="danger" />
        </View>
      ))}
    </Card>
  ) : null;

  return (
    <Screen>
      <ScrollView>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <OrgLogo size={52} />
          <View style={{ flexShrink: 1 }}>
            <Title>{current?.org.name ?? 'SALEPRO by MONTE'}</Title>
            <Body tone="muted">สวัสดี {profile?.display_name || profile?.email}{current ? ` · ${ROLE_LABEL[current.role]}` : ''}</Body>
          </View>
        </View>
        {err ? <Body tone="danger">{err}</Body> : null}
        {wide ? (
          <View style={{ gap: 12 }}>
            {s ? (
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <Tile label="ยอดขายเดือนนี้ (บาท)" value={baht(thisM)} grad="blue" basis="22%" to="/invoices" />
                <Tile label="Job ที่ยังเปิด" value={String(s.open_jobs)} grad="green" basis="22%" to="/jobs" />
                <Tile label="ใบเสนอราคารอตอบ (บาท)" value={baht(s.quotes_open_value)} grad="purple" basis="22%" to="/quotes" />
                <Tile label="อินวอยซ์ค้างชำระ (บาท)" value={baht(s.invoices_unpaid_value)} grad={s.invoices_overdue > 0 ? 'red' : 'orange'} basis="22%" to="/invoices" />
              </View>
            ) : null}
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
              <View style={{ flex: 2 }}>{barsCard}{recentCard}</View>
              <View style={{ flex: 1 }}>{pipeCard}{lowCard}</View>
            </View>
          </View>
        ) : (
          <View>
            {salesCard}
            {pipeCard}
            {s ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                <Tile label="นัดเข้าพบวันนี้" value={String(s.visits_today)} grad="blue" to="/visits" />
                <Tile label="ใบเสนอราคารอตอบ (บาท)" value={baht(s.quotes_open_value)} grad="purple" to="/quotes" />
                <Tile label="Job ที่ยังเปิด" value={String(s.open_jobs)} grad="green" to="/jobs" />
                <Tile label="อินวอยซ์ค้างชำระ (บาท)" value={baht(s.invoices_unpaid_value)} grad={s.invoices_overdue > 0 ? 'red' : 'orange'} to="/invoices" />
              </View>
            ) : null}
            {lowCard}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

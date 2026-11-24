import { useCallback, useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import * as Location from 'expo-location';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { addMinutes, dayKey, groupByDay, hhmm, parseLocal } from '@/lib/dates';
import { friendly } from '@/lib/errors';
import { directionsLink } from '@/lib/geo';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type V = {
  id: string; customer_id: string; address_id: string | null; assignee: string; title: string; purpose: string | null;
  starts_at: string; ends_at: string; status: 'planned' | 'done' | 'cancelled'; outcome: string | null; checked_in_at: string | null;
};
type C = { id: string; name: string };
type Mem = { user_id: string; profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null };
type A = { id: string; customer_id: string; latitude: number | null; longitude: number | null };

const nameOf = (m: Mem) => { const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles; return p?.display_name || p?.email || m.user_id.slice(0, 6); };

export default function Visits() {
  const { current, profile } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('visits', current?.role);
  const isAdmin = current?.role === 'owner' || current?.role === 'admin';
  const [rows, setRows] = useState<V[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [mems, setMems] = useState<Mem[]>([]);
  const [addrs, setAddrs] = useState<A[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [mine, setMine] = useState<'all' | 'mine'>('all');
  const [f, setF] = useState({ customer: '', title: '', date: dayKey(new Date()), time: '09:00', mins: '60', assignee: '' });
  const [note, setNote] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!orgId) return;
    const [v, c, m, a] = await Promise.all([
      neon.from('visit_plans').select('id,customer_id,address_id,assignee,title,purpose,starts_at,ends_at,status,outcome,checked_in_at').eq('org_id', orgId).order('starts_at'),
      neon.from('customers').select('id,name').eq('org_id', orgId).is('archived_at', null).order('name'),
      neon.from('memberships').select('user_id,profiles(display_name,email)').eq('org_id', orgId).eq('status', 'active'),
      neon.from('customer_addresses').select('id,customer_id,latitude,longitude').eq('org_id', orgId).eq('is_default', true),
    ]);
    if (v.error || c.error || m.error || a.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setRows(v.data as V[]); setCusts(c.data as C[]); setMems(m.data as unknown as Mem[]); setAddrs(a.data as A[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!orgId || !profile) return;
    if (!f.customer) return setErr('เลือกลูกค้า');
    if (!f.title.trim()) return setErr('กรอกหัวข้อการเข้าพบ');
    const start = parseLocal(f.date, f.time);
    const mins = Number(f.mins);
    if (!start) return setErr('วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเวลา ชช:นน');
    if (!Number.isFinite(mins) || mins < 5 || mins > 1440) return setErr('ระยะเวลาต้องอยู่ระหว่าง 5 ถึง 1440 นาที');
    const addr = addrs.find((a) => a.customer_id === f.customer);
    const { error } = await neon.from('visit_plans').insert({
      org_id: orgId, customer_id: f.customer, address_id: addr?.id ?? null, assignee: isAdmin && f.assignee ? f.assignee : profile.id,
      title: f.title.trim(), starts_at: start.toISOString(), ends_at: addMinutes(start, mins).toISOString(),
    });
    if (error) return setErr(friendly(error));
    setF({ ...f, title: '' }); setErr(null); await load();
  }

  async function setStatus(v: V, status: 'done' | 'cancelled') {
    const patch: Record<string, unknown> = { status };
    if (status === 'done') patch.outcome = (note[v.id] ?? '').trim() || null;
    const { error } = await neon.from('visit_plans').update(patch).eq('id', v.id);
    if (error) setErr(friendly(error)); else { setErr(null); await load(); }
  }

  async function checkIn(v: V) {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setErr('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง');
      const p = await Location.getCurrentPositionAsync({});
      const { error } = await neon.from('visit_plans').update({ checked_in_at: new Date().toISOString(), check_in_lat: Number(p.coords.latitude.toFixed(6)), check_in_lng: Number(p.coords.longitude.toFixed(6)) }).eq('id', v.id);
      if (error) setErr(friendly(error)); else { setErr(null); await load(); }
    } catch { setErr('อ่านตำแหน่งปัจจุบันไม่ได้'); }
  }

  const shown = rows.filter((r) => mine === 'all' || r.assignee === profile?.id);
  const groups = groupByDay(shown.filter((r) => r.status !== 'cancelled'));
  const mem = (id: string) => { const m = mems.find((x) => x.user_id === id); return m ? nameOf(m) : '-'; };

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>แผนเข้าพบลูกค้า</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Chips value={mine} options={[{ v: 'all', label: 'ทั้งทีม' }, { v: 'mine', label: 'ของฉัน' }]} onPick={setMine} />
        {editable ? (
          <Card>
            <Body>เพิ่มนัดเข้าพบ</Body>
            <Body tone="muted">ลูกค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {custs.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setF({ ...f, customer: c.id })}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: f.customer === c.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
              {custs.length === 0 ? <Body tone="muted">ยังไม่มีลูกค้า — เพิ่มที่เมนูลูกค้าก่อน</Body> : null}
            </View>
            <Field label="หัวข้อ" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
            <Field label="วันที่ (ปปปป-ดด-วว)" value={f.date} onChangeText={(v) => setF({ ...f, date: v })} />
            <Field label="เวลา (ชช:นน)" value={f.time} onChangeText={(v) => setF({ ...f, time: v })} />
            <Chips value={f.mins} options={[{ v: '30', label: '30 นาที' }, { v: '60', label: '1 ชม.' }, { v: '120', label: '2 ชม.' }, { v: '240', label: '4 ชม.' }]} onPick={(v) => setF({ ...f, mins: v })} />
            {isAdmin ? (
              <>
                <Body tone="muted">ผู้รับผิดชอบ</Body>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                  {mems.map((m) => (
                    <Pressable key={m.user_id} accessibilityRole="button" onPress={() => setF({ ...f, assignee: m.user_id })}
                      style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: (f.assignee || profile?.id) === m.user_id ? colors.selected : 'transparent' }}>
                      <Text style={{ color: colors.text }}>{nameOf(m)}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <Button title="เพิ่มนัด" onPress={add} />
          </Card>
        ) : null}
        {groups.length === 0 ? <Empty>ยังไม่มีนัดเข้าพบ</Empty> : null}
        {groups.map((g) => (
          <View key={g.day}>
            <Text style={{ color: colors.accent, fontWeight: '700', marginVertical: 8 }}>{new Date(g.day + 'T00:00:00').toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            {g.items.map((v) => {
              const c = custs.find((x) => x.id === v.customer_id);
              const a = addrs.find((x) => x.customer_id === v.customer_id);
              const own = isAdmin || v.assignee === profile?.id;
              return (
                <Card key={v.id}>
                  <Text style={{ color: colors.text, fontWeight: '700' }}>{hhmm(new Date(v.starts_at))}–{hhmm(new Date(v.ends_at))} · {v.title}</Text>
                  <Body tone="muted">{c?.name ?? '-'} · {mem(v.assignee)}</Body>
                  <View style={{ flexDirection: 'row', gap: 6, marginVertical: 6 }}>
                    <Pill text={v.status === 'done' ? 'เสร็จแล้ว' : 'วางแผน'} tone={v.status === 'done' ? 'ok' : 'muted'} />
                    {v.checked_in_at ? <Pill text="เช็คอินแล้ว" tone="ok" /> : null}
                  </View>
                  {v.outcome ? <Body tone="muted">ผล: {v.outcome}</Body> : null}
                  {a && a.latitude !== null && a.longitude !== null ? (
                    <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(directionsLink({ lat: a.latitude as number, lng: a.longitude as number }))}><Text style={{ color: colors.accent }}>นำทางไปหาลูกค้า</Text></Pressable>
                  ) : null}
                  {editable && own && v.status === 'planned' ? (
                    <View style={{ marginTop: 8 }}>
                      {!v.checked_in_at ? <Button title="เช็คอินตำแหน่งปัจจุบัน" variant="ghost" onPress={() => checkIn(v)} /> : null}
                      <Field label="สรุปผลการเข้าพบ" value={note[v.id] ?? ''} onChangeText={(t) => setNote({ ...note, [v.id]: t })} />
                      <Button title="จบการเข้าพบ" onPress={() => setStatus(v, 'done')} />
                      <Button title="ยกเลิกนัด" variant="danger" onPress={() => setStatus(v, 'cancelled')} />
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

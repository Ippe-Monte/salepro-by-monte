import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import * as Location from 'expo-location';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { addMinutes, dayKey, groupByDay, hhmm, parseLocal } from '@/lib/dates';
import { friendly } from '@/lib/errors';
import { directionsLink, formatKm, legs, type Coords } from '@/lib/geo';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { Icon } from '@/ui/Icon';
import { TitleAdd } from '@/ui/ListBits';
import { CalendarGrid, DateField, TimeField, fmtDate } from '@/ui/Pickers';
import { StopsMap, type Stop } from '@/ui/StopsMap';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

type V = {
  id: string; customer_id: string; address_id: string | null; assignee: string; title: string; purpose: string | null;
  starts_at: string; ends_at: string; status: 'planned' | 'done' | 'cancelled'; outcome: string | null; checked_in_at: string | null;
  location_name: string | null; location_lat: number | null; location_lng: number | null;
};
type C = { id: string; name: string };
type Mem = { user_id: string; profiles: { display_name: string; email: string } | { display_name: string; email: string }[] | null };
type A = { id: string; customer_id: string; latitude: number | null; longitude: number | null };
type Loc = { lat: number; lng: number } | null;

const nameOf = (m: Mem) => { const p = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles; return p?.display_name || p?.email || (m.user_id ?? '').slice(0, 6); };

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
  const [tab, setTab] = useState<'cal' | 'map'>('cal');
  const [day, setDay] = useState(dayKey(new Date()));
  const [adding, setAdding] = useState(false);
  const [loc, setLoc] = useState<Loc>(null); // meeting place chosen for this visit; null = customer's address
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState<Loc>(null);
  const [sel, setSel] = useState<string | null>(null); // visit opened from the day list
  const [ed, setEd] = useState<{ id: string; title: string; date: string; time: string; mins: string } | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [v, c, m, a] = await Promise.all([
      neon.from('visit_plans').select('id,customer_id,address_id,assignee,title,purpose,starts_at,ends_at,status,outcome,checked_in_at,location_name,location_lat,location_lng').eq('org_id', orgId).order('starts_at'),
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
      ...(loc ? { location_lat: loc.lat, location_lng: loc.lng, location_name: 'ระบุเอง' } : {}),
    });
    if (error) return setErr(friendly(error));
    setF({ ...f, title: '' }); setLoc(null); setAdding(false); setDay(f.date); setErr(null); await load();
  }

  const addrOf = (customerId: string) => addrs.find((x) => x.customer_id === customerId);
  /** Where a visit takes place: its own point if one was set, otherwise the customer's default address. */
  const placeOf = (v: V): Coords | null => {
    if (v.location_lat !== null && v.location_lng !== null) return { lat: v.location_lat, lng: v.location_lng };
    const a = addrOf(v.customer_id);
    return a && a.latitude !== null && a.longitude !== null ? { lat: a.latitude, lng: a.longitude } : null;
  };

  /** Keep the chosen point only for this visit, or also save it as the customer's address coordinates. */
  async function confirmPick(alsoCustomer: boolean) {
    if (!pick) return;
    if (alsoCustomer && f.customer) {
      const a = addrOf(f.customer);
      if (a) {
        const { error } = await neon.from('customer_addresses').update({ latitude: pick.lat, longitude: pick.lng }).eq('id', a.id);
        if (error) return setErr(friendly(error));
        await load();
      } else setErr('ลูกค้ารายนี้ยังไม่มีที่อยู่ให้บันทึกพิกัด จึงใช้เฉพาะนัดนี้');
    }
    setLoc(pick); setPickOpen(false);
  }

  async function setStatus(v: V, status: 'done' | 'cancelled') {
    const patch: Record<string, unknown> = { status };
    if (status === 'done') patch.outcome = (note[v.id] ?? '').trim() || null;
    const { error } = await neon.from('visit_plans').update(patch).eq('id', v.id);
    if (error) setErr(friendly(error)); else { setErr(null); setSel(null); await load(); }
  }

  async function saveEdit() {
    if (!ed) return;
    if (!ed.title.trim()) return setErr('กรอกหัวข้อการเข้าพบ');
    const start = parseLocal(ed.date, ed.time); const mins = Number(ed.mins);
    if (!start) return setErr('วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว และเวลา ชช:นน');
    if (!Number.isFinite(mins) || mins < 5 || mins > 1440) return setErr('ระยะเวลาต้องอยู่ระหว่าง 5 ถึง 1440 นาที');
    const { error } = await neon.from('visit_plans').update({ title: ed.title.trim(), starts_at: start.toISOString(), ends_at: addMinutes(start, mins).toISOString() }).eq('id', ed.id);
    if (error) return setErr(friendly(error));
    setErr(null); setDay(ed.date); setEd(null); await load();
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

  const shown = rows.filter((r) => (mine === 'all' || r.assignee === profile?.id) && r.status !== 'cancelled');
  const marks = useMemo(() => new Set(shown.map((r) => dayKey(new Date(r.starts_at)))), [shown]);
  const dayRows = shown.filter((r) => dayKey(new Date(r.starts_at)) === day).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const mem = (id: string) => { const m = mems.find((x) => x.user_id === id); return m ? nameOf(m) : '-'; };
  const custName = (id: string) => custs.find((x) => x.id === id)?.name ?? '-';

  // Map tab: the selected day's visits as numbered stops, in time order.
  const places = dayRows.map((v) => placeOf(v));
  const stops: Stop[] = dayRows.flatMap((v, i) => { const p = places[i]; return p ? [{ n: i + 1, lat: p.lat, lng: p.lng, label: `${hhmm(new Date(v.starts_at))} ${custName(v.customer_id)}` }] : []; });
  const legKm = legs(places);
  const totalKm = legKm.reduce<number>((a, b) => a + (b ?? 0), 0);

  const tabBtn = (key: 'cal' | 'map', label: string, icon: string) => (
    <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)}
      style={{ flex: 1, minHeight: 40, borderRadius: 10, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: tab === key ? colors.primary : 'transparent' }}>
      <Icon name={icon} size={18} color={tab === key ? '#fff' : colors.muted} />
      <Text style={{ color: tab === key ? '#fff' : colors.muted, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );

  /** One appointment in the day list. Tapping it opens the actions; the list itself has no finish/cancel buttons. */
  const visitCard = (v: V, i: number) => {
    const own = isAdmin || v.assignee === profile?.id;
    const p = places[i] ?? null;
    const open = sel === v.id;
    return (
      <Card key={v.id}>
        <Pressable accessibilityRole="button" onPress={() => { setSel(open ? null : v.id); setEd(null); }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{i + 1}. {hhmm(new Date(v.starts_at))}–{hhmm(new Date(v.ends_at))} · {v.title}</Text>
          <Body tone="muted">{custName(v.customer_id)} · {mem(v.assignee)}</Body>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
            <Pill text={v.status === 'done' ? 'เสร็จแล้ว' : 'วางแผน'} tone={v.status === 'done' ? 'ok' : 'muted'} />
            {v.checked_in_at ? <Pill text="เช็คอินแล้ว" tone="ok" /> : null}
            {v.location_lat !== null ? <Pill text="สถานที่ระบุเอง" tone="muted" /> : null}
          </View>
        </Pressable>
        {open ? (
          <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
            {v.outcome ? <Body tone="muted">ผล: {v.outcome}</Body> : null}
            {p ? (
              <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(directionsLink(p))}><Text style={{ color: colors.accent }}>นำทางไปหาลูกค้า</Text></Pressable>
            ) : <Body tone="muted">ยังไม่มีพิกัดสถานที่</Body>}
            {editable && own && v.status === 'planned' ? (
              ed?.id === v.id ? (
                <View style={{ marginTop: 8 }}>
                  <Field label="หัวข้อ" value={ed.title} onChangeText={(t) => setEd({ ...ed, title: t })} />
                  <DateField label="วันที่" value={ed.date} onChange={(d) => setEd({ ...ed, date: d })} />
                  <TimeField label="เวลา (24 ชม.)" value={ed.time} onChange={(t) => setEd({ ...ed, time: t })} />
                  <Chips value={ed.mins} options={[{ v: '30', label: '30 นาที' }, { v: '60', label: '1 ชม.' }, { v: '120', label: '2 ชม.' }, { v: '240', label: '4 ชม.' }]} onPick={(m) => setEd({ ...ed, mins: m })} />
                  <Button title="บันทึกการแก้ไข" onPress={() => void saveEdit()} />
                  <Button title="ยกเลิก" variant="ghost" onPress={() => setEd(null)} />
                </View>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {!v.checked_in_at ? <Button title="เช็คอินตำแหน่งปัจจุบัน" variant="ghost" onPress={() => checkIn(v)} /> : null}
                  <Button title="แก้ไขนัด" variant="ghost" onPress={() => { const st = new Date(v.starts_at); setEd({ id: v.id, title: v.title, date: dayKey(st), time: hhmm(st), mins: String(Math.round((new Date(v.ends_at).getTime() - st.getTime()) / 60000)) }); }} />
                  <Field label="สรุปผลการเข้าพบ" value={note[v.id] ?? ''} onChangeText={(t) => setNote({ ...note, [v.id]: t })} />
                  <Button title="จบการเข้าพบ" onPress={() => setStatus(v, 'done')} />
                  <Button title="ยกเลิกนัด" variant="danger" onPress={() => setStatus(v, 'cancelled')} />
                </View>
              )
            ) : null}
          </View>
        ) : null}
      </Card>
    );
  };

  const cust = custs.find((c) => c.id === f.customer);
  const defaultPlace = f.customer ? (() => { const a = addrOf(f.customer); return a && a.latitude !== null && a.longitude !== null ? { lat: a.latitude, lng: a.longitude } : null; })() : null;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <TitleAdd title="แผนเข้าพบลูกค้า" show={editable} open={adding} onToggle={() => { setAdding(!adding); setF((x) => ({ ...x, date: day })); }} label="เพิ่มนัดเข้าพบ" />
        {err ? <Body tone="danger">{err}</Body> : null}
        {adding ? (
          <Card>
            <Body>เพิ่มนัดเข้าพบ</Body>
            <Body tone="muted">ลูกค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {custs.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => { setF({ ...f, customer: c.id }); setLoc(null); }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: f.customer === c.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
              {custs.length === 0 ? <Body tone="muted">ยังไม่มีลูกค้า — เพิ่มที่เมนูลูกค้าก่อน</Body> : null}
            </View>
            <Field label="หัวข้อ" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
            <DateField label="วันที่" value={f.date} onChange={(d) => setF({ ...f, date: d })} />
            <TimeField label="เวลา (24 ชม.)" value={f.time} onChange={(t) => setF({ ...f, time: t })} />
            <Chips value={f.mins} options={[{ v: '30', label: '30 นาที' }, { v: '60', label: '1 ชม.' }, { v: '120', label: '2 ชม.' }, { v: '240', label: '4 ชม.' }]} onPick={(v) => setF({ ...f, mins: v })} />
            <Body tone="muted">สถานที่นัด</Body>
            <Body>{loc ? `พิกัดที่เลือกเอง (${loc.lat}, ${loc.lng})` : defaultPlace ? `ที่อยู่ของ ${cust?.name ?? 'ลูกค้า'}` : f.customer ? 'ลูกค้ายังไม่มีพิกัด — เลือกจุดบนแผนที่ได้' : 'เลือกลูกค้าก่อน'}</Body>
            {f.customer ? <Button title={loc || defaultPlace ? 'เปลี่ยนสถานที่นัด' : 'ปักหมุดบนแผนที่'} variant="ghost" icon="pin" onPress={() => { setPick(loc ?? defaultPlace); setPickOpen(true); }} /> : null}
            {loc ? <Button title="ใช้ที่อยู่ลูกค้าตามเดิม" variant="ghost" onPress={() => setLoc(null)} /> : null}
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
            <Button title="ยกเลิก" variant="ghost" onPress={() => { setAdding(false); setLoc(null); }} />
          </Card>
        ) : null}
        <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
          {tabBtn('cal', 'ปฏิทิน', 'schedule')}
          {tabBtn('map', 'แผนที่', 'map')}
        </View>
        <Chips value={mine} options={[{ v: 'all', label: 'ทั้งทีม' }, { v: 'mine', label: 'ของฉัน' }]} onPick={setMine} />

        {tab === 'cal' ? (
          <>
            <Card><CalendarGrid value={day} onChange={(d) => { setDay(d); setF((x) => ({ ...x, date: d })); }} marks={marks} /></Card>
            <Text style={{ color: colors.accent, fontWeight: '800', marginVertical: 8 }}>{fmtDate(day)}</Text>
            {dayRows.length === 0 ? <Empty>วันนี้ยังไม่มีนัดเข้าพบ</Empty> : dayRows.map((v, i) => visitCard(v, i))}
          </>
        ) : (
          <>
            <Text style={{ color: colors.accent, fontWeight: '800', marginBottom: 4 }}>{day === dayKey(new Date()) ? 'แผนเดินทางวันนี้' : 'แผนเดินทาง'} · {fmtDate(day)}</Text>
            <DateField label="เลือกวันที่" value={day} onChange={(d) => { setDay(d); setF((x) => ({ ...x, date: d })); }} />
            {day !== dayKey(new Date()) ? <Button title="กลับไปวันนี้" variant="ghost" onPress={() => setDay(dayKey(new Date()))} /> : null}
            {dayRows.length === 0 ? <Empty>วันนี้ยังไม่มีนัดเข้าพบ</Empty> : (
              <>
                <StopsMap stops={stops} height={340} />
                <Card>
                  <Text style={{ color: colors.text, fontWeight: '800', marginBottom: 6 }}>ลำดับการเดินทาง{stops.length > 1 ? ` · รวมประมาณ ${formatKm(totalKm)} (เส้นตรง)` : ''}</Text>
                  {dayRows.map((v, i) => (
                    <View key={v.id}>
                      {legKm[i] != null ? <Text style={{ color: colors.muted, fontSize: 12, marginLeft: 36, marginVertical: 2 }}>↓ {formatKm(legKm[i] as number)}</Text> : null}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: places[i] ? colors.primary : colors.muted, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800' }}>{i + 1}</Text></View>
                        <View style={{ flexShrink: 1 }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{hhmm(new Date(v.starts_at))} · {custName(v.customer_id)}</Text>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>{v.title}{places[i] ? '' : ' · ยังไม่มีพิกัด'}</Text>
                        </View>
                      </View>
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        )}
      </ScrollView>

      {pickOpen ? (
        <Modal animationType="slide" onRequestClose={() => setPickOpen(false)}>
          <View style={{ flex: 1, backgroundColor: colors.bg, padding: 16, paddingTop: 24 }}>
            <Title>เลือกสถานที่นัด</Title>
            <Body tone="muted">แตะบนแผนที่เพื่อปักหมุดตำแหน่งใหม่</Body>
            <View style={{ marginVertical: 12 }}><StopsMap stops={defaultPlace ? [{ n: 1, ...defaultPlace, label: cust?.name ?? 'ลูกค้า' }] : []} picked={pick} height={380} onPick={(lat, lng) => setPick({ lat, lng })} /></View>
            {pick ? <Body>{`พิกัด ${pick.lat}, ${pick.lng}`}</Body> : null}
            {pick ? <Body tone="muted">ต้องการบันทึกพิกัดนี้เป็นที่อยู่ของลูกค้าด้วยหรือไม่?</Body> : null}
            <Button title="บันทึกเป็นที่อยู่ลูกค้าด้วย และใช้กับนัดนี้" onPress={() => void confirmPick(true)} />
            <Button title="ใช้เฉพาะนัดนี้" variant="ghost" onPress={() => void confirmPick(false)} />
            <Button title="ยกเลิก" variant="ghost" onPress={() => setPickOpen(false)} />
          </View>
        </Modal>
      ) : null}
    </Screen>
  );
}

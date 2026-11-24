import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import * as Location from 'expo-location';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { directionsLink, mapsLink, parseCoords, validateCoordPair } from '@/lib/geo';
import { neon } from '@/lib/neon';
import { searchPlaces, type Place } from '@/lib/places';
import type { ScanResult } from '@/lib/cardscan';
import { CardScanner, Contacts, CustomerLogo, LogoEditor } from '@/ui/CustomerExtras';
import { Icon } from '@/ui/Icon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { AddToggle, ConfirmTrash } from '@/ui/ListBits';
import { DetailRows, EditActions } from '@/ui/ViewEdit';
import { colors } from '@/ui/theme';

type Addr = {
  id: string; customer_id: string; label: string; address_line: string; province: string | null;
  latitude: number | null; longitude: number | null; contact_name: string | null; contact_phone: string | null;
  is_default: boolean; zone_id: string | null;
};
type Cust = { id: string; code: string; name: string; phone: string | null; email: string | null; tax_id: string | null; archived_at: string | null };
type Zone = { id: string; code: string; name: string };
type CStat = 'regular' | 'negotiating' | 'none';
const CSTAT: Record<CStat, { label: string; tone: 'ok' | 'warn' | 'muted' }> = { regular: { label: 'ลูกค้าประจำ', tone: 'ok' }, negotiating: { label: 'กำลังเจรจา', tone: 'warn' }, none: { label: 'ยังไม่มีงาน', tone: 'muted' } };

/** Optional: records which delivery zone the customer's coordinates fall in. */
function ZonePick({ zones, value, onPick }: { zones: Zone[]; value: string; onPick: (id: string) => void }) {
  return (
    <View>
      <Body tone="muted">โซนส่งของ (ไม่บังคับ ใช้บันทึกว่าพิกัดของลูกค้าอยู่ในโซนใด)</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
        {[{ id: '', name: 'ไม่ระบุ' }, ...zones].map((z) => (
          <Pressable key={z.id || 'none'} accessibilityRole="button" onPress={() => onPick(z.id)}
            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: value === z.id ? colors.selected : 'transparent' }}>
            <Text style={{ color: colors.text }}>{z.name}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

export default function Customers() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('customers', current?.role);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [q, setQ] = useState('');
  const [stat, setStat] = useState<'all' | CStat>('all');
  const [info, setInfo] = useState<Record<string, { stat: CStat; last: string | null }>>({});
  const wide = useWindowDimensions().width >= 700;
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [nc, setNc] = useState({ code: '', name: '', phone: '', email: '', tax: '' });
  // New customer wizard: step 1 = company + its address, step 2 = first contact person.
  const [step, setStep] = useState<1 | 2>(1);
  const EMPTY_AD = { label: '', line: '', province: '', lat: '', lng: '', zone: '' };
  const EMPTY_C1 = { name: '', position: '', phone: '', email: '', line: '', source: 'typed' as 'typed' | 'card_photo' | 'qr' };
  const [ad, setAd] = useState(EMPTY_AD);
  const [c1, setC1] = useState(EMPTY_C1);
  const [editing, setEditing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [ce, setCe] = useState({ code: '', name: '', phone: '', email: '', tax: '' });
  const [addingAddr, setAddingAddr] = useState(false);
  const [qs, setQs] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [na, setNa] = useState({ label: 'สาขา', line: '', province: '', lat: '', lng: '', contact: '', phone: '', zone: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const [c, a, z, jt, iv] = await Promise.all([
      neon.from('customers').select('id,code,name,phone,email,tax_id,archived_at').eq('org_id', orgId).order('name'),
      neon.from('customer_addresses').select('id,customer_id,label,address_line,province,latitude,longitude,contact_name,contact_phone,is_default,zone_id').eq('org_id', orgId),
      neon.from('delivery_zones').select('id,code,name').eq('org_id', orgId).order('code'),
      neon.from('job_tickets').select('customer_id,status,created_at').eq('org_id', orgId),
      neon.from('invoices').select('customer_id,status').eq('org_id', orgId),
    ]);
    if (c.error || a.error || z.error || jt.error || iv.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    const m: Record<string, { stat: CStat; last: string | null }> = {};
    for (const t of jt.data as { customer_id: string; status: string; created_at: string }[]) {
      const x = (m[t.customer_id] ??= { stat: 'none', last: null });
      if (!['done', 'cancelled'].includes(t.status) && x.stat === 'none') x.stat = 'negotiating';
      if (!x.last || t.created_at > x.last) x.last = t.created_at;
    }
    for (const v of iv.data as { customer_id: string; status: string }[]) if (v.status !== 'cancelled' && v.status !== 'draft') (m[v.customer_id] ??= { stat: 'none', last: null }).stat = 'regular';
    setInfo(m);
    setErr(null); setCusts(c.data as Cust[]); setAddrs(a.data as Addr[]); setZones(z.data as Zone[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return custs.filter((c) => !c.archived_at && (stat === 'all' || (info[c.id]?.stat ?? 'none') === stat) && (!t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t)));
  }, [custs, q, stat, info]);

  async function search() {
    if (searching) return;
    setSearching(true); setFound(null);
    try { setFound(await searchPlaces(qs || nc.name)); setErr(null); } catch { setErr('ค้นหาจากอินเทอร์เน็ตไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setSearching(false); }
  }

  function usePlace(p: Place) {
    setNc((c) => ({ ...c, name: p.name, phone: c.phone || p.phone, code: c.code || nextCode() }));
    setAd((a) => ({ ...a, line: a.line || p.address, province: a.province || p.province || '', lat: a.lat || String(p.lat), lng: a.lng || String(p.lng) }));
    setFound(null);
  }

  function useCard(r: ScanResult) {
    setNc((c) => ({ ...c, name: c.name || r.company, code: c.code || nextCode() }));
    setC1({ name: r.name, position: r.position, phone: r.phone, email: r.email, line: r.lineId, source: r.source });
  }

  const nextCode = () => `C${String(custs.length + 1).padStart(4, '0')}`;

  function coordsOf(a: { lat: string; lng: string }): { lat: string; lng: string } | string {
    let lat = a.lat; let lng = a.lng;
    if (lat && !lng) { const p = parseCoords(lat); if (p) { lat = String(p.lat); lng = String(p.lng); } }
    return validateCoordPair(lat, lng) ?? { lat, lng };
  }

  function nextStep() {
    if (!nc.code.trim() || !nc.name.trim()) return setErr('กรอกรหัสและชื่อลูกค้า');
    if (!ad.line.trim()) return setErr('กรอกที่อยู่ของบริษัท');
    if (typeof coordsOf(ad) === 'string') return setErr(coordsOf(ad) as string);
    setErr(null); setStep(2);
  }

  async function addCustomer() {
    if (!orgId || busy) return;
    if (!c1.name.trim()) return setErr('กรอกชื่อผู้ติดต่อคนแรก');
    const co = coordsOf(ad);
    if (typeof co === 'string') return setErr(co);
    setBusy(true);
    const { data: made, error } = await neon.from('customers').insert({ org_id: orgId, code: nc.code.trim(), name: nc.name.trim(), phone: nc.phone.trim() || null, email: nc.email.trim() || null, tax_id: nc.tax.trim() || null }).select('id').single();
    if (error || !made) { setBusy(false); setStep(1); return setErr(error?.code === '23505' ? 'รหัสลูกค้านี้ถูกใช้แล้ว' : friendly(error)); }
    const warn: string[] = [];
    const { data: a, error: ae } = await neon.from('customer_addresses').insert({
      org_id: orgId, customer_id: made.id, label: ad.label.trim() || 'สำนักงานใหญ่', address_line: ad.line.trim(), province: ad.province.trim() || null,
      latitude: co.lat ? Number(co.lat) : null, longitude: co.lng ? Number(co.lng) : null, zone_id: ad.zone || null,
    }).select('id').single();
    if (ae || !a) warn.push('บันทึกที่อยู่ไม่สำเร็จ'); else await neon.rpc('set_default_address', { p_address: a.id });
    const { error: cerr } = await neon.from('customer_contacts').insert({ org_id: orgId, customer_id: made.id, name: c1.name.trim(), position: c1.position.trim() || null, phone: c1.phone.trim() || null, email: c1.email.trim() || null, line_id: c1.line.trim() || null, source: c1.source });
    if (cerr) warn.push('บันทึกผู้ติดต่อไม่สำเร็จ');
    setBusy(false);
    setNc({ code: '', name: '', phone: '', email: '', tax: '' }); setAd(EMPTY_AD); setC1(EMPTY_C1); setStep(1); setQs(''); setFound(null);
    setErr(warn.length ? warn.join(' / ') : null); setAdding(false); await load();
    setOpen(made.id); setEditing(false); setSaved(true);
  }

  function startEdit(c: Cust) { setCe({ code: c.code, name: c.name, phone: c.phone ?? '', email: c.email ?? '', tax: c.tax_id ?? '' }); setSaved(false); setErr(null); setAddingAddr(false); setEditing(true); }
  async function saveEdit(id: string) {
    if (!ce.code.trim() || !ce.name.trim()) return setErr('กรอกรหัสและชื่อลูกค้า');
    setBusy(true);
    const { error } = await neon.from('customers').update({ code: ce.code.trim(), name: ce.name.trim(), phone: ce.phone.trim() || null, email: ce.email.trim() || null, tax_id: ce.tax.trim() || null }).eq('id', id);
    setBusy(false);
    if (error) return setErr(error.code === '23505' ? 'รหัสลูกค้านี้ถูกใช้แล้ว' : friendly(error));
    setErr(null); setEditing(false); setSaved(true); await load();
  }

  async function archiveCustomer(id: string) {
    const { error } = await neon.from('customers').update({ archived_at: new Date().toISOString() }).eq('id', id);
    if (error) return setErr(friendly(error));
    if (open === id) setOpen(null);
    setErr(null); await load();
  }

  async function useMyLocation() {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') return setErr('ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง');
      const p = await Location.getCurrentPositionAsync({});
      setNa((s) => ({ ...s, lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6) }));
      setErr(null);
    } catch { setErr('อ่านตำแหน่งปัจจุบันไม่ได้'); }
  }

  async function addAddress(customerId: string, first: boolean) {
    if (!orgId || busy) return;
    if (!na.line.trim()) return setErr('กรอกที่อยู่');
    let latText = na.lat; let lngText = na.lng;
    if (latText && !lngText) { const p = parseCoords(latText); if (p) { latText = String(p.lat); lngText = String(p.lng); } }
    const bad = validateCoordPair(latText, lngText);
    if (bad) return setErr(bad);
    setBusy(true);
    const { data, error } = await neon.from('customer_addresses').insert({
      org_id: orgId, customer_id: customerId, label: na.label.trim() || 'ที่อยู่', address_line: na.line.trim(),
      province: na.province.trim() || null, latitude: latText ? Number(latText) : null, longitude: lngText ? Number(lngText) : null,
      contact_name: na.contact.trim() || null, contact_phone: na.phone.trim() || null, zone_id: na.zone || null,
    }).select('id').single();
    if (!error && first && data) await neon.rpc('set_default_address', { p_address: data.id });
    setBusy(false);
    if (error) return setErr(friendly(error));
    setNa({ label: 'สาขา', line: '', province: '', lat: '', lng: '', contact: '', phone: '', zone: '' }); setErr(null); setAddingAddr(false); await load();
  }

  async function removeAddr(id: string) {
    const { error } = await neon.from('customer_addresses').delete().eq('id', id);
    if (error) setErr(friendly(error)); else await load();
  }
  async function makeDefault(id: string) {
    const { error } = await neon.rpc('set_default_address', { p_address: id });
    if (error) setErr(friendly(error)); else await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ลูกค้า</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        {editable ? <AddToggle open={adding} onToggle={() => setAdding(!adding)} label="เพิ่มลูกค้า" /> : null}
        {editable && adding ? (
          <Card>
            <Body>{step === 1 ? 'ขั้นที่ 1/2 · ข้อมูลบริษัทและที่อยู่' : 'ขั้นที่ 2/2 · ผู้ติดต่อคนแรก'}</Body>
            {step === 1 ? (
              <>
                <Field label="ค้นหาบริษัทจากอินเทอร์เน็ต (พิมพ์ชื่อ)" value={qs} onChangeText={setQs} />
                <Button title="ค้นหาข้อมูลบริษัท" variant="ghost" icon="search" busy={searching} onPress={() => void search()} />
                {found && found.length === 0 ? <Body tone="muted">ไม่พบข้อมูล — พิมพ์ข้อมูลเองได้เลย</Body> : null}
                {found?.map((p) => (
                  <Pressable key={p.id} accessibilityRole="button" onPress={() => usePlace(p)} style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingVertical: 8 }}>
                    <Text style={{ color: colors.text, fontWeight: '700' }}>{p.name}</Text>
                    <Text style={{ color: colors.muted, fontSize: 12 }}>{p.address}{p.province ? ` ${p.province}` : ''}{p.phone ? ` · ${p.phone}` : ''}</Text>
                    <Text style={{ color: colors.accent, fontSize: 12 }}>ใช้ข้อมูลนี้</Text>
                  </Pressable>
                ))}
                <Field label="รหัสลูกค้า" value={nc.code} onChangeText={(v) => setNc({ ...nc, code: v })} autoCapitalize="characters" />
                <Field label="ชื่อลูกค้า / บริษัท" value={nc.name} onChangeText={(v) => setNc({ ...nc, name: v })} />
                <Field label="เลขประจำตัวผู้เสียภาษี" value={nc.tax} onChangeText={(v) => setNc({ ...nc, tax: v })} keyboardType="number-pad" />
                <Field label="โทรศัพท์บริษัท" value={nc.phone} onChangeText={(v) => setNc({ ...nc, phone: v })} keyboardType="phone-pad" />
                <Field label="อีเมลบริษัท" value={nc.email} onChangeText={(v) => setNc({ ...nc, email: v })} keyboardType="email-address" autoCapitalize="none" />
                <Body>ที่อยู่บริษัท (1 บริษัท 1 ที่อยู่ ถ้ามีหลายที่อยู่ให้เพิ่มเป็นสาขาภายหลัง)</Body>
                <Field label="ชื่อสาขา (เว้นว่าง = สำนักงานใหญ่)" value={ad.label} onChangeText={(v) => setAd({ ...ad, label: v })} />
                <Field label="ที่อยู่" value={ad.line} onChangeText={(v) => setAd({ ...ad, line: v })} multiline />
                <Field label="จังหวัด" value={ad.province} onChangeText={(v) => setAd({ ...ad, province: v })} />
                <Field label="ละติจูด (หรือวาง 13.7563, 100.5018)" value={ad.lat} onChangeText={(v) => setAd({ ...ad, lat: v })} keyboardType="numbers-and-punctuation" />
                <Field label="ลองจิจูด" value={ad.lng} onChangeText={(v) => setAd({ ...ad, lng: v })} keyboardType="numbers-and-punctuation" />
                <ZonePick zones={zones} value={ad.zone} onPick={(id) => setAd({ ...ad, zone: id })} />
                <Button title="ถัดไป: ผู้ติดต่อ" onPress={nextStep} />
              </>
            ) : (
              <>
                <Body tone="muted">{`บริษัท: ${nc.name}`}</Body>
                <CardScanner onResult={useCard} />
                <Field label="ชื่อผู้ติดต่อ" value={c1.name} onChangeText={(v) => setC1({ ...c1, name: v })} />
                <Field label="ตำแหน่ง" value={c1.position} onChangeText={(v) => setC1({ ...c1, position: v })} />
                <Field label="โทรศัพท์" value={c1.phone} onChangeText={(v) => setC1({ ...c1, phone: v })} keyboardType="phone-pad" />
                <Field label="อีเมล" value={c1.email} onChangeText={(v) => setC1({ ...c1, email: v })} keyboardType="email-address" autoCapitalize="none" />
                <Field label="LINE ID" value={c1.line} onChangeText={(v) => setC1({ ...c1, line: v })} autoCapitalize="none" />
                <Body tone="muted">ผู้ติดต่อคนอื่นเพิ่มได้ภายหลัง ด้วยปุ่ม + ในหน้ารายละเอียดลูกค้า</Body>
                <Button title="บันทึกลูกค้า" onPress={addCustomer} busy={busy} />
                <Button title="ย้อนกลับ" variant="ghost" onPress={() => setStep(1)} />
              </>
            )}
          </Card>
        ) : null}
        <Field label="ค้นหา (ชื่อหรือรหัส)" value={q} onChangeText={setQ} />
        <Chips value={stat} options={[{ v: 'all', label: 'ทุกสถานะ' }, { v: 'regular', label: 'ลูกค้าประจำ' }, { v: 'negotiating', label: 'กำลังเจรจา' }, { v: 'none', label: 'ยังไม่มีงาน' }]} onPick={setStat} />
        {shown.length === 0 ? <Empty>ยังไม่มีลูกค้า</Empty> : null}
        {wide && shown.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.border, borderRadius: 10, gap: 8 }}>
            <Text style={{ flex: 1, color: colors.muted, fontWeight: '700', fontSize: 12, paddingLeft: 56 }}>ลูกค้า</Text>
            <Text style={{ width: 120, color: colors.muted, fontWeight: '700', fontSize: 12 }}>สถานะ</Text>
            <Text style={{ width: 120, color: colors.muted, fontWeight: '700', fontSize: 12 }}>โทรศัพท์</Text>
            <Text style={{ width: 96, color: colors.muted, fontWeight: '700', fontSize: 12 }}>งานล่าสุด</Text>
            <Text style={{ width: 28 + 40, color: colors.muted, fontWeight: '700', fontSize: 12 }}>ดู</Text>
          </View>
        ) : null}
        {shown.map((c) => {
          const list = addrs.filter((a) => a.customer_id === c.id);
          const isOpen = open === c.id;
          const st = info[c.id]?.stat ?? 'none'; const last = info[c.id]?.last ?? null;
          return (
            <Card key={c.id}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable accessibilityRole="button" onPress={() => { setEditing(false); setSaved(false); setOpen(isOpen ? null : c.id); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <CustomerLogo customerId={c.id} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{c.name}</Text>
                    <Text style={{ color: colors.muted }}>{c.code}{!wide && c.phone ? ` · ${c.phone}` : ''} · {list.length} ที่อยู่</Text>
                    {!wide ? <View style={{ flexDirection: 'row', marginTop: 4 }}><Pill text={CSTAT[st].label} tone={CSTAT[st].tone} /></View> : null}
                  </View>
                  {wide ? (
                    <>
                      <View style={{ width: 120, alignItems: 'flex-start' }}><Pill text={CSTAT[st].label} tone={CSTAT[st].tone} /></View>
                      <Text style={{ width: 120, color: colors.text }}>{c.phone ?? '-'}</Text>
                      <Text style={{ width: 96, color: colors.muted, fontSize: 13 }}>{last ? last.slice(0, 10) : '-'}</Text>
                      <View style={{ width: 28, alignItems: 'center' }}><Icon name="eye" size={20} color={colors.accent} /></View>
                    </>
                  ) : null}
                </Pressable>
                {editable ? <ConfirmTrash label="ลบลูกค้า" onConfirm={() => void archiveCustomer(c.id)} /> : null}
              </View>
              {isOpen ? (
                <View style={{ marginTop: 12 }}>
                  {editing && orgId ? <LogoEditor orgId={orgId} customerId={c.id} /> : null}
                  {editing ? (
                    <View>
                      <Field label="รหัสลูกค้า" value={ce.code} onChangeText={(v) => setCe({ ...ce, code: v })} autoCapitalize="characters" />
                      <Field label="ชื่อลูกค้า / บริษัท" value={ce.name} onChangeText={(v) => setCe({ ...ce, name: v })} />
                      <Field label="เลขประจำตัวผู้เสียภาษี" value={ce.tax} onChangeText={(v) => setCe({ ...ce, tax: v })} keyboardType="number-pad" />
                      <Field label="โทรศัพท์บริษัท" value={ce.phone} onChangeText={(v) => setCe({ ...ce, phone: v })} keyboardType="phone-pad" />
                      <Field label="อีเมลบริษัท" value={ce.email} onChangeText={(v) => setCe({ ...ce, email: v })} keyboardType="email-address" autoCapitalize="none" />
                    </View>
                  ) : (
                    <DetailRows rows={[['รหัสลูกค้า', c.code], ['ชื่อลูกค้า / บริษัท', c.name], ['เลขประจำตัวผู้เสียภาษี', c.tax_id], ['โทรศัพท์บริษัท', c.phone], ['อีเมลบริษัท', c.email]]} />
                  )}
                  {list.map((a) => {
                    const has = a.latitude !== null && a.longitude !== null;
                    const pt = has ? { lat: a.latitude as number, lng: a.longitude as number } : null;
                    const zone = zones.find((z) => z.id === a.zone_id);
                    return (
                      <View key={a.id} style={{ borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10, marginTop: 10, gap: 4 }}>
                        <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={{ color: colors.text, fontWeight: '600' }}>{a.label}</Text>
                          {a.is_default ? <Pill text="ค่าเริ่มต้น" tone="ok" /> : null}
                          {zone ? <Pill text={zone.name} /> : null}
                          {!has ? <Pill text="ยังไม่มีพิกัด" tone="warn" /> : null}
                        </View>
                        <Body tone="muted">{a.address_line}{a.province ? ` ${a.province}` : ''}</Body>
                        {a.contact_name || a.contact_phone ? <Body tone="muted">ติดต่อ: {a.contact_name ?? ''} {a.contact_phone ?? ''}</Body> : null}
                        {pt ? <Body tone="muted">พิกัด {pt.lat}, {pt.lng}</Body> : null}
                        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                          {pt ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(mapsLink(pt))}><Text style={{ color: colors.accent }}>เปิดแผนที่</Text></Pressable> : null}
                          {pt ? <Pressable accessibilityRole="link" onPress={() => void Linking.openURL(directionsLink(pt))}><Text style={{ color: colors.accent }}>นำทาง</Text></Pressable> : null}
                          {editing && !a.is_default ? <Pressable accessibilityRole="button" onPress={() => void makeDefault(a.id)}><Text style={{ color: colors.accent }}>ตั้งเป็นค่าเริ่มต้น</Text></Pressable> : null}
                          {editing ? <Pressable accessibilityRole="button" onPress={() => void removeAddr(a.id)}><Text style={{ color: colors.danger }}>ลบ</Text></Pressable> : null}
                        </View>
                      </View>
                    );
                  })}
                  {editing ? (
                    <View style={{ marginTop: 10 }}>
                      <AddToggle open={addingAddr} onToggle={() => setAddingAddr(!addingAddr)} label="เพิ่มสาขา / ที่อยู่อื่น" />
                      {addingAddr ? (
                        <View>
                          <Field label="ชื่อสาขา (เช่น โรงงาน, สาขา)" value={na.label} onChangeText={(v) => setNa({ ...na, label: v })} />
                          <Field label="ที่อยู่" value={na.line} onChangeText={(v) => setNa({ ...na, line: v })} multiline />
                          <Field label="จังหวัด" value={na.province} onChangeText={(v) => setNa({ ...na, province: v })} />
                          <Field label="ละติจูด (หรือวาง 13.7563, 100.5018)" value={na.lat} onChangeText={(v) => setNa({ ...na, lat: v })} keyboardType="numbers-and-punctuation" />
                          <Field label="ลองจิจูด" value={na.lng} onChangeText={(v) => setNa({ ...na, lng: v })} keyboardType="numbers-and-punctuation" />
                          <Button title="ใช้ตำแหน่งปัจจุบันของฉัน" variant="ghost" onPress={useMyLocation} />
                          <Field label="ผู้ติดต่อ" value={na.contact} onChangeText={(v) => setNa({ ...na, contact: v })} />
                          <Field label="โทรศัพท์ผู้ติดต่อ" value={na.phone} onChangeText={(v) => setNa({ ...na, phone: v })} keyboardType="phone-pad" />
                          <ZonePick zones={zones} value={na.zone} onPick={(id) => setNa({ ...na, zone: id })} />
                          <Button title="เพิ่มสาขานี้" onPress={() => addAddress(c.id, list.length === 0)} busy={busy} />
                        </View>
                      ) : null}
                    </View>
                  ) : null}
                  {orgId ? <Contacts orgId={orgId} customerId={c.id} editable={editable && editing} /> : null}
                  <EditActions editing={editing} canEdit={editable} busy={busy} saved={saved} onEdit={() => startEdit(c)} onSave={() => void saveEdit(c.id)} onCancel={() => { setEditing(false); setErr(null); }} />
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

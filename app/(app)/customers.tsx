import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
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
import { Body, Button, Card, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Addr = {
  id: string; customer_id: string; label: string; address_line: string; province: string | null;
  latitude: number | null; longitude: number | null; contact_name: string | null; contact_phone: string | null;
  is_default: boolean; zone_id: string | null;
};
type Cust = { id: string; code: string; name: string; phone: string | null; email: string | null; tax_id: string | null; archived_at: string | null };
type Zone = { id: string; code: string; name: string };

export default function Customers() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('customers', current?.role);
  const [custs, setCusts] = useState<Cust[]>([]);
  const [addrs, setAddrs] = useState<Addr[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nc, setNc] = useState({ code: '', name: '', phone: '', email: '' });
  // Prefill from an internet search or a scanned card; saved together with the new customer.
  const [pre, setPre] = useState<{ place: Place | null; contact: ScanResult | null }>({ place: null, contact: null });
  const [qs, setQs] = useState('');
  const [found, setFound] = useState<Place[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [na, setNa] = useState({ label: 'สำนักงานใหญ่', line: '', province: '', lat: '', lng: '', contact: '', phone: '', zone: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const [c, a, z] = await Promise.all([
      neon.from('customers').select('id,code,name,phone,email,tax_id,archived_at').eq('org_id', orgId).order('name'),
      neon.from('customer_addresses').select('id,customer_id,label,address_line,province,latitude,longitude,contact_name,contact_phone,is_default,zone_id').eq('org_id', orgId),
      neon.from('delivery_zones').select('id,code,name').eq('org_id', orgId).order('code'),
    ]);
    if (c.error || a.error || z.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setCusts(c.data as Cust[]); setAddrs(a.data as Addr[]); setZones(z.data as Zone[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return custs.filter((c) => !c.archived_at && (!t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().includes(t)));
  }, [custs, q]);

  async function search() {
    if (searching) return;
    setSearching(true); setFound(null);
    try { setFound(await searchPlaces(qs || nc.name)); setErr(null); } catch { setErr('ค้นหาจากอินเทอร์เน็ตไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setSearching(false); }
  }

  function usePlace(p: Place) {
    setPre((x) => ({ ...x, place: p }));
    setNc((c) => ({ ...c, name: p.name, phone: c.phone || p.phone, code: c.code || nextCode() }));
    setFound(null);
  }

  function useCard(r: ScanResult) {
    setPre((x) => ({ ...x, contact: r }));
    setNc((c) => ({ ...c, name: c.name || r.company, phone: c.phone || r.phone, email: c.email || r.email, code: c.code || nextCode() }));
  }

  const nextCode = () => `C${String(custs.length + 1).padStart(4, '0')}`;

  async function addCustomer() {
    if (!orgId || busy) return;
    if (!nc.code.trim() || !nc.name.trim()) return setErr('กรอกรหัสและชื่อลูกค้า');
    setBusy(true);
    const { data: made, error } = await neon.from('customers').insert({ org_id: orgId, code: nc.code.trim(), name: nc.name.trim(), phone: nc.phone.trim() || null, email: nc.email.trim() || null }).select('id').single();
    if (error || !made) { setBusy(false); return setErr(error?.code === '23505' ? 'รหัสลูกค้านี้ถูกใช้แล้ว' : friendly(error)); }
    const warn: string[] = [];
    if (pre.place) {
      const p = pre.place;
      const { data: a, error: ae } = await neon.from('customer_addresses').insert({ org_id: orgId, customer_id: made.id, label: 'สำนักงานใหญ่', address_line: p.address, province: p.province || null, latitude: p.lat, longitude: p.lng }).select('id').single();
      if (ae || !a) warn.push('บันทึกที่อยู่ไม่สำเร็จ'); else await neon.rpc('set_default_address', { p_address: a.id });
    }
    if (pre.contact?.name) {
      const c = pre.contact;
      const { error: ce } = await neon.from('customer_contacts').insert({ org_id: orgId, customer_id: made.id, name: c.name, position: c.position || null, department: c.department || null, phone: c.phone || null, email: c.email || null, line_id: c.lineId || null, source: c.source });
      if (ce) warn.push('บันทึกผู้ติดต่อไม่สำเร็จ');
    }
    setBusy(false);
    setNc({ code: '', name: '', phone: '', email: '' }); setPre({ place: null, contact: null }); setQs(''); setFound(null);
    setErr(warn.length ? warn.join(' / ') : null); await load();
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
    setNa({ label: 'สาขา', line: '', province: '', lat: '', lng: '', contact: '', phone: '', zone: '' }); setErr(null); await load();
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
        <Field label="ค้นหา (ชื่อหรือรหัส)" value={q} onChangeText={setQ} />
        {editable ? (
          <Card>
            <Body>เพิ่มลูกค้า</Body>
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
            {pre.place ? <Body tone="ok">{`จะเพิ่มที่อยู่และพิกัดจาก: ${pre.place.name} (${pre.place.lat}, ${pre.place.lng})`}</Body> : null}
            <CardScanner onResult={useCard} />
            {pre.contact ? <Body tone="ok">{`จะเพิ่มผู้ติดต่อ: ${pre.contact.name}`}</Body> : null}
            <Field label="รหัสลูกค้า" value={nc.code} onChangeText={(v) => setNc({ ...nc, code: v })} autoCapitalize="characters" />
            <Field label="ชื่อลูกค้า / บริษัท" value={nc.name} onChangeText={(v) => setNc({ ...nc, name: v })} />
            <Field label="โทรศัพท์" value={nc.phone} onChangeText={(v) => setNc({ ...nc, phone: v })} keyboardType="phone-pad" />
            <Field label="อีเมล" value={nc.email} onChangeText={(v) => setNc({ ...nc, email: v })} keyboardType="email-address" autoCapitalize="none" />
            <Button title="เพิ่มลูกค้า" onPress={addCustomer} busy={busy} />
          </Card>
        ) : null}
        {shown.length === 0 ? <Empty>ยังไม่มีลูกค้า</Empty> : null}
        {shown.map((c) => {
          const list = addrs.filter((a) => a.customer_id === c.id);
          const isOpen = open === c.id;
          return (
            <Card key={c.id}>
              <Pressable accessibilityRole="button" onPress={() => setOpen(isOpen ? null : c.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <CustomerLogo customerId={c.id} size={44} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '700', fontSize: 16 }}>{c.name}</Text>
                  <Text style={{ color: colors.muted }}>{c.code}{c.phone ? ` · ${c.phone}` : ''} · {list.length} ที่อยู่</Text>
                </View>
              </Pressable>
              {isOpen ? (
                <View style={{ marginTop: 12 }}>
                  {editable && orgId ? <LogoEditor orgId={orgId} customerId={c.id} /> : null}
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
                          {editable && !a.is_default ? <Pressable accessibilityRole="button" onPress={() => void makeDefault(a.id)}><Text style={{ color: colors.accent }}>ตั้งเป็นค่าเริ่มต้น</Text></Pressable> : null}
                          {editable ? <Pressable accessibilityRole="button" onPress={() => void removeAddr(a.id)}><Text style={{ color: colors.danger }}>ลบ</Text></Pressable> : null}
                        </View>
                      </View>
                    );
                  })}
                  {orgId ? <Contacts orgId={orgId} customerId={c.id} editable={editable} /> : null}
                  {editable ? (
                    <View style={{ marginTop: 14 }}>
                      <Body>เพิ่มที่อยู่</Body>
                      <Field label="ชื่อสถานที่ (เช่น โรงงาน, สาขา)" value={na.label} onChangeText={(v) => setNa({ ...na, label: v })} />
                      <Field label="ที่อยู่" value={na.line} onChangeText={(v) => setNa({ ...na, line: v })} multiline />
                      <Field label="จังหวัด" value={na.province} onChangeText={(v) => setNa({ ...na, province: v })} />
                      <Field label="ละติจูด (หรือวาง 13.7563, 100.5018)" value={na.lat} onChangeText={(v) => setNa({ ...na, lat: v })} keyboardType="numbers-and-punctuation" />
                      <Field label="ลองจิจูด" value={na.lng} onChangeText={(v) => setNa({ ...na, lng: v })} keyboardType="numbers-and-punctuation" />
                      <Button title="ใช้ตำแหน่งปัจจุบันของฉัน" variant="ghost" onPress={useMyLocation} />
                      <Field label="ผู้ติดต่อ" value={na.contact} onChangeText={(v) => setNa({ ...na, contact: v })} />
                      <Field label="โทรศัพท์ผู้ติดต่อ" value={na.phone} onChangeText={(v) => setNa({ ...na, phone: v })} keyboardType="phone-pad" />
                      <Body tone="muted">โซนส่งของ</Body>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                        {[{ id: '', name: 'ไม่ระบุ' }, ...zones].map((z) => (
                          <Pressable key={z.id || 'none'} accessibilityRole="button" onPress={() => setNa({ ...na, zone: z.id })}
                            style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: na.zone === z.id ? colors.selected : 'transparent' }}>
                            <Text style={{ color: colors.text }}>{z.name}</Text>
                          </Pressable>
                        ))}
                      </View>
                      <Button title="บันทึกที่อยู่" onPress={() => addAddress(c.id, list.length === 0)} busy={busy} />
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

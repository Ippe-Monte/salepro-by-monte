import { useCallback, useEffect, useState } from 'react';
import { Image, Platform, Pressable, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { byteaToDataUri, toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage } from '@/lib/pickImage';
import { fromVCardText, ocrCard, pickFileWeb, readQr, type ScanResult } from '@/lib/cardscan';
import { Icon } from './Icon';
import { Body, Button, Field } from './kit';
import { Text } from './Text';
import { colors } from './theme';

/** Customer logo/photo: tiny cache so list rows and the detail view share one fetch. */
const logos = new Map<string, string | null>();
const subs = new Set<() => void>();
async function fetchLogo(id: string) {
  const { data, error } = await neon.from('customer_logos').select('mime,data').eq('customer_id', id).maybeSingle();
  if (error) return;
  const r = data as { mime: string; data: unknown } | null;
  logos.set(id, r ? byteaToDataUri(r.data, r.mime) : null);
  subs.forEach((f) => f());
}

export function CustomerLogo({ customerId, size }: { customerId: string; size: number }) {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (!logos.has(customerId)) void fetchLogo(customerId);
    return () => { subs.delete(f); };
  }, [customerId]);
  const uri = logos.get(customerId);
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.22 }} resizeMode="contain" accessibilityLabel="Customer logo" />;
  return <View style={{ width: size, height: size, borderRadius: size * 0.22, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}><Icon name="building" size={size * 0.5} color={colors.muted} /></View>;
}

export function LogoEditor({ orgId, customerId }: { orgId: string; customerId: string }) {
  const [err, setErr] = useState<string | null>(null);
  async function change() {
    const p = await pickImage({ maxSide: 400, format: 'png' });
    if (p === null) return;
    if (p === 'too-big') return setErr('รูปใหญ่เกินไป ลองรูปอื่น');
    const { error } = await neon.from('customer_logos').upsert({ org_id: orgId, customer_id: customerId, mime: p.mime, data: toByteaParam(p.b64) }, { onConflict: 'customer_id' });
    if (error) return setErr(friendly(error));
    setErr(null); await fetchLogo(customerId);
  }
  async function remove() {
    const { error } = await neon.from('customer_logos').delete().eq('customer_id', customerId);
    if (error) setErr(friendly(error)); else { setErr(null); await fetchLogo(customerId); }
  }
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <CustomerLogo customerId={customerId} size={64} />
      <View style={{ flex: 1 }}>
        <Button title="เปลี่ยนโลโก้/รูปบริษัท" variant="ghost" icon="camera" onPress={() => void change()} />
        {logos.get(customerId) ? <Button title="ลบโลโก้" variant="ghost" onPress={() => void remove()} /> : null}
        {err ? <Body tone="danger">{err}</Body> : null}
      </View>
    </View>
  );
}

/** Two ways to read a business card: photo of a printed card (OCR) or a QR code from an electronic card. */
export function CardScanner({ onResult }: { onResult: (r: ScanResult) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (Platform.OS !== 'web') return <Body tone="muted">การสแกนนามบัตรใช้ได้บนเว็บ/PWA</Body>;

  async function run(kind: 'ocr' | 'qr') {
    if (busy) return;
    const file = await pickFileWeb(kind === 'ocr');
    if (!file) return;
    setBusy(true); setStatus(kind === 'ocr' ? 'กำลังอ่านนามบัตร… (ครั้งแรกอาจใช้เวลาสักครู่)' : 'กำลังอ่าน QR…');
    try {
      if (kind === 'qr') {
        const text = await readQr(file);
        const r = text ? fromVCardText(text) : null;
        if (!r) setStatus('ไม่พบ QR นามบัตรในรูปนี้'); else { setStatus('อ่านนามบัตรแล้ว ตรวจสอบข้อมูลก่อนบันทึก'); onResult(r); }
      } else {
        const r = await ocrCard(file, (pct) => setStatus(`กำลังอ่านนามบัตร ${pct}%`));
        if (!r.name && !r.phone && !r.email) setStatus('อ่านข้อความจากรูปไม่ได้ ลองถ่ายให้ชัดและตรงขึ้น');
        else { setStatus('อ่านนามบัตรแล้ว ตรวจสอบและแก้ไขข้อมูลก่อนบันทึก'); onResult(r); }
      }
    } catch { setStatus('อ่านนามบัตรไม่สำเร็จ'); } finally { setBusy(false); }
  }
  return (
    <View>
      <Button title="ถ่ายรูปนามบัตร (อ่านอัตโนมัติ)" variant="ghost" icon="camera" busy={busy} onPress={() => void run('ocr')} />
      <Button title="สแกน QR นามบัตรอิเล็กทรอนิกส์" variant="ghost" icon="search" busy={busy} onPress={() => void run('qr')} />
      {status ? <Body tone="muted">{status}</Body> : null}
    </View>
  );
}

type Contact = { id: string; name: string; position: string | null; department: string | null; phone: string | null; email: string | null; line_id: string | null; source: string };
const empty = { name: '', position: '', department: '', phone: '', email: '', line: '' };

export function Contacts({ orgId, customerId, editable }: { orgId: string; customerId: string; editable: boolean }) {
  const [rows, setRows] = useState<Contact[]>([]);
  const [f, setF] = useState(empty);
  const [source, setSource] = useState<'typed' | 'card_photo' | 'qr'>('typed');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await neon.from('customer_contacts').select('id,name,position,department,phone,email,line_id,source').eq('org_id', orgId).eq('customer_id', customerId).order('created_at');
    if (error) setErr(friendly(error)); else setRows(data as Contact[]);
  }, [orgId, customerId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!f.name.trim()) return setErr('กรอกชื่อผู้ติดต่อ');
    const { error } = await neon.from('customer_contacts').insert({ org_id: orgId, customer_id: customerId, name: f.name.trim(), position: f.position.trim() || null, department: f.department.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, line_id: f.line.trim() || null, source });
    if (error) return setErr(friendly(error));
    setF(empty); setSource('typed'); setErr(null); await load();
  }
  async function remove(id: string) {
    const { error } = await neon.from('customer_contacts').delete().eq('id', id);
    if (error) setErr(friendly(error)); else await load();
  }
  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.text, fontWeight: '700' }}>ผู้ติดต่อ ({rows.length})</Text>
      {rows.map((c) => (
        <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{c.name}{c.position ? ` · ${c.position}` : ''}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{[c.phone, c.email, c.line_id ? `LINE ${c.line_id}` : ''].filter(Boolean).join(' · ')}</Text>
          </View>
          {editable ? <Pressable accessibilityRole="button" accessibilityLabel="ลบผู้ติดต่อ" onPress={() => void remove(c.id)} style={{ padding: 6 }}><Icon name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      ))}
      {editable ? (
        <View style={{ marginTop: 6 }}>
          <CardScanner onResult={(r) => { setF({ name: r.name, position: r.position, department: r.department, phone: r.phone, email: r.email, line: r.lineId }); setSource(r.source); }} />
          <Field label="ชื่อผู้ติดต่อ" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
          <Field label="ตำแหน่ง" value={f.position} onChangeText={(v) => setF({ ...f, position: v })} />
          <Field label="โทรศัพท์" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} keyboardType="phone-pad" />
          <Field label="อีเมล" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} keyboardType="email-address" autoCapitalize="none" />
          <Field label="LINE ID" value={f.line} onChangeText={(v) => setF({ ...f, line: v })} autoCapitalize="none" />
          <Button title="บันทึกผู้ติดต่อ" onPress={() => void add()} />
        </View>
      ) : null}
      {err ? <Body tone="danger">{err}</Body> : null}
    </View>
  );
}

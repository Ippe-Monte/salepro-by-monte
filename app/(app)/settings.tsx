import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit, validateOrgName } from '@/auth/roles';
import { saveRow } from '@/lib/db';
import { friendly } from '@/lib/errors';
import { toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage } from '@/lib/pickImage';
import { Body, Button, Card, Field, Screen, Title } from '@/ui/kit';
import { DbImage } from '@/ui/DbImage';

type Logo = { mime: string; data: string };

export default function CompanySettings() {
  const { current, refresh } = useAuth();
  const org = current?.org;
  const editable = canEdit('settings', current?.role);
  const [f, setF] = useState({ name: '', tax: '', phone: '', address: '', vat: '7', currency: 'THB', branch: '', email: '', web: '', tagline: '' });
  const [logo, setLogo] = useState<Logo | null>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    if (!org) return;
    const [b, l] = await Promise.all([
      neon.from('org_branding').select('branch_name,email,website,tagline').eq('org_id', org.id).maybeSingle(),
      neon.from('org_logos').select('mime,data').eq('org_id', org.id).maybeSingle(),
    ]);
    const br = b.data as { branch_name: string | null; email: string | null; website: string | null; tagline: string | null } | null;
    setF({
      name: org.name, tax: org.tax_id ?? '', phone: org.phone ?? '', address: org.address ?? '', vat: String(org.vat_rate), currency: org.currency,
      branch: br?.branch_name ?? '', email: br?.email ?? '', web: br?.website ?? '', tagline: br?.tagline ?? '',
    });
    setLogo((l.data as Logo | null) ?? null);
  }, [org]);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!org || busy) return;
    const nameErr = validateOrgName(f.name);
    const vatNum = Number(f.vat);
    if (nameErr) return setMsg({ text: nameErr, ok: false });
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 100) return setMsg({ text: 'VAT ต้องอยู่ระหว่าง 0–100', ok: false });
    if (!/^[A-Z]{3}$/.test(f.currency)) return setMsg({ text: 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร เช่น THB', ok: false });
    setBusy(true);
    const { error, data } = await neon.from('organizations').update({
      name: f.name.trim(), tax_id: f.tax.trim() || null, phone: f.phone.trim() || null,
      address: f.address.trim() || null, vat_rate: vatNum, currency: f.currency,
    }).eq('id', org.id).select('id');
    if (error || !data?.length) { setBusy(false); return setMsg({ text: friendly(error ?? { message: 'forbidden' }), ok: false }); }
    const e2 = await saveRow('org_branding', { org_id: org.id }, {
      branch_name: f.branch.trim() || null, email: f.email.trim() || null, website: f.web.trim() || null, tagline: f.tagline.trim() || null,
    });
    setBusy(false);
    if (e2) return setMsg({ text: friendly(e2), ok: false });
    setMsg({ text: 'บันทึกแล้ว', ok: true });
    await refresh();
  }

  async function chooseLogo() {
    if (!org) return;
    const p = await pickImage({ maxSide: 400, format: 'png' });
    if (p === null) return;
    if (p === 'too-big') return setMsg({ text: 'รูปใหญ่เกินไป (ไม่เกิน 300 KB) ลองรูปอื่น', ok: false });
    const e = await saveRow('org_logos', { org_id: org.id }, { mime: p.mime, data: toByteaParam(p.b64) });
    if (e) return setMsg({ text: friendly(e), ok: false });
    setMsg({ text: 'อัปโหลดโลโก้แล้ว', ok: true });
    await load();
  }
  async function removeLogo() {
    if (!org) return;
    const { error } = await neon.from('org_logos').delete().eq('org_id', org.id);
    if (error) return setMsg({ text: friendly(error), ok: false });
    setLogo(null); setMsg({ text: 'ลบโลโก้แล้ว', ok: true });
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ตั้งค่าบริษัท</Title>
        {!editable && <Body tone="muted">เฉพาะเจ้าของ/ผู้ดูแลเท่านั้นที่แก้ไขได้</Body>}
        <Card>
          <Body>โลโก้บริษัท</Body>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 8 }}>
            <DbImage data={logo?.data} mime={logo?.mime ?? 'image/png'} size={88} />
            {editable ? (
              <View style={{ flex: 1 }}>
                <Button title={logo ? 'เปลี่ยนโลโก้' : 'อัปโหลดโลโก้'} variant="ghost" onPress={() => void chooseLogo()} />
                {logo ? <Button title="ลบโลโก้" variant="ghost" onPress={() => void removeLogo()} /> : null}
              </View>
            ) : null}
          </View>
          <Body tone="muted">ใช้บนหัวเอกสาร (ย่อให้อัตโนมัติ ไม่เกิน 300 KB)</Body>
        </Card>
        <Card>
          <Field label="ชื่อบริษัท" value={f.name} onChangeText={set('name')} editable={editable} />
          <Field label="สาขา (เช่น สำนักงานใหญ่)" value={f.branch} onChangeText={set('branch')} editable={editable} />
          <Field label="เลขประจำตัวผู้เสียภาษี" value={f.tax} onChangeText={set('tax')} editable={editable} />
          <Field label="เบอร์โทร" value={f.phone} onChangeText={set('phone')} editable={editable} keyboardType="phone-pad" />
          <Field label="อีเมล" value={f.email} onChangeText={set('email')} editable={editable} autoCapitalize="none" keyboardType="email-address" />
          <Field label="เว็บไซต์" value={f.web} onChangeText={set('web')} editable={editable} autoCapitalize="none" />
          <Field label="สโลแกน / ข้อความใต้ชื่อ" value={f.tagline} onChangeText={set('tagline')} editable={editable} />
          <Field label="ที่อยู่ (ใช้บนเอกสาร)" value={f.address} onChangeText={set('address')} editable={editable} multiline />
          <Field label="VAT (%)" value={f.vat} onChangeText={set('vat')} editable={editable} keyboardType="decimal-pad" />
          <Field label="สกุลเงิน" value={f.currency} onChangeText={(t) => set('currency')(t.toUpperCase())} editable={editable} autoCapitalize="characters" />
          {msg && <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body>}
          {editable && <Button title="บันทึก" onPress={() => void save()} busy={busy} />}
        </Card>
      </ScrollView>
    </Screen>
  );
}

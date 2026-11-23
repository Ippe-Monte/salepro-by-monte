import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit, validateOrgName } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Field, Screen, Title } from '@/ui/kit';

export default function CompanySettings() {
  const { current, refresh } = useAuth();
  const org = current?.org;
  const editable = canEdit('settings', current?.role);
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [vat, setVat] = useState('7');
  const [currency, setCurrency] = useState('THB');
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!org) return;
    setName(org.name); setTaxId(org.tax_id ?? ''); setPhone(org.phone ?? '');
    setAddress(org.address ?? ''); setVat(String(org.vat_rate)); setCurrency(org.currency);
  }, [org]);

  async function save() {
    if (!org || busy) return;
    const nameErr = validateOrgName(name);
    const vatNum = Number(vat);
    if (nameErr) return setMsg({ text: nameErr, ok: false });
    if (!Number.isFinite(vatNum) || vatNum < 0 || vatNum > 100) return setMsg({ text: 'VAT ต้องอยู่ระหว่าง 0–100', ok: false });
    if (!/^[A-Z]{3}$/.test(currency)) return setMsg({ text: 'สกุลเงินต้องเป็นรหัส 3 ตัวอักษร เช่น THB', ok: false });
    setBusy(true);
    const { error, data } = await neon.from('organizations').update({
      name: name.trim(), tax_id: taxId.trim() || null, phone: phone.trim() || null,
      address: address.trim() || null, vat_rate: vatNum, currency,
    }).eq('id', org.id).select('id');
    setBusy(false);
    if (error || !data?.length) return setMsg({ text: friendly(error ?? { message: 'forbidden' }), ok: false });
    setMsg({ text: 'บันทึกแล้ว', ok: true });
    await refresh();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ข้อมูลบริษัท</Title>
        {!editable && <Body tone="muted">เฉพาะ admin เท่านั้นที่แก้ไขได้</Body>}
        <Card>
          <Field label="ชื่อบริษัท" value={name} onChangeText={setName} editable={editable} />
          <Field label="เลขประจำตัวผู้เสียภาษี" value={taxId} onChangeText={setTaxId} editable={editable} />
          <Field label="เบอร์โทร" value={phone} onChangeText={setPhone} editable={editable} keyboardType="phone-pad" />
          <Field label="ที่อยู่ (ใช้บนเอกสาร)" value={address} onChangeText={setAddress} editable={editable} multiline />
          <Field label="VAT (%)" value={vat} onChangeText={setVat} editable={editable} keyboardType="decimal-pad" />
          <Field label="สกุลเงิน" value={currency} onChangeText={(t) => setCurrency(t.toUpperCase())} editable={editable} autoCapitalize="characters" />
          {msg && <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body>}
          {editable && <Button title="บันทึก" onPress={save} busy={busy} />}
        </Card>
      </ScrollView>
    </Screen>
  );
}

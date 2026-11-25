import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { validateOrgName } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Field, Screen, Title } from '@/ui/kit';

export default function Onboarding() {
  const { gate, refresh, selectOrg, signOut } = useAuth();
  const router = useRouter();
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<'create' | 'join' | null>(null);
  const [invites, setInvites] = useState<{ org_name: string; role: string; expires_at: string }[]>([]);
  useEffect(() => { void neon.rpc('my_pending_invitations').then(({ data }) => setInvites(Array.isArray(data) ? data : [])); }, []);
  const hasOrg = gate === 'ready' || gate === 'suspended';

  async function create() {
    if (busy) return;
    const v = validateOrgName(name);
    if (v) return setErr(v);
    setBusy('create'); setErr(null);
    const { data, error } = await neon.rpc('create_organization', {
      p_name: name.trim(), p_tax_id: taxId, p_address: address, p_phone: phone,
    });
    if (error) { setBusy(null); return setErr(friendly(error)); }
    if (typeof data === 'string') selectOrg(data);
    await refresh();
    setBusy(null);
    router.replace('/(app)');
  }

  async function join() {
    if (busy) return;
    if (!code.trim()) return setErr('กรุณากรอกโค้ดเชิญ');
    setBusy('join'); setErr(null);
    const { data, error } = await neon.rpc('accept_invitation', { p_code: code.trim() });
    if (error) { setBusy(null); return setErr(friendly(error)); }
    if (typeof data === 'string') selectOrg(data);
    await refresh();
    setBusy(null);
    router.replace('/(app)');
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>เริ่มต้นใช้งาน</Title>
        {err && <Body tone="danger">{err}</Body>}
        {invites.length > 0 ? (
          <Card>
            <Body>คุณถูกเชิญเข้าบริษัท:</Body>
            {invites.map((i) => <Body key={i.org_name + i.expires_at} tone="ok">• {i.org_name} (สิทธิ์ {i.role})</Body>)}
            <Body tone="muted">กรอกโค้ดเชิญที่ได้รับจาก admin ด้านล่างเพื่อเข้าร่วม — ไม่ต้องสร้างบริษัทใหม่</Body>
          </Card>
        ) : null}
        <Card>
          <Body>เข้าร่วมบริษัทที่มีอยู่ด้วยโค้ดเชิญ</Body>
          <Body tone="muted">ต้องล็อกอินด้วยอีเมลเดียวกับที่ admin ใช้เชิญ</Body>
          <Field label="โค้ดเชิญ" value={code} onChangeText={setCode} autoCapitalize="characters" />
          <Button title="เข้าร่วม" onPress={join} busy={busy === 'join'} />
        </Card>
        <Card>
          <Body>สร้างบริษัทใหม่ (คุณจะเป็น admin)</Body>
          <Field label="ชื่อบริษัท" value={name} onChangeText={setName} />
          <Field label="เลขประจำตัวผู้เสียภาษี (ถ้ามี)" value={taxId} onChangeText={setTaxId} />
          <Field label="เบอร์โทร (ถ้ามี)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Field label="ที่อยู่ (ถ้ามี)" value={address} onChangeText={setAddress} multiline />
          <Button title="สร้างบริษัท" onPress={create} busy={busy === 'create'} />
        </Card>
        {hasOrg
          ? <Button title="ยกเลิก" variant="ghost" onPress={() => router.replace('/(app)')} />
          : <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />}
      </ScrollView>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Account() {
  const { profile, memberships, current, selectOrg, signOut, refresh } = useAuth();
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function leave() {
    if (!current || busy) return;
    setBusy(true);
    const { error } = await neon.rpc('leave_organization', { p_org: current.org_id });
    setBusy(false);
    setConfirmLeave(false);
    if (error) setErr(friendly(error)); else { setErr(null); await refresh(); }
  }
  const router = useRouter();
  const usable = memberships.filter((m) => m.status === 'active');
  return (
    <Screen>
      <ScrollView>
        <Title>บัญชีของฉัน</Title>
        <Card>
          <Body>{profile?.display_name}</Body>
          <Body tone="muted">{profile?.email}</Body>
        </Card>
        <Body tone="muted">บริษัทของฉัน (แตะเพื่อสลับ)</Body>
        <View style={{ marginTop: 8 }}>
          {usable.map((m) => (
            <Pressable key={m.org_id} accessibilityRole="button" onPress={() => selectOrg(m.org_id)}
              style={{ backgroundColor: colors.card, borderColor: current?.org_id === m.org_id ? colors.accent : colors.border, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 8 }}>
              <Body>{m.org.name}{m.org.status === 'suspended' ? ' (ระงับ)' : ''}</Body>
              <Body tone="muted">{ROLE_LABEL[m.role]}{current?.org_id === m.org_id ? ' · กำลังใช้งาน' : ''}</Body>
            </Pressable>
          ))}
        </View>
        {err && <Body tone="danger">{err}</Body>}
        <Button title="สร้าง/เข้าร่วมบริษัทอื่น" variant="ghost" onPress={() => router.push('/onboarding')} />
        {current && !confirmLeave && <Button title={`ออกจากบริษัท ${current.org.name}`} variant="ghost" onPress={() => setConfirmLeave(true)} />}
        {current && confirmLeave && (
          <Card>
            <Body>ยืนยันออกจาก {current.org.name}? คุณจะเข้าถึงข้อมูลบริษัทนี้ไม่ได้อีกจนกว่าจะถูกเชิญใหม่</Body>
            <Button title="ยืนยันออกจากบริษัท" variant="danger" busy={busy} onPress={() => void leave()} />
            <Button title="ยกเลิก" variant="ghost" onPress={() => setConfirmLeave(false)} />
          </Card>
        )}
        <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

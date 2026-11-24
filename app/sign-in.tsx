import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { LangSwitch } from '@/ui/LangSwitch';
import { Logo } from '@/ui/Logo';
import { InstallButton } from '@/ui/InstallButton';
import { VersionBadge } from '@/ui/VersionBadge';
import { colors } from '@/ui/theme';
import { useAuth } from '@/auth/AuthProvider';
import { validateEmail } from '@/auth/roles';
import { isConfigured } from '@/lib/neon';
import { Body, Button, Field, Screen } from '@/ui/kit';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    const v = validateEmail(email);
    if (v) return setErr(v);
    if (!password) return setErr('กรุณากรอกรหัสผ่าน');
    setBusy(true);
    setErr(null);
    const e = await signIn(email, password);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
        <View style={{ alignSelf: 'flex-end' }}><LangSwitch /></View>
        <View style={{ alignItems: 'center', marginVertical: 20 }}>
          <Logo size={140} />
          <Text style={{ color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 12 }}>SALEPRO</Text>
          <Text style={{ color: colors.muted }}>by MONTE · Sale Engineer</Text>
        </View>
        <View style={{ width: '100%', maxWidth: 420 }}>
          {!isConfigured && <Body tone="danger">ยังไม่ได้ตั้งค่า EXPO_PUBLIC_NEON_AUTH_URL / EXPO_PUBLIC_NEON_DATA_API_URL</Body>}
          <Field label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="รหัสผ่าน" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" onSubmitEditing={submit} />
          {err && <Body tone="danger">{err}</Body>}
          <Button title="เข้าสู่ระบบ" onPress={submit} busy={busy} />
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Link href="/sign-up"><Body tone="muted">ยังไม่มีบัญชี? ลงทะเบียน</Body></Link>
          </View>
          <View style={{ alignItems: 'center' }}><InstallButton /></View>
          <VersionBadge />
        </View>
      </ScrollView>
    </Screen>
  );
}

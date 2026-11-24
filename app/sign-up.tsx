import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Logo } from '@/ui/Logo';
import { useAuth } from '@/auth/AuthProvider';
import { validateEmail, validatePassword } from '@/auth/roles';
import { Body, Button, Field, Screen } from '@/ui/kit';

export default function SignUp() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    if (!name.trim()) return setErr('กรุณากรอกชื่อ');
    const v = validateEmail(email) ?? validatePassword(password);
    if (v) return setErr(v);
    setBusy(true);
    setErr(null);
    const e = await signUp(name, email, password);
    setBusy(false);
    if (e) setErr(e);
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ alignItems: 'center' }}>
        <Logo size={110} />
        <View style={{ width: '100%', maxWidth: 420 }}>
          <Field label="ชื่อ-สกุล" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="อีเมล" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="รหัสผ่าน (อย่างน้อย 8 ตัว)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" onSubmitEditing={submit} />
          {err && <Body tone="danger">{err}</Body>}
          <Button title="ลงทะเบียน" onPress={submit} busy={busy} />
          <View style={{ marginTop: 16, alignItems: 'center' }}>
            <Link href="/sign-in"><Body tone="muted">มีบัญชีแล้ว? เข้าสู่ระบบ</Body></Link>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

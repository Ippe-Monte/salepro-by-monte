import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Account() {
  const { profile, memberships, current, selectOrg, signOut } = useAuth();
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
              <Body tone="muted">{m.role}{current?.org_id === m.org_id ? ' · กำลังใช้งาน' : ''}</Body>
            </Pressable>
          ))}
        </View>
        <Button title="สร้าง/เข้าร่วมบริษัทอื่น" variant="ghost" onPress={() => router.push('/onboarding')} />
        <Button title="ออกจากระบบ" variant="ghost" onPress={() => void signOut()} />
      </ScrollView>
    </Screen>
  );
}

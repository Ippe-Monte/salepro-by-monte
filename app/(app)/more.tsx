import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { Body, Screen, Title } from '@/ui/kit';
import { VersionBadge } from '@/ui/VersionBadge';
import { isBottomItem } from '@/ui/nav';
import { useShell } from '@/ui/Shell';
import { colors } from '@/ui/theme';

export default function More() {
  const router = useRouter();
  const { isPlatform } = useAuth();
  const { items } = useShell();
  const rest = items.filter((i) => !isBottomItem(i.name));
  const extra = [
    ...(isPlatform ? [{ name: 'platform', label: 'แพลตฟอร์ม', icon: '🛡️' }] : []),
    { name: 'account', label: 'บัญชีของฉัน', icon: '👤' },
  ];
  return (
    <Screen>
      <ScrollView>
        <Title>เมนูทั้งหมด</Title>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {[...rest, ...extra].map((i) => (
            <Pressable key={i.name} accessibilityRole="button" onPress={() => router.push(`/${i.name}` as never)}
              style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 }}>
              <Text style={{ fontSize: 26 }}>{i.icon}</Text>
              <Text style={{ color: colors.text, fontWeight: '600' }}>{i.label}</Text>
            </Pressable>
          ))}
        </View>
        {rest.length === 0 ? <Body tone="muted">ไม่มีเมนูเพิ่มเติม</Body> : null}
        <VersionBadge />
      </ScrollView>
    </Screen>
  );
}

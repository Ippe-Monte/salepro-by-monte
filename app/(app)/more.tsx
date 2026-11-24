import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { Body, Screen, Title } from '@/ui/kit';
import { Icon, IconChip } from '@/ui/Icon';
import { InstallButton } from '@/ui/InstallButton';
import { startTour } from '@/ui/Tour';
import { VersionBadge } from '@/ui/VersionBadge';
import { isBottomItem } from '@/ui/nav';
import { useShell } from '@/ui/Shell';
import { colors } from '@/ui/theme';

export default function More() {
  const router = useRouter();
  const { isPlatform } = useAuth();
  const { items } = useShell();
  const rest = items.filter((i) => !isBottomItem(i.name) && i.name !== 'invoices');
  const extra = [
    ...(isPlatform ? [{ name: 'platform', label: 'แพลตฟอร์ม', icon: 'shield' }] : []),
    { name: 'account', label: 'บัญชีของฉัน', icon: 'profile' },
  ];
  return (
    <Screen>
      <ScrollView>
        <Title>เมนูทั้งหมด</Title>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {[...rest, ...extra].map((i) => (
            <Pressable key={i.name} accessibilityRole="button" onPress={() => router.push(`/${i.name}` as never)}
              style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, alignItems: 'center', gap: 6 }}>
              <IconChip name={i.icon} size={48} />
              <Text style={{ color: colors.text, fontWeight: '600' }}>{i.label}</Text>
            </Pressable>
          ))}
        </View>
        {rest.length === 0 ? <Body tone="muted">ไม่มีเมนูเพิ่มเติม</Body> : null}
        <View style={{ alignItems: 'center', marginTop: 12 }}>
          <Pressable accessibilityRole="button" onPress={startTour} style={{ width: '100%', maxWidth: 420, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="book" size={20} color={colors.primary} /><Text style={{ color: colors.text, fontWeight: '600' }}>คู่มือเริ่มต้นใช้งาน</Text></View>
          </Pressable>
          <InstallButton />
        </View>
        <VersionBadge />
      </ScrollView>
    </Screen>
  );
}

import { usePathname, useRouter } from 'expo-router';
import { Image, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { canOpen } from '@/auth/roles';
import { Logo } from './Logo';
import { BOTTOM, isBottomItem, visibleItems, type NavItem } from './nav';
import { useTheme } from './ThemeProvider';
import { colors } from './theme';

export const WIDE = 1024;

function activeName(path: string): string {
  const seg = path.replace(/^\/+/, '').split('/')[0];
  return seg === '' || seg === '(app)' ? 'index' : seg;
}

function ThemeButton() {
  const { mode, toggle } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="สลับโหมดสว่าง/มืด" onPress={toggle}
      style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Text style={{ fontSize: 18 }}>{mode === 'dark' ? '☀️' : '🌙'}</Text>
    </Pressable>
  );
}

function OrgBadge() {
  const { current } = useAuth();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      <Logo size={32} />
      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700', fontSize: 15, flexShrink: 1 }}>{current?.org.name ?? 'SALEPRO by MONTE'}</Text>
    </Pressable>
  );
}

export function TopBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top + 8, paddingBottom: 8, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1 }}>
      <OrgBadge />
      <ThemeButton />
    </View>
  );
}

export function Sidebar({ items, active }: { items: NavItem[]; active: string }) {
  const router = useRouter();
  const { current, profile } = useAuth();
  return (
    <View style={{ width: 240, backgroundColor: colors.side, borderRightColor: colors.border, borderRightWidth: 1, paddingVertical: 16, paddingHorizontal: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 8, marginBottom: 16 }}>
        <Logo size={44} />
        <View style={{ flexShrink: 1 }}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>SALEPRO</Text>
          <Text numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>{current?.org.name}</Text>
        </View>
      </View>
      {items.map((i) => {
        const on = i.name === active;
        return (
          <Pressable key={i.name} accessibilityRole="button" onPress={() => router.push((i.name === 'index' ? '/' : `/${i.name}`) as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 2, backgroundColor: on ? colors.selected : 'transparent' }}>
            <Text style={{ fontSize: 16 }}>{i.icon}</Text>
            <Text style={{ color: on ? colors.text : colors.muted, fontWeight: on ? '700' : '500' }}>{i.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
        <Text style={{ fontSize: 16 }}>👤</Text>
        <Text numberOfLines={1} style={{ color: colors.muted, flexShrink: 1 }}>{profile?.display_name || profile?.email}</Text>
      </Pressable>
      <View style={{ alignItems: 'flex-start', paddingHorizontal: 4 }}><ThemeButton /></View>
    </View>
  );
}

export function BottomBar({ items, active }: { items: NavItem[]; active: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = BOTTOM.map((n) => items.find((i) => i.name === n)).filter(Boolean) as NavItem[];
  const moreOn = !isBottomItem(active);
  const tabs: { key: string; label: string; icon: string; on: boolean; go: () => void }[] = [
    ...bottom.map((i) => ({ key: i.name, label: i.label, icon: i.icon, on: i.name === active, go: () => router.push((i.name === 'index' ? '/' : `/${i.name}`) as never) })),
    { key: 'more', label: 'เพิ่มเติม', icon: '☰', on: moreOn, go: () => router.push('/more') },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: insets.bottom, paddingTop: 6 }}>
      {tabs.map((t) => (
        <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={t.label} onPress={t.go} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
          <View style={{ paddingHorizontal: 14, paddingVertical: 4, borderRadius: 14, backgroundColor: t.on ? colors.selected : 'transparent' }}>
            <Text style={{ fontSize: 18 }}>{t.icon}</Text>
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, color: t.on ? colors.primary : colors.muted, fontWeight: t.on ? '700' : '500' }}>{t.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function useShell() {
  const { width } = useWindowDimensions();
  const path = usePathname();
  const { current } = useAuth();
  const items = visibleItems(canOpen, current?.role);
  return { wide: width >= WIDE, items, active: activeName(path) };
}

export { Image };

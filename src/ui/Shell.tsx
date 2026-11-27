import { usePathname, useRouter } from 'expo-router';
import { Image, Pressable, View, useWindowDimensions } from 'react-native';
import { Text } from './Text';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/auth/AuthProvider';
import { canOpen } from '@/auth/roles';
import { Avatar } from './Avatar';
import { Bell } from './Bell';
import { Icon } from './Icon';
import { LangSwitch } from './LangSwitch';
import { Logo } from './Logo';
import { OrgLogo } from './OrgLogo';
import { BOTTOM, MERGED, isBottomItem, TAB_LABEL, tabOf, visibleItems, type NavItem } from './nav';
import { useTheme } from './ThemeProvider';
import { VersionBadge } from './VersionBadge';
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
      style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
      <Icon name={mode === 'dark' ? 'sun' : 'moon'} size={20} color={colors.muted} />
    </Pressable>
  );
}

function OrgBadge() {
  const { current } = useAuth();
  const router = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push('/settings')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
      <OrgLogo size={26} />
      <Text numberOfLines={1} style={{ color: colors.text, fontWeight: '700', fontSize: 14, flexShrink: 1 }}>{current?.org.name ?? 'SALEPRO by MONTE'}</Text>
    </Pressable>
  );
}

function ProfileDot() {
  const router = useRouter();
  return <Avatar size={36} onPress={() => router.push('/account')} />;
}

/** Phone header: row 1 = app logo + tools, row 2 = the company's logo and name. */
export function TopBar() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: colors.card, borderBottomColor: colors.border, borderBottomWidth: 1, paddingTop: insets.top + 6 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Logo size={38} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><LangSwitch /><ThemeButton /><Bell /><ProfileDot /></View>
      </View>
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><OrgBadge /></View>
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
        <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>SALEPRO</Text>
      </View>
      <View style={{ paddingHorizontal: 8, marginBottom: 14 }}><OrgBadge /></View>
      {items.filter((i) => !MERGED.includes(i.name)).map((i) => {
        const on = i.name === tabOf(active);
        return (
          <Pressable key={i.name} accessibilityRole="button" onPress={() => router.push((i.name === 'index' ? '/' : `/${i.name}`) as never)}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, marginBottom: 2, backgroundColor: on ? colors.selected : 'transparent' }}>
            <Icon name={i.icon} size={20} color={on ? colors.accent : colors.muted} />
            <Text style={{ color: on ? colors.text : colors.muted, fontWeight: on ? '700' : '500' }}>{i.label}</Text>
          </Pressable>
        );
      })}
      <View style={{ flex: 1 }} />
      <Pressable accessibilityRole="button" onPress={() => router.push('/account')} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 }}>
        <Icon name="profile" size={20} color={colors.muted} />
        <Text numberOfLines={1} style={{ color: colors.muted, flexShrink: 1 }}>{profile?.display_name || profile?.email}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }}><ThemeButton /><Bell /><LangSwitch /></View>
      <View style={{ paddingHorizontal: 8 }}><VersionBadge align="left" /></View>
    </View>
  );
}

export function BottomBar({ items, active }: { items: NavItem[]; active: string }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const bottom = BOTTOM.map((n) => items.find((i) => i.name === n)).filter(Boolean) as NavItem[];
  const moreOn = !isBottomItem(active);
  const tabs: { key: string; label: string; icon: string; on: boolean; go: () => void }[] = [
    ...bottom.map((i) => ({ key: i.name, label: TAB_LABEL[i.name] ?? i.label, icon: i.icon, on: i.name === tabOf(active), go: () => router.push((i.name === 'index' ? '/' : `/${i.name}`) as never) })),
    { key: 'more', label: 'เพิ่มเติม', icon: 'menu', on: moreOn, go: () => router.push('/more') },
  ];
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.card, borderTopColor: colors.border, borderTopWidth: 1, paddingBottom: insets.bottom, paddingTop: 6 }}>
      {tabs.map((t) => (
        <Pressable key={t.key} accessibilityRole="button" accessibilityLabel={t.label} onPress={t.go} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
          <View style={{ position: 'absolute', top: -6, width: 28, height: 3, borderRadius: 2, backgroundColor: t.on ? colors.highlight : 'transparent' }} />
          <View style={{ paddingVertical: 4 }}>
            <Icon name={t.icon} size={24} color={t.on ? colors.accent : colors.muted} strokeWidth={t.on ? 2.2 : 1.8} />
          </View>
          <Text numberOfLines={1} style={{ fontSize: 11, color: t.on ? colors.accent : colors.muted, fontWeight: t.on ? '700' : '500' }}>{t.label}</Text>
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

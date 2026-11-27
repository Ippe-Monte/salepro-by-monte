import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { colors } from './theme';

/** Two-or-more way switch between sibling screens that share one bottom tab (e.g. Quote | Invoice). */
export function SegTabs({ tabs, active }: { tabs: { href: string; label: string }[]; active: string }) {
  const router = useRouter();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: colors.bg, borderRadius: 12, padding: 3, marginBottom: 12, borderWidth: 1, borderColor: colors.border, alignSelf: 'stretch' }}>
      {tabs.map((t) => {
        const on = t.href === active;
        return (
          <Pressable key={t.href} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) router.replace(t.href as never); }}
            style={{ flex: 1, minHeight: 42, paddingHorizontal: 2, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : 'transparent' }}>
            <Text numberOfLines={2} style={{ color: on ? colors.onPrimary : colors.muted, fontWeight: '800', fontSize: tabs.length > 3 ? 12 : 15, textAlign: 'center' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** The five document lists that live under the Job Ticket tab. */
export function JobTabs({ active }: { active: string }) {
  return <SegTabs active={active} tabs={[{ href: '/jobs', label: 'Job Ticket' }, { href: '/quotes', label: 'ใบเสนอราคา' }, { href: '/delivery', label: 'DO' }, { href: '/notes', label: 'ใบส่งของ' }, { href: '/invoices', label: 'Invoice' }]} />;
}

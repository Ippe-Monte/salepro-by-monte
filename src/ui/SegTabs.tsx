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
            style={{ flex: 1, minHeight: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? colors.primary : 'transparent' }}>
            <Text style={{ color: on ? '#fff' : colors.muted, fontWeight: '800' }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

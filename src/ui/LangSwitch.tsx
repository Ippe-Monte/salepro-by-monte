import { Pressable, Text as RNText, View } from 'react-native';
import { setLang, useLang, type Lang } from '@/i18n';
import { colors } from './theme';

/** TH | EN switch. The whole screen is re-rendered in the chosen language. */
export function LangSwitch() {
  const lang = useLang();
  const opt = (l: Lang, label: string) => (
    <Pressable key={l} accessibilityRole="button" accessibilityState={{ selected: lang === l }} accessibilityLabel={l === 'th' ? 'ภาษาไทย' : 'English'} onPress={() => setLang(l)}
      style={{ paddingHorizontal: 11, minHeight: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: lang === l ? colors.primary : 'transparent' }}>
      <RNText style={{ fontSize: 12, fontWeight: '800', color: lang === l ? colors.onPrimary : colors.muted }}>{label}</RNText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
      {opt('th', 'TH')}
      {opt('en', 'EN')}
    </View>
  );
}

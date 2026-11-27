import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View, type TextInputProps } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { colors } from './theme';

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={{ flex: 1, backgroundColor: colors.bg, padding: 20 }}>{children}</View>;
}
export function Title({ children }: { children: React.ReactNode }) {
  return <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12 }}>{children}</Text>;
}
export function Body({ children, tone }: { children: React.ReactNode; tone?: 'muted' | 'danger' | 'ok' }) {
  const color = tone === 'danger' ? colors.danger : tone === 'ok' ? colors.ok : tone === 'muted' ? colors.muted : colors.text;
  return <Text style={{ color, fontSize: 15, lineHeight: 22 }}>{children}</Text>;
}
export function Field(props: TextInputProps & { label: string }) {
  const { label, onFocus, onBlur, ...rest } = props;
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, marginBottom: 4 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        onFocus={(e) => { setFocus(true); onFocus?.(e); }}
        onBlur={(e) => { setFocus(false); onBlur?.(e); }}
        style={{ backgroundColor: colors.input, borderColor: focus ? colors.accent : colors.border, borderWidth: focus ? 2 : 1, borderRadius: 12, color: colors.text, paddingHorizontal: focus ? 11 : 12, paddingVertical: focus ? 11 : 12, minHeight: 48 }}
        {...rest}
      />
    </View>
  );
}
export function Button({ title, onPress, busy, variant, icon }: { title: string; onPress: () => void; busy?: boolean; variant?: 'ghost' | 'danger'; icon?: string }) {
  const bg = variant === 'ghost' ? 'transparent' : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress}
      style={({ pressed }) => ({ backgroundColor: bg, borderColor: colors.border, borderWidth: variant === 'ghost' ? 1 : 0, borderRadius: 12, minHeight: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : pressed ? 0.85 : 1, marginTop: 8 })}>
      {busy ? <ActivityIndicator color={variant === 'ghost' ? colors.text : variant === 'danger' ? '#fff' : colors.onPrimary} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <Icon name={icon} size={19} color={variant === 'ghost' ? colors.accent : variant === 'danger' ? '#fff' : colors.onPrimary} /> : null}
          <Text style={{ color: variant === 'ghost' ? colors.text : variant === 'danger' ? '#fff' : colors.onPrimary, fontWeight: '700' }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: '#0f172a', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } }}>{children}</View>;
}

export function Chips<T extends string>({ value, options, onPick }: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
      {options.map((o) => (
        <Pressable key={o.v} accessibilityRole="button" onPress={() => onPick(o.v)}
          style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: value === o.v ? colors.primary : colors.border, backgroundColor: value === o.v ? colors.selected : 'transparent' }}>
          <Text style={{ color: value === o.v ? colors.selectedText : colors.text, fontWeight: value === o.v ? '600' : '400' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}
export function Empty({ children }: { children: React.ReactNode }) {
  return <View style={{ padding: 24, alignItems: 'center' }}><Text style={{ color: colors.muted }}>{children}</Text></View>;
}
export function Pill({ text, tone }: { text: string; tone?: 'ok' | 'warn' | 'danger' | 'muted' }) {
  const bg = tone === 'ok' ? colors.pillOkBg : tone === 'warn' ? colors.pillWarnBg : tone === 'danger' ? colors.pillDangerBg : colors.pillMutedBg;
  const fg = tone === 'ok' ? colors.pillOkFg : tone === 'warn' ? colors.pillWarnFg : tone === 'danger' ? colors.pillDangerFg : colors.pillMutedFg;
  return <Text style={{ color: fg, backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, fontSize: 12, fontWeight: '600', alignSelf: 'flex-start', overflow: 'hidden' }}>{text}</Text>;
}

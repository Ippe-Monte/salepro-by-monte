import { ActivityIndicator, Pressable, Text, TextInput, View, type TextInputProps } from 'react-native';
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
  const { label, ...rest } = props;
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={{ color: colors.muted, marginBottom: 4 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 10, color: colors.text, padding: 12, minHeight: 48 }}
        {...rest}
      />
    </View>
  );
}
export function Button({ title, onPress, busy, variant }: { title: string; onPress: () => void; busy?: boolean; variant?: 'ghost' | 'danger' }) {
  const bg = variant === 'ghost' ? 'transparent' : variant === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable accessibilityRole="button" disabled={busy} onPress={onPress}
      style={{ backgroundColor: bg, borderColor: colors.border, borderWidth: variant === 'ghost' ? 1 : 0, borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.6 : 1, marginTop: 8 }}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>{title}</Text>}
    </Pressable>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  return <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 12 }}>{children}</View>;
}

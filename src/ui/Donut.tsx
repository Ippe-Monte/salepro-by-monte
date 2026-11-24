import { View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { Text } from './Text';
import { colors } from './theme';

/** Ring chart: one arc per slice, with the total in the middle. */
export function Donut({ slices, total, caption, size = 180 }: { slices: { key: string; value: number; color: string }[]; total: number; caption: string; size?: number }) {
  const stroke = size * 0.17; const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const sum = slices.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${total} ${caption}`}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${size / 2}, ${size / 2}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.border} strokeWidth={stroke} fill="none" />
          {sum > 0 ? slices.filter((s) => s.value > 0).map((s) => {
            const len = (s.value / sum) * c; const off = -acc * c / sum; acc += s.value;
            return <Circle key={s.key} cx={size / 2} cy={size / 2} r={r} stroke={s.color} strokeWidth={stroke} fill="none" strokeDasharray={`${Math.max(0, len - 1.5)} ${c - Math.max(0, len - 1.5)}`} strokeDashoffset={off} />;
          }) : null}
        </G>
      </Svg>
      <View style={{ position: 'absolute', alignItems: 'center' }}>
        <Text style={{ color: colors.text, fontSize: size * 0.2, fontWeight: '800' }}>{total}</Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{caption}</Text>
      </View>
    </View>
  );
}

import { Linking, Pressable, View } from 'react-native';
import { directionsLink } from '@/lib/geo';
import { Text } from './Text';
import { colors } from './theme';

export type Stop = { n: number; lat: number; lng: number; label: string };

/** Native fallback (the web build uses StopsMap.web.tsx with an interactive OpenStreetMap). */
export function StopsMap({ stops }: { stops: Stop[]; height?: number; onPick?: (lat: number, lng: number) => void; picked?: { lat: number; lng: number } | null }) {
  return (
    <View style={{ gap: 6 }}>
      {stops.map((s) => (
        <Pressable key={s.n} accessibilityRole="link" onPress={() => void Linking.openURL(directionsLink({ lat: s.lat, lng: s.lng }))}>
          <Text style={{ color: colors.accent }}>{s.n}. {s.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

import { Image, View, Text } from 'react-native';
import { byteaToDataUri } from '@/lib/image';
import { colors } from './theme';

/** Shows an image stored as bytea. Falls back to a grey box when the value is missing. */
export function DbImage({ data, mime, size, round }: { data: unknown; mime: string; size: number; round?: boolean }) {
  const uri = byteaToDataUri(data, mime);
  const style = { width: size, height: size, borderRadius: round ? size / 2 : 10, backgroundColor: colors.border };
  if (!uri) return <View style={{ ...style, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: colors.muted, fontSize: size / 3 }}>🖼️</Text></View>;
  return <Image source={{ uri }} style={style} resizeMode="contain" />;
}

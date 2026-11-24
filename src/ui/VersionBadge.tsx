import { Text } from 'react-native';
import { VERSION_LABEL } from '@/version';
import { colors } from './theme';

export function VersionBadge({ align = 'center' }: { align?: 'center' | 'left' }) {
  return (
    <Text accessibilityLabel={`เวอร์ชัน ${VERSION_LABEL}`} style={{ color: colors.muted, fontSize: 12, textAlign: align, marginTop: 8 }}>
      SALEPRO {VERSION_LABEL}
    </Text>
  );
}

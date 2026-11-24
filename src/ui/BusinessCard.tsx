import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import { Text } from './Text';

export const CARD_THEMES = { blue: '#1d4ed8', dark: '#0f172a', green: '#047857', orange: '#c2410c', purple: '#6d28d9' } as const;
export type CardTheme = keyof typeof CARD_THEMES;

export type CardView = {
  name: string; position: string; department: string; phone: string; email: string; website: string; lineId: string;
  company: string; theme: CardTheme; photoUri: string | null; logoUri: string | null;
};

/** On-screen electronic business card (85 x 50 mm ratio) with a QR code that phones can scan to save the contact. */
export function BusinessCard({ c, vcf }: { c: CardView; vcf: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(vcf, { type: 'svg', margin: 0, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } }).then((s) => { if (live) setSvg(s); }).catch(() => { if (live) setSvg(null); });
    return () => { live = false; };
  }, [vcf]);
  const bg = CARD_THEMES[c.theme];
  const line = (t: string) => (t ? <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.92)', fontSize: 12, marginTop: 2 }}>{t}</Text> : null);
  return (
    <View style={{ width: '100%', maxWidth: 420, aspectRatio: 1.7, borderRadius: 18, backgroundColor: bg, padding: 16, flexDirection: 'row', gap: 12, alignSelf: 'center' }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {c.photoUri ? <Image source={{ uri: c.photoUri }} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: '#fff' }} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{c.name || '-'}</Text>
            {c.position ? <Text numberOfLines={1} style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{c.position}{c.department ? ` · ${c.department}` : ''}</Text> : c.department ? <Text style={{ color: '#fff', fontSize: 13 }}>{c.department}</Text> : null}
          </View>
        </View>
        <View>
          {line(c.phone)}{line(c.email)}{line(c.lineId ? `LINE: ${c.lineId}` : '')}{line(c.website)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {c.logoUri ? <Image source={{ uri: c.logoUri }} style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' }} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={{ color: '#fff', fontWeight: '700', fontSize: 12, flexShrink: 1 }}>{c.company}</Text>
          </View>
        </View>
      </View>
      <View style={{ width: 92, alignSelf: 'center', alignItems: 'center' }}>
        <View style={{ width: 92, height: 92, backgroundColor: '#fff', borderRadius: 8, padding: 5 }}>{svg ? <SvgXml xml={svg} width="100%" height="100%" /> : null}</View>
        <Text style={{ color: '#fff', fontSize: 10, marginTop: 4 }}>สแกนเพื่อบันทึก</Text>
      </View>
    </View>
  );
}

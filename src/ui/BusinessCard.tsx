import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import { LEGACY_THEME_COLOR, textOn } from '@/lib/cardcolor';
import { Text } from './Text';

/** Kept for old saved cards: the five original theme names map to a colour. */
export const CARD_THEMES = LEGACY_THEME_COLOR;
export type CardTheme = keyof typeof CARD_THEMES;

export type CardTemplate = { uri: string; textColor: 'light' | 'dark'; pos: 'tl' | 'tr' | 'bl' | 'br' | 'center'; panel: boolean };

export type CardView = {
  name: string; position: string; department: string; phone: string; email: string; website: string; lineId: string;
  company: string; color: string; template: CardTemplate | null; photoUri: string | null; logoUri: string | null;
};

const POS: Record<CardTemplate['pos'], object> = {
  tl: { top: 10, left: 10, alignItems: 'flex-start' }, tr: { top: 10, right: 10, alignItems: 'flex-end' },
  bl: { bottom: 10, left: 10, alignItems: 'flex-start' }, br: { bottom: 10, right: 10, alignItems: 'flex-end' },
  center: { top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
};

/** On-screen electronic business card (85 x 50 mm ratio) with a QR code that phones can scan to save the contact. */
export function BusinessCard({ c, vcf }: { c: CardView; vcf: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(vcf, { type: 'svg', margin: 0, errorCorrectionLevel: 'L', color: { dark: '#000000', light: '#ffffff' } }).then((s) => { if (live) setSvg(s); }).catch(() => { if (live) setSvg(null); });
    return () => { live = false; };
  }, [vcf]);

  const qr = (size: number) => (
    <View style={{ width: size, height: size, backgroundColor: '#fff', borderRadius: 6, padding: 4, borderWidth: 1, borderColor: '#e2e8f0' }}>{svg ? <SvgXml xml={svg} width="100%" height="100%" /> : null}</View>
  );

  if (c.template) {
    const t = c.template;
    const fg = t.textColor === 'light' ? '#ffffff' : '#0f172a';
    const panelBg = t.textColor === 'light' ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.78)';
    const qrLeft = t.pos === 'br' || t.pos === 'tr';
    const qrTop = t.pos === 'bl' || t.pos === 'br' ? 10 : undefined;
    const t1 = (s: string, extra?: object) => (s ? <Text numberOfLines={1} style={{ color: fg, fontSize: 11, ...extra }}>{s}</Text> : null);
    return (
      <View style={{ width: '100%', maxWidth: 420, aspectRatio: 1.7, borderRadius: 14, overflow: 'hidden', alignSelf: 'center', backgroundColor: '#e2e8f0', borderWidth: 1, borderColor: '#cbd5e1' }}>
        <Image source={{ uri: t.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" />
        <View style={{ position: 'absolute', maxWidth: '72%', ...POS[t.pos] } as object}>
          <View style={{ padding: t.panel ? 8 : 0, borderRadius: 8, backgroundColor: t.panel ? panelBg : 'transparent' }}>
            {t1(c.name || '-', { fontSize: 15, fontWeight: '800' })}
            {t1([c.position, c.department].filter(Boolean).join(' · '), { fontWeight: '600' })}
            {t1(c.phone)}{t1(c.email)}{t1(c.lineId ? `LINE: ${c.lineId}` : '')}{t1(c.website)}
          </View>
        </View>
        <View style={{ position: 'absolute', [qrLeft ? 'left' : 'right']: 10, ...(qrTop !== undefined ? { bottom: qrTop } : { top: 10 }) } as object}>{qr(56)}</View>
      </View>
    );
  }

  const bg = c.color;
  const fg = textOn(bg);
  const soft = fg === '#ffffff' ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.85)';
  const line = (t: string) => (t ? <Text numberOfLines={1} style={{ color: soft, fontSize: 12, marginTop: 2 }}>{t}</Text> : null);
  return (
    <View style={{ width: '100%', maxWidth: 420, aspectRatio: 1.7, borderRadius: 18, backgroundColor: bg, padding: 16, flexDirection: 'row', gap: 12, alignSelf: 'center', borderWidth: 1, borderColor: fg === '#0f172a' ? '#cbd5e1' : 'transparent' }}>
      <View style={{ flex: 1, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {c.photoUri ? <Image source={{ uri: c.photoUri }} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: fg }} /> : null}
          <View style={{ flexShrink: 1 }}>
            <Text numberOfLines={1} style={{ color: fg, fontSize: 18, fontWeight: '800' }}>{c.name || '-'}</Text>
            {c.position ? <Text numberOfLines={1} style={{ color: fg, fontSize: 13, fontWeight: '600' }}>{c.position}{c.department ? ` · ${c.department}` : ''}</Text> : c.department ? <Text style={{ color: fg, fontSize: 13 }}>{c.department}</Text> : null}
          </View>
        </View>
        <View>
          {line(c.phone)}{line(c.email)}{line(c.lineId ? `LINE: ${c.lineId}` : '')}{line(c.website)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
            {c.logoUri ? <Image source={{ uri: c.logoUri }} style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff' }} resizeMode="contain" /> : null}
            <Text numberOfLines={1} style={{ color: fg, fontWeight: '700', fontSize: 12, flexShrink: 1 }}>{c.company}</Text>
          </View>
        </View>
      </View>
      <View style={{ width: 92, alignSelf: 'center', alignItems: 'center' }}>
        {qr(92)}
        <Text style={{ color: fg, fontSize: 10, marginTop: 4 }}>สแกนเพื่อบันทึก</Text>
      </View>
    </View>
  );
}

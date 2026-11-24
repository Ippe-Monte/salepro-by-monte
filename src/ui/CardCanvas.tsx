import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, PanResponder, Platform, View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import QRCode from 'qrcode';
import { textOn } from '@/lib/cardcolor';
import { clamp, TYPE_LABEL, type El, type Layout } from '@/lib/cardlayout';
import type { CardTemplate } from './BusinessCard';
import { Text } from './Text';

export type CardData = {
  name: string; position: string; department: string; company: string; address: string; phone: string; email: string; line: string; website: string;
  logoUri: string | null; photoUri: string | null;
};

const valueOf = (e: El, d: CardData): string => {
  switch (e.t) {
    case 'name': return d.name; case 'position': return d.position; case 'department': return d.department; case 'company': return d.company;
    case 'address': return d.address; case 'phone': return d.phone; case 'email': return d.email; case 'website': return d.website;
    case 'line': return d.line ? `LINE: ${d.line}` : ''; case 'text': return e.txt ?? '';
    default: return '';
  }
};

type ItemProps = { e: El; cardW: number; cardH: number; fg: string; data: CardData; qr: string | null; selected: boolean; editable: boolean; onSelect: (id: string) => void; onMove: (id: string, x: number, y: number) => void };

function Item({ e, cardW, cardH, fg, data, qr, selected, editable, onSelect, onMove }: ItemProps) {
  const ref = useRef(e); ref.current = e;
  const start = useRef({ x: 0, y: 0 });
  const [w, setW] = useState(0);
  // The responder is created once (handlers read the latest props through a ref), otherwise a re-render during a drag would drop the gesture.
  const live = useRef({ editable, cardW, cardH, onSelect, onMove });
  live.current = { editable, cardW, cardH, onSelect, onMove };
  const pan = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => live.current.editable,
    onMoveShouldSetPanResponder: () => live.current.editable,
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: () => { start.current = { x: ref.current.x, y: ref.current.y }; live.current.onSelect(ref.current.id); },
    onPanResponderMove: (_, g) => live.current.onMove(ref.current.id, clamp(start.current.x + (g.dx / live.current.cardW) * 100, 0, 96), clamp(start.current.y + (g.dy / live.current.cardH) * 100, 0, 96)),
  }), []);

  const size = (e.s / 100) * cardW;
  const colour = e.c || fg;
  let body: React.ReactNode = null;
  if (e.t === 'qr') body = <View style={{ width: size, height: size, backgroundColor: '#fff', padding: size * 0.06, borderRadius: 4 }}>{qr ? <SvgXml xml={qr} width="100%" height="100%" /> : null}</View>;
  else if (e.t === 'logo') body = data.logoUri ? <Image source={{ uri: data.logoUri }} style={{ width: size, height: size }} resizeMode="contain" /> : <View style={{ width: size, height: size, borderWidth: 1, borderStyle: 'dashed', borderColor: colour, opacity: 0.5 }} />;
  else if (e.t === 'photo') body = data.photoUri ? <Image source={{ uri: data.photoUri }} style={{ width: size, height: size, borderRadius: size / 2 }} /> : <View style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderStyle: 'dashed', borderColor: colour, opacity: 0.5 }} />;
  else {
    const v = valueOf(e, data) || (editable ? TYPE_LABEL[e.t] : '');
    if (!v) return null;
    body = <Text style={{ color: colour, fontSize: size, lineHeight: size * 1.2, fontWeight: e.b ? '800' : '500', opacity: valueOf(e, data) ? 1 : 0.4 }}>{v}</Text>;
  }
  const left = (e.x / 100) * cardW - (e.a === 'c' ? w / 2 : e.a === 'r' ? w : 0);
  const web = Platform.OS === 'web' ? ({ touchAction: 'none', cursor: editable ? 'grab' : 'default', userSelect: 'none' } as object) : {};
  return (
    <View {...pan.panHandlers} accessibilityLabel={`กล่อง ${TYPE_LABEL[e.t]}`} onLayout={(ev) => setW(ev.nativeEvent.layout.width)}
      style={{ position: 'absolute', left, top: (e.y / 100) * cardH, borderWidth: selected && editable ? 1 : 0, borderStyle: 'dashed', borderColor: '#2563eb', ...web } as object}>
      {body}
    </View>
  );
}

/** The card itself: draws every element at its place; in edit mode the elements can be dragged. */
export function CardCanvas({ layout, data, vcf, color, template, selected, editable, onSelect, onMove, width }: {
  layout: Layout; data: CardData; vcf: string; color: string; template?: CardTemplate | null; selected?: string | null; editable?: boolean;
  onSelect?: (id: string | null) => void; onMove?: (id: string, x: number, y: number) => void; width?: number;
}) {
  const [qr, setQr] = useState<string | null>(null);
  const [auto, setAuto] = useState(300);
  useEffect(() => {
    let live = true;
    QRCode.toString(vcf, { type: 'svg', margin: 0, errorCorrectionLevel: 'L' }).then((s) => { if (live) setQr(s); }).catch(() => { if (live) setQr(null); });
    return () => { live = false; };
  }, [vcf]);
  const cardW = width ?? auto;
  const cardH = (cardW * layout.h) / layout.w;
  const fg = template ? (template.textColor === 'light' ? '#ffffff' : '#0f172a') : textOn(color);
  return (
    <View onLayout={(ev) => { if (!width) setAuto(Math.max(120, ev.nativeEvent.layout.width)); }} style={{ width: width ?? '100%', maxWidth: 520, alignSelf: 'center' }}>
      <View style={{ width: cardW, height: cardH, backgroundColor: template ? '#e2e8f0' : color, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#cbd5e1' }}>
        {template ? <Image source={{ uri: template.uri }} style={{ position: 'absolute', width: '100%', height: '100%' }} resizeMode="cover" /> : null}
        {editable && onSelect ? <View onStartShouldSetResponder={() => true} onResponderRelease={() => onSelect(null)} style={{ position: 'absolute', width: '100%', height: '100%' }} /> : null}
        {layout.els.map((e) => (
          <Item key={e.id} e={e} cardW={cardW} cardH={cardH} fg={fg} data={data} qr={qr} selected={selected === e.id} editable={!!editable}
            onSelect={(id) => onSelect?.(id)} onMove={(id, x, y) => onMove?.(id, x, y)} />
        ))}
      </View>
    </View>
  );
}


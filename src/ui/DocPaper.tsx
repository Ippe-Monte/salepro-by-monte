import { useEffect } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { baht } from '@/lib/money';
import { bahtText } from '@/lib/bahttext';
import type { DocContext, Img } from '@/lib/docmeta';
import { DbImage } from './DbImage';

export type PaperItem = { code?: string; desc: string; qty: number; unit: string; price?: number; total?: number; image?: Img | null };
export type PaperProps = {
  ctx: DocContext;
  org: { name: string; tax_id: string | null; address: string | null; phone: string | null };
  docNo: string;
  date: string;
  party: { label: string; name: string; lines: string[] };
  meta: [string, string][];
  items: PaperItem[];
  totals?: { subtotal: number; discount: number; vat: number; vatRate: number; total: number };
  note?: string | null;
  extra?: string[];
};

const INK = '#111827';
const LINE = '#cbd5e1';
let styled = false;

/** Web only: print a copy of the paper placed directly under <body>, so the rest of the app never shows up on the page. */
function usePrintStyle() {
  useEffect(() => {
    if (Platform.OS !== 'web' || styled || typeof document === 'undefined') return;
    const el = document.createElement('style');
    el.textContent = '#print-root { display: none; } @media print { body.printing > *:not(#print-root) { display: none !important; } body.printing, html:has(body.printing) { height: auto !important; overflow: visible !important; } body.printing #print-root { display: block !important; } #print-root * { overflow: visible !important; } @page { size: A4; margin: 12mm; } }';
    document.head.appendChild(el);
    styled = true;
  }, []);
}

export function printPaper() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const src = Array.from(document.querySelectorAll('[id="paper"]')).find((e) => e.getClientRects().length > 0) ?? null;
  if (!src) return window.print();
  const root = document.createElement('div');
  root.id = 'print-root';
  root.appendChild(src.cloneNode(true));
  document.body.appendChild(root);
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); root.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
}

export function DocPaper(p: PaperProps) {
  usePrintStyle();
  const { settings: s, branding: b, logo } = p.ctx;
  const align = s.logo_pos === 'center' ? 'center' : s.logo_pos === 'right' ? 'flex-end' : 'flex-start';
  const sigs = s.sig_labels.slice(0, 4);
  const cols = [s.col_image, s.col_code, s.show_prices, s.col_unit];
  const price = s.show_prices;
  return (
    <View nativeID="paper" style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: LINE, borderRadius: 8, marginVertical: 12 }}>
     <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ flexGrow: 1 }}>
      <View style={{ padding: 24, minWidth: 600, flexGrow: 1 }}>
      <View style={{ alignItems: align, marginBottom: 12, flexDirection: 'row', justifyContent: align }}>
        {s.logo_show && logo ? <View style={{ marginRight: 12 }}><DbImage data={logo.data} mime={logo.mime} size={64} /></View> : null}
        <View style={{ flexShrink: 1, alignItems: s.logo_pos === 'center' ? 'center' : s.logo_pos === 'right' ? 'flex-end' : 'flex-start' }}>
          <Text style={{ color: INK, fontWeight: '800', fontSize: 17 }}>{p.org.name}{b?.branch_name ? ` (${b.branch_name})` : ''}</Text>
          {b?.tagline ? <Text style={{ color: '#475569', fontSize: 12 }}>{b.tagline}</Text> : null}
          {p.org.address ? <Text style={{ color: '#475569', fontSize: 12 }}>{p.org.address}</Text> : null}
          <Text style={{ color: '#475569', fontSize: 12 }}>
            {[p.org.tax_id ? `เลขผู้เสียภาษี ${p.org.tax_id}` : '', p.org.phone ? `โทร ${p.org.phone}` : '', b?.email ?? '', b?.website ?? ''].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <View style={{ backgroundColor: s.header_color, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 }}>
        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 18, textAlign: 'center' }}>{s.title_th ?? ''}</Text>
        {s.title_en ? <Text style={{ color: '#fff', textAlign: 'center', fontSize: 12 }}>{s.title_en}</Text> : null}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <View style={{ flexGrow: 1, flexBasis: 220 }}>
          <Text style={{ color: '#64748b', fontSize: 12 }}>{p.party.label}</Text>
          <Text style={{ color: INK, fontWeight: '700' }}>{p.party.name}</Text>
          {p.party.lines.map((l, i) => <Text key={i} style={{ color: '#334155', fontSize: 12 }}>{l}</Text>)}
        </View>
        <View style={{ flexGrow: 1, flexBasis: 180 }}>
          <Text style={{ color: INK }}>เลขที่: <Text style={{ fontWeight: '700' }}>{p.docNo}</Text></Text>
          <Text style={{ color: INK }}>วันที่: {p.date}</Text>
          {p.meta.map(([k, v]) => <Text key={k} style={{ color: INK }}>{k}: {v}</Text>)}
        </View>
      </View>
      <View style={{ borderTopWidth: 1, borderColor: LINE }}>
        <View style={{ flexDirection: 'row', backgroundColor: '#f1f5f9', paddingVertical: 6 }}>
          <Cell w={28} bold>#</Cell>
          {cols[0] ? <Cell w={48} bold>รูป</Cell> : null}
          {cols[1] ? <Cell w={72} bold>รหัส</Cell> : null}
          <Cell flex bold>รายการ</Cell>
          <Cell w={56} right bold>จำนวน</Cell>
          {cols[3] ? <Cell w={44} bold>หน่วย</Cell> : null}
          {price ? <Cell w={80} right bold>ราคา</Cell> : null}
          {price ? <Cell w={88} right bold>รวม</Cell> : null}
        </View>
        {p.items.map((it, i) => (
          <View key={i} style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: LINE, paddingVertical: 6, alignItems: 'center' }}>
            <Cell w={28}>{String(i + 1)}</Cell>
            {cols[0] ? <View style={{ width: 48, paddingHorizontal: 4 }}>{it.image ? <DbImage data={it.image.data} mime={it.image.mime} size={36} /> : null}</View> : null}
            {cols[1] ? <Cell w={72}>{it.code ?? ''}</Cell> : null}
            <Cell flex>{it.desc}</Cell>
            <Cell w={56} right>{it.qty.toLocaleString()}</Cell>
            {cols[3] ? <Cell w={44}>{it.unit}</Cell> : null}
            {price ? <Cell w={80} right>{baht(it.price ?? 0)}</Cell> : null}
            {price ? <Cell w={88} right>{baht(it.total ?? 0)}</Cell> : null}
          </View>
        ))}
      </View>
      {price && p.totals ? (
        <View style={{ alignSelf: 'flex-end', width: 260, marginTop: 8 }}>
          <Row k="รวมเป็นเงิน" v={baht(p.totals.subtotal)} />
          {p.totals.discount > 0 ? <Row k="ส่วนลด" v={`-${baht(p.totals.discount)}`} /> : null}
          <Row k={`ภาษีมูลค่าเพิ่ม ${p.totals.vatRate}%`} v={baht(p.totals.vat)} />
          <Row k="จำนวนเงินรวมทั้งสิ้น" v={baht(p.totals.total)} bold />
          <Text style={{ color: '#475569', fontSize: 12, textAlign: 'right', marginTop: 4 }}>({bahtText(p.totals.total)})</Text>
        </View>
      ) : null}
      {p.note ? <Text style={{ color: INK, marginTop: 10 }}>หมายเหตุ: {p.note}</Text> : null}
      {s.notes ? <Text style={{ color: '#334155', marginTop: 6, fontSize: 12 }}>{s.notes}</Text> : null}
      {(p.extra ?? []).map((e, i) => <Text key={i} style={{ color: '#334155', marginTop: 4, fontSize: 12 }}>{e}</Text>)}
      {sigs.length > 0 ? (
        <View style={{ flexDirection: 'row', gap: 16, marginTop: 36 }}>
          {sigs.map((g) => (
            <View key={g} style={{ flex: 1, alignItems: 'center' }}>
              <View style={{ borderTopWidth: 1, borderColor: INK, width: '100%', marginBottom: 4 }} />
              <Text style={{ color: INK, fontSize: 12 }}>{g}</Text>
              <Text style={{ color: '#64748b', fontSize: 11 }}>วันที่ ____/____/____</Text>
            </View>
          ))}
        </View>
      ) : null}
      {s.footer ? <Text style={{ color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 16 }}>{s.footer}</Text> : null}
      </View>
     </ScrollView>
    </View>
  );
}

function Cell({ children, w, flex, right, bold }: { children?: string; w?: number; flex?: boolean; right?: boolean; bold?: boolean }) {
  return (
    <View style={flex ? { flex: 1, paddingHorizontal: 4 } : { width: w, paddingHorizontal: 4 }}>
      <Text style={{ color: INK, fontSize: 12, fontWeight: bold ? '700' : '400', textAlign: right ? 'right' : 'left' }}>{children}</Text>
    </View>
  );
}
function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
      <Text style={{ color: INK, fontWeight: bold ? '800' : '400' }}>{k}</Text>
      <Text style={{ color: INK, fontWeight: bold ? '800' : '400' }}>{v}</Text>
    </View>
  );
}

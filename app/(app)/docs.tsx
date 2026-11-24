import { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { saveRow } from '@/lib/db';
import { formatDocNo, validateColor, validatePrefix } from '@/lib/docno';
import { DEFAULT_TITLE, DOC_LABEL, loadDocContext, type DocContext, type DocType } from '@/lib/docmeta';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Field, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { DocPaper, printPaper } from '@/ui/DocPaper';

const A4_W = 794; // A4 at 96 dpi
const A4_H = 1123;

function ZoomBtn({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={{ minWidth: 40, minHeight: 36, paddingHorizontal: 10, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

const DEFAULT_PREFIX: Record<DocType, string> = { quote: 'QT', invoice: 'IV', delivery_note: 'DN', delivery_order: 'DO' };

type Form = {
  title_th: string; title_en: string; prefix: string; digits: string; year_fmt: 'ce' | 'be' | 'none'; separator: '-' | '/' | '';
  logo_show: boolean; logo_pos: 'left' | 'center' | 'right'; header_color: string;
  col_image: boolean; col_code: boolean; col_unit: boolean; show_prices: boolean;
  validity_days: string; credit_days: string; vat_rate: string; notes: string; footer: string; sigs: string;
};

function defaults(t: DocType): Form {
  return {
    title_th: DEFAULT_TITLE[t][0], title_en: DEFAULT_TITLE[t][1], prefix: DEFAULT_PREFIX[t], digits: '4', year_fmt: 'ce', separator: '-',
    logo_show: true, logo_pos: 'left', header_color: '#2563EB', col_image: false, col_code: true, col_unit: true, show_prices: true,
    validity_days: t === 'quote' ? '30' : '', credit_days: t === 'invoice' ? '30' : '', vat_rate: '', notes: '', footer: '',
    sigs: t === 'delivery_note' ? 'ผู้ส่งของ,ผู้รับของ' : t === 'quote' ? 'ผู้เสนอราคา,ผู้อนุมัติ' : t === 'invoice' ? 'ผู้ออกเอกสาร,ผู้รับเอกสาร' : 'ผู้จัดของ,ผู้ขับรถ',
  };
}

const YES_NO = [{ v: 'y', label: 'แสดง' }, { v: 'n', label: 'ซ่อน' }];
const yn = (b: boolean) => (b ? 'y' : 'n');
const intOrNull = (s: string) => (s.trim() === '' ? null : Number(s));

export default function DocSettings() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('docs', current?.role);
  const [type, setType] = useState<DocType>('quote');
  const [f, setF] = useState<Form>(defaults('quote'));
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<DocContext | null>(null);
  const { width: winW } = useWindowDimensions();
  const [zoom, setZoom] = useState<number | null>(null); // null = fit to screen
  const [paperH, setPaperH] = useState(A4_H);
  const fit = Math.min(1.5, Math.max(0.3, (winW - 24) / A4_W));
  const scale = zoom ?? fit;
  const step = (d: number) => setZoom(Math.min(2, Math.max(0.3, Math.round((scale + d) * 10) / 10)));
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await neon.from('doc_settings').select('*').eq('org_id', orgId).eq('doc_type', type).maybeSingle();
    const d = defaults(type);
    if (!data) { setF(d); return; }
    const r = data as Record<string, any>;
    setF({
      title_th: r.title_th ?? d.title_th, title_en: r.title_en ?? d.title_en, prefix: r.prefix, digits: String(r.digits), year_fmt: r.year_fmt,
      separator: r.separator, logo_show: r.logo_show, logo_pos: r.logo_pos, header_color: r.header_color, col_image: r.col_image,
      col_code: r.col_code, col_unit: r.col_unit, show_prices: r.show_prices, validity_days: r.validity_days == null ? '' : String(r.validity_days),
      credit_days: r.credit_days == null ? '' : String(r.credit_days), vat_rate: r.vat_rate == null ? '' : String(r.vat_rate),
      notes: r.notes ?? '', footer: r.footer ?? '', sigs: (r.sig_labels ?? []).join(','),
    });
  }, [orgId, type]);
  useEffect(() => { setMsg(null); void load(); }, [load]);

  async function save() {
    if (!orgId || busy) return;
    const digits = Number(f.digits);
    const sigs = f.sigs.split(',').map((s) => s.trim()).filter(Boolean);
    const err = validatePrefix(f.prefix) ?? validateColor(f.header_color)
      ?? (!Number.isInteger(digits) || digits < 3 || digits > 6 ? 'จำนวนหลักต้องเป็น 3–6' : null)
      ?? (sigs.length > 4 ? 'ช่องลายเซ็นได้สูงสุด 4 ช่อง' : null);
    if (err) return setMsg({ text: err, ok: false });
    const days = [f.validity_days, f.credit_days].map(intOrNull);
    if (days.some((d) => d !== null && (!Number.isInteger(d) || d < 0 || d > 365))) return setMsg({ text: 'จำนวนวันต้องเป็น 0–365', ok: false });
    const vat = intOrNull(f.vat_rate);
    if (vat !== null && (!Number.isFinite(vat) || vat < 0 || vat > 100)) return setMsg({ text: 'VAT ต้องอยู่ระหว่าง 0–100', ok: false });
    setBusy(true);
    const e = await saveRow('doc_settings', { org_id: orgId, doc_type: type }, {
      title_th: f.title_th.trim() || null, title_en: f.title_en.trim() || null, prefix: f.prefix, digits, year_fmt: f.year_fmt, separator: f.separator,
      logo_show: f.logo_show, logo_pos: f.logo_pos, header_color: f.header_color, col_image: f.col_image, col_code: f.col_code, col_unit: f.col_unit,
      show_prices: type === 'quote' || type === 'invoice',
      validity_days: days[0], credit_days: days[1], vat_rate: vat, notes: f.notes.trim() || null, footer: f.footer.trim() || null, sig_labels: sigs,
    });
    setBusy(false);
    if (e) return setMsg({ text: e.code === '23505' ? 'รหัสนำหน้านี้ถูกใช้กับเอกสารประเภทอื่นแล้ว' : friendly(e), ok: false });
    setMsg({ text: 'บันทึกแล้ว (มีผลกับเลขเอกสารที่ออกหลังจากนี้)', ok: true });
  }


  /** Shows a sample document using the values currently on screen (saved or not). */
  async function openPreview() {
    if (!orgId) return;
    const base = await loadDocContext(orgId, type);
    setZoom(null);
    const sigs = f.sigs.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 4);
    const vat = intOrNull(f.vat_rate);
    setPreview({
      ...base,
      settings: {
        ...base.settings, title_th: f.title_th.trim() || null, title_en: f.title_en.trim() || null, logo_show: f.logo_show, logo_pos: f.logo_pos,
        header_color: validateColor(f.header_color) === null ? f.header_color : '#2563EB', col_image: f.col_image, col_code: f.col_code, col_unit: f.col_unit,
        show_prices: type === 'quote' || type === 'invoice', validity_days: intOrNull(f.validity_days), credit_days: intOrNull(f.credit_days),
        vat_rate: vat, notes: f.notes.trim() || null, footer: f.footer.trim() || null, sig_labels: sigs,
      },
    });
  }

  const digitsN = Number(f.digits);
  const sample = validatePrefix(f.prefix) === null && digitsN >= 3 && digitsN <= 6 ? formatDocNo({ prefix: f.prefix, digits: digitsN, year_fmt: f.year_fmt, separator: f.separator }, 1) : '—';
  const dis = !editable;
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>ตั้งค่าเอกสาร</Title>
        {dis && <Body tone="muted">เฉพาะเจ้าของ/ผู้ดูแลเท่านั้นที่แก้ไขได้</Body>}
        <Chips value={type} onPick={setType} options={(Object.keys(DOC_LABEL) as DocType[]).map((v) => ({ v, label: DOC_LABEL[v] }))} />
        <Card>
          <Body>ชื่อเอกสาร</Body>
          <Field label="ชื่อภาษาไทย" value={f.title_th} onChangeText={(v) => set('title_th', v)} editable={!dis} />
          <Field label="ชื่อภาษาอังกฤษ" value={f.title_en} onChangeText={(v) => set('title_en', v)} editable={!dis} />
        </Card>
        <Card>
          <Body>เลขที่เอกสาร</Body>
          <Field label="รหัสนำหน้า (A–Z, 0–9 ไม่เกิน 6 ตัว)" value={f.prefix} onChangeText={(v) => set('prefix', v.toUpperCase())} editable={!dis} autoCapitalize="characters" />
          <Field label="จำนวนหลักของเลขลำดับ (3–6)" value={f.digits} onChangeText={(v) => set('digits', v)} editable={!dis} keyboardType="number-pad" />
          <Body tone="muted">ปี</Body>
          <Chips value={f.year_fmt} onPick={(v) => !dis && set('year_fmt', v)} options={[{ v: 'ce', label: 'ค.ศ.' }, { v: 'be', label: 'พ.ศ.' }, { v: 'none', label: 'ไม่ใส่ปี' }]} />
          <Body tone="muted">ตัวคั่น</Body>
          <Chips value={f.separator} onPick={(v) => !dis && set('separator', v)} options={[{ v: '-', label: '-' }, { v: '/', label: '/' }, { v: '', label: 'ไม่มี' }]} />
          <Text style={{ color: colors.accent, fontWeight: '700', marginTop: 4 }}>ตัวอย่าง: {sample}</Text>
          {f.year_fmt === 'none' ? <Body tone="muted">ไม่ใส่ปี = เลขลำดับต่อเนื่องไม่รีเซ็ตทุกปี</Body> : null}
        </Card>
        <Card>
          <Body>หน้าตาเอกสาร</Body>
          <Body tone="muted">โลโก้</Body>
          <Chips value={yn(f.logo_show)} onPick={(v) => !dis && set('logo_show', v === 'y')} options={YES_NO} />
          <Chips value={f.logo_pos} onPick={(v) => !dis && set('logo_pos', v)} options={[{ v: 'left', label: 'ซ้าย' }, { v: 'center', label: 'กลาง' }, { v: 'right', label: 'ขวา' }]} />
          <Field label="สีหัวตาราง (#RRGGBB)" value={f.header_color} onChangeText={(v) => set('header_color', v)} editable={!dis} autoCapitalize="characters" />
          <Body tone="muted">คอลัมน์รูปสินค้า</Body>
          <Chips value={yn(f.col_image)} onPick={(v) => !dis && set('col_image', v === 'y')} options={YES_NO} />
          <Body tone="muted">คอลัมน์รหัสสินค้า</Body>
          <Chips value={yn(f.col_code)} onPick={(v) => !dis && set('col_code', v === 'y')} options={YES_NO} />
          <Body tone="muted">คอลัมน์หน่วย</Body>
          <Chips value={yn(f.col_unit)} onPick={(v) => !dis && set('col_unit', v === 'y')} options={YES_NO} />
        </Card>
        <Card>
          <Body>เงื่อนไขและข้อความ</Body>
          {type === 'quote' ? <Field label="ยืนราคา (วัน)" value={f.validity_days} onChangeText={(v) => set('validity_days', v)} editable={!dis} keyboardType="number-pad" /> : null}
          {type === 'invoice' ? <Field label="เครดิต (วัน) — ใช้คำนวณวันครบกำหนด" value={f.credit_days} onChangeText={(v) => set('credit_days', v)} editable={!dis} keyboardType="number-pad" /> : null}
          {type === 'quote' || type === 'invoice' ? <Field label="VAT % (เว้นว่าง = ใช้ค่าของบริษัท)" value={f.vat_rate} onChangeText={(v) => set('vat_rate', v)} editable={!dis} keyboardType="decimal-pad" /> : null}
          <Field label="หมายเหตุท้ายตาราง" value={f.notes} onChangeText={(v) => set('notes', v)} editable={!dis} multiline />
          <Field label="ข้อความท้ายกระดาษ" value={f.footer} onChangeText={(v) => set('footer', v)} editable={!dis} multiline />
          <Field label="ช่องลายเซ็น (คั่นด้วย , สูงสุด 4)" value={f.sigs} onChangeText={(v) => set('sigs', v)} editable={!dis} />
          {msg && <Body tone={msg.ok ? 'ok' : 'danger'}>{msg.text}</Body>}
          {editable && <Button title="บันทึก" onPress={() => void save()} busy={busy} />}
          <Button title="ดูตัวอย่างเอกสาร" variant="ghost" icon="documents" onPress={() => void openPreview()} />
        </Card>
      </ScrollView>

      {preview && current ? (() => {
        const st = preview.settings;
        const rate = st.vat_rate ?? current.org.vat_rate ?? 7;
        const rows = [
          { code: 'P-001', desc: 'สินค้าตัวอย่าง A', qty: 2, unit: 'ชิ้น', price: 1500 },
          { code: 'P-002', desc: 'สินค้าตัวอย่าง B', qty: 10, unit: 'ชุด', price: 250 },
        ].map((r) => ({ ...r, total: r.qty * r.price }));
        const subtotal = rows.reduce((a, r) => a + r.total, 0);
        const vat = Math.round(subtotal * rate) / 100;
        const meta: [string, string][] = type === 'quote' ? [['ยืนราคา', `${st.validity_days ?? 30} วัน`]] : type === 'invoice' ? [['เครดิต', `${st.credit_days ?? 30} วัน`]] : [];
        return (
          <Modal visible animationType="slide" onRequestClose={() => setPreview(null)}>
            <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingBottom: 8, flexWrap: 'wrap' }}>
                <ZoomBtn label="−" onPress={() => step(-0.1)} />
                <Text style={{ color: colors.text, fontWeight: '700', minWidth: 48, textAlign: 'center' }}>{Math.round(scale * 100)}%</Text>
                <ZoomBtn label="+" onPress={() => step(0.1)} />
                <ZoomBtn label="พอดีจอ" onPress={() => setZoom(null)} />
                <ZoomBtn label="100%" onPress={() => setZoom(1)} />
                <View style={{ flex: 1 }} />
                <ZoomBtn label="ปิดตัวอย่าง" onPress={() => setPreview(null)} />
              </View>
              <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, alignItems: 'flex-start' }}>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  <View style={{ width: A4_W * scale, height: paperH * scale, overflow: 'hidden', backgroundColor: '#fff', borderRadius: 4 }}>
                    <View onLayout={(e) => setPaperH(Math.max(A4_H, e.nativeEvent.layout.height))} style={{ width: A4_W, minHeight: A4_H, backgroundColor: '#fff', transform: [{ scale }], transformOrigin: 'top left' }}>
                      <DocPaper
                        ctx={preview} org={current.org} docNo={sample} date={new Date().toLocaleDateString('th-TH')}
                        party={{ label: type === 'delivery_order' ? 'จัดส่งถึง' : 'ลูกค้า', name: 'บริษัท ตัวอย่าง จำกัด', lines: ['123 ถนนตัวอย่าง กรุงเทพฯ 10110'] }}
                        meta={meta} items={rows}
                        totals={{ subtotal, discount: 0, vat, vatRate: rate, total: subtotal + vat }}
                        note="หมายเหตุตัวอย่าง"
                      />
                    </View>
                  </View>
                </ScrollView>
                <View style={{ alignSelf: 'stretch', marginTop: 12 }}>
                  <Body tone="muted">ตัวอย่างนี้ใช้ข้อมูลสมมุติ และค่าที่ตั้งอยู่บนหน้าจอ (ยังไม่ต้องกดบันทึกก็ดูได้)</Body>
                  <Button title="พิมพ์ / บันทึกเป็น PDF" variant="ghost" onPress={printPaper} />
                </View>
              </ScrollView>
            </View>
          </Modal>
        );
      })() : null}
    </Screen>
  );
}

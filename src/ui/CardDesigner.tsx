import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { clamp, defaultLayout, isBox, isPortrait, newEl, sanitize, setPortrait, setSize, SIZE_PRESETS, SIZE_RANGE, TYPE_LABEL, type El, type ElType, type Layout } from '@/lib/cardlayout';
import type { CardTemplate } from './BusinessCard';
import { CardCanvas, type CardData } from './CardCanvas';
import { ConfirmTrash } from './ListBits';
import { Body, Button, Chips, Field } from './kit';
import { Text } from './Text';
import { colors } from './theme';

type Saved = { id: string; name: string; layout: unknown; created_by: string };
const ADDABLE: ElType[] = ['name', 'position', 'department', 'company', 'address', 'phone', 'email', 'line', 'website', 'text', 'qr', 'logo', 'photo'];
const TEXT_COLORS = ['', '#ffffff', '#000000', '#1d4ed8', '#b91c1c', '#047857', '#f97316'];

/**
 * Designs the card format: size, orientation and text boxes dragged to where they belong.
 * Formats are saved for the whole company, so a colleague only has to fill in their own details.
 */
export function CardDesigner({ orgId, userId, canDeleteAll, layout, layoutId, onChange, onPickSaved, data, vcf, color, template }: {
  orgId: string; userId: string; canDeleteAll: boolean; layout: Layout; layoutId: string | null;
  onChange: (l: Layout) => void; onPickSaved: (id: string, l: Layout) => void; data: CardData; vcf: string; color: string; template: CardTemplate | null;
}) {
  const [saved, setSaved] = useState<Saved[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [wTxt, setWTxt] = useState(String(layout.w));
  const [hTxt, setHTxt] = useState(String(layout.h));

  const load = useCallback(async () => {
    const { data: rows, error } = await neon.from('card_layouts').select('id,name,layout,created_by').eq('org_id', orgId).order('created_at');
    if (error) setErr(friendly(error)); else { setErr(null); setSaved(rows as Saved[]); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setWTxt(String(layout.w)); setHTxt(String(layout.h)); }, [layout.w, layout.h]);

  const el = layout.els.find((e) => e.id === sel) ?? null;
  const patch = (id: string, p: Partial<El>) => onChange({ ...layout, els: layout.els.map((e) => (e.id === id ? { ...e, ...p } : e)) });
  const add = (t: ElType) => {
    if (layout.els.length >= 30) return setErr('เพิ่มกล่องได้ไม่เกิน 30 กล่อง');
    const e = newEl(t, { x: 10, y: 10 + (layout.els.length % 8) * 6 }); setErr(null); onChange({ ...layout, els: [...layout.els, e] }); setSel(e.id);
  };
  const applySize = (w: number, h: number) => onChange(setSize(layout, w, h));
  const nudge = (dx: number, dy: number) => { if (el) patch(el.id, { x: clamp(el.x + dx, 0, 96), y: clamp(el.y + dy, 0, 96) }); };
  const step = (dir: 1 | -1) => { if (!el) return; const r = SIZE_RANGE(el.t); patch(el.id, { s: clamp(el.s + dir * r.step, r.min, r.max) }); };

  async function removeSaved(id: string) {
    const { error } = await neon.from('card_layouts').delete().eq('id', id);
    if (error) setErr(friendly(error)); else { setErr(null); await load(); }
  }

  const btn = { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border };
  return (
    <View>
      {err ? <Body tone="danger">{err}</Body> : null}
      {saved.length > 0 ? (
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>รูปแบบนามบัตรของบริษัท (แตะเพื่อใช้)</Text>
          {saved.map((s) => (
            <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
              <Pressable accessibilityRole="button" onPress={() => { onPickSaved(s.id, sanitize(s.layout)); setSel(null); }} style={{ flex: 1, ...btn, backgroundColor: layoutId === s.id ? colors.selected : 'transparent' }}>
                <Text style={{ color: colors.text }}>{s.name}</Text>
              </Pressable>
              {canDeleteAll || s.created_by === userId ? <ConfirmTrash label="ลบรูปแบบ" onConfirm={() => void removeSaved(s.id)} /> : null}
            </View>
          ))}
        </View>
      ) : <Body tone="muted">ยังไม่มีรูปแบบที่บันทึกไว้ ออกแบบด้านล่างแล้วบันทึกเป็นรูปแบบของบริษัทได้</Body>}

      <Text style={{ color: colors.text, fontWeight: '700' }}>ขนาดนามบัตร</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
        {SIZE_PRESETS.map((p) => {
          const on = Math.min(layout.w, layout.h) === Math.min(p.w, p.h) && Math.max(layout.w, layout.h) === Math.max(p.w, p.h);
          return <Pressable key={p.key} accessibilityRole="button" onPress={() => onChange(setPortrait(setSize(layout, p.w, p.h), isPortrait(layout)))} style={{ ...btn, backgroundColor: on ? colors.selected : 'transparent' }}><Text style={{ color: colors.text, fontSize: 13 }}>{p.label}</Text></Pressable>;
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 1 }}><Field label="กว้าง (มม.)" value={wTxt} keyboardType="number-pad" onChangeText={setWTxt} onBlur={() => applySize(Number(wTxt), layout.h)} /></View>
        <View style={{ flex: 1 }}><Field label="สูง (มม.)" value={hTxt} keyboardType="number-pad" onChangeText={setHTxt} onBlur={() => applySize(layout.w, Number(hTxt))} /></View>
      </View>
      <Chips value={isPortrait(layout) ? 'p' : 'l'} options={[{ v: 'l', label: 'แนวนอน' }, { v: 'p', label: 'แนวตั้ง' }]} onPick={(v) => onChange(setPortrait(layout, v === 'p'))} />

      <View style={{ marginVertical: 10 }}>
        <CardCanvas layout={layout} data={data} vcf={vcf} color={color} template={template} selected={sel} editable onSelect={setSel} onMove={(id, x, y) => patch(id, { x, y })} />
        <Body tone="muted">ลากกล่องข้อความบนนามบัตรเพื่อจัดตำแหน่ง แตะกล่องเพื่อเลือกและปรับแต่ง</Body>
      </View>

      <Text style={{ color: colors.text, fontWeight: '700' }}>เพิ่มกล่องข้อความ</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 6 }}>
        {ADDABLE.map((t) => (
          <Pressable key={t} accessibilityRole="button" accessibilityLabel={`เพิ่ม ${TYPE_LABEL[t]}`} onPress={() => add(t)} style={btn}><Text style={{ color: colors.text, fontSize: 13 }}>+ {TYPE_LABEL[t]}</Text></Pressable>
        ))}
      </View>

      {el ? (
        <View style={{ borderWidth: 1, borderColor: colors.accent, borderRadius: 10, padding: 10, marginTop: 6 }}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>กล่องที่เลือก: {TYPE_LABEL[el.t]}</Text>
          {el.t === 'text' ? <Field label="ข้อความ" value={el.txt ?? ''} onChangeText={(v) => patch(el.id, { txt: v.slice(0, 120) })} /> : null}
          <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6, flexWrap: 'wrap' }}>
            <Pressable accessibilityRole="button" accessibilityLabel="ย่อ" onPress={() => step(-1)} style={btn}><Text style={{ color: colors.text }}>ย่อ −</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="ขยาย" onPress={() => step(1)} style={btn}><Text style={{ color: colors.text }}>ขยาย +</Text></Pressable>
            {!isBox(el.t) ? <Pressable accessibilityRole="button" onPress={() => patch(el.id, { b: !el.b })} style={{ ...btn, backgroundColor: el.b ? colors.selected : 'transparent' }}><Text style={{ color: colors.text, fontWeight: '800' }}>ตัวหนา</Text></Pressable> : null}
          </View>
          {!isBox(el.t) ? <Chips value={el.a ?? 'l'} options={[{ v: 'l', label: 'ชิดซ้าย' }, { v: 'c', label: 'กึ่งกลาง' }, { v: 'r', label: 'ชิดขวา' }]} onPick={(v) => patch(el.id, { a: v })} /> : null}
          {!isBox(el.t) ? (
            <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <Text style={{ color: colors.muted }}>สีตัวอักษร</Text>
              {TEXT_COLORS.map((c) => (
                <Pressable key={c || 'auto'} accessibilityRole="button" accessibilityLabel={c || 'สีอัตโนมัติ'} onPress={() => patch(el.id, { c })}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c || 'transparent', borderWidth: 3, borderColor: (el.c ?? '') === c ? colors.primary : '#cbd5e1', alignItems: 'center', justifyContent: 'center' }}>
                  {c === '' ? <Text style={{ fontSize: 11, color: colors.muted }}>A</Text> : null}
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginVertical: 6 }}>
            {([['◀', -1, 0], ['▲', 0, -1], ['▼', 0, 1], ['▶', 1, 0]] as const).map(([g, dx, dy]) => (
              <Pressable key={g} accessibilityRole="button" accessibilityLabel={`ขยับ ${g}`} onPress={() => nudge(dx, dy)} style={btn}><Text style={{ color: colors.text }}>{g}</Text></Pressable>
            ))}
          </View>
          <Button title="ลบกล่องนี้" variant="ghost" onPress={() => { onChange({ ...layout, els: layout.els.filter((e) => e.id !== el.id) }); setSel(null); }} />
        </View>
      ) : null}
      <Button title="เริ่มใหม่ (รูปแบบมาตรฐาน)" variant="ghost" onPress={() => { onChange(defaultLayout()); setSel(null); }} />
    </View>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { byteaToDataUri, toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage, type Picked } from '@/lib/pickImage';
import type { CardTemplate } from './BusinessCard';
import { Body, Button, Card, Chips, Field } from './kit';
import { Text } from './Text';
import { colors } from './theme';

export type TemplateRow = { id: string; name: string; mime: string; data: string; text_color: 'light' | 'dark'; text_pos: CardTemplate['pos']; panel: boolean; created_by: string };
export const toTemplate = (r: TemplateRow | undefined | null): CardTemplate | null => {
  const uri = r ? byteaToDataUri(r.data, r.mime) : null;
  return r && uri ? { uri, textColor: r.text_color, pos: r.text_pos, panel: r.panel } : null;
};

const POS_LABEL: Record<CardTemplate['pos'], string> = { tl: 'บนซ้าย', tr: 'บนขวา', bl: 'ล่างซ้าย', br: 'ล่างขวา', center: 'กลาง' };

/** Company-wide card templates: photograph an existing printed card once, everyone in the company can reuse it. */
export function CardTemplates({ orgId, userId, canDeleteAll, selected, onSelect, onDraft, preview }: {
  orgId: string; userId: string; canDeleteAll: boolean; selected: string | null;
  onSelect: (id: string | null, t: TemplateRow | null) => void;
  /** Lets the parent preview an unsaved photo on the live card. */
  onDraft: (t: CardTemplate | null) => void;
  /** The live business card, repeated here so changes are visible next to the controls. */
  preview?: React.ReactNode;
}) {
  const [rows, setRows] = useState<TemplateRow[]>([]);
  const [draft, setDraft] = useState<{ pic: Picked; name: string; color: 'light' | 'dark'; pos: CardTemplate['pos']; panel: boolean } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('card_templates').select('id,name,mime,data,text_color,text_pos,panel,created_by').eq('org_id', orgId).order('created_at');
    if (error) setErr('โหลด Template ไม่สำเร็จ'); else { setErr(null); setRows(data as TemplateRow[]); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    onDraft(draft ? { uri: `data:${draft.pic.mime};base64,${draft.pic.b64}`, textColor: draft.color, pos: draft.pos, panel: draft.panel } : null);
    return () => onDraft(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  async function take(source: 'camera' | 'library') {
    const p = await pickImage({ maxSide: 1000, format: 'jpeg', source });
    if (p === null) return;
    if (p === 'denied') return setErr('ไม่ได้รับอนุญาตให้ใช้กล้อง');
    if (p === 'too-big') return setErr('รูปใหญ่เกินไป ลองรูปอื่น');
    setErr(null); setDraft({ pic: p, name: '', color: 'dark', pos: 'bl', panel: true });
  }

  async function save() {
    if (!draft || busy) return;
    if (!draft.name.trim()) return setErr('ตั้งชื่อ Template');
    setBusy(true);
    const { data, error } = await neon.from('card_templates').insert({ org_id: orgId, name: draft.name.trim(), mime: draft.pic.mime, data: toByteaParam(draft.pic.b64), text_color: draft.color, text_pos: draft.pos, panel: draft.panel }).select('id').single();
    setBusy(false);
    if (error || !data) return setErr(friendly(error));
    setDraft(null); setErr(null); await load();
    const { data: full } = await neon.from('card_templates').select('id,name,mime,data,text_color,text_pos,panel,created_by').eq('id', data.id).single();
    onSelect(data.id, (full as TemplateRow) ?? null);
  }

  async function remove(r: TemplateRow) {
    const { error } = await neon.from('card_templates').delete().eq('id', r.id);
    if (error) return setErr(friendly(error));
    if (selected === r.id) onSelect(null, null);
    await load();
  }

  return (
    <View style={{ marginTop: 14 }}>
      <Text style={{ color: colors.text, fontWeight: '800' }}>Template นามบัตรของบริษัท</Text>
      <Body tone="muted">ถ่ายรูปนามบัตรที่ออกแบบไว้แล้ว เก็บเป็น Template ให้ทุกคนในบริษัทใช้ร่วมกัน (ข้อมูลของแต่ละคนจะวางทับบนรูป)</Body>
      {err ? <Body tone="danger">{err}</Body> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 8 }}>
        <Pressable accessibilityRole="button" onPress={() => onSelect(null, null)} style={{ width: 96, height: 62, borderRadius: 8, borderWidth: 2, borderColor: selected ? colors.border : colors.primary, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: colors.text, fontSize: 12, textAlign: 'center' }}>ไม่ใช้ Template (ใช้สีล้วน)</Text>
        </Pressable>
        {rows.map((r) => {
          const uri = byteaToDataUri(r.data, r.mime);
          return (
            <View key={r.id} style={{ width: 96, alignItems: 'center', gap: 2 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={r.name} onPress={() => onSelect(r.id, r)} style={{ width: 96, height: 62, borderRadius: 8, borderWidth: 2, borderColor: selected === r.id ? colors.primary : colors.border, overflow: 'hidden' }}>
                {uri ? <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" /> : null}
              </Pressable>
              <Text numberOfLines={1} style={{ color: colors.text, fontSize: 12 }}>{r.name}</Text>
              {canDeleteAll || r.created_by === userId ? <Pressable accessibilityRole="button" onPress={() => void remove(r)}><Text style={{ color: colors.danger, fontSize: 12 }}>ลบ</Text></Pressable> : null}
            </View>
          );
        })}
      </View>
      {draft ? (
        <Card>
          {preview}
          <Body>ดูตัวอย่างบนนามบัตร แล้วเลือกตำแหน่งข้อความ</Body>
          <Field label="ชื่อ Template" value={draft.name} onChangeText={(v) => setDraft({ ...draft, name: v })} />
          <Body tone="muted">ตำแหน่งข้อความ</Body>
          <Chips value={draft.pos} options={(Object.keys(POS_LABEL) as CardTemplate['pos'][]).map((v) => ({ v, label: POS_LABEL[v] }))} onPick={(v) => setDraft({ ...draft, pos: v })} />
          <Chips value={draft.color} options={[{ v: 'dark', label: 'ตัวอักษรสีเข้ม' }, { v: 'light', label: 'ตัวอักษรสีขาว' }]} onPick={(v) => setDraft({ ...draft, color: v })} />
          <Chips value={draft.panel ? 'y' : 'n'} options={[{ v: 'y', label: 'มีแถบโปร่งแสงรองข้อความ' }, { v: 'n', label: 'ไม่มีแถบ' }]} onPick={(v) => setDraft({ ...draft, panel: v === 'y' })} />
          <Button title="บันทึกเป็น Template ของบริษัท" busy={busy} onPress={() => void save()} />
          <Button title="ยกเลิก" variant="ghost" onPress={() => setDraft(null)} />
        </Card>
      ) : (
        <View>
          <Button title="ถ่ายรูปนามบัตรเป็น Template" variant="ghost" icon="camera" onPress={() => void take('camera')} />
          <Button title="เลือกรูปนามบัตรจากเครื่อง" variant="ghost" icon="plus" onPress={() => void take('library')} />
        </View>
      )}
    </View>
  );
}

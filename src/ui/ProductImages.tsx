import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text } from './Text';
import { friendly } from '@/lib/errors';
import { toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { pickImage } from '@/lib/pickImage';
import { DbImage } from './DbImage';
import { Body } from './kit';
import { colors } from './theme';

type Row = { id: string; position: number; mime: string; data: string };

/** Up to three images per product. Images are loaded only when this panel is opened. */
export function ProductImages({ orgId, productId, editable }: { orgId: string; productId: string; editable: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('product_images').select('id,position,mime,data').eq('org_id', orgId).eq('product_id', productId).order('position');
    if (error) setErr('โหลดรูปไม่สำเร็จ'); else { setErr(null); setRows(data as Row[]); }
  }, [orgId, productId]);
  useEffect(() => { void load(); }, [load]);

  async function put(position: number) {
    if (busy) return;
    const p = await pickImage({ maxSide: 640, format: 'jpeg' });
    if (p === null) return;
    if (p === 'too-big') return setErr('รูปใหญ่เกินไป (ไม่เกิน 300 KB) ลองรูปอื่น');
    setBusy(true);
    const existing = rows.find((r) => r.position === position);
    const { error } = existing
      ? await neon.from('product_images').update({ mime: p.mime, data: toByteaParam(p.b64) }).eq('id', existing.id)
      : await neon.from('product_images').insert({ org_id: orgId, product_id: productId, position, mime: p.mime, data: toByteaParam(p.b64) });
    setBusy(false);
    if (error) return setErr(friendly(error));
    await load();
  }
  async function del(id: string) {
    const { error } = await neon.from('product_images').delete().eq('id', id);
    if (error) setErr(friendly(error)); else await load();
  }

  return (
    <View style={{ marginTop: 8 }}>
      {err ? <Body tone="danger">{err}</Body> : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        {[1, 2, 3].map((pos) => {
          const r = rows.find((x) => x.position === pos);
          return (
            <View key={pos} style={{ alignItems: 'center', gap: 4 }}>
              <Pressable accessibilityRole="button" accessibilityLabel={`รูปที่ ${pos}`} disabled={!editable || busy} onPress={() => void put(pos)}>
                {r ? <DbImage data={r.data} mime={r.mime} size={84} /> : (
                  <View style={{ width: 84, height: 84, borderRadius: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: colors.muted, fontSize: 24 }}>{editable ? '＋' : '–'}</Text>
                  </View>
                )}
              </Pressable>
              {r && editable ? <Pressable accessibilityRole="button" onPress={() => void del(r.id)}><Text style={{ color: colors.danger, fontSize: 12 }}>ลบ</Text></Pressable> : null}
            </View>
          );
        })}
      </View>
      <Body tone="muted">รูปที่ 1 ใช้เป็นรูปหลักบนเอกสาร (ย่อให้อัตโนมัติ ไม่เกิน 300 KB)</Body>
    </View>
  );
}

import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { base64Bytes, byteaToDataUri, hexToBase64, toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { MAX_ATTACH_BYTES, uriToBase64 } from '@/lib/pickImage';
import { Icon } from './Icon';
import { Body, Button } from './kit';
import { Text } from './Text';
import { colors } from './theme';

type F = { id: string; file_name: string; mime: string; byte_size: number };
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Datasheets (PDF or image) of a product. Files are read only when tapped. */
export function ProductFiles({ orgId, productId, editable }: { orgId: string; productId: string; editable: boolean }) {
  const [rows, setRows] = useState<F[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ uri: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('product_datasheets').select('id,file_name,mime,byte_size').eq('org_id', orgId).eq('product_id', productId).order('created_at');
    if (error) setErr(friendly(error)); else { setErr(null); setRows(data as F[]); }
  }, [orgId, productId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a) return;
      const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) return setErr('รองรับเฉพาะ PDF และรูปภาพ');
      if ((a.size ?? 0) > MAX_ATTACH_BYTES) return setErr('ไฟล์ใหญ่เกิน 1.8 MB (ลองลดขนาดไฟล์ก่อน)');
      const b64 = await uriToBase64(a.uri);
      if (base64Bytes(b64) > MAX_ATTACH_BYTES) return setErr('ไฟล์ใหญ่เกิน 1.8 MB (ลองลดขนาดไฟล์ก่อน)');
      const { error } = await neon.from('product_datasheets').insert({ org_id: orgId, product_id: productId, file_name: a.name.slice(0, 200), mime, data: toByteaParam(b64) });
      if (error) setErr(friendly(error)); else { setErr(null); await load(); }
    } catch { setErr('เพิ่มไฟล์ไม่สำเร็จ'); } finally { setBusy(false); }
  }

  async function open(f: F) {
    const { data, error } = await neon.from('product_datasheets').select('data').eq('id', f.id).single();
    if (error || !data) return setErr(friendly(error));
    const hex = (data as { data: string }).data;
    if (f.mime === 'application/pdf') {
      if (Platform.OS === 'web') {
        const bin = atob(hexToBase64(hex.slice(2)));
        window.open(URL.createObjectURL(new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], { type: 'application/pdf' })), '_blank');
      } else setErr('เปิด PDF บนแอพมือถือยังไม่รองรับ');
      return;
    }
    const uri = byteaToDataUri(hex, f.mime);
    if (uri) setView({ uri, name: f.file_name }); else setErr('เปิดไฟล์ไม่ได้');
  }

  async function remove(f: F) {
    const { error } = await neon.from('product_datasheets').delete().eq('id', f.id);
    if (error) setErr(friendly(error)); else await load();
  }

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>Datasheet ({rows.length})</Text>
      {err ? <Body tone="danger">{err}</Body> : null}
      {rows.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Icon name="documents" size={22} color={colors.primary} />
          <Pressable accessibilityRole="button" onPress={() => void open(f)} style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.accent, fontWeight: '600' }}>{f.file_name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{kb(f.byte_size)}</Text>
          </Pressable>
          {editable ? <Pressable accessibilityRole="button" accessibilityLabel="ลบไฟล์แนบ" onPress={() => void remove(f)} style={{ padding: 6 }}><Icon name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      ))}
      {rows.length === 0 ? <Body tone="muted">ยังไม่มี Datasheet</Body> : null}
      {editable ? <Button title="แนบ Datasheet (PDF / รูป)" variant="ghost" icon="paperclip" busy={busy} onPress={() => void add()} /> : null}
      {view ? (
        <Modal animationType="fade" onRequestClose={() => setView(null)}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <ScrollView maximumZoomScale={4} contentContainerStyle={{ flexGrow: 1, justifyContent: 'center' }}>
              <Image source={{ uri: view.uri }} style={{ width: '100%', height: 600 }} resizeMode="contain" accessibilityLabel={view.name} />
            </ScrollView>
            <Pressable accessibilityRole="button" onPress={() => setView(null)} style={{ position: 'absolute', top: 16, right: 16, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 20, padding: 10 }}><Icon name="x" size={22} color="#000" /></Pressable>
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

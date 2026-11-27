import * as DocumentPicker from 'expo-document-picker';
import { useCallback, useEffect, useState } from 'react';
import { Image, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { base64Bytes, byteaToDataUri, hexToBase64, toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { MAX_ATTACH_BYTES, pickPhoto, uriToBase64 } from '@/lib/pickImage';
import { Icon } from './Icon';
import { Body, Button } from './kit';
import { Text } from './Text';
import { colors } from './theme';

type F = { id: string; kind: 'photo' | 'drawing' | 'file'; file_name: string; mime: string; byte_size: number; created_at: string };
const KIND: Record<string, string> = { photo: 'รูปถ่าย', drawing: 'Drawing', file: 'ไฟล์' };
const kb = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1000))} KB`);

/** Photos, drawings and PDFs attached to a job ticket, so details are not missed when taking the order. */
export function JobFiles({ orgId, ticketId, editable }: { orgId: string; ticketId: string; editable: boolean }) {
  const [rows, setRows] = useState<F[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<{ uri: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('job_attachments').select('id,kind,file_name,mime,byte_size,created_at').eq('org_id', orgId).eq('ticket_id', ticketId).order('created_at');
    if (error) setErr(friendly(error)); else { setErr(null); setRows(data as F[]); }
  }, [orgId, ticketId]);
  useEffect(() => { void load(); }, [load]);

  async function save(kind: F['kind'], name: string, mime: string, b64: string) {
    if (base64Bytes(b64) > MAX_ATTACH_BYTES) return setErr('ไฟล์ใหญ่เกิน 1.8 MB');
    const { error } = await neon.from('job_attachments').insert({ org_id: orgId, ticket_id: ticketId, kind, file_name: name.slice(0, 200), mime, data: toByteaParam(b64) });
    if (error) setErr(friendly(error)); else { setErr(null); await load(); }
  }

  async function photo(source: 'camera' | 'library') {
    if (busy) return;
    setBusy(true);
    try {
      const p = await pickPhoto(source);
      if (p === 'denied') setErr('ไม่ได้รับอนุญาตให้ใช้กล้อง');
      else if (p === 'too-big') setErr('ย่อรูปแล้วยังใหญ่เกินไป ลองรูปอื่น');
      else if (p) await save('photo', p.name, p.mime, p.b64);
    } catch { setErr('เพิ่มรูปไม่สำเร็จ'); } finally { setBusy(false); }
  }

  async function drawing() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'], copyToCacheDirectory: true });
      const a = r.canceled ? null : r.assets?.[0];
      if (!a) return;
      const mime = a.mimeType ?? (a.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');
      if (!['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime)) return setErr('รองรับเฉพาะ PDF และรูปภาพ');
      if ((a.size ?? 0) > MAX_ATTACH_BYTES) return setErr('ไฟล์ใหญ่เกิน 1.8 MB (ลองลดขนาดไฟล์ก่อน)');
      await save('drawing', a.name, mime, await uriToBase64(a.uri));
    } catch { setErr('เพิ่มไฟล์ไม่สำเร็จ'); } finally { setBusy(false); }
  }

  async function open(f: F) {
    const { data, error } = await neon.from('job_attachments').select('data').eq('id', f.id).single();
    if (error || !data) return setErr(friendly(error));
    const uri = byteaToDataUri((data as { data: string }).data, f.mime);
    if (!uri) return setErr('เปิดไฟล์ไม่ได้');
    if (f.mime === 'application/pdf') {
      if (Platform.OS === 'web') {
        const bin = atob(hexToBase64((data as { data: string }).data.slice(2)));
        const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
        window.open(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })), '_blank');
      } else setErr('เปิด PDF บนแอพมือถือยังไม่รองรับ');
    } else setView({ uri, name: f.file_name });
  }

  async function remove(f: F) {
    const { error } = await neon.from('job_attachments').delete().eq('id', f.id);
    if (error) setErr(friendly(error)); else await load();
  }

  return (
    <View style={{ marginTop: 10 }}>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>ไฟล์แนบ ({rows.length})</Text>
      {err ? <Body tone="danger">{err}</Body> : null}
      {rows.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
          <Icon name={f.mime === 'application/pdf' ? 'documents' : 'camera'} size={22} color={colors.accent} />
          <Pressable accessibilityRole="button" onPress={() => void open(f)} style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: colors.accent, fontWeight: '600' }}>{f.file_name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>{KIND[f.kind]} · {kb(f.byte_size)}</Text>
          </Pressable>
          {editable ? <Pressable accessibilityRole="button" accessibilityLabel="ลบไฟล์แนบ" onPress={() => void remove(f)} style={{ padding: 6 }}><Icon name="x" size={18} color={colors.muted} /></Pressable> : null}
        </View>
      ))}
      {rows.length === 0 ? <Body tone="muted">ยังไม่มีไฟล์แนบ</Body> : null}
      {editable ? (
        <View style={{ marginTop: 6 }}>
          <Button title="ถ่ายรูปชิ้นงาน" variant="ghost" icon="camera" busy={busy} onPress={() => void photo('camera')} />
          <Button title="เลือกรูปจากเครื่อง" variant="ghost" icon="plus" busy={busy} onPress={() => void photo('library')} />
          <Button title="แนบ Drawing / PDF" variant="ghost" icon="paperclip" busy={busy} onPress={() => void drawing()} />
        </View>
      ) : null}
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

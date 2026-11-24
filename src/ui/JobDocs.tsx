import { useCallback, useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { friendly } from '@/lib/errors';
import { base64Bytes, toByteaParam } from '@/lib/image';
import { neon } from '@/lib/neon';
import { MAX_ATTACH_BYTES, pickPhoto } from '@/lib/pickImage';
import { ConfirmTrash } from './ListBits';
import { Body, Button, Field } from './kit';
import { Text } from './Text';
import { colors } from './theme';

type D = { id: string; kind: 'do' | 'dn'; doc_no: string; doc_date: string; status: 'recorded' | 'received'; receiver_name: string | null; note: string | null; file_name: string | null };
const KIND = { do: 'DO (ใบสั่งส่งของ)', dn: 'ใบส่งของ' } as const;

/** DO and delivery notes are issued outside the app: here they are only *recorded* against the Job Ticket for follow-up and summaries. */
export function JobDocs({ orgId, ticketId, editable, canDelete, onChanged }: { orgId: string; ticketId: string; editable: boolean; canDelete: boolean; onChanged: () => void }) {
  const [rows, setRows] = useState<D[]>([]);
  const [form, setForm] = useState<'do' | 'dn' | null>(null);
  const [f, setF] = useState({ no: '', date: new Date().toISOString().slice(0, 10), note: '' });
  const [photo, setPhoto] = useState<{ name: string; mime: string; b64: string } | null>(null);
  const [recv, setRecv] = useState<{ id: string; who: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('job_docs').select('id,kind,doc_no,doc_date,status,receiver_name,note,file_name').eq('org_id', orgId).eq('ticket_id', ticketId).order('created_at');
    if (error) setErr(friendly(error)); else { setErr(null); setRows(data as D[]); }
  }, [orgId, ticketId]);
  useEffect(() => { void load(); }, [load]);

  async function pick(source: 'camera' | 'library') {
    const p = await pickPhoto(source);
    if (p === 'denied') setErr('ไม่ได้รับอนุญาตให้ใช้กล้อง');
    else if (p === 'too-big') setErr('ย่อรูปแล้วยังใหญ่เกินไป ลองรูปอื่น');
    else if (p) { if (base64Bytes(p.b64) > MAX_ATTACH_BYTES) setErr('ไฟล์ใหญ่เกิน 1.8 MB'); else { setErr(null); setPhoto({ name: p.name, mime: p.mime, b64: p.b64 }); } }
  }

  async function save() {
    if (!form || busy) return;
    if (!f.no.trim()) return setErr(form === 'do' ? 'กรอกเลขที่ DO' : 'กรอกเลขที่ใบส่งของ');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) return setErr('วันที่ต้องเป็นรูปแบบ ปปปป-ดด-วว');
    setBusy(true);
    try {
      const { error } = await neon.from('job_docs').insert({
        org_id: orgId, ticket_id: ticketId, kind: form, doc_no: f.no.trim(), doc_date: f.date, note: f.note.trim() || null,
        ...(photo ? { file_name: photo.name.slice(0, 200), mime: photo.mime, data: toByteaParam(photo.b64) } : {}),
      });
      if (error) return setErr(friendly(error));
      setMsg(form === 'do' ? 'บันทึก DO แล้ว' : 'บันทึกใบส่งของแล้ว'); setErr(null); setForm(null); setPhoto(null); setF({ ...f, no: '', note: '' });
      await load(); onChanged();
    } finally { setBusy(false); }
  }

  async function received() {
    if (!recv || busy) return;
    setBusy(true);
    try {
      const { error } = await neon.from('job_docs').update({ status: 'received', receiver_name: recv.who.trim() || null }).eq('id', recv.id);
      if (error) return setErr(friendly(error));
      setMsg('บันทึกว่าลูกค้ารับของแล้ว'); setErr(null); setRecv(null); await load(); onChanged();
    } finally { setBusy(false); }
  }

  async function remove(d: D) {
    const { error } = await neon.from('job_docs').delete().eq('id', d.id);
    if (error) return setErr(friendly(error));
    setMsg('ลบรายการแล้ว'); await load(); onChanged();
  }

  const has = (k: 'do' | 'dn') => rows.some((r) => r.kind === k);
  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>บันทึกเอกสาร DO / ใบส่งของ</Text>
      {err ? <Body tone="danger">{err}</Body> : null}
      {msg ? <Body tone="ok">{msg}</Body> : null}
      {rows.length === 0 ? <Body tone="muted">ยังไม่มีการบันทึก DO หรือใบส่งของ</Body> : null}
      {rows.map((d) => (
        <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '600' }}>{d.kind === 'do' ? 'DO' : 'ใบส่งของ'} {d.doc_no} · {d.doc_date}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {d.kind === 'dn' ? (d.status === 'received' ? `ลูกค้ารับแล้ว${d.receiver_name ? ` · ${d.receiver_name}` : ''}` : 'รอลูกค้าเซ็นรับ') : 'บันทึกแล้ว'}{d.file_name ? ' · มีไฟล์แนบ' : ''}{d.note ? ` · ${d.note}` : ''}
            </Text>
          </View>
          {editable && d.kind === 'dn' && d.status === 'recorded' ? (
            <Pressable accessibilityRole="button" onPress={() => setRecv({ id: d.id, who: '' })} style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.accent }}><Text style={{ color: colors.accent, fontSize: 13 }}>ลูกค้ารับแล้ว</Text></Pressable>
          ) : null}
          {canDelete ? <ConfirmTrash label="ลบรายการ" onConfirm={() => void remove(d)} /> : null}
        </View>
      ))}
      {recv ? (
        <View style={{ marginTop: 6 }}>
          <Field label="ชื่อผู้รับของ (ถ้ามี)" value={recv.who} onChangeText={(v) => setRecv({ ...recv, who: v })} />
          <Button title="ยืนยันลูกค้ารับของแล้ว" busy={busy} onPress={() => void received()} />
          <Button title="ยกเลิก" variant="ghost" onPress={() => setRecv(null)} />
        </View>
      ) : null}
      {editable && !form ? (
        <View style={{ marginTop: 6 }}>
          {!has('do') ? <Button title="บันทึก DO" variant="ghost" icon="plus" onPress={() => { setForm('do'); setMsg(null); }} /> : null}
          {!has('dn') ? <Button title="บันทึกใบส่งของ" variant="ghost" icon="plus" onPress={() => { setForm('dn'); setMsg(null); }} /> : null}
        </View>
      ) : null}
      {editable && form ? (
        <View style={{ marginTop: 6 }}>
          <Body>{form === 'do' ? 'บันทึก DO' : 'บันทึกใบส่งของ'}</Body>
          <Field label={form === 'do' ? 'เลขที่ DO' : 'เลขที่ใบส่งของ'} value={f.no} onChangeText={(v) => setF({ ...f, no: v })} />
          <Field label="วันที่ (ปปปป-ดด-วว)" value={f.date} onChangeText={(v) => setF({ ...f, date: v })} />
          <Field label="หมายเหตุ" value={f.note} onChangeText={(v) => setF({ ...f, note: v })} />
          {photo ? <Body tone="muted">แนบรูป: {photo.name}</Body> : null}
          <Button title="ถ่ายรูปเอกสาร" variant="ghost" icon="camera" onPress={() => void pick('camera')} />
          <Button title="เลือกรูปเอกสาร" variant="ghost" icon="plus" onPress={() => void pick('library')} />
          <Button title="บันทึก" busy={busy} onPress={() => void save()} />
          <Button title="ยกเลิก" variant="ghost" onPress={() => { setForm(null); setPhoto(null); setErr(null); }} />
        </View>
      ) : null}
    </View>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

type T = { id: string; doc_no: string; customer_id: string; title: string; description: string | null; priority: string; status: string; source: string; due_date: string | null };
type Ev = { id: string; kind: string; from_status: string | null; to_status: string | null; body: string | null; created_at: string };
type C = { id: string; name: string };

const STATUS: Record<string, string> = { open: 'เปิดงาน', in_progress: 'กำลังดำเนินการ', waiting_customer: 'รอลูกค้า', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
const PRIORITY: Record<string, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง', urgent: 'ด่วน' };
const SOURCE: Record<string, string> = { phone: 'โทรศัพท์', email: 'อีเมล', line: 'LINE', visit: 'เข้าพบ', other: 'อื่นๆ' };
const NEXT: Record<string, string[]> = { open: ['in_progress', 'cancelled'], in_progress: ['waiting_customer', 'done', 'cancelled'], waiting_customer: ['in_progress', 'cancelled'], done: [], cancelled: [] };
const tone = (s: string) => (s === 'done' ? 'ok' : s === 'cancelled' ? 'muted' : s === 'waiting_customer' ? 'warn' : 'muted') as 'ok' | 'muted' | 'warn';

export default function Jobs() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('jobs', current?.role);
  const [rows, setRows] = useState<T[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [filter, setFilter] = useState<'active' | 'closed'>('active');
  const [sel, setSel] = useState<string | null>(null);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ customer: '', title: '', desc: '', priority: 'normal', source: 'phone', due: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const [t, c] = await Promise.all([
      neon.from('job_tickets').select('id,doc_no,customer_id,title,description,priority,status,source,due_date').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('customers').select('id,name').eq('org_id', orgId).is('archived_at', null).order('name'),
    ]);
    if (t.error || c.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setRows(t.data as T[]); setCusts(c.data as C[]);
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function loadEvents(id: string) {
    const { data } = await neon.from('job_ticket_events').select('id,kind,from_status,to_status,body,created_at').eq('ticket_id', id).order('created_at');
    setEvs((data ?? []) as Ev[]);
  }
  async function open(id: string) {
    setComment('');
    if (sel === id) return setSel(null);
    setSel(id); await loadEvents(id);
  }

  async function add() {
    if (!orgId) return;
    if (!f.customer) return setErr('เลือกลูกค้า');
    if (!f.title.trim()) return setErr('กรอกหัวข้องาน');
    if (f.due && !/^\d{4}-\d{2}-\d{2}$/.test(f.due)) return setErr('กำหนดเสร็จต้องเป็นรูปแบบ ปปปป-ดด-วว');
    const { error } = await neon.from('job_tickets').insert({ org_id: orgId, customer_id: f.customer, title: f.title.trim(), description: f.desc.trim() || null, priority: f.priority, source: f.source, due_date: f.due || null });
    if (error) return setErr(friendly(error));
    setF({ ...f, title: '', desc: '', due: '' }); setErr(null); await load();
  }
  async function move(t: T, status: string) {
    const { error } = await neon.from('job_tickets').update({ status }).eq('id', t.id);
    if (error) return setErr(friendly(error));
    setErr(null); await load(); await loadEvents(t.id);
  }
  async function addComment(t: T) {
    if (!orgId || !comment.trim()) return;
    const { error } = await neon.from('job_ticket_events').insert({ org_id: orgId, ticket_id: t.id, body: comment.trim() });
    if (error) return setErr(friendly(error));
    setComment(''); setErr(null); await loadEvents(t.id);
  }

  const shown = rows.filter((r) => (filter === 'active' ? !['done', 'cancelled'].includes(r.status) : ['done', 'cancelled'].includes(r.status)));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>Job Ticket</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Chips value={filter} options={[{ v: 'active', label: 'กำลังติดตาม' }, { v: 'closed', label: 'ปิดแล้ว' }]} onPick={setFilter} />
        {editable ? (
          <Card>
            <Body>รับงานจากลูกค้า</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {custs.map((c) => (
                <Pressable key={c.id} accessibilityRole="button" onPress={() => setF({ ...f, customer: c.id })}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: f.customer === c.id ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{c.name}</Text>
                </Pressable>
              ))}
            </View>
            <Field label="หัวข้องาน" value={f.title} onChangeText={(v) => setF({ ...f, title: v })} />
            <Field label="รายละเอียด" value={f.desc} onChangeText={(v) => setF({ ...f, desc: v })} multiline />
            <Chips value={f.priority} options={Object.entries(PRIORITY).map(([v, label]) => ({ v, label }))} onPick={(v) => setF({ ...f, priority: v })} />
            <Chips value={f.source} options={Object.entries(SOURCE).map(([v, label]) => ({ v, label }))} onPick={(v) => setF({ ...f, source: v })} />
            <Field label="กำหนดเสร็จ (ปปปป-ดด-วว)" value={f.due} onChangeText={(v) => setF({ ...f, due: v })} />
            <Button title="เปิด Job Ticket" onPress={add} />
          </Card>
        ) : null}
        {shown.length === 0 ? <Empty>ไม่มีงาน</Empty> : null}
        {shown.map((t) => {
          const overdue = !!t.due_date && t.due_date < today && !['done', 'cancelled'].includes(t.status);
          return (
            <Card key={t.id}>
              <Pressable accessibilityRole="button" onPress={() => void open(t.id)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{t.doc_no} · {t.title}</Text>
                <Body tone="muted">{custs.find((c) => c.id === t.customer_id)?.name ?? '-'} · {SOURCE[t.source]}{t.due_date ? ` · กำหนด ${t.due_date}` : ''}</Body>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Pill text={STATUS[t.status] ?? t.status} tone={tone(t.status)} />
                  <Pill text={`ความสำคัญ: ${PRIORITY[t.priority]}`} tone={t.priority === 'urgent' ? 'danger' : t.priority === 'high' ? 'warn' : 'muted'} />
                  {overdue ? <Pill text="เกินกำหนด" tone="danger" /> : null}
                </View>
              </Pressable>
              {sel === t.id ? (
                <View style={{ marginTop: 10 }}>
                  {t.description ? <Body>{t.description}</Body> : null}
                  {editable && (NEXT[t.status] ?? []).length > 0 ? (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
                      {(NEXT[t.status] ?? []).map((s) => (
                        <Pressable key={s} accessibilityRole="button" onPress={() => void move(t, s)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.accent }}>
                          <Text style={{ color: colors.accent }}>→ {STATUS[s]}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  <Body>ความเคลื่อนไหว</Body>
                  {evs.map((e) => (
                    <Body key={e.id} tone="muted">
                      {new Date(e.created_at).toLocaleString(dateLocale())} · {e.kind === 'created' ? 'เปิดงาน' : e.kind === 'status' ? `${STATUS[e.from_status ?? ''] ?? ''} → ${STATUS[e.to_status ?? ''] ?? ''}` : e.body}
                    </Body>
                  ))}
                  {editable ? (
                    <>
                      <Field label="เพิ่มบันทึก" value={comment} onChangeText={setComment} />
                      <Button title="บันทึก" variant="ghost" onPress={() => addComment(t)} />
                    </>
                  ) : null}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { nextAction, STEPS, stepOf, SUB_LABEL, subOf, summarize, type PipelineRow, type Sub } from '@/lib/pipeline';
import { JobDocs } from '@/ui/JobDocs';
import { JobFiles } from '@/ui/JobFiles';
import { AddToggle } from '@/ui/ListBits';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

type T = { id: string; doc_no: string; customer_id: string; title: string; description: string | null; priority: string; status: string; source: string; due_date: string | null };
type Ev = { id: string; kind: string; from_status: string | null; to_status: string | null; body: string | null; created_at: string };
type C = { id: string; name: string };

const STATUS: Record<string, string> = { open: 'เปิดงาน', in_progress: 'กำลังดำเนินการ', waiting_customer: 'รอลูกค้า', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
const PRIORITY: Record<string, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง', urgent: 'ด่วน' };
const SOURCE: Record<string, string> = { phone: 'โทรศัพท์', email: 'อีเมล', line: 'LINE', visit: 'เข้าพบ', other: 'อื่นๆ' };
const NEXT: Record<string, string[]> = { open: ['in_progress', 'done', 'cancelled'], in_progress: ['waiting_customer', 'done', 'cancelled'], waiting_customer: ['in_progress', 'cancelled'], done: [], cancelled: [] };
const tone = (s: string) => (s === 'done' ? 'ok' : s === 'cancelled' ? 'muted' : s === 'waiting_customer' ? 'warn' : 'muted') as 'ok' | 'muted' | 'warn';

function Stepper({ step, label }: { step: number; label: string }) {
  return (
    <View style={{ marginTop: 8 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {STEPS.map((s) => <View key={s.n} style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: s.n <= step ? colors.primary : colors.border }} />)}
      </View>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>ขั้น {step}/5 · {label}</Text>
    </View>
  );
}

/** Documents that belong to this job, in process order. */
function Flow({ p }: { p: PipelineRow | undefined }) {
  const rows: [string, string | null, string | null][] = [
    ['2. ใบเสนอราคา', p?.quote_no ?? null, p?.quote_status ?? null], ['3. DO', p?.do_no ?? null, p?.do_status ?? null],
    ['4. ใบส่งของ', p?.dn_no ?? null, p?.dn_status ?? null], ['5. Invoice', p?.inv_no ?? null, p?.inv_status ?? null],
  ];
  const ST: Record<string, string> = { draft: 'ร่าง', sent: 'ส่งแล้ว', accepted: 'ลูกค้าตกลง', recorded: 'บันทึกแล้ว', issued: 'ออกแล้ว', received: 'ลูกค้ารับแล้ว', paid: 'ชำระแล้ว' };
  return (
    <View style={{ marginVertical: 8 }}>
      <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 4 }}>เอกสารในงานนี้</Text>
      {rows.map(([name, no, st]) => (
        <Body key={name} tone={no ? undefined : 'muted'}>{name}: {no ? `${no} · ${ST[st ?? ''] ?? st}` : 'ยังไม่มี'}</Body>
      ))}
    </View>
  );
}

export default function Jobs() {
  const router = useRouter();
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('jobs', current?.role);
  const [rows, setRows] = useState<T[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [filter, setFilter] = useState<'active' | 'closed'>('active');
  const [sel, setSel] = useState<string | null>(null);
  const [pipe, setPipe] = useState<Record<string, PipelineRow>>({});
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ customer: '', title: '', desc: '', priority: 'normal', source: 'phone', due: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const [t, c, pl] = await Promise.all([
      neon.from('job_tickets').select('id,doc_no,customer_id,title,description,priority,status,source,due_date').eq('org_id', orgId).order('created_at', { ascending: false }),
      neon.from('customers').select('id,name').eq('org_id', orgId).is('archived_at', null).order('name'),
      neon.from('job_pipeline').select('*').eq('org_id', orgId),
    ]);
    if (t.error || c.error || pl.error) return setErr('โหลดข้อมูลไม่สำเร็จ');
    setErr(null); setRows(t.data as T[]); setCusts(c.data as C[]);
    setPipe(Object.fromEntries((pl.data as PipelineRow[]).map((r) => [r.ticket_id, r])));
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
    setF({ ...f, title: '', desc: '', due: '' }); setErr(null); setAdding(false); await load();
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

  async function go(t: T, n: NonNullable<ReturnType<typeof nextAction>>) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      if (n.kind === 'make_quote') {
        const { data, error } = await neon.from('quotations').insert({ org_id: orgId, customer_id: t.customer_id, ticket_id: t.id }).select('id').single();
        if (error || !data) return setErr(friendly(error));
        await load(); router.push({ pathname: '/quotes', params: { open: data.id } } as never);
      } else if (n.kind === 'open_quote') router.push({ pathname: '/quotes', params: { open: n.id } } as never);
      else if (n.kind === 'rec_do' || n.kind === 'rec_dn' || n.kind === 'receive_dn') setSel(t.id);
      else if (n.kind === 'make_invoice') {
        const { data, error } = await neon.rpc('issue_invoice', { p_quotation: n.quoteId, p_note: null });
        if (error) return setErr(friendly(error));
        await load(); router.push({ pathname: '/invoices', params: { open: (data as { id: string } | null)?.id ?? '' } } as never);
      } else if (n.kind === 'open_invoice') router.push({ pathname: '/invoices', params: { open: n.id } } as never);
    } finally { setBusy(false); }
  }

  const isOpen = (r: T) => !['done', 'cancelled'].includes(r.status);
  const subs = useMemo(() => rows.filter(isOpen).map((r) => ({ id: r.id, sub: subOf(pipe[r.id]) })), [rows, pipe]);
  const counts = useMemo(() => summarize(subs), [subs]);
  const subById = Object.fromEntries(subs.map((x) => [x.id, x.sub])) as Record<string, Sub>;

  const shown = rows.filter((r) => (filter === 'active' ? !['done', 'cancelled'].includes(r.status) && (step === 0 || stepOf(subById[r.id] ?? 'open') === step) : ['done', 'cancelled'].includes(r.status)));
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>Job Ticket</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        {editable ? <AddToggle open={adding} onToggle={() => setAdding(!adding)} label="เปิด Job Ticket รับงาน" /> : null}
        <Card>
          <Text style={{ color: colors.text, fontWeight: '800' }}>สรุปสถานะงาน (ทุกเอกสารเริ่มจาก Job Ticket)</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {STEPS.map((s) => {
              const n = s.subs.reduce((a, k) => a + counts[k], 0);
              const on = step === s.n;
              return (
                <Pressable key={s.n} accessibilityRole="button" onPress={() => { setFilter('active'); setStep(on ? 0 : s.n); }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.primary : colors.border, backgroundColor: on ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800' }}>{n}</Text>
                  <Text numberOfLines={2} style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>{s.n}. {s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {STEPS.filter((s) => step === 0 || s.n === step).flatMap((s) => s.subs).filter((k) => counts[k] > 0 && k !== 'inv_paid').map((k) => (
            <Body key={k} tone="muted">• {SUB_LABEL[k]}: {counts[k]}</Body>
          ))}
          {subs.length === 0 ? <Body tone="muted">ยังไม่มีงานที่กำลังติดตาม</Body> : null}
        </Card>
        <Chips value={filter} options={[{ v: 'active', label: 'กำลังติดตาม' }, { v: 'closed', label: 'ปิดแล้ว' }]} onPick={(v) => { setFilter(v); setStep(0); }} />
        {editable && adding ? (
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
                {isOpen(t) ? <Stepper step={stepOf(subById[t.id] ?? 'open')} label={SUB_LABEL[subById[t.id] ?? 'open']} /> : null}
              </Pressable>
              {sel === t.id ? (
                <View style={{ marginTop: 10 }}>
                  {t.description ? <Body>{t.description}</Body> : null}
                  <Flow p={pipe[t.id]} />
                  {(() => {
                    const n = isOpen(t) ? nextAction(pipe[t.id]) : null;
                    if (!n) return null;
                    const label: Record<string, string> = { make_quote: 'ออกใบเสนอราคาจาก Job นี้', open_quote: 'เปิดใบเสนอราคา', rec_do: 'บันทึก DO (เลื่อนลงด้านล่าง)', rec_dn: 'บันทึกใบส่งของ (เลื่อนลงด้านล่าง)', receive_dn: 'บันทึกว่าลูกค้ารับของแล้ว', make_invoice: 'ออก Invoice', open_invoice: 'เปิด Invoice' };
                    if ((n.kind === 'make_quote' || n.kind === 'make_invoice') && !editable) return null;
                    return <Button title={`ขั้นต่อไป: ${label[n.kind] ?? ''}`} busy={busy} onPress={() => void go(t, n)} />;
                  })()}
                  {orgId ? <JobDocs orgId={orgId} ticketId={t.id} editable={editable || canEdit('delivery', current?.role)} canDelete={current?.role === 'owner' || current?.role === 'admin'} onChanged={() => void load()} /> : null}
                  {orgId ? <JobFiles orgId={orgId} ticketId={t.id} editable={editable} /> : null}
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

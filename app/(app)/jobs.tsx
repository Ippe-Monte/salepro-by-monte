import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canChangeOwned, canEdit } from '@/auth/roles';
import { useOrgMembers } from '@/lib/members';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { nextAction, STEPS, stepOf, SUB_LABEL, subOf, summarize, type PipelineRow, type Sub } from '@/lib/pipeline';
import { JobFiles } from '@/ui/JobFiles';
import { TitleAdd } from '@/ui/ListBits';
import { JobTabs } from '@/ui/SegTabs';
import { baht } from '@/lib/money';
import { Icon } from '@/ui/Icon';
import { Body, Button, Card, Chips, Empty, Field, Pill, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';
import { dateLocale } from '@/i18n';

// Baht sign written as an escape so it is not mistaken for translatable Thai text.
const BAHT = String.fromCharCode(0x0e3f);

type T = { id: string; doc_no: string; customer_id: string; title: string; description: string | null; priority: string; status: string; source: string; due_date: string | null; created_at: string; created_by: string | null };
type Ev = { id: string; kind: string; from_status: string | null; to_status: string | null; body: string | null; created_at: string };
type C = { id: string; name: string };

const STATUS: Record<string, string> = { open: 'เปิดงาน', in_progress: 'กำลังดำเนินการ', waiting_customer: 'รอลูกค้า', done: 'เสร็จสิ้น', cancelled: 'ยกเลิก' };
const PRIORITY: Record<string, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง', urgent: 'ด่วน' };
const SOURCE: Record<string, string> = { phone: 'โทรศัพท์', email: 'อีเมล', line: 'LINE', visit: 'เข้าพบ', other: 'อื่นๆ' };
const NEXT: Record<string, string[]> = { open: ['in_progress', 'done', 'cancelled'], in_progress: ['waiting_customer', 'done', 'cancelled'], waiting_customer: ['in_progress', 'cancelled'], done: [], cancelled: [] };
const SHORT: Record<Sub, string> = { open: 'รับงานแล้ว', quote_draft: 'ใบเสนอราคา (ร่าง)', quote_sent: 'ส่งใบเสนอราคาแล้ว', quote_ok: 'ลูกค้าตกลง', do_prep: 'ออก DO แล้ว จองสต็อก', do_ship: 'ตัดสต็อกแล้ว', dn_wait: 'รอลูกค้ารับของ', dn_done: 'ลูกค้ารับของแล้ว', inv_wait: 'รอชำระเงิน', inv_paid: 'ชำระเงินแล้ว' };
const PAGE = 8;
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
  const ST: Record<string, string> = { draft: 'ร่าง', sent: 'ส่งแล้ว', accepted: 'ลูกค้าตกลง', ready: 'พร้อมส่ง', dispatched: 'ออกจัดส่ง', delivered: 'ส่งสำเร็จ', issued: 'ออกแล้ว', received: 'ลูกค้ารับแล้ว', paid: 'ชำระแล้ว' };
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
  const { current, profile } = useAuth();
  const orgId = current?.org_id;
  const canOpenNew = canEdit('jobs', current?.role);
  const { nameOf } = useOrgMembers(current?.org_id);
  /** Only the member who opened the ticket (or owner/admin) can change it; others view only. */
  const mayChange = (t: T) => canChangeOwned(current?.role, t.created_by, profile?.id);
  const [rows, setRows] = useState<T[]>([]);
  const [custs, setCusts] = useState<C[]>([]);
  const [filter, setFilter] = useState<'active' | 'closed'>('active');
  const [sel, setSel] = useState<string | null>(null);
  const [pipe, setPipe] = useState<Record<string, PipelineRow>>({});
  const [step, setStep] = useState(0);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const wide = useWindowDimensions().width >= 700;
  const [busy, setBusy] = useState(false);
  const [evs, setEvs] = useState<Ev[]>([]);
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ customer: '', title: '', desc: '', priority: 'normal', source: 'phone', due: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const [t, c, pl] = await Promise.all([
      neon.from('job_tickets').select('id,doc_no,customer_id,title,description,priority,status,source,due_date,created_at,created_by').eq('org_id', orgId).order('created_at', { ascending: false }),
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

  /** Issue a DO from the accepted quotation: copy its product lines, then reserve the stock (mark_do_ready). */
  async function createDo(t: T, quoteId: string): Promise<string | null> {
    if (!orgId) return 'ไม่พบบริษัท';
    const { data: ad } = await neon.from('customer_addresses').select('id,is_default').eq('org_id', orgId).eq('customer_id', t.customer_id);
    const list = (ad ?? []) as { id: string; is_default: boolean }[];
    const addr = list.find((a) => a.is_default) ?? list[0];
    if (!addr) return 'ลูกค้านี้ยังไม่มีที่อยู่ — เพิ่มที่อยู่ในเมนูลูกค้าก่อน';
    const { data: li, error: e1 } = await neon.from('quotation_items').select('product_id,description,qty,unit').eq('quotation_id', quoteId);
    if (e1) return friendly(e1);
    const lines = ((li ?? []) as { product_id: string | null; description: string; qty: number; unit: string }[]).filter((x) => x.product_id);
    if (lines.length === 0) return 'ใบเสนอราคานี้ไม่มีรายการที่ผูกกับสินค้า จึงจองสต็อกไม่ได้';
    const { data, error } = await neon.from('delivery_orders').insert({ org_id: orgId, customer_id: t.customer_id, address_id: addr.id, quotation_id: quoteId }).select('id').single();
    if (error || !data) return friendly(error);
    const { error: e2 } = await neon.from('delivery_order_items').insert(lines.map((l) => ({ org_id: orgId, order_id: data.id, product_id: l.product_id as string, description: l.description, qty: l.qty, unit: l.unit })));
    if (e2) return friendly(e2);
    const { error: e3 } = await neon.rpc('mark_do_ready', { p_do: data.id });
    return e3 ? `${friendly(e3)} — DO ถูกสร้างเป็นร่างแล้ว กดพร้อมส่งอีกครั้งในหน้า DO เมื่อมีของ` : null;
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
      else if (n.kind === 'make_do') {
        const msg = await createDo(t, n.quoteId);
        if (msg) return setErr(msg);
        await load(); router.push('/delivery' as never);
      }
      else if (n.kind === 'open_do') router.push('/delivery' as never);
      else if (n.kind === 'make_dn') {
        const { data, error } = await neon.rpc('issue_delivery_note', { p_do: n.doId });
        if (error) return setErr(friendly(error));
        await load(); router.push({ pathname: '/notes', params: { open: (data as { id: string } | null)?.id ?? '' } } as never);
      } else if (n.kind === 'open_dn') router.push({ pathname: '/notes', params: { open: n.id } } as never);
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
  const needle = q.trim().toLowerCase();
  const filtered = shown.filter((r) => !needle || `${r.doc_no} ${r.title} ${custs.find((c) => c.id === r.customer_id)?.name ?? ''}`.toLowerCase().includes(needle));
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  const cur = Math.min(page, pages);
  const visible = filtered.slice((cur - 1) * PAGE, cur * PAGE);
  const today = new Date().toISOString().slice(0, 10);
  const COL = { no: 118, cust: 1.3, title: 1.3, amt: 100, st: 150, date: 92, act: 40 };
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <JobTabs active="/jobs" />
        <TitleAdd title="Job Ticket" show={canOpenNew} open={adding} onToggle={() => setAdding(!adding)} />
        {err ? <Body tone="danger">{err}</Body> : null}
        <Card>
          <Text style={{ color: colors.text, fontWeight: '800' }}>สรุปสถานะงาน (ทุกเอกสารเริ่มจาก Job Ticket)</Text>
          <View style={{ flexDirection: 'row', gap: 6, marginTop: 10 }}>
            {STEPS.map((s) => {
              const n = s.subs.reduce((a, k) => a + counts[k], 0);
              const on = step === s.n;
              return (
                <Pressable key={s.n} accessibilityRole="button" onPress={() => { setFilter('active'); setStep(on ? 0 : s.n); setPage(1); }}
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
        <Chips value={filter} options={[{ v: 'active', label: 'กำลังติดตาม' }, { v: 'closed', label: 'ปิดแล้ว' }]} onPick={(v) => { setFilter(v); setStep(0); setPage(1); }} />
        {canOpenNew && adding ? (
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
        <Field label="ค้นหา เลขที่ / ลูกค้า / หัวข้องาน" value={q} onChangeText={(v) => { setQ(v); setPage(1); }} />
        {filtered.length === 0 ? <Empty>ไม่มีงาน</Empty> : null}
        {wide && filtered.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, backgroundColor: colors.border, borderRadius: 10, gap: 10 }}>
            <Text style={{ width: COL.no, color: colors.muted, fontWeight: '700', fontSize: 12 }}>เลขที่</Text>
            <Text style={{ flex: COL.cust, color: colors.muted, fontWeight: '700', fontSize: 12 }}>ลูกค้า</Text>
            <Text style={{ flex: COL.title, color: colors.muted, fontWeight: '700', fontSize: 12 }}>งาน</Text>
            <Text style={{ width: COL.amt, color: colors.muted, fontWeight: '700', fontSize: 12, textAlign: 'right' }}>มูลค่า (บาท)</Text>
            <Text style={{ width: COL.st, color: colors.muted, fontWeight: '700', fontSize: 12 }}>สถานะ</Text>
            <Text style={{ width: COL.date, color: colors.muted, fontWeight: '700', fontSize: 12 }}>วันที่</Text>
            <Text style={{ width: COL.act, color: colors.muted, fontWeight: '700', fontSize: 12, textAlign: 'center' }}>ดู</Text>
          </View>
        ) : null}
        {visible.map((t) => {
          const overdue = !!t.due_date && t.due_date < today && !['done', 'cancelled'].includes(t.status);
          const sub = subById[t.id] ?? subOf(pipe[t.id]);
          const amount = pipe[t.id]?.inv_total ?? pipe[t.id]?.quote_total ?? null;
          const cname = custs.find((c) => c.id === t.customer_id)?.name ?? '-';
          const stText = isOpen(t) ? SHORT[sub] : (STATUS[t.status] ?? t.status);
          const stTone = !isOpen(t) ? tone(t.status) : sub === 'inv_paid' || sub === 'dn_done' ? 'ok' : sub === 'quote_sent' || sub === 'dn_wait' || sub === 'inv_wait' ? 'warn' : 'muted';
          return (
            <Card key={t.id}>
              <Pressable accessibilityRole="button" onPress={() => void open(t.id)}>
                {wide ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ width: COL.no, color: colors.text, fontWeight: '700', fontSize: 13 }}>{t.doc_no}</Text>
                    <Text numberOfLines={1} style={{ flex: COL.cust, color: colors.text }}>{cname}</Text>
                    <Text numberOfLines={1} style={{ flex: COL.title, color: colors.text }}>{t.title}</Text>
                    <Text style={{ width: COL.amt, color: colors.text, textAlign: 'right' }}>{amount !== null ? baht(amount) : '-'}</Text>
                    <View style={{ width: COL.st, alignItems: 'flex-start' }}><Pill text={stText} tone={stTone} /></View>
                    <Text style={{ width: COL.date, color: colors.muted, fontSize: 13 }}>{(t.created_at ?? '').slice(0, 10)}</Text>
                    <View style={{ width: COL.act, alignItems: 'center' }}><Icon name="eye" size={20} color={colors.accent} /></View>
                  </View>
                ) : (
                  <View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: '700', flexShrink: 1 }}>{t.doc_no} · {t.title}</Text>
                      <Text style={{ color: colors.text, fontWeight: '700' }}>{amount !== null ? `${BAHT} ${baht(amount)}` : ''}</Text>
                    </View>
                    <Body tone="muted">{cname} · {SOURCE[t.source]}{t.due_date ? ` · กำหนด ${t.due_date}` : ''}</Body>
                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      <Pill text={stText} tone={stTone} />
                      {t.priority === 'urgent' || t.priority === 'high' ? <Pill text={`ความสำคัญ: ${PRIORITY[t.priority]}`} tone={t.priority === 'urgent' ? 'danger' : 'warn'} /> : null}
                      {overdue ? <Pill text="เกินกำหนด" tone="danger" /> : null}
                    </View>
                  </View>
                )}
                {isOpen(t) ? <Stepper step={stepOf(sub)} label={SUB_LABEL[sub]} /> : null}
              </Pressable>
              {sel === t.id ? (
                <View style={{ marginTop: 10 }}>
                  <Body tone="muted">ผู้เปิดงาน: {nameOf(t.created_by)}{mayChange(t) ? '' : ' · ดูอย่างเดียว (แก้ไขได้เฉพาะผู้เปิดงาน เจ้าของ และแอดมิน)'}</Body>
                  {t.description ? <Body>{t.description}</Body> : null}
                  <Flow p={pipe[t.id]} />
                  {(() => {
                    const n = isOpen(t) ? nextAction(pipe[t.id]) : null;
                    if (!n) return null;
                    const label: Record<string, string> = { make_quote: 'ออกใบเสนอราคาจาก Job นี้', open_quote: 'เปิดใบเสนอราคา', make_do: 'ออก DO (จองสต็อก)', open_do: 'เปิด DO', make_dn: 'ออกใบส่งของ (ตัดสต็อก)', open_dn: 'เปิดใบส่งของ', make_invoice: 'ออก Invoice', open_invoice: 'เปิด Invoice' };
                    if (n.kind.startsWith('make') && !mayChange(t)) return null;
                    return <Button title={`ขั้นต่อไป: ${label[n.kind] ?? ''}`} busy={busy} onPress={() => void go(t, n)} />;
                  })()}
                  {orgId ? <JobFiles orgId={orgId} ticketId={t.id} editable={mayChange(t)} /> : null}
                  {mayChange(t) && (NEXT[t.status] ?? []).length > 0 ? (
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
                  {mayChange(t) ? (
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
        {filtered.length > 0 ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 12, gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ color: colors.muted, fontSize: 13 }}>แสดง {(cur - 1) * PAGE + 1}–{Math.min(cur * PAGE, filtered.length)} จาก {filtered.length} รายการ</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {Array.from({ length: pages }, (_, i) => i + 1).slice(Math.max(0, cur - 3), Math.max(0, cur - 3) + 5).map((n) => (
                <Pressable key={n} accessibilityRole="button" accessibilityLabel={`หน้า ${n}`} onPress={() => setPage(n)} style={{ minWidth: 36, minHeight: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: n === cur ? colors.primary : colors.border, backgroundColor: n === cur ? colors.selected : 'transparent' }}>
                  <Text style={{ color: colors.text }}>{n}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

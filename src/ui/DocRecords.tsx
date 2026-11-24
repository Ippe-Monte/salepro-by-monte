import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Card, Empty, Field, Pill, Screen, Title } from './kit';
import { Text } from './Text';
import { colors } from './theme';

type R = { id: string; ticket_id: string; doc_no: string; doc_date: string; status: string; receiver_name: string | null; note: string | null };
type T = { id: string; doc_no: string; title: string; customer_id: string };

/** Summary of DO / delivery note records. Documents are recorded from the Job Ticket, never started here. */
export function DocRecords({ kind }: { kind: 'do' | 'dn' }) {
  const { current } = useAuth();
  const router = useRouter();
  const orgId = current?.org_id;
  const [rows, setRows] = useState<R[]>([]);
  const [tix, setTix] = useState<Record<string, T>>({});
  const [cust, setCust] = useState<Record<string, string>>({});
  const [q, setQ] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    const [d, t, c] = await Promise.all([
      neon.from('job_docs').select('id,ticket_id,doc_no,doc_date,status,receiver_name,note').eq('org_id', orgId).eq('kind', kind).order('doc_date', { ascending: false }),
      neon.from('job_tickets').select('id,doc_no,title,customer_id').eq('org_id', orgId),
      neon.from('customers').select('id,name').eq('org_id', orgId),
    ]);
    if (d.error || t.error || c.error) return setErr(friendly(d.error ?? t.error ?? c.error));
    setErr(null); setRows(d.data as R[]);
    setTix(Object.fromEntries((t.data as T[]).map((x) => [x.id, x])));
    setCust(Object.fromEntries((c.data as { id: string; name: string }[]).map((x) => [x.id, x.name])));
  }, [orgId, kind]);
  useEffect(() => { void load(); }, [load]);

  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => !needle || `${r.doc_no} ${tix[r.ticket_id]?.doc_no ?? ''} ${tix[r.ticket_id]?.title ?? ''} ${cust[tix[r.ticket_id]?.customer_id ?? ''] ?? ''}`.toLowerCase().includes(needle));
  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>{kind === 'do' ? 'บันทึก DO' : 'บันทึกใบส่งของ'}</Title>
        <Body tone="muted">เอกสารทั้งหมดบันทึกจากหน้า Job Ticket (เปิดงาน แล้วบันทึกเอกสารในงานนั้น) หน้านี้ใช้ดูสรุปและค้นหา</Body>
        {err ? <Body tone="danger">{err}</Body> : null}
        <Field label="ค้นหา เลขที่เอกสาร / Job / ลูกค้า" value={q} onChangeText={setQ} />
        {shown.length === 0 ? <Empty>ยังไม่มีรายการ</Empty> : null}
        {shown.map((r) => {
          const t = tix[r.ticket_id];
          return (
            <Card key={r.id}>
              <Pressable accessibilityRole="button" onPress={() => router.push('/jobs' as never)}>
                <Text style={{ color: colors.text, fontWeight: '700' }}>{r.doc_no} · {r.doc_date}</Text>
                <Body tone="muted">{t ? `${t.doc_no} · ${t.title}` : '-'} · {cust[t?.customer_id ?? ''] ?? '-'}</Body>
                {kind === 'dn' ? <Pill text={r.status === 'received' ? 'ลูกค้ารับแล้ว' : 'รอลูกค้าเซ็นรับ'} tone={r.status === 'received' ? 'ok' : 'warn'} /> : null}
                {r.note ? <Body tone="muted">{r.note}</Body> : null}
              </Pressable>
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

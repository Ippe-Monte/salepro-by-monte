import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';
import { Text } from '@/ui/Text';
import { colors } from '@/ui/theme';

type Company = { id: string; name: string; status: 'active' | 'suspended'; created_at: string; members: number; owner: string | null; last_activity: string | null };
type Overview = { users: number; users_7d: number; users_no_company: number; orgs: number; orgs_active: number; members_active: number; companies: Company[] };

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: colors.card, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 14 }}>
      <Text style={{ color: colors.muted, fontSize: 13 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800' }}>{value}</Text>
      {sub ? <Text style={{ color: colors.muted, fontSize: 12 }}>{sub}</Text> : null}
    </View>
  );
}

// Platform operator view: usage counts and company names only. No product, customer or document content.
export default function Platform() {
  const { isPlatform } = useAuth();
  const [ov, setOv] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await neon.rpc('platform_overview');
    if (error) setErr(friendly(error)); else { setErr(null); setOv(data as unknown as Overview); }
  }, []);
  useEffect(() => { if (isPlatform) void load(); }, [isPlatform, load]);

  async function setStatus(id: string, status: 'active' | 'suspended') {
    setBusy(id);
    const { error } = await neon.rpc('set_org_status', { p_org: id, p_status: status });
    setBusy(null);
    if (error) setErr(friendly(error)); else await load();
  }

  if (!isPlatform) return <Screen><Body tone="danger">ไม่มีสิทธิ์เข้าถึง</Body></Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <Title>ภาพรวมการใช้งานแพลตฟอร์ม</Title>
        {err && <Body tone="danger">{err}</Body>}
        {ov && (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <Stat label="ผู้ใช้ทั้งหมด" value={ov.users} sub={`สมัครใหม่ 7 วัน: ${ov.users_7d}`} />
              <Stat label="บริษัท" value={ov.orgs} sub={`ใช้งานอยู่ ${ov.orgs_active}`} />
              <Stat label="สมาชิกที่ใช้งานอยู่" value={ov.members_active} />
              <Stat label="ยังไม่เข้าบริษัท" value={ov.users_no_company} />
            </View>
            <Text style={{ color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 8 }}>บริษัททั้งหมด</Text>
            {ov.companies.length === 0 && <Body tone="muted">ยังไม่มีบริษัท</Body>}
            {ov.companies.map((c) => (
              <Card key={c.id}>
                <Body>{c.name}</Body>
                <Body tone="muted">{c.status === 'active' ? 'ใช้งานอยู่' : 'ถูกระงับ'} · สมาชิก {c.members} คน{c.owner ? ` · เจ้าของ ${c.owner}` : ''}</Body>
                <Body tone="muted">สร้างเมื่อ {fmt(c.created_at)} · ใช้งานล่าสุด {fmt(c.last_activity)}</Body>
                {c.status === 'active'
                  ? <Button title="ระงับบริษัท" variant="ghost" busy={busy === c.id} onPress={() => void setStatus(c.id, 'suspended')} />
                  : <Button title="เปิดใช้งานอีกครั้ง" busy={busy === c.id} onPress={() => void setStatus(c.id, 'active')} />}
              </Card>
            ))}
            <Button title="รีเฟรช" variant="ghost" onPress={() => void load()} />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

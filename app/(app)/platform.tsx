import { useCallback, useEffect, useState } from 'react';
import { FlatList } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';

type OrgRow = { id: string; name: string; status: 'active' | 'suspended'; created_at: string; member_count: number };

// Platform operator view: companies and member counts only. No business data is exposed here.
export default function Platform() {
  const { isPlatform } = useAuth();
  const [rows, setRows] = useState<OrgRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await neon.rpc('platform_list_orgs');
    if (error) setErr(friendly(error)); else { setErr(null); setRows(data as unknown as OrgRow[]); }
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
      <Title>บริษัททั้งหมดบนแพลตฟอร์ม</Title>
      {err && <Body tone="danger">{err}</Body>}
      {rows?.length === 0 && <Body tone="muted">ยังไม่มีบริษัท</Body>}
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Card>
            <Body>{item.name}</Body>
            <Body tone="muted">{item.status === 'active' ? 'ใช้งานอยู่' : 'ถูกระงับ'} · สมาชิก {item.member_count} คน · สร้างเมื่อ {new Date(item.created_at).toLocaleDateString('th-TH')}</Body>
            {item.status === 'active'
              ? <Button title="ระงับบริษัท" variant="danger" busy={busy === item.id} onPress={() => void setStatus(item.id, 'suspended')} />
              : <Button title="เปิดใช้งานอีกครั้ง" busy={busy === item.id} onPress={() => void setStatus(item.id, 'active')} />}
          </Card>
        )}
      />
    </Screen>
  );
}

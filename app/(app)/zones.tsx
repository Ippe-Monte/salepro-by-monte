import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { canEdit } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Empty, Field, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Zone = { id: string; code: string; name: string; provinces: string[] };

export default function Zones() {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const editable = canEdit('zones', current?.role);
  const [rows, setRows] = useState<Zone[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({ code: '', name: '', provinces: '' });

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data, error } = await neon.from('delivery_zones').select('id,code,name,provinces').eq('org_id', orgId).order('code');
    if (error) setErr('โหลดข้อมูลไม่สำเร็จ'); else { setErr(null); setRows(data as Zone[]); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!orgId) return;
    if (!f.code.trim() || !f.name.trim()) return setErr('กรอกรหัสและชื่อโซน');
    const provinces = f.provinces.split(',').map((s) => s.trim()).filter(Boolean);
    const { error } = await neon.from('delivery_zones').insert({ org_id: orgId, code: f.code.trim(), name: f.name.trim(), provinces });
    if (error) return setErr(error.code === '23505' ? 'รหัสโซนนี้ถูกใช้แล้ว' : friendly(error));
    setF({ code: '', name: '', provinces: '' }); await load();
  }
  async function remove(id: string) {
    const { error } = await neon.from('delivery_zones').delete().eq('id', id);
    if (error) setErr(error.code === '23503' ? 'ลบไม่ได้ เพราะมีที่อยู่ลูกค้าใช้โซนนี้อยู่' : friendly(error)); else await load();
  }

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>โซนส่งของ</Title>
        {err ? <Body tone="danger">{err}</Body> : null}
        {editable ? (
          <Card>
            <Field label="รหัสโซน (เช่น N1)" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} autoCapitalize="characters" />
            <Field label="ชื่อโซน (เช่น กรุงเทพฯ เหนือ)" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
            <Field label="จังหวัดในโซน (คั่นด้วย,)" value={f.provinces} onChangeText={(v) => setF({ ...f, provinces: v })} />
            <Button title="เพิ่มโซน" onPress={add} />
          </Card>
        ) : null}
        {rows.length === 0 ? <Empty>ยังไม่มีโซน</Empty> : null}
        {rows.map((z) => (
          <Card key={z.id}>
            <Text style={{ color: colors.text, fontWeight: '700' }}>{z.code} · {z.name}</Text>
            <Body tone="muted">{z.provinces.join(', ') || 'ไม่ระบุจังหวัด'}</Body>
            {editable ? <Pressable accessibilityRole="button" onPress={() => void remove(z.id)}><Text style={{ color: colors.danger, marginTop: 6 }}>ลบ</Text></Pressable> : null}
          </Card>
        ))}
      </ScrollView>
    </Screen>
  );
}

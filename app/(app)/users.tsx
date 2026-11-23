import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { ROLES, canOpen, type Profile, type Role, type Status } from '@/auth/roles';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

export default function Users() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Profile[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await neon.from('profiles').select('id,email,display_name,role,status').order('created_at');
    if (error) setErr('โหลดรายชื่อไม่สำเร็จ');
    else { setErr(null); setRows(data as unknown as Profile[]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function update(id: string, role: Role, status: Status) {
    setBusyId(id);
    const { error } = await neon.rpc('admin_update_user', { target: id, new_role: role, new_status: status });
    setBusyId(null);
    if (error) setErr(error.message?.includes('last active admin') ? 'ไม่สามารถลดสิทธิ์ admin คนสุดท้ายได้' : 'บันทึกไม่สำเร็จ');
    else await load();
  }

  if (!canOpen('users', profile?.role)) return <Screen><Body tone="danger">ไม่มีสิทธิ์เข้าถึง</Body></Screen>;

  return (
    <Screen>
      <Title>จัดการผู้ใช้</Title>
      {err && <Body tone="danger">{err}</Body>}
      {rows && rows.length === 0 && <Body tone="muted">ยังไม่มีผู้ใช้</Body>}
      <FlatList
        data={rows ?? []}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Card>
            <Body>{item.display_name || item.email}</Body>
            <Body tone="muted">{item.email} · {item.status}</Body>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {ROLES.map((r) => (
                <Pressable key={r} accessibilityRole="button" onPress={() => void update(item.id, r, item.status === 'pending' ? 'active' : item.status)}
                  style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: item.role === r ? colors.primary : 'transparent' }}>
                  <Text style={{ color: '#fff' }}>{r}</Text>
                </Pressable>
              ))}
            </View>
            {item.status !== 'active' && <Button title="อนุมัติ" busy={busyId === item.id} onPress={() => void update(item.id, item.role, 'active')} />}
            {item.status === 'active' && item.id !== profile?.id && <Button title="ปิดใช้งาน" variant="danger" busy={busyId === item.id} onPress={() => void update(item.id, item.role, 'disabled')} />}
          </Card>
        )}
      />
    </Screen>
  );
}

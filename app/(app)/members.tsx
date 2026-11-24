import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL, assignableRoles, canManageMember, canOpen, validateEmail, type Role } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Field, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Row = { user_id: string; role: Role; status: 'active' | 'disabled'; profiles: { email: string; display_name: string } | { email: string; display_name: string }[] | null };
type Invite = { id: string; email: string; role: Role; code: string; expires_at: string };

function RoleChips({ value, onPick, roles }: { value: Role; onPick: (r: Role) => void; roles: readonly Role[] }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
      {roles.map((r) => (
        <Pressable key={r} accessibilityRole="button" onPress={() => onPick(r)}
          style={{ paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: value === r ? colors.selected : 'transparent' }}>
          <Text style={{ color: colors.text }}>{ROLE_LABEL[r]}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export default function Members() {
  const { current, profile } = useAuth();
  const orgId = current?.org_id;
  const [rows, setRows] = useState<Row[] | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('sales');
  const [newCode, setNewCode] = useState<string | null>(null);
  const roles = assignableRoles(current?.role);

  const load = useCallback(async () => {
    if (!orgId) return;
    const m = await neon.from('memberships').select('user_id,role,status,profiles(email,display_name)').eq('org_id', orgId).order('created_at');
    const i = await neon.from('invitations').select('id,email,role,code,expires_at').eq('org_id', orgId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
    if (m.error || i.error) setErr('โหลดข้อมูลไม่สำเร็จ');
    else { setErr(null); setRows(m.data as unknown as Row[]); setInvites((i.data ?? []) as unknown as Invite[]); }
  }, [orgId]);
  useEffect(() => { void load(); }, [load]);

  async function update(userId: string, r: Role, s: 'active' | 'disabled') {
    if (!orgId) return;
    setBusy(userId);
    const { error } = await neon.rpc('update_member', { p_org: orgId, p_user: userId, p_role: r, p_status: s });
    setBusy(null);
    if (error) setErr(friendly(error)); else { setErr(null); await load(); }
  }

  async function invite() {
    if (!orgId || busy) return;
    const v = validateEmail(email);
    if (v) return setErr(v);
    setBusy('invite'); setNewCode(null);
    const { data, error } = await neon.rpc('create_invitation', { p_org: orgId, p_email: email.trim(), p_role: role });
    setBusy(null);
    if (error) return setErr(friendly(error));
    setErr(null); setNewCode(String(data)); setEmail(''); await load();
  }

  async function revoke(id: string) {
    setBusy(id);
    const { error } = await neon.rpc('revoke_invitation', { p_id: id });
    setBusy(null);
    if (error) setErr(friendly(error)); else await load();
  }

  if (!canOpen('members', current?.role)) return <Screen><Body tone="danger">ไม่มีสิทธิ์เข้าถึง</Body></Screen>;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled">
        <Title>สมาชิกของ {current?.org.name}</Title>
        {err && <Body tone="danger">{err}</Body>}
        <Card>
          <Body>เชิญสมาชิก</Body>
          <Field label="อีเมลของผู้ถูกเชิญ" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <RoleChips value={role} onPick={setRole} roles={roles} />
          <Button title="สร้างโค้ดเชิญ" onPress={invite} busy={busy === 'invite'} />
          {newCode && (
            <View style={{ marginTop: 12 }}>
              <Body tone="ok">โค้ดเชิญ (ส่งให้ผู้ถูกเชิญ ใช้ได้ 7 วัน):</Body>
              <Text selectable style={{ color: colors.accent, fontSize: 24, fontWeight: '700', letterSpacing: 2 }}>{newCode}</Text>
            </View>
          )}
        </Card>
        {invites.length > 0 && <Body tone="muted">คำเชิญที่ยังไม่ถูกใช้</Body>}
        {invites.map((i) => (
          <Card key={i.id}>
            <Body>{i.email} · {ROLE_LABEL[i.role]}</Body>
            <Text selectable style={{ color: colors.accent, letterSpacing: 1 }}>{i.code}</Text>
            <Button title="ยกเลิกคำเชิญ" variant="ghost" busy={busy === i.id} onPress={() => void revoke(i.id)} />
          </Card>
        ))}
        <Body tone="muted">สมาชิก</Body>
        {rows?.length === 0 && <Body tone="muted">ยังไม่มีสมาชิก</Body>}
        {(rows ?? []).map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const self = r.user_id === profile?.id;
          const manageable = canManageMember(current?.role, r.role);
          return (
            <Card key={r.user_id}>
              <Body>{p?.display_name || p?.email}{self ? ' (คุณ)' : ''}</Body>
              <Body tone="muted">{p?.email} · {ROLE_LABEL[r.role]} · {r.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</Body>
              {manageable && <RoleChips value={r.role} onPick={(nr) => void update(r.user_id, nr, r.status)} roles={roles} />}
              {manageable && r.status === 'active' && !self && <Button title="ปิดใช้งาน" variant="danger" busy={busy === r.user_id} onPress={() => void update(r.user_id, r.role, 'disabled')} />}
              {manageable && r.status === 'disabled' && <Button title="เปิดใช้งาน" busy={busy === r.user_id} onPress={() => void update(r.user_id, r.role, 'active')} />}
              {!manageable && <Body tone="muted">เฉพาะเจ้าของเท่านั้นที่จัดการสมาชิกคนนี้ได้</Body>}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

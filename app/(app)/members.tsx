import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Text } from '@/ui/Text';
import { useAuth } from '@/auth/AuthProvider';
import { ROLE_LABEL, assignableRoles, canManageMember, canOpen, validateEmail, type Role } from '@/auth/roles';
import { friendly } from '@/lib/errors';
import { neon } from '@/lib/neon';
import { Body, Button, Card, Field, Screen, Title } from '@/ui/kit';
import { colors } from '@/ui/theme';

type Row = { user_id: string; role: Role; stock_manager: boolean; status: 'active' | 'disabled'; profiles: { email: string; display_name: string } | { email: string; display_name: string }[] | null };
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
  const [openId, setOpenId] = useState<string | null>(null); // member whose details are open
  const [confirmOff, setConfirmOff] = useState(false);
  const roles = assignableRoles(current?.role);
  const isAdm = current?.role === 'owner' || current?.role === 'admin';

  const load = useCallback(async () => {
    if (!orgId) return;
    const m = await neon.from('memberships').select('user_id,role,status,stock_manager,profiles(email,display_name)').eq('org_id', orgId).order('created_at');
    const i = !isAdm ? { data: [], error: null } : await neon.from('invitations').select('id,email,role,code,expires_at').eq('org_id', orgId).eq('status', 'pending').gt('expires_at', new Date().toISOString());
    if (m.error || i.error) setErr('โหลดข้อมูลไม่สำเร็จ');
    else { setErr(null); setRows(m.data as unknown as Row[]); setInvites((i.data ?? []) as unknown as Invite[]); }
  }, [orgId, isAdm]);
  useEffect(() => { void load(); }, [load]);

  async function update(userId: string, r: Role, s: 'active' | 'disabled') {
    if (!orgId) return;
    setBusy(userId);
    const { error } = await neon.rpc('update_member', { p_org: orgId, p_user: userId, p_role: r, p_status: s });
    setBusy(null);
    if (error) setErr(friendly(error)); else { setErr(null); await load(); }
  }

  async function setStockManager(userId: string, value: boolean) {
    if (!orgId) return;
    setBusy(userId);
    const { error } = await neon.rpc('set_stock_manager', { p_org: orgId, p_user: userId, p_value: value });
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
        {!isAdm ? <Body tone="muted">รายชื่อเพื่อนร่วมบริษัท (ดูอย่างเดียว)</Body> : <Body tone="muted">แตะชื่อสมาชิกเพื่อเปลี่ยนบทบาท มอบสิทธิ์ หรือปิดใช้งาน</Body>}
        {err && <Body tone="danger">{err}</Body>}
        {isAdm ? (
          <>
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
          </>
        ) : null}
        <Body tone="muted">สมาชิก</Body>
        {rows?.length === 0 && <Body tone="muted">ยังไม่มีสมาชิก</Body>}
        {(rows ?? []).map((r) => {
          const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
          const self = r.user_id === profile?.id;
          const manageable = canManageMember(current?.role, r.role);
          const open = openId === r.user_id;
          return (
            <Card key={r.user_id}>
              <Pressable accessibilityRole="button" onPress={() => { setOpenId(open ? null : r.user_id); setConfirmOff(false); }}>
                <Body>{p?.display_name || p?.email}{self ? ' (คุณ)' : ''}</Body>
                <Body tone="muted">{p?.email} · {ROLE_LABEL[r.role]}{r.stock_manager ? ' · ผู้จัดการคลังสินค้า' : ''} · {r.status === 'active' ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</Body>
              </Pressable>
              {open && isAdm ? (
                <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                  {manageable ? (
                    <>
                      <Body tone="muted">บทบาท</Body>
                      <RoleChips value={r.role} onPick={(nr) => void update(r.user_id, nr, r.status)} roles={roles} />
                      <Body tone="muted">สิทธิ์เพิ่มเติม: ผู้จัดการคลังสินค้า (เพิ่ม/ลด/ปรับจำนวนสินค้า)</Body>
                      <Button title={r.stock_manager ? 'ยกเลิกสิทธิ์ผู้จัดการคลังสินค้า' : 'มอบสิทธิ์ผู้จัดการคลังสินค้า'} variant="ghost" busy={busy === r.user_id} onPress={() => void setStockManager(r.user_id, !r.stock_manager)} />
                      {r.status === 'disabled' ? <Button title="เปิดใช้งานสมาชิก" busy={busy === r.user_id} onPress={() => void update(r.user_id, r.role, 'active')} /> : null}
                      {r.status === 'active' && !self ? (
                        confirmOff ? (
                          <View style={{ gap: 6 }}>
                            <Body tone="danger">ปิดใช้งานสมาชิกคนนี้? เขาจะเข้าบริษัทไม่ได้จนกว่าจะเปิดใช้งานใหม่</Body>
                            <Button title="ยืนยันปิดใช้งาน" variant="danger" busy={busy === r.user_id} onPress={() => { setConfirmOff(false); void update(r.user_id, r.role, 'disabled'); }} />
                            <Button title="ยกเลิก" variant="ghost" onPress={() => setConfirmOff(false)} />
                          </View>
                        ) : (
                          <Pressable accessibilityRole="button" onPress={() => setConfirmOff(true)} style={{ alignSelf: 'flex-start', paddingVertical: 8 }}><Text style={{ color: colors.danger, fontSize: 13 }}>ปิดใช้งานสมาชิกนี้…</Text></Pressable>
                        )
                      ) : null}
                    </>
                  ) : <Body tone="muted">เฉพาะเจ้าของเท่านั้นที่จัดการสมาชิกคนนี้ได้</Body>}
                </View>
              ) : null}
            </Card>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

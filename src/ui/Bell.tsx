import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { addMinutes } from '@/lib/dates';
import { neon } from '@/lib/neon';
import { buildNotices, signature, type Summary } from '@/lib/notifications';
import { Icon } from './Icon';
import { Text } from './Text';
import { colors } from './theme';

const seenKey = (org: string) => `salepro.notif.seen.${org}`;
const readSeen = (org: string) => { try { return Platform.OS === 'web' ? localStorage.getItem(seenKey(org)) ?? '' : ''; } catch { return ''; } };
const writeSeen = (org: string, v: string) => { try { if (Platform.OS === 'web') localStorage.setItem(seenKey(org), v); } catch { /* storage unavailable */ } };

/** Bell next to the profile photo: today's visits, overdue jobs/invoices and low stock. The badge clears once opened. */
export function Bell() {
  const { current } = useAuth();
  const router = useRouter();
  const orgId = current?.org_id;
  const [summary, setSummary] = useState<Summary | null>(null);
  const [tomorrow, setTomorrow] = useState(0);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState('');

  const load = useCallback(async () => {
    if (!orgId) return;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const t0 = addMinutes(start, 24 * 60); const t1 = addMinutes(start, 48 * 60);
    const [a, b] = await Promise.all([
      neon.rpc('dashboard_summary', { p_org: orgId }),
      neon.from('visit_plans').select('id', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'planned').gte('starts_at', t0.toISOString()).lt('starts_at', t1.toISOString()),
    ]);
    if (!a.error) setSummary(a.data as Summary);
    if (!b.error) setTomorrow(b.count ?? 0);
  }, [orgId]);

  useEffect(() => {
    if (!orgId) return;
    setSeen(readSeen(orgId));
    void load();
    const t = setInterval(() => void load(), 120_000);
    return () => clearInterval(t);
  }, [orgId, load]);

  const notices = useMemo(() => buildNotices(summary, tomorrow), [summary, tomorrow]);
  const sig = signature(notices);
  const total = notices.reduce((a, x) => a + x.count, 0);
  const unread = total > 0 && sig !== seen;

  function show() { setOpen(true); void load(); if (orgId) { writeSeen(orgId, sig); setSeen(sig); } }
  const color = { danger: colors.danger, warn: colors.cta, info: colors.primary } as const;
  const onColor = { danger: '#fff', warn: colors.onCta, info: colors.onPrimary } as const;

  return (
    <>
      <Pressable accessibilityRole="button" accessibilityLabel="การแจ้งเตือน" onPress={show}
        style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <Icon name="bell" size={20} color={colors.muted} />
        {unread ? (
          <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{total > 99 ? '99+' : total}</Text>
          </View>
        ) : null}
      </Pressable>
      {open ? (
        <Modal transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable accessibilityLabel="ปิด" onPress={() => setOpen(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', paddingTop: 70, paddingHorizontal: 16 }}>
            <Pressable onPress={() => undefined} style={{ width: '100%', maxWidth: 400, backgroundColor: colors.card, borderRadius: 18, padding: 16 }}>
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17, marginBottom: 8 }}>การแจ้งเตือน</Text>
              {notices.length === 0 ? <Text style={{ color: colors.muted, paddingVertical: 12 }}>ไม่มีการแจ้งเตือนใหม่</Text> : notices.map((x) => (
                <Pressable key={x.key} accessibilityRole="button" onPress={() => { setOpen(false); router.push(x.href as never); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}>
                  <Icon name={x.icon} size={22} color={color[x.tone]} />
                  <Text style={{ color: colors.text, flex: 1 }}>{x.label}</Text>
                  <View style={{ minWidth: 28, height: 24, borderRadius: 12, paddingHorizontal: 8, backgroundColor: color[x.tone], alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: onColor[x.tone], fontWeight: '800' }}>{x.count}</Text></View>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, View } from 'react-native';
import { Text } from './Text';
import { useAuth } from '@/auth/AuthProvider';
import { TOUR_STEPS, TOUR_STORAGE_PREFIX } from './tourSteps';
import { colors } from './theme';

const EVENT = 'salepro:tour';

/** Open the welcome guide again (used by the "คู่มือเริ่มต้นใช้งาน" button). */
export function startTour() {
  if (Platform.OS === 'web') window.dispatchEvent(new Event(EVENT));
}

function seen(userId: string): boolean {
  try { return globalThis.localStorage?.getItem(TOUR_STORAGE_PREFIX + userId) === '1'; } catch { return true; }
}
function markSeen(userId: string) {
  try { globalThis.localStorage?.setItem(TOUR_STORAGE_PREFIX + userId, '1'); } catch { /* storage blocked: never loop */ }
}
function canStore(): boolean {
  try { return typeof globalThis.localStorage !== 'undefined' && globalThis.localStorage !== null; } catch { return false; }
}

/** Welcome guide for new users: shown once per user per device after the first sign-in. */
export function TourHost() {
  const { gate, profile } = useAuth();
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    if (gate !== 'ready' || !profile) return;
    if (canStore() && !seen(profile.id)) setStep(0);
  }, [gate, profile]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const open = () => setStep(0);
    window.addEventListener(EVENT, open);
    return () => window.removeEventListener(EVENT, open);
  }, []);

  const close = useCallback(() => {
    if (profile) markSeen(profile.id);
    setStep(null);
  }, [profile]);

  if (step === null) return null;
  const s = TOUR_STEPS[step];
  const last = step === TOUR_STEPS.length - 1;
  const btn = (label: string, onPress: () => void, primary: boolean) => (
    <Pressable accessibilityRole="button" onPress={onPress}
      style={{ flex: primary ? 1.4 : 1, minHeight: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: primary ? colors.primary : 'transparent', borderWidth: primary ? 0 : 1, borderColor: colors.border }}>
      <Text style={{ color: primary ? '#fff' : colors.text, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: 'rgba(3,11,46,0.6)', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 420, backgroundColor: colors.card, borderRadius: 20, borderWidth: 1, borderColor: colors.border, padding: 22 }}>
          <Text style={{ fontSize: 44, textAlign: 'center' }}>{s.icon}</Text>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: '800', textAlign: 'center', marginTop: 8 }}>{s.title}</Text>
          <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23, textAlign: 'center', marginTop: 10 }}>{s.text}</Text>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginVertical: 16 }}>
            {TOUR_STEPS.map((_, i) => (
              <View key={i} style={{ width: i === step ? 18 : 7, height: 7, borderRadius: 4, backgroundColor: i === step ? colors.primary : colors.border }} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {step === 0 ? btn('ข้าม', close, false) : btn('ย้อนกลับ', () => setStep(step - 1), false)}
            {last ? btn('เริ่มใช้งาน', close, true) : btn(`ถัดไป (${step + 1}/${TOUR_STEPS.length})`, () => setStep(step + 1), true)}
          </View>
        </View>
      </View>
    </Modal>
  );
}

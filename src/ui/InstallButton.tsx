import { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Button } from './kit';
import { colors } from './theme';

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type PwaWindow = Window & { __pwaPrompt?: PromptEvent | null };

function isStandalone(): boolean {
  const w = window as Window & { navigator: Navigator & { standalone?: boolean } };
  return w.matchMedia?.('(display-mode: standalone)').matches === true || w.navigator.standalone === true;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** "Install app" shortcut for the web build. Hidden on native apps and once the app is already installed. */
export function InstallButton() {
  const [, bump] = useState(0);
  const [help, setHelp] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const on = () => bump((n) => n + 1);
    window.addEventListener('pwa-prompt', on);
    window.addEventListener('appinstalled', on);
    return () => { window.removeEventListener('pwa-prompt', on); window.removeEventListener('appinstalled', on); };
  }, []);

  if (Platform.OS !== 'web' || typeof window === 'undefined' || isStandalone()) return null;

  const deferred = (window as PwaWindow).__pwaPrompt ?? null;

  async function install() {
    if (!deferred) { setHelp((h) => !h); return; }
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch { /* user closed the prompt */ }
    (window as PwaWindow).__pwaPrompt = null;
    setHelp(false);
    bump((n) => n + 1);
  }

  const steps = isIos()
    ? 'บน iPhone/iPad: เปิดด้วย Safari แตะปุ่มแชร์ (สี่เหลี่ยมมีลูกศรขึ้น) แล้วเลือก "เพิ่มไปยังหน้าจอโฮม"'
    : 'เปิดเมนูของเบราว์เซอร์ (⋮ หรือ ⋯) แล้วเลือก "ติดตั้งแอป" หรือ "เพิ่มไปยังหน้าจอหลัก" (บน Android ใช้ Chrome)';

  return (
    <View style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
      <Button title="📲 ติดตั้งแอปลงเครื่อง" variant="ghost" onPress={() => { void install(); }} />
      {help && !deferred ? (
        <View accessibilityRole="alert" style={{ marginTop: 8, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}>
          <Text style={{ color: colors.text }}>{steps}</Text>
        </View>
      ) : null}
    </View>
  );
}

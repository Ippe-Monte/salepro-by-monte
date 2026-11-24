import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from '@/ui/Text';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { ThemeProvider, useTheme } from '@/ui/ThemeProvider';
import { Button } from '@/ui/kit';
import { TourHost } from '@/ui/Tour';
import { VersionBadge } from '@/ui/VersionBadge';
import { colors } from '@/ui/theme';

function Guard() {
  const { gate, error, refresh, signOut } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const top = segments[0] as string | undefined;

  useEffect(() => {
    if (gate === 'loading' || gate === 'error') return;
    const target =
      gate === 'ready' ? '/(app)' : gate === 'signed-out' ? '/sign-in' : gate === 'no-org' ? '/onboarding' : '/suspended';
    const inApp = top === '(app)';
    const inAuth = top === 'sign-in' || top === 'sign-up';
    const ok =
      (gate === 'ready' && (inApp || top === 'onboarding')) ||
      (gate === 'signed-out' && inAuth) ||
      (gate === 'no-org' && top === 'onboarding') ||
      (gate === 'suspended' && (top === 'suspended' || top === 'onboarding'));
    if (!ok) router.replace(target as never);
  }, [gate, top, router]);

  if (gate === 'error') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: 420, gap: 12 }}>
          <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>เข้าสู่ระบบแล้ว แต่โหลดข้อมูลไม่สำเร็จ</Text>
          <Text style={{ color: colors.danger }}>{error}</Text>
          <Button title="ลองใหม่" onPress={() => { void refresh(); }} />
          <Button title="ออกจากระบบ" variant="ghost" onPress={() => { void signOut(); }} />
          <VersionBadge />
        </View>
      </View>
    );
  }
  if (gate === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Slot />;
}

function Root() {
  const { mode } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <Guard />
      <TourHost />
    </>
  );
}

export default function RootLayout() {
  return <AuthProvider><ThemeProvider><Root /></ThemeProvider></AuthProvider>;
}

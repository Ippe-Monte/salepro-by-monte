import { Slot, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { AuthProvider, useAuth } from '@/auth/AuthProvider';
import { colors } from '@/ui/theme';

function Guard() {
  const { gate } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const top = segments[0] as string | undefined;

  useEffect(() => {
    if (gate === 'loading') return;
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

  if (gate === 'loading') {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <Guard />
    </AuthProvider>
  );
}

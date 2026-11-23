import { Tabs } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { canOpen } from '@/auth/roles';
import { colors } from '@/ui/theme';

export default function AppLayout() {
  const { profile } = useAuth();
  const role = profile?.role;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted,
    }}>
      <Tabs.Screen name="index" options={{ title: 'แดชบอร์ด' }} />
      <Tabs.Screen name="users" options={{ title: 'ผู้ใช้', href: canOpen('users', role) ? undefined : null }} />
      <Tabs.Screen name="account" options={{ title: 'บัญชี' }} />
    </Tabs>
  );
}

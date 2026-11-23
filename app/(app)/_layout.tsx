import { Tabs } from 'expo-router';
import { useAuth } from '@/auth/AuthProvider';
import { canOpen } from '@/auth/roles';
import { colors } from '@/ui/theme';

export default function AppLayout() {
  const { current, isPlatform } = useAuth();
  const role = current?.role;
  const hide = { href: null } as const;
  return (
    <Tabs screenOptions={{
      headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text,
      tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
      tabBarActiveTintColor: colors.accent, tabBarInactiveTintColor: colors.muted,
    }}>
      <Tabs.Screen name="index" options={{ title: 'แดชบอร์ด', ...(current && canOpen('dashboard', role) ? {} : hide) }} />
      <Tabs.Screen name="customers" options={{ title: 'ลูกค้า', ...(current && canOpen('customers', role) ? {} : hide) }} />
      <Tabs.Screen name="visits" options={{ title: 'แผนเข้าพบ', ...(current && canOpen('visits', role) ? {} : hide) }} />
      <Tabs.Screen name="jobs" options={{ title: 'Job Ticket', ...(current && canOpen('jobs', role) ? {} : hide) }} />
      <Tabs.Screen name="quotes" options={{ title: 'ใบเสนอราคา', ...(current && canOpen('quotes', role) ? {} : hide) }} />
      <Tabs.Screen name="products" options={{ title: 'สินค้า', ...(current && canOpen('products', role) ? {} : hide) }} />
      <Tabs.Screen name="stock" options={{ title: 'สต็อก', ...(current && canOpen('stock', role) ? {} : hide) }} />
      <Tabs.Screen name="delivery" options={{ title: 'ส่งของ (DO)', ...(current && canOpen('delivery', role) ? {} : hide) }} />
      <Tabs.Screen name="zones" options={{ title: 'โซนส่งของ', ...(current && canOpen('zones', role) ? {} : hide) }} />
      <Tabs.Screen name="members" options={{ title: 'สมาชิก', ...(canOpen('members', role) ? {} : hide) }} />
      <Tabs.Screen name="settings" options={{ title: 'บริษัท', ...(current ? {} : hide) }} />
      <Tabs.Screen name="platform" options={{ title: 'แพลตฟอร์ม', ...(isPlatform ? {} : hide) }} />
      <Tabs.Screen name="account" options={{ title: 'บัญชี' }} />
    </Tabs>
  );
}

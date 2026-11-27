import { Tabs } from 'expo-router';
import { useEffect } from 'react';
import { installPullRefresh } from '@/ui/pullRefresh';
import { View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { bgPattern, colors } from '@/ui/theme';
import { ALL_ITEMS } from '@/ui/nav';
import { BottomBar, Sidebar, TopBar, useShell } from '@/ui/Shell';

export default function AppLayout() {
  const { isPlatform } = useAuth();
  useEffect(() => installPullRefresh(), []);
  const { wide, items, active } = useShell();
  const shown = new Set(items.map((i) => i.name));
  const hidden = { href: null } as const;
  return (
    <View style={{ flex: 1, flexDirection: wide ? 'row' : 'column', backgroundColor: colors.bg, ...(bgPattern() as object) }}>
      {wide ? <Sidebar items={items} active={active} /> : null}
      <View style={{ flex: 1 }}>
        {wide ? null : <TopBar />}
        <Tabs tabBar={() => null} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}>
          {ALL_ITEMS.map((i) => <Tabs.Screen key={i.name} name={i.name} options={shown.has(i.name) ? {} : hidden} />)}
          <Tabs.Screen name="platform" options={isPlatform ? {} : hidden} />
          <Tabs.Screen name="account" options={{}} />
          <Tabs.Screen name="more" options={{}} />
        </Tabs>
        {wide ? null : <BottomBar items={items} active={active} />}
      </View>
    </View>
  );
}

import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { byteaToDataUri } from '@/lib/image';
import { neon } from '@/lib/neon';
import { Text } from './Text';
import { colors } from './theme';

/** The signed-in user's profile photo, shared by the header, account page and business card. */
const cache = new Map<string, string | null>();
const subs = new Set<() => void>();

async function fetchAvatar(uid: string) {
  const { data, error } = await neon.from('profile_avatars').select('mime,data').eq('user_id', uid).maybeSingle();
  if (error) return;
  const r = data as { mime: string; data: unknown } | null;
  cache.set(uid, r ? byteaToDataUri(r.data, r.mime) : null);
  subs.forEach((f) => f());
}
export function refreshAvatar(uid: string) { return fetchAvatar(uid); }

export function useAvatarUri(): string | null {
  const { profile } = useAuth();
  const uid = profile?.id;
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (uid && !cache.has(uid)) void fetchAvatar(uid);
    return () => { subs.delete(f); };
  }, [uid]);
  return uid ? cache.get(uid) ?? null : null;
}

export function Avatar({ size, onPress }: { size: number; onPress?: () => void }) {
  const { profile } = useAuth();
  const uri = useAvatarUri();
  const initial = (profile?.display_name || profile?.email || '?').trim().charAt(0).toUpperCase();
  const inner = uri
    ? <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} accessibilityLabel="Profile photo" />
    : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.42 }}>{initial}</Text></View>;
  return onPress ? <Pressable accessibilityRole="button" accessibilityLabel="บัญชีของฉัน" onPress={onPress}>{inner}</Pressable> : inner;
}

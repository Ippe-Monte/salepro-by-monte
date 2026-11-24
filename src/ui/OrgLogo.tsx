import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { byteaToDataUri } from '@/lib/image';
import { neon } from '@/lib/neon';
import { Logo } from './Logo';

/** Company logo cache, shared by every place that shows it (home, top bar, sidebar). */
const cache = new Map<string, string | null>();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());

async function fetchLogo(orgId: string) {
  const { data, error } = await neon.from('org_logos').select('mime,data').eq('org_id', orgId).maybeSingle();
  if (error) return;
  const r = data as { mime: string; data: unknown } | null;
  cache.set(orgId, r ? byteaToDataUri(r.data, r.mime) : null);
  notify();
}

/** Call after the logo is uploaded or removed so every screen updates. */
export function refreshOrgLogo(orgId: string) { return fetchLogo(orgId); }

/** The signed-in company's logo; falls back to the SALEPRO app logo when none is uploaded. */
export function OrgLogo({ size }: { size: number }) {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (orgId && !cache.has(orgId)) void fetchLogo(orgId);
    return () => { subs.delete(f); };
  }, [orgId]);
  const uri = orgId ? cache.get(orgId) : null;
  if (!uri) return <Logo size={size} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.24 }} accessibilityLabel="Company logo" resizeMode="contain" />;
}

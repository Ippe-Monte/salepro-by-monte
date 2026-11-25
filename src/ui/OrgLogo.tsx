import { useEffect, useState } from 'react';
import { Image } from 'react-native';
import { useAuth } from '@/auth/AuthProvider';
import { byteaToDataUri } from '@/lib/image';
import { neon } from '@/lib/neon';
import { Logo } from './Logo';

/** Company logo cache, shared by every place that shows it (home, top bar, sidebar).
 *  Kept in localStorage too, and a failed fetch (expired session, network) is retried, so the logo never
 *  silently falls back to the SALEPRO logo after the app has been open for a while. */
const cache = new Map<string, string | null>();
const subs = new Set<() => void>();
const notify = () => subs.forEach((f) => f());
const KEY = (orgId: string) => `salepro.logo.${orgId}`;
const tries = new Map<string, number>();

function stored(orgId: string): string | null | undefined {
  try { const v = globalThis.localStorage?.getItem(KEY(orgId)); return v === null || v === undefined ? undefined : v === '' ? null : v; } catch { return undefined; }
}
function store(orgId: string, uri: string | null) {
  try { globalThis.localStorage?.setItem(KEY(orgId), uri ?? ''); } catch { /* storage full or blocked: memory cache only */ }
}

async function fetchLogo(orgId: string) {
  const { data, error } = await neon.from('org_logos').select('mime,data').eq('org_id', orgId).maybeSingle();
  if (error) {
    // keep whatever we have (memory or localStorage) and try again a few times
    const n = (tries.get(orgId) ?? 0) + 1; tries.set(orgId, n);
    if (n <= 4) setTimeout(() => void fetchLogo(orgId), 1500 * n);
    return;
  }
  tries.set(orgId, 0);
  const r = data as { mime: string; data: unknown } | null;
  const uri = r ? byteaToDataUri(r.data, r.mime) : null;
  cache.set(orgId, uri); store(orgId, uri);
  notify();
}

function peek(orgId: string): string | null { const c = cache.get(orgId); if (c !== undefined) return c; const s = stored(orgId); return s ?? null; }

function ensure(orgId: string) {
  if (!cache.has(orgId)) { const s = stored(orgId); if (s !== undefined) cache.set(orgId, s); }
  void fetchLogo(orgId); // always refresh in the background; the cached logo is shown meanwhile
}

if (typeof document !== 'undefined') {
  // coming back to the app: refresh every logo we know about
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') for (const id of cache.keys()) void fetchLogo(id); });
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
    if (orgId) ensure(orgId);
    return () => { subs.delete(f); };
  }, [orgId]);
  const uri = orgId ? peek(orgId) : null;
  if (!uri) return <Logo size={size} />;
  return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size * 0.24 }} accessibilityLabel="Company logo" resizeMode="contain" />;
}

/** Data URI of the company logo (or null) for places that draw it themselves, e.g. the business card. */
export function useOrgLogoUri(): string | null {
  const { current } = useAuth();
  const orgId = current?.org_id;
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((n) => n + 1);
    subs.add(f);
    if (orgId) ensure(orgId);
    return () => { subs.delete(f); };
  }, [orgId]);
  return orgId ? peek(orgId) : null;
}

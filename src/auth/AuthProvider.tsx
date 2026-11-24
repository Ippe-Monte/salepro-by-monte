import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { neon } from '@/lib/neon';
import { resolveAccess, type Gate, type Membership, type Org, type Profile } from './roles';

type Ctx = {
  gate: Gate;
  profile: Profile | null;
  memberships: Membership[];
  current: Membership | null;
  isPlatform: boolean;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  selectOrg: (orgId: string) => void;
};

const AuthContext = createContext<Ctx | null>(null);
const ORG_KEY = 'salepro.currentOrg';

function loadPreferredOrg(): string | null {
  try { return globalThis.localStorage?.getItem(ORG_KEY) ?? null; } catch { return null; }
}
function savePreferredOrg(id: string) {
  try { globalThis.localStorage?.setItem(ORG_KEY, id); } catch { /* storage unavailable: keep in memory only */ }
}

// A hung request must never leave the app spinning forever: fail with a message that names the step.
export function withTimeout<T>(p: PromiseLike<T>, step: string, ms = 20000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`หมดเวลารอเซิร์ฟเวอร์ (ขั้น: ${step})`)), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

function message(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m && m.length < 200 ? m : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

type MembershipRow = { org_id: string; role: Membership['role']; status: Membership['status']; organizations: Org | Org[] | null };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [memberships, setMemberships] = useState<Membership[] | null>(null);
  const [isPlatform, setIsPlatform] = useState(false);
  const [preferred, setPreferred] = useState<string | null>(loadPreferredOrg);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setProfile(null); setMemberships(null); setIsPlatform(false);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const { data } = await withTimeout(neon.auth.getSession(), 'ตรวจ session');
      if (!data?.session) { setSignedIn(false); reset(); return; }
      setSignedIn(true);
      setError(null);
      const pr = await withTimeout(neon.rpc('ensure_profile'), 'สร้างโปรไฟล์');
      if (pr.error) throw pr.error;
      const mr = await withTimeout(neon
        .from('memberships')
        .select('org_id,role,status,organizations(id,name,status,tax_id,address,phone,currency,vat_rate)'), 'ดึงรายชื่อบริษัท');
      if (mr.error) throw mr.error;
      const rows = (mr.data ?? []) as unknown as MembershipRow[];
      const ms: Membership[] = rows.flatMap((r) => {
        const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
        return org ? [{ org_id: r.org_id, role: r.role, status: r.status, org }] : [];
      });
      const pl = await withTimeout(neon.rpc('am_platform_admin'), 'ตรวจสิทธิ์แพลตฟอร์ม');
      setProfile(pr.data as unknown as Profile);
      setMemberships(ms);
      setIsPlatform(pl.data === true);
      setError(null);
    } catch (e) {
      setError(message(e));
      setSignedIn((s) => s ?? false);
    }
  }, [reset]);

  useEffect(() => { void refresh(); }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error: err } = await withTimeout(neon.auth.signIn.email({ email: email.trim(), password }), 'เข้าสู่ระบบ');
      if (err) return message(err);
    } catch (e) { return message(e); }
    await refresh();
    return null;
  }, [refresh]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    try {
      const { error: err } = await withTimeout(neon.auth.signUp.email({ name: name.trim(), email: email.trim(), password }), 'ลงทะเบียน');
      if (err) return message(err);
    } catch (e) { return message(e); }
    await refresh();
    return null;
  }, [refresh]);

  const signOut = useCallback(async () => {
    await neon.auth.signOut();
    reset();
    setSignedIn(false);
  }, [reset]);

  const selectOrg = useCallback((orgId: string) => { savePreferredOrg(orgId); setPreferred(orgId); }, []);

  const access = useMemo(
    () => resolveAccess(signedIn, profile, memberships, isPlatform, preferred, error),
    [signedIn, profile, memberships, isPlatform, preferred, error],
  );

  const value = useMemo<Ctx>(
    () => ({
      gate: access.gate, profile, memberships: memberships ?? [], current: access.current,
      isPlatform, error, signIn, signUp, signOut, refresh, selectOrg,
    }),
    [access, profile, memberships, isPlatform, error, signIn, signUp, signOut, refresh, selectOrg],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

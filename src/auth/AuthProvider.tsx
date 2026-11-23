import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { neon } from '@/lib/neon';
import { gateFor, type Gate, type Profile } from './roles';

type Ctx = {
  gate: Gate;
  profile: Profile | null;
  error: string | null;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (name: string, email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Ctx | null>(null);

function message(e: unknown): string {
  const m = (e as { message?: string } | null)?.message;
  return m && m.length < 200 ? m : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data } = await neon.auth.getSession();
      if (!data?.session) {
        setSignedIn(false);
        setProfile(null);
        return;
      }
      setSignedIn(true);
      // Creates the profile on first sign-in (first user = admin, others pending).
      const res = await neon.rpc('ensure_profile');
      if (res.error) throw res.error;
      setProfile(res.data as unknown as Profile);
      setError(null);
    } catch (e) {
      setError(message(e));
      setSignedIn((s) => s ?? false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error: err } = await neon.auth.signIn.email({ email: email.trim(), password });
    if (err) return message(err);
    await refresh();
    return null;
  }, [refresh]);

  const signUp = useCallback(async (name: string, email: string, password: string) => {
    const { error: err } = await neon.auth.signUp.email({ name: name.trim(), email: email.trim(), password });
    if (err) return message(err);
    await refresh();
    return null;
  }, [refresh]);

  const signOut = useCallback(async () => {
    await neon.auth.signOut();
    setProfile(null);
    setSignedIn(false);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ gate: gateFor(signedIn, profile), profile, error, signIn, signUp, signOut, refresh }),
    [signedIn, profile, error, signIn, signUp, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Ctx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}

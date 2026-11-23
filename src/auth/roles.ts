export const ROLES = ['admin', 'sales', 'warehouse', 'dispatcher', 'viewer'] as const;
export type Role = (typeof ROLES)[number];
export const STATUSES = ['pending', 'active', 'disabled'] as const;
export type Status = (typeof STATUSES)[number];

export type Profile = {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  status: Status;
};

export type Gate = 'loading' | 'signed-out' | 'pending' | 'disabled' | 'ready';

/** Where a session should be allowed to go. UI gate only; RLS is the real control. */
export function gateFor(signedIn: boolean | null, profile: Profile | null): Gate {
  if (signedIn === null) return 'loading';
  if (!signedIn) return 'signed-out';
  if (!profile) return 'loading';
  if (profile.status === 'pending') return 'pending';
  if (profile.status === 'disabled') return 'disabled';
  return 'ready';
}

/** Which role may open which module (menu visibility only; enforced again in the database). */
export const MODULE_ROLES: Record<string, readonly Role[]> = {
  dashboard: ROLES,
  users: ['admin'],
};

export function canOpen(module: string, role: Role | undefined): boolean {
  return !!role && (MODULE_ROLES[module] ?? []).includes(role);
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 8) return 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
  return null;
}

export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'อีเมลไม่ถูกต้อง';
}

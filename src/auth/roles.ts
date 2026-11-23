export const ROLES = ['owner', 'admin', 'sales', 'warehouse', 'dispatcher', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'เจ้าของ', admin: 'ผู้ดูแล', sales: 'ฝ่ายขาย', warehouse: 'คลังสินค้า', dispatcher: 'ฝ่ายจัดส่ง', viewer: 'ดูอย่างเดียว',
};

/** Roles the caller may hand out. Only owners can grant or change ownership (enforced in the database too). */
export function assignableRoles(callerRole: Role | undefined): readonly Role[] {
  if (callerRole === 'owner') return ROLES;
  if (callerRole === 'admin') return ROLES.filter((r) => r !== 'owner');
  return [];
}

/** May the caller change this member? Admins cannot touch owners. */
export function canManageMember(callerRole: Role | undefined, targetRole: Role): boolean {
  if (callerRole === 'owner') return true;
  return callerRole === 'admin' && targetRole !== 'owner';
}

export type Profile = { id: string; email: string; display_name: string };
export type Org = {
  id: string;
  name: string;
  status: 'active' | 'suspended';
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  currency: string;
  vat_rate: number;
};
export type Membership = { org_id: string; role: Role; status: 'active' | 'disabled'; org: Org };

export type Gate = 'loading' | 'signed-out' | 'no-org' | 'suspended' | 'ready';

export type Access = { gate: Gate; current: Membership | null };

/**
 * Decide where a session may go and which company is current. UI gate only — RLS is the real control.
 * `preferredOrgId` is the company the user last chose (if still usable it wins).
 */
export function resolveAccess(
  signedIn: boolean | null,
  profile: Profile | null,
  memberships: Membership[] | null,
  isPlatform: boolean,
  preferredOrgId: string | null,
): Access {
  if (signedIn === null) return { gate: 'loading', current: null };
  if (!signedIn) return { gate: 'signed-out', current: null };
  if (!profile || memberships === null) return { gate: 'loading', current: null };
  const active = memberships.filter((m) => m.status === 'active');
  const usable = active.filter((m) => m.org.status === 'active');
  const current = usable.find((m) => m.org_id === preferredOrgId) ?? usable[0] ?? null;
  if (current) return { gate: 'ready', current };
  if (isPlatform) return { gate: 'ready', current: null };
  if (active.length > 0) return { gate: 'suspended', current: null };
  return { gate: 'no-org', current: null };
}

/** Which role may open which module (menu visibility only; enforced again in the database). */
export const MODULE_ROLES: Record<string, readonly Role[]> = {
  dashboard: ROLES,
  members: ['owner', 'admin'],
  settings: ROLES,
};
export const EDIT_ROLES: Record<string, readonly Role[]> = { settings: ['owner', 'admin'] };

export function canOpen(module: string, role: Role | undefined): boolean {
  return !!role && (MODULE_ROLES[module] ?? []).includes(role);
}
export function canEdit(module: string, role: Role | undefined): boolean {
  return !!role && (EDIT_ROLES[module] ?? []).includes(role);
}

export function validatePassword(pw: string): string | null {
  return pw.length < 8 ? 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' : null;
}
export function validateEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ? null : 'อีเมลไม่ถูกต้อง';
}
export function validateOrgName(name: string): string | null {
  const n = name.trim();
  return n.length < 2 || n.length > 120 ? 'ชื่อบริษัทต้องยาว 2–120 ตัวอักษร' : null;
}

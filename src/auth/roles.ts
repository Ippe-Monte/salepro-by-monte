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

export type Profile = {
  id: string; email: string; display_name: string;
  phone?: string | null; position?: string | null; department?: string | null; line_id?: string | null; website?: string | null;
  card_theme?: 'blue' | 'dark' | 'green' | 'orange' | 'purple'; card_show_logo?: boolean; card_show_photo?: boolean;
  card_color?: string | null; card_template_id?: string | null; card_layout_id?: string | null;
};
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
export type Membership = { org_id: string; role: Role; status: 'active' | 'disabled'; stock_manager?: boolean; org: Org };

/** May change stock quantities: owner, admin, the warehouse role, or anyone granted the extra "stock manager" permission. */
export function canManageStock(m: { role: Role; stock_manager?: boolean } | null | undefined): boolean {
  return !!m && (m.role === 'owner' || m.role === 'admin' || m.role === 'warehouse' || m.stock_manager === true);
}

/** May change an item that someone opened (Job Ticket, visit): its creator, or owner/admin. */
export function canChangeOwned(role: Role | undefined, createdBy: string | null | undefined, userId: string | undefined): boolean {
  if (role === 'owner' || role === 'admin') return true;
  return role === 'sales' && !!userId && createdBy === userId;
}

/** May archive ("delete") a customer: owner and admin only. */
export function canArchiveCustomer(role: Role | undefined): boolean { return role === 'owner' || role === 'admin'; }

export type Gate = 'loading' | 'signed-out' | 'no-org' | 'suspended' | 'ready' | 'error';

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
  loadError: string | null = null,
): Access {
  if (signedIn === null) return { gate: 'loading', current: null };
  if (!signedIn) return { gate: 'signed-out', current: null };
  if (!profile || memberships === null) return { gate: loadError ? 'error' : 'loading', current: null };
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
  customers: ROLES,
  zones: ROLES,
  products: ROLES,
  stock: ROLES,
  visits: ROLES,
  jobs: ROLES,
  quotes: ROLES,
  delivery: ROLES,
  invoices: ROLES,
  notes: ROLES,
  members: ROLES, // everyone can see their colleagues; managing them is owner/admin only
  settings: ROLES,
  docs: ROLES,
};
/** Who may change data in each module (the database enforces the same rule with RLS). */
export const EDIT_ROLES: Record<string, readonly Role[]> = {
  customers: ['owner', 'admin', 'sales'],
  zones: ['owner', 'admin', 'dispatcher'],
  products: ['owner', 'admin', 'warehouse'],
  stock: ['owner', 'admin', 'warehouse'],
  visits: ['owner', 'admin', 'sales'],
  jobs: ['owner', 'admin', 'sales'],
  quotes: ['owner', 'admin', 'sales'],
  delivery: ['owner', 'admin', 'dispatcher', 'warehouse'],
  invoices: ['owner', 'admin'],
  notes: ['owner', 'admin', 'dispatcher', 'warehouse'],
  settings: ['owner', 'admin'],
  docs: ['owner', 'admin'],
};

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

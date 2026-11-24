import type { Role } from '@/auth/roles';

export type NavItem = { name: string; label: string; icon: string; module: string };

/** Everything the app can open. `name` is the route file under app/(app). */
export const ALL_ITEMS: NavItem[] = [
  { name: 'index', label: 'หน้าหลัก', icon: '🏠', module: 'dashboard' },
  { name: 'customers', label: 'ลูกค้า', icon: '👥', module: 'customers' },
  { name: 'quotes', label: 'ใบเสนอราคา', icon: '📄', module: 'quotes' },
  { name: 'visits', label: 'แผนเข้าพบ', icon: '📅', module: 'visits' },
  { name: 'jobs', label: 'Job Ticket', icon: '🎫', module: 'jobs' },
  { name: 'products', label: 'สินค้า', icon: '📦', module: 'products' },
  { name: 'stock', label: 'สต็อก', icon: '🏬', module: 'stock' },
  { name: 'delivery', label: 'ส่งของ (DO)', icon: '🚚', module: 'delivery' },
  { name: 'notes', label: 'ใบส่งของ', icon: '🧾', module: 'notes' },
  { name: 'invoices', label: 'อินวอยซ์', icon: '💳', module: 'invoices' },
  { name: 'zones', label: 'โซนส่งของ', icon: '🗺️', module: 'zones' },
  { name: 'members', label: 'สมาชิก', icon: '🔑', module: 'members' },
  { name: 'settings', label: 'ตั้งค่าบริษัท', icon: '🏢', module: 'settings' },
  { name: 'docs', label: 'ตั้งค่าเอกสาร', icon: '⚙️', module: 'docs' },
];

/** The five items always shown in the phone bottom bar; everything else lives under "เพิ่มเติม". */
export const BOTTOM = ['index', 'customers', 'quotes', 'visits'] as const;

export function isBottomItem(name: string): boolean {
  return (BOTTOM as readonly string[]).includes(name);
}

export function visibleItems(canOpen: (module: string, role: Role | undefined) => boolean, role: Role | undefined): NavItem[] {
  return ALL_ITEMS.filter((i) => canOpen(i.module, role));
}

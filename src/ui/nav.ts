import type { Role } from '@/auth/roles';

export type NavItem = { name: string; label: string; icon: string; module: string };

/** Everything the app can open. `name` is the route file under app/(app). */
export const ALL_ITEMS: NavItem[] = [
  { name: 'index', label: 'หน้าหลัก', icon: 'home', module: 'dashboard' },
  { name: 'customers', label: 'ลูกค้า', icon: 'groups', module: 'customers' },
  { name: 'quotes', label: 'ใบเสนอราคา', icon: 'documents', module: 'quotes' },
  { name: 'visits', label: 'แผนเข้าพบ', icon: 'schedule', module: 'visits' },
  { name: 'jobs', label: 'Job Ticket', icon: 'ticket', module: 'jobs' },
  { name: 'products', label: 'สินค้า', icon: 'box', module: 'products' },
  { name: 'stock', label: 'สต็อก', icon: 'warehouse', module: 'stock' },
  { name: 'delivery', label: 'ส่งของ (DO)', icon: 'truck', module: 'delivery' },
  { name: 'notes', label: 'ใบส่งของ', icon: 'clipboard', module: 'notes' },
  { name: 'invoices', label: 'อินวอยซ์', icon: 'wallet', module: 'invoices' },
  { name: 'zones', label: 'โซนส่งของ', icon: 'pin', module: 'zones' },
  { name: 'members', label: 'สมาชิก', icon: 'key', module: 'members' },
  { name: 'settings', label: 'ตั้งค่าบริษัท', icon: 'building', module: 'settings' },
  { name: 'docs', label: 'ตั้งค่าเอกสาร', icon: 'settings', module: 'docs' },
];

/** The five items always shown in the phone bottom bar; everything else lives under "เพิ่มเติม". */
export const BOTTOM = ['index', 'customers', 'quotes', 'visits'] as const;

export function isBottomItem(name: string): boolean {
  return (BOTTOM as readonly string[]).includes(name);
}

export function visibleItems(canOpen: (module: string, role: Role | undefined) => boolean, role: Role | undefined): NavItem[] {
  return ALL_ITEMS.filter((i) => canOpen(i.module, role));
}

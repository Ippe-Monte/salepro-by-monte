/** Free-layout business card: a size in millimetres and text boxes placed anywhere on it. */
export type ElType = 'name' | 'position' | 'department' | 'company' | 'address' | 'phone' | 'email' | 'line' | 'website' | 'text' | 'qr' | 'logo' | 'photo';
export type El = {
  id: string; t: ElType; x: number; y: number; // top-left, in % of the card
  s: number; // text: font size in % of card width; qr/logo/photo: box size in % of card width
  b?: boolean; a?: 'l' | 'c' | 'r'; c?: string; // bold, alignment, colour ('' = automatic from the card colour)
  txt?: string; // content of a free text box
};
export type Layout = { w: number; h: number; els: El[] };

export const SIZE_PRESETS: { key: string; label: string; w: number; h: number }[] = [
  { key: 'th', label: 'มาตรฐานไทย 90×55 มม.', w: 90, h: 55 },
  { key: 'eu', label: 'ยุโรป 85×55 มม.', w: 85, h: 55 },
  { key: 'us', label: 'สหรัฐ 89×51 มม.', w: 89, h: 51 },
];
export const MIN_MM = 30;
export const MAX_MM = 200;

export const TYPE_LABEL: Record<ElType, string> = {
  name: 'ชื่อ-นามสกุล', position: 'ตำแหน่ง', department: 'แผนก', company: 'ชื่อบริษัท', address: 'ที่อยู่บริษัท', phone: 'เบอร์โทร', email: 'อีเมล',
  line: 'LINE ID', website: 'เว็บไซต์', text: 'ข้อความอิสระ', qr: 'QR Code', logo: 'โลโก้', photo: 'รูปโปรไฟล์',
};
export const isBox = (t: ElType) => t === 'qr' || t === 'logo' || t === 'photo';
export const SIZE_RANGE = (t: ElType) => (isBox(t) ? { min: 8, max: 45, step: 3 } : { min: 2, max: 12, step: 0.5 });

let n = 0;
export const newId = () => `e${Date.now().toString(36)}${(n++).toString(36)}`;

export function newEl(t: ElType, at?: Partial<El>): El {
  const box = isBox(t);
  const base: El = { id: newId(), t, x: 6, y: 6, s: box ? (t === 'qr' ? 22 : 14) : t === 'name' ? 6 : 3.8, b: t === 'name' || t === 'company', a: 'l', c: '' };
  return { ...base, ...(t === 'text' ? { txt: 'ข้อความ' } : {}), ...at };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Size in mm kept inside sensible bounds; orientation swaps width and height. */
export function setSize(l: Layout, w: number, h: number): Layout {
  return { ...l, w: clamp(Math.round(w) || 90, MIN_MM, MAX_MM), h: clamp(Math.round(h) || 55, MIN_MM, MAX_MM) };
}
export const isPortrait = (l: Layout) => l.h > l.w;
export function setPortrait(l: Layout, portrait: boolean): Layout {
  const lo = Math.min(l.w, l.h); const hi = Math.max(l.w, l.h);
  return portrait ? { ...l, w: lo, h: hi } : { ...l, w: hi, h: lo };
}

/** Starting layout: everything the standard card needs, so the user only rearranges. */
export function defaultLayout(): Layout {
  return {
    w: 90, h: 55,
    els: [
      newEl('name', { x: 6, y: 8 }), newEl('position', { x: 6, y: 22 }), newEl('company', { x: 6, y: 62, s: 3.6 }),
      newEl('phone', { x: 6, y: 74, s: 3.4 }), newEl('email', { x: 6, y: 83, s: 3.4 }), newEl('qr', { x: 72, y: 52, s: 22 }),
    ],
  };
}

/** Keep stored layouts safe to render: drop unknown element types and clamp every number. */
export function sanitize(raw: unknown): Layout {
  const r = (raw ?? {}) as Partial<Layout>;
  const ok = new Set<string>(Object.keys(TYPE_LABEL));
  const els = (Array.isArray(r.els) ? r.els : []).filter((e): e is El => !!e && typeof e === 'object' && ok.has((e as El).t)).slice(0, 40).map((e) => ({
    id: String(e.id || newId()), t: e.t, x: clamp(Number(e.x) || 0, 0, 100), y: clamp(Number(e.y) || 0, 0, 100), s: clamp(Number(e.s) || 4, 1, 60),
    b: !!e.b, a: (e.a === 'c' || e.a === 'r' ? e.a : 'l') as 'l' | 'c' | 'r', c: typeof e.c === 'string' && /^#[0-9a-fA-F]{6}$/.test(e.c) ? e.c : '', txt: typeof e.txt === 'string' ? e.txt.slice(0, 120) : undefined,
  }));
  return { w: clamp(Number(r.w) || 90, MIN_MM, MAX_MM), h: clamp(Number(r.h) || 55, MIN_MM, MAX_MM), els };
}

/** Move an element by a drag of (dx, dy) pixels on a card drawn cardW x cardH pixels wide. */
export function drag(e: El, dxPx: number, dyPx: number, cardW: number, cardH: number): El {
  return { ...e, x: clamp(e.x + (dxPx / cardW) * 100, 0, 96), y: clamp(e.y + (dyPx / cardH) * 100, 0, 96) };
}

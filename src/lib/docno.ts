export type NumberFormat = { prefix: string; digits: number; year_fmt: 'ce' | 'be' | 'none'; separator: '-' | '/' | '' };

/** Mirrors next_doc_no() in the database; used only for the preview in document settings. */
export function formatDocNo(f: NumberFormat, n: number, now: Date = new Date()): string {
  const y = now.getFullYear();
  const ytxt = f.year_fmt === 'ce' ? String(y) : f.year_fmt === 'be' ? String(y + 543) : '';
  const num = String(n).padStart(f.digits, '0');
  return f.prefix + (f.year_fmt === 'none' ? f.separator : f.separator + ytxt + f.separator) + num;
}

export function validatePrefix(p: string): string | null {
  return /^[A-Z0-9]{1,6}$/.test(p) ? null : 'รหัสนำหน้าต้องเป็น A–Z หรือ 0–9 ยาว 1–6 ตัว';
}
export function validateColor(c: string): string | null {
  return /^#[0-9A-Fa-f]{6}$/.test(c) ? null : 'สีต้องเป็นรูปแบบ #RRGGBB';
}

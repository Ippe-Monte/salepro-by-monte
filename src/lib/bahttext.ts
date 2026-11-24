const D = ['', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const P = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function chunk(raw: string): string {
  const s = raw.replace(/^0+/, '');
  let out = '';
  const n = s.length;
  for (let i = 0; i < n; i++) {
    const d = Number(s[i]);
    const pos = n - i - 1;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += 'สิบ';
    else if (pos === 1 && d === 2) out += 'ยี่สิบ';
    else if (pos === 0 && d === 1 && n > 1) out += 'เอ็ด';
    else out += D[d] + P[pos];
  }
  return out;
}

function intText(n: number): string {
  if (n === 0) return 'ศูนย์';
  const s = String(n);
  const parts: string[] = [];
  for (let end = s.length; end > 0; end -= 6) parts.unshift(s.slice(Math.max(0, end - 6), end));
  return parts.map((p, i) => chunk(p) + (i < parts.length - 1 ? 'ล้าน' : '')).join('');
}

/** Amount in Thai words, e.g. 1234.5 → หนึ่งพันสองร้อยสามสิบสี่บาทห้าสิบสตางค์ */
export function bahtText(amount: number): string {
  const total = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(total / 100);
  const sat = total % 100;
  const b = intText(baht) + 'บาท';
  return sat === 0 ? b + 'ถ้วน' : b + intText(sat) + 'สตางค์';
}

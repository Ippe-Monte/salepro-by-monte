/** Turns OCR text from a business card into contact fields. Pure and forgiving: anything it cannot place is left empty. */
export type ParsedCard = { name: string; position: string; company: string; phone: string; email: string; website: string; lineId: string };

const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const WEB = /\b((?:https?:\/\/)?(?:www\.)[A-Z0-9.-]+\.[A-Z]{2,}(?:\/\S*)?)/i;
const PHONE = /(?:\+?66|0)[\s.-]?\d{1,2}[\s.-]?\d{3}[\s.-]?\d{3,4}/;
const LINE = /line\s*(?:id|@)?\s*[:：]?\s*(@?[A-Za-z0-9._-]{3,})/i;
const POSITION = /(manager|engineer|director|president|sales|executive|officer|supervisor|specialist|consultant|ผู้จัดการ|วิศวกร|ผู้อำนวยการ|หัวหน้า|ฝ่าย|เจ้าหน้าที่|ประธาน|กรรมการ|ตัวแทน)/i;
const COMPANY = /(บริษัท|บจก|หจก|ห้างหุ้นส่วน|co\.?,?\s*ltd|company|limited|corporation|corp\.?|inc\.?|group|industries|engineering)/i;

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

export function parseCardText(raw: string): ParsedCard {
  const lines = raw.split(/\r?\n/).map(squash).filter((l) => l.length > 1);
  const out: ParsedCard = { name: '', position: '', company: '', phone: '', email: '', website: '', lineId: '' };
  const rest: string[] = [];
  for (const l of lines) {
    const em = EMAIL.exec(l);
    if (em && !out.email) { out.email = em[0].toLowerCase(); continue; }
    const ln = LINE.exec(l);
    if (ln && !out.lineId) { out.lineId = ln[1]!; continue; }
    const web = WEB.exec(l);
    if (web && !out.website && !em) { out.website = web[1]!.replace(/[.,;]$/, ''); continue; }
    const ph = PHONE.exec(l.replace(/[()]/g, ''));
    if (ph && !out.phone && /\d{8,}/.test(l.replace(/\D/g, '').padEnd(8, 'x'))) { out.phone = squash(ph[0]); continue; }
    if (/^(tel|mobile|phone|fax|โทร|มือถือ|แฟกซ์)/i.test(l) && /\d{6,}/.test(l.replace(/\D/g, ''))) continue;
    rest.push(l);
  }
  for (const l of rest) {
    if (!out.company && COMPANY.test(l)) { out.company = l; continue; }
    if (!out.position && POSITION.test(l)) { out.position = l; continue; }
  }
  // The name is the first remaining short line without digits (cards print it large, near the top).
  out.name = rest.find((l) => l !== out.company && l !== out.position && /[A-Za-z\u0E00-\u0E7F]{2}/.test(l) && !/\d/.test(l) && l.length <= 60 && !COMPANY.test(l)) ?? '';
  return out;
}

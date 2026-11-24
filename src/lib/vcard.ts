/** vCard 3.0 for the electronic business card. UTF-8, CRLF line endings, folded at 75 octets is not required by phones. */
export type CardData = {
  name: string; company?: string | null; position?: string | null; department?: string | null;
  phone?: string | null; email?: string | null; website?: string | null; lineId?: string | null;
  address?: string | null; photoB64?: string | null; photoType?: 'JPEG' | 'PNG' | null;
};

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,');
const clean = (v: string | null | undefined) => (v ?? '').trim();

export function buildVCard(c: CardData, opts: { photo?: boolean } = {}): string {
  const name = clean(c.name) || '-';
  const parts = name.split(/\s+/);
  const family = parts.length > 1 ? parts[parts.length - 1]! : '';
  const given = parts.length > 1 ? parts.slice(0, -1).join(' ') : name;
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(family)};${esc(given)};;;`, `FN:${esc(name)}`];
  const org = [clean(c.company), clean(c.department)].filter(Boolean).map(esc).join(';');
  if (org) lines.push(`ORG:${org}`);
  if (clean(c.position)) lines.push(`TITLE:${esc(clean(c.position))}`);
  if (clean(c.phone)) lines.push(`TEL;TYPE=CELL,VOICE:${esc(clean(c.phone))}`);
  if (clean(c.email)) lines.push(`EMAIL;TYPE=INTERNET,WORK:${esc(clean(c.email))}`);
  if (clean(c.website)) lines.push(`URL:${clean(c.website).replace(/[\r\n]/g, '')}`);
  if (clean(c.address)) lines.push(`ADR;TYPE=WORK:;;${esc(clean(c.address))};;;;`);
  if (clean(c.lineId)) lines.push(`X-SOCIALPROFILE;TYPE=line:${esc(clean(c.lineId))}`, `NOTE:LINE ID: ${esc(clean(c.lineId))}`);
  if (opts.photo && c.photoB64) lines.push(`PHOTO;ENCODING=b;TYPE=${c.photoType ?? 'JPEG'}:${c.photoB64}`);
  lines.push('END:VCARD');
  return lines.join('\r\n') + '\r\n';
}

/** Read the main fields back out of a vCard text (used when scanning someone else's card). */
export function parseVCard(text: string): Partial<CardData> | null {
  if (!/BEGIN:VCARD/i.test(text)) return null;
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const get = (key: string): string | null => {
    const m = new RegExp(`^${key}(?:;[^:]*)?:(.*)$`, 'im').exec(unfolded);
    return m ? m[1]!.replace(/\\n/gi, '\n').replace(/\\([;,\\])/g, '$1').trim() : null;
  };
  const org = get('ORG');
  return {
    name: get('FN') ?? undefined, company: org ? org.split(';')[0] : null, department: org?.split(';')[1] ?? null,
    position: get('TITLE'), phone: get('TEL'), email: get('EMAIL'), website: get('URL'),
  };
}

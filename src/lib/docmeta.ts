import { neon } from './neon';

export type DocType = 'quote' | 'invoice' | 'delivery_note' | 'delivery_order';
export const DOC_LABEL: Record<DocType, string> = { quote: 'ใบเสนอราคา', invoice: 'อินวอยซ์', delivery_note: 'ใบส่งของ', delivery_order: 'DO (ใบปล่อยของ)' };
export const DEFAULT_TITLE: Record<DocType, [string, string]> = {
  quote: ['ใบเสนอราคา', 'Quotation'], invoice: ['ใบแจ้งหนี้ / อินวอยซ์', 'Invoice'],
  delivery_note: ['ใบส่งของ', 'Delivery Note'], delivery_order: ['ใบปล่อยสินค้า (DO)', 'Delivery Order'],
};
export const DEFAULT_SIGS: Record<DocType, string[]> = {
  quote: ['ผู้เสนอราคา', 'ผู้อนุมัติ'], invoice: ['ผู้ออกเอกสาร', 'ผู้รับเอกสาร'], delivery_note: ['ผู้ส่งของ', 'ผู้รับของ'], delivery_order: ['ผู้จัดของ', 'ผู้ขับรถ'],
};

export type DocSettings = {
  title_th: string | null; title_en: string | null; logo_show: boolean; logo_pos: 'left' | 'center' | 'right'; header_color: string;
  col_image: boolean; col_code: boolean; col_unit: boolean; show_prices: boolean; credit_days: number | null; validity_days: number | null;
  vat_rate: number | null; notes: string | null; footer: string | null; sig_labels: string[];
};
export type Branding = { branch_name: string | null; email: string | null; website: string | null; tagline: string | null };
export type Img = { mime: string; data: string };
export type DocContext = { settings: DocSettings; branding: Branding | null; logo: Img | null };

export function defaultSettings(t: DocType): DocSettings {
  return {
    title_th: DEFAULT_TITLE[t][0], title_en: DEFAULT_TITLE[t][1], logo_show: true, logo_pos: 'left', header_color: '#2563EB',
    col_image: false, col_code: true, col_unit: true, show_prices: t === 'quote' || t === 'invoice', credit_days: null, validity_days: null,
    vat_rate: null, notes: null, footer: null, sig_labels: DEFAULT_SIGS[t],
  };
}

/** Branding, logo and layout settings needed to print one document type. */
export async function loadDocContext(orgId: string, t: DocType): Promise<DocContext> {
  const [s, b, l] = await Promise.all([
    neon.from('doc_settings').select('*').eq('org_id', orgId).eq('doc_type', t).maybeSingle(),
    neon.from('org_branding').select('branch_name,email,website,tagline').eq('org_id', orgId).maybeSingle(),
    neon.from('org_logos').select('mime,data').eq('org_id', orgId).maybeSingle(),
  ]);
  const def = defaultSettings(t);
  const row = s.data as Partial<DocSettings> | null;
  const settings: DocSettings = row ? { ...def, ...row, sig_labels: row.sig_labels && row.sig_labels.length ? row.sig_labels : def.sig_labels } : def;
  return { settings, branding: (b.data as Branding | null) ?? null, logo: (l.data as Img | null) ?? null };
}

/** First image (position 1) of each product, for the optional image column on documents. */
export async function loadThumbs(orgId: string, productIds: string[]): Promise<Record<string, Img>> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return {};
  const { data } = await neon.from('product_images').select('product_id,mime,data').eq('org_id', orgId).eq('position', 1).in('product_id', ids);
  const out: Record<string, Img> = {};
  for (const r of (data ?? []) as { product_id: string; mime: string; data: string }[]) out[r.product_id] = { mime: r.mime, data: r.data };
  return out;
}

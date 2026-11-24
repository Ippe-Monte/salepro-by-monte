/** Browser-side business card scanning: read a QR vCard from a photo, or OCR a printed card. Web only. */
import jsQR from 'jsqr';
import { parseCardText, type ParsedCard } from './cardparse';
import { parseVCard } from './vcard';

export function pickFileWeb(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}

async function toCanvas(file: File, maxSide: number): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c;
}

/** Decode a QR code found in a photo; returns its text or null. */
export async function readQr(file: File): Promise<string | null> {
  for (const side of [1400, 2200, 800]) {
    const c = await toCanvas(file, side);
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
    const r = jsQR(d.data, d.width, d.height, { inversionAttempts: 'attemptBoth' });
    if (r?.data) return r.data;
  }
  return null;
}

export type ScanResult = ParsedCard & { department: string; source: 'card_photo' | 'qr' };

export function fromVCardText(text: string): ScanResult | null {
  const v = parseVCard(text);
  if (!v?.name) return null;
  return { name: v.name ?? '', position: v.position ?? '', department: v.department ?? '', company: v.company ?? '', phone: v.phone ?? '', email: v.email ?? '', website: v.website ?? '', lineId: '', source: 'qr' };
}

/** OCR a photographed card (Thai + English). The first run downloads the language data, so it can take a while. */
export async function ocrCard(file: File, onProgress?: (pct: number) => void): Promise<ScanResult> {
  const { default: Tesseract } = await import('tesseract.js');
  const c = await toCanvas(file, 1800);
  const res = await Tesseract.recognize(c, 'tha+eng', { logger: (m: { status: string; progress: number }) => { if (m.status === 'recognizing text') onProgress?.(Math.round(m.progress * 100)); } });
  return { ...parseCardText(res.data.text), department: '', source: 'card_photo' };
}

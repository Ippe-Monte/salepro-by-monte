/** Image helpers: the database stores images as bytea; PostgREST reads/writes bytea as '\x<hex>' strings. */

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';

export const MAX_IMAGE_BYTES = 300000;

/** Size in bytes of decoded base64 text. */
export function base64Bytes(b64: string): number {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - (pad && clean.length % 4 === 0 ? 0 : 0);
}

export function base64ToHex(b64: string): string {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '');
  let out = '';
  let bits = 0; let acc = 0;
  for (const ch of clean) {
    acc = (acc << 6) | B64.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const byte = (acc >> bits) & 0xff;
      out += HEX[byte >> 4] + HEX[byte & 15];
      acc &= (1 << bits) - 1;
    }
  }
  return out;
}

export function hexToBase64(hex: string): string {
  let out = '';
  for (let i = 0; i < hex.length; i += 6) {
    const chunk = hex.slice(i, i + 6);
    const bytes: number[] = [];
    for (let j = 0; j < chunk.length; j += 2) bytes.push(parseInt(chunk.slice(j, j + 2), 16));
    const n = (bytes[0] << 16) | ((bytes[1] ?? 0) << 8) | (bytes[2] ?? 0);
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (bytes.length > 1 ? B64[(n >> 6) & 63] : '=') + (bytes.length > 2 ? B64[n & 63] : '=');
  }
  return out;
}

/** Value to send in an insert/update of a bytea column. */
export function toByteaParam(b64: string): string {
  return '\\x' + base64ToHex(b64);
}

/** A bytea value as returned by the Data API ('\x..' hex) → data URI for <Image>. Returns null when unusable. */
export function byteaToDataUri(value: unknown, mime: string): string | null {
  if (typeof value !== 'string' || !value.startsWith('\\x') || value.length < 4) return null;
  return `data:${mime};base64,${hexToBase64(value.slice(2))}`;
}

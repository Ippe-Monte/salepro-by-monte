// Single source of truth for the app version, shown as "V1.00".
// Change it with: npm run version:set 1.01   (updates app.json and package.json too).
export const APP_VERSION = '1.17';

export const VERSION_LABEL = `V${APP_VERSION}`;

export function toSemver(v: string): string {
  const m = /^(\d+)\.(\d{2})$/.exec(v);
  if (!m) throw new Error(`Version must look like 1.00, got "${v}"`);
  return `${Number(m[1])}.${Number(m[2])}.0`;
}

// Android/Play versionCode must grow with every upload: 1.00 -> 1000, 1.01 -> 1001, 2.00 -> 2000.
export function toVersionCode(v: string): number {
  const m = /^(\d+)\.(\d{2})$/.exec(v);
  if (!m) throw new Error(`Version must look like 1.00, got "${v}"`);
  return Number(m[1]) * 1000 + Number(m[2]);
}

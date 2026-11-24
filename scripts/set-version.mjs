// Usage: node scripts/set-version.mjs 1.01
import { readFileSync, writeFileSync } from 'node:fs';
const v = process.argv[2];
const m = /^(\d+)\.(\d{2})$/.exec(v || '');
if (!m) { console.error('Usage: npm run version:set 1.01  (format x.xx)'); process.exit(1); }
const semver = `${Number(m[1])}.${Number(m[2])}.0`;
const code = Number(m[1]) * 1000 + Number(m[2]);
const edit = (file, fn) => { const j = JSON.parse(readFileSync(file, 'utf8')); fn(j); writeFileSync(file, JSON.stringify(j, null, 2) + '\n'); };
edit('app.json', (j) => { j.expo.version = semver; j.expo.android.versionCode = code; j.expo.ios.buildNumber = String(code); });
edit('package.json', (j) => { j.version = semver; });
const f = 'src/version.ts';
writeFileSync(f, readFileSync(f, 'utf8').replace(/APP_VERSION = '[^']*'/, `APP_VERSION = '${v}'`));
console.log(`Version set to V${v} (semver ${semver}, versionCode ${code})`);

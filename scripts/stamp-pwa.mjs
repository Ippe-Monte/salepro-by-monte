// Runs after `expo export`: stamps the version and base path into the PWA files, writes dist/version.json,
// and copies index.html to 404.html (GitHub Pages has no rewrite rules; 404.html makes deep links open the app).
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
const v = /APP_VERSION = '([^']+)'/.exec(readFileSync('src/version.ts', 'utf8'))?.[1];
if (!v) throw new Error('APP_VERSION not found');
const base = (process.env.EXPO_BASE_URL || '').replace(/\/+$/, '');
if (base && !base.startsWith('/')) throw new Error('EXPO_BASE_URL must start with "/", e.g. /salepro-by-monte');

const stamp = (file) => {
  const s = readFileSync(file, 'utf8');
  writeFileSync(file, s.replaceAll('__APP_VERSION__', v).replaceAll('__BASE__', base));
};
for (const f of ['dist/sw.js', 'dist/manifest.webmanifest', 'dist/index.html']) stamp(f);
for (const f of ['dist/sw.js', 'dist/manifest.webmanifest', 'dist/index.html']) {
  if (readFileSync(f, 'utf8').includes('__')) {
    const left = readFileSync(f, 'utf8').match(/__[A-Z_]+__/g);
    if (left) throw new Error(`${f} still has placeholders: ${left.join(', ')}`);
  }
}
writeFileSync('dist/version.json', JSON.stringify({ version: v, label: `V${v}`, base, built: new Date().toISOString() }) + '\n');
copyFileSync('dist/index.html', 'dist/404.html');
console.log(`PWA stamped with V${v}, base "${base || '/'}"`);

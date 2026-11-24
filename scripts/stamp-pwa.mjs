// Runs after `expo export`: stamps the version into dist/sw.js and writes dist/version.json.
import { readFileSync, writeFileSync } from 'node:fs';
const v = /APP_VERSION = '([^']+)'/.exec(readFileSync('src/version.ts', 'utf8'))?.[1];
if (!v) throw new Error('APP_VERSION not found');
const sw = readFileSync('dist/sw.js', 'utf8');
if (!sw.includes('__APP_VERSION__')) throw new Error('dist/sw.js has no __APP_VERSION__ placeholder');
writeFileSync('dist/sw.js', sw.replaceAll('__APP_VERSION__', v));
writeFileSync('dist/version.json', JSON.stringify({ version: v, label: `V${v}`, built: new Date().toISOString() }) + '\n');
console.log(`PWA stamped with V${v}`);

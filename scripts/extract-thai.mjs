// Lists every Thai text fragment in app/ and src/ (string literals, template pieces, JSX text), using the Babel parser.
// Used by the i18n coverage test: every fragment must have an English translation in src/i18n/en.ts.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const thai = /[฀-๿]/;

export function extractThai(roots = ['app', 'src']) {
  const out = new Set();
  const add = (t) => { const s = (t ?? '').replace(/\s+/g, ' ').trim(); if (s && thai.test(s)) out.add(s); };
  const scan = (p) => {
    const ast = parse(readFileSync(p, 'utf8'), { sourceType: 'module', plugins: ['typescript', 'jsx'] });
    traverse(ast, {
      StringLiteral(path) { add(path.node.value); },
      TemplateElement(path) { add(path.node.value.cooked); },
      JSXText(path) { add(path.node.value); },
    });
  };
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) { if (!/[\\/]i18n$/.test(p)) walk(p); }
      else if (/\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) && !/DocPaper|bahttext/.test(f)) scan(p);
    }
  };
  roots.forEach(walk);
  return [...out].sort();
}

if (process.argv[1] && process.argv[1].endsWith('extract-thai.mjs')) {
  const a = extractThai();
  console.log(JSON.stringify(a));
  console.error(a.length + ' fragments');
}

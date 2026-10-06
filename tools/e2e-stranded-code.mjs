/* STRANDED CODE GUARD (Node) ----------------------------------------------------
   Coach rule 2026-10-06 (CLAUDE.md): a replacement removes what it replaces,
   in the same change. The 2026-10-06 code review found 24 element ids still
   read by code whose markup had been replaced; that dead layer hid an
   unreachable Mark as Final. This guard fails when:

     1. production code looks up an element id that no production source
        creates (getElementById / querySelector('#id')), or
     2. a stylesheet keeps a selector branch no production source can produce
        (tools/prune-dead-css.mjs --strict reports any dead branch).

   Only the coach can park code. PARKED names each exception and why.

   Run:  node tools/e2e-stranded-code.mjs */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PARKED = {
  ocrStatus: 'OCR-1, parked by the coach 2026-09-27',
  ocrPreview: 'OCR-1, parked by the coach 2026-09-27',
};

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

// Comments are not code: a removed id named in a comment is history, not a lookup.
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const files = fs.readdirSync(`${ROOT}/js`).filter(f => /\.(js|jsx)$/.test(f));
const sources = new Map(files.map(f => [f, fs.readFileSync(`${ROOT}/js/${f}`, 'utf8')]));
const all = [...sources.values()].join('\n') + '\n' + fs.readFileSync(`${ROOT}/index.html`, 'utf8');
const produced = new Set();
for (const re of [/\bid\s*=\s*["'`]([\w-]+)["'`]/g, /\bid\s*=\s*\{\s*["'`]([\w-]+)["'`]\s*\}/g, /\.id\s*=\s*["'`]([\w-]+)["'`]/g, /setAttribute\(\s*['"]id['"]\s*,\s*['"]([\w-]+)['"]/g]) {
  for (const m of all.matchAll(re)) produced.add(m[1]);
}
const stranded = [];
for (const [f, src] of sources) {
  stripComments(src).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(/getElementById\(\s*['"]([\w-]+)['"]\s*\)|querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/g)) {
      const id = m[1] || m[2];
      if (!produced.has(id) && !PARKED[id]) stranded.push(`#${id} ${f}:${i + 1}`);
    }
  });
}
ok(!stranded.length, 'no production code looks up an element id that nothing creates', stranded.join(', '));
const parkedLive = Object.keys(PARKED).filter(id => [...sources.values()].some(src => src.includes(id)));
ok(parkedLive.length === Object.keys(PARKED).length, 'every parked exception still exists (remove it here when its code goes)',
  Object.keys(PARKED).filter(id => !parkedLive.includes(id)).join(', '));

const report = execFileSync(process.execPath, [`${ROOT}/tools/prune-dead-css.mjs`, '--strict'], { cwd: ROOT, encoding: 'utf8' });
const dead = Number((report.match(/(\d+) dead branches/) || [])[1]);
ok(dead === 0, 'no stylesheet keeps a selector branch no production source can produce', report.trim().split('\n').slice(-3).join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

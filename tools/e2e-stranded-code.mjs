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

// Comments are not code on either side: an id named in a comment neither
// creates an element nor looks one up. Blanking keeps line numbers.
const blank = m => m.replace(/[^\n]/g, ' ');
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/<!--[\s\S]*?-->/g, blank).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');
const PRODUCERS = [/\bid\s*=\s*["'`]([\w-]+)["'`]/g, /\bid\s*=\s*\{\s*["'`]([\w-]+)["'`]\s*\}/g, /\.id\s*=\s*["'`]([\w-]+)["'`]/g, /setAttribute\(\s*['"]id['"]\s*,\s*['"]([\w-]+)['"]/g];
// \s spans newlines, so a lookup split across lines is still a lookup.
const LOOKUP = /getElementById\(\s*['"]([\w-]+)['"]\s*\)|querySelector(?:All)?\(\s*['"]#([\w-]+)['"]/g;
const producedIds = texts => {
  const ids = new Set();
  for (const text of texts) for (const re of PRODUCERS) for (const m of stripComments(text).matchAll(re)) ids.add(m[1]);
  return ids;
};
const strandedLookups = (sourceMap, ids) => {
  const out = [];
  for (const [f, src] of sourceMap) {
    const code = stripComments(src);
    for (const m of code.matchAll(LOOKUP)) {
      const id = m[1] || m[2];
      if (!ids.has(id) && !PARKED[id]) out.push(`#${id} ${f}:${code.slice(0, m.index).split('\n').length}`);
    }
  }
  return out;
};

// The detector must see through both ways a dead reference can hide.
const selfStranded = strandedLookups(new Map([['probe.js', "const a = document.getElementById(\n  'gone'\n);\nconst b = document.querySelector('#kept');"]]),
  producedIds(['<!-- <div id="gone"></div> -->', '/* el.id = "gone" */', '<div id="kept"></div>']));
ok(selfStranded.length === 1 && selfStranded[0] === '#gone probe.js:1', 'the guard ignores ids produced only in comments and catches a lookup split across lines', JSON.stringify(selfStranded));

const files = fs.readdirSync(`${ROOT}/js`).filter(f => /\.(js|jsx)$/.test(f));
const sources = new Map(files.map(f => [f, fs.readFileSync(`${ROOT}/js/${f}`, 'utf8')]));
const produced = producedIds([...sources.values(), fs.readFileSync(`${ROOT}/index.html`, 'utf8')]);
const stranded = strandedLookups(sources, produced);
ok(!stranded.length, 'no production code looks up an element id that nothing creates', stranded.join(', '));
const parkedLive = Object.keys(PARKED).filter(id => [...sources.values()].some(src => src.includes(id)));
ok(parkedLive.length === Object.keys(PARKED).length, 'every parked exception still exists (remove it here when its code goes)',
  Object.keys(PARKED).filter(id => !parkedLive.includes(id)).join(', '));

const report = execFileSync(process.execPath, [`${ROOT}/tools/prune-dead-css.mjs`, '--strict'], { cwd: ROOT, encoding: 'utf8' });
const dead = Number((report.match(/(\d+) dead branches/) || [])[1]);
ok(dead === 0, 'no stylesheet keeps a selector branch no production source can produce', report.trim().split('\n').slice(-3).join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

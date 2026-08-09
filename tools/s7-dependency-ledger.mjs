/* S7-0 DEPENDENCY LEDGER — blocking, read-only.
 *
 * `audit-shell-deps.mjs` counts ids and checks composition. It does NOT map the
 * JavaScript that depends on each legacy element, so its 218 is a SURFACE COUNT,
 * not a deletion list. Deleting from a surface count is how `videoFileInput`
 * (live film loading) and `season-library.js` (the Team Hub's registry) would
 * have been removed.
 *
 * This classifies every id inside #app into exactly one of four buckets:
 *
 *   native-owned   no live JS reference outside the legacy tree -> removable
 *   nonvisual-host referenced by live JS but never rendered      -> rehome
 *   engine-dep     a module depends on it to do real work        -> decouple first
 *   dead-module    only referenced by a module that itself dies  -> retire together
 *
 * Output is a table plus the unresolved set. It asserts nothing and changes
 * nothing; S7-a..f consume it.
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---- 1. the ids actually inside #app -------------------------------------
const appStart = html.indexOf('<div id="app"');
if (appStart < 0) { console.log('No #app in index.html — S7-d may already be done.'); process.exit(0); }
// #app runs to the classic outlet's close; take the rest of body as the bound
// and let per-id checks decide. Conservative: over-collect, then classify.
const appHtml = html.slice(appStart);
const ids = [...new Set([...appHtml.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]))];

// ---- 2. every live JS/JSX source, minus the modules already slated to die --
const jsDir = path.join(ROOT, 'js');
const sources = fs.readdirSync(jsDir).filter(f => /\.(js|jsx)$/.test(f));
const text = new Map(sources.map(f => [f, fs.readFileSync(path.join(jsDir, f), 'utf8')]));

// Modules S7 retires. A reference from ONLY these does not keep an id alive.
// wizard.js was deleted in S7-b and season-library.js in S7-c, so the set is
// empty: every id below is now classified against LIVE code only.
const DYING = new Set();

// Live references that S7-b made OPTIONAL. These still show as engine-dep,
// because a reference is a reference — but their consumer guards against
// absence, so S7-d may delete them without decoupling first.
const OPTIONAL = new Set(['videoDropZone']);

// Modules that render into the native tree — a reference from these means the
// id is genuinely consumed by the surviving product.
const refsFor = id => {
  const hits = [];
  const patterns = [
    new RegExp(`getElementById\\(\\s*['"\`]${id}['"\`]`),
    new RegExp(`querySelector\\(\\s*['"\`]#${id}['"\`]`),
    new RegExp(`['"\`]#${id}['"\`]`),
    new RegExp(`\\b${id}\\b`),
  ];
  for (const [file, body] of text) {
    if (patterns.slice(0, 3).some(p => p.test(body))) hits.push(file);
  }
  return hits;
};

const rows = ids.map(id => {
  const hits = refsFor(id);
  const live = hits.filter(f => !DYING.has(f));
  const dyingOnly = hits.length > 0 && live.length === 0;
  let bucket;
  if (hits.length === 0) bucket = 'native-owned';
  else if (dyingOnly) bucket = 'dead-module';
  else bucket = 'engine-dep';           // refined by hand below for nonvisual hosts
  return { id, bucket, live, dying: hits.filter(f => DYING.has(f)) };
});

// Known nonvisual hosts: referenced by live JS but never rendered to the coach.
// These must be REHOMED, not deleted. Listed explicitly because "is it rendered"
// cannot be answered from source alone.
const NONVISUAL = new Set(['videoFileInput', 'videoFolderInput', 'projectFileInput', 'clipFileInput']);
for (const r of rows) if (NONVISUAL.has(r.id) && r.bucket === 'engine-dep') r.bucket = 'nonvisual-host';

const by = b => rows.filter(r => r.bucket === b);
console.log('\n== S7-0 DEPENDENCY LEDGER ==');
console.log(`ids collected from #app onward: ${ids.length}\n`);
for (const b of ['engine-dep', 'nonvisual-host', 'dead-module', 'native-owned']) {
  const set = by(b);
  console.log(`${b.toUpperCase().padEnd(15)} ${String(set.length).padStart(4)}`);
}
console.log('\n-- ENGINE DEPENDENCIES (decouple before deleting) --');
for (const r of by('engine-dep')) {
  const flag = OPTIONAL.has(r.id) ? '  [optional — consumer guards absence]' : '';
  console.log(`  ${r.id.padEnd(32)} ${r.live.join(', ')}${flag}`);
}
console.log('\n-- NONVISUAL HOSTS (rehome to body) --');
for (const r of by('nonvisual-host')) console.log(`  ${r.id.padEnd(32)} ${r.live.join(', ')}`);
console.log('\n-- DEAD MODULE ONLY (retire together) --');
for (const r of by('dead-module')) console.log(`  ${r.id.padEnd(32)} ${r.dying.join(', ')}`);
console.log(`\n-- NATIVE-OWNED / no JS reference: ${by('native-owned').length} ids (removable with the markup) --`);
console.log('\nLedger is advisory input to S7-a..f. It asserts nothing.\n');

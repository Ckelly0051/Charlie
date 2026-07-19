/* E3a-6b — AST-based raw-read audit: the SECOND line of defense (§19 item 6b).
   The behavioral tests (e2e-analytics-projection.mjs) are the primary, syntax-proof
   guarantee; this catches a raw read on a surface nobody wrote a behavioral probe
   for. A grep is insufficient — the analytics code already uses optional chaining
   (`p?.tags?.formation`), computed brackets (`p?.tags?.[key]`), aliases
   (`const t = p.tags; t.formation`) and destructuring, all of which evade a string
   match. So we PARSE each file and walk member expressions rooted at a `.tags`
   object.

   For the six projected fields (formation/backfield/strength/coverage/qbAlignment/
   coverageFamily) this FAILS on any resolvable raw read:
     - dot / optional-chain:      X.tags.formation   X?.tags?.formation
     - bracket string literal:    X.tags['formation']
     - alias:                     const t = X.tags; … t.formation
     - destructuring:             const { formation } = X.tags
   and FLAGS every computed `X.tags[expr]` (expr not a string literal) for manual
   classification — it can't be resolved statically, so a human must confirm it
   never routes one of the six fields around StatsEngine.proj. Each flag must be
   ACKnowledged with a reason, or the audit fails (a NEW unreviewed computed read
   is a finding).

   Scan (E3a): the analytics engine, its registry, and the parity harness. The
   allowlist may name ONLY sites inside these scanned files (§19). E3b widens the
   scan to Study/Film Room/export consumers.
   Run: node tools/e2e-raw-read-audit.mjs */
import { parse } from 'acorn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = new Set(['formation', 'backfield', 'strength', 'coverage', 'qbAlignment', 'coverageFamily']);
const FILES = [
  'js/stats-engine.js', 'js/analytics-registry.js', 'tools/e2e-parity.mjs',
  // E3b: analytics DISPLAY/FILTER consumers, added as each is wired. A raw
  // six-field read in any of these is a film-link/analytics divergence.
  'js/heat-maps.js', 'js/advanced-metrics.js', 'js/play-filter.js',
];

// Resolvable raw reads that are LEGITIMATE (must live inside a scanned file). Empty
// today: every six-field read in these files goes through StatsEngine.proj, whose
// own body reads `p.tags` (the object) but none of the six field names.
const ALLOW = [];   // { file, line, field }

// Computed `X.tags[expr]` reads, manually classified as safe (they never route one
// of the six fields around proj). Identity is (file, EXACT expression text, exact
// MULTIPLICITY) — E3a-R4 re-review: text alone is not an AST site, so a DUPLICATE
// of an ACKed expression elsewhere in the same file would inherit the ack silently.
// `count` pins how many times that expression may appear; a duplicate raises the
// count and fails until re-classified, and removing one also fails (stale ACK).
// This is stable under benign edits (text + count unchanged) yet catches the exact
// duplicate/move bypass R4 names — proven by the sensitivity self-test below.
const ACK = [
  { file: 'js/analytics-registry.js', method: '_buildDimensions', code: 'p?.tags?.[key]', count: 1, reason: "generic tag(key) helper — verified never called with any of the six fields (formation/backfield/strength/coverage/qbAlignment/coverageFamily all bind SE.proj explicitly)" },
  { file: 'js/stats-engine.js', method: 'projField', code: 'p.tags[key]', count: 1, reason: "E3b: projField IS the sanctioned by-key projection seam — it returns proj(p)[key] for the six PROJECTED_FIELDS and reaches this raw read ONLY for non-projected keys. Method-scoped (E3b-P5): this same expression text is forbidden in a display method." },
  { file: 'js/advanced-metrics.js', method: 'summarize', code: 'x.play.tags[key]', count: 1, reason: "E3b: EPA groupBy() branches on StatsEngine.PROJECTED_FIELDS — the six go through projField(), and this raw read is reachable ONLY for non-projected keys (playType, down, …), which keep their existing 'Unknown' bucket." },
];

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

// E3b: unwrap optional chaining AND the `||`/`??` fallback idiom. `const t =
// X.tags || {}` is a LogicalExpression, so the rev-1 detector never registered `t`
// as a tags alias and silently missed every six-field read behind it (it hid
// call-sheet-builder, plan-export, breakdown-video, cutup-exporter and
// play-filter). The tags member is the LEFT operand.
const unwrap = (n) => {
  if (!n) return n;
  if (n.type === 'ChainExpression') return unwrap(n.expression);
  if (n.type === 'LogicalExpression') return unwrap(n.left);
  return n;
};
const isTagsMember = (n) => {
  n = unwrap(n);
  return n && n.type === 'MemberExpression' && !n.computed
    && n.property.type === 'Identifier' && n.property.name === 'tags';
};
// The visitor receives the ENCLOSING METHOD name: E3b puts an ALLOWED editor read
// and a FORBIDDEN display read with identical expression text in the same module
// (play-grid `_tendency` vs `_openEditor`/`_applyEdit`), so file+expression alone
// cannot classify them (E3b-P5).
function walk(node, visit, method = '(top)') {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit, method); return; }
  if (typeof node.type === 'string') {
    visit(node, method);
    const named = node.key?.name || node.id?.name;
    const inner = (/Function|MethodDefinition|Property/.test(node.type) && named) ? named : method;
    for (const k in node) {
      if (k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
      const v = node[k];
      if (v && typeof v === 'object') walk(v, visit, inner);
    }
    return;
  }
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
    const v = node[k];
    if (v && typeof v === 'object') walk(v, visit, method);
  }
}

const findings = [];   // hard raw reads
const flags = [];      // computed tags[expr]

/** Scan ONE source string with the real detector. Extracted so a permanent AST
 *  FIXTURE can drive the same parser path the scanned files do — the sensitivity
 *  tests below only exercise classify(), so without this a regression in
 *  unwrap()/isTagsMember() would leave every test green (E3b review finding 3). */
function scanSource(src, rel, sink = { findings, flags }) {
  let ast;
  try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
  catch (e) { return { parseError: e.message }; }

  // Pass 1 — alias identifiers assigned from a `.tags` member (incl. `|| {}`).
  const aliases = new Set();
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isTagsMember(node.init)) {
      aliases.add(node.id.name);
    }
  });
  const findings = sink.findings, flags = sink.flags;

  // Pass 2 — raw reads of the six fields + computed flags.
  walk(ast, (node, method) => {
    if (node.type !== 'MemberExpression' && node.type !== 'VariableDeclarator') return;
    const line = node.loc.start.line;

    // dot / optional-chain: X.tags.FIELD
    if (node.type === 'MemberExpression' && !node.computed
      && node.property.type === 'Identifier' && FIELDS.has(node.property.name)
      && isTagsMember(node.object)) {
      findings.push({ file: rel, line, field: node.property.name, form: 'dot/optional-chain .tags.' + node.property.name });
    }
    // bracket string literal: X.tags['FIELD']
    if (node.type === 'MemberExpression' && node.computed
      && node.property.type === 'Literal' && FIELDS.has(node.property.value)
      && isTagsMember(node.object)) {
      findings.push({ file: rel, line, field: node.property.value, form: "bracket .tags['" + node.property.value + "']" });
    }
    // computed non-literal on .tags → FLAG (identity = exact expression text, so a
    // NEW or MOVED computed read is a distinct, unacknowledged site).
    if (node.type === 'MemberExpression' && node.computed
      && node.property.type !== 'Literal' && isTagsMember(node.object)) {
      flags.push({ file: rel, line, method, code: src.slice(node.start, node.end).replace(/\s+/g, ' ') });
    }
    // alias read: aliasVar.FIELD
    if (node.type === 'MemberExpression' && !node.computed
      && node.property.type === 'Identifier' && FIELDS.has(node.property.name)
      && node.object.type === 'Identifier' && aliases.has(node.object.name)) {
      findings.push({ file: rel, line, field: node.property.name, form: `alias ${node.object.name}.${node.property.name}` });
    }
    // destructuring: const { FIELD, … } = X.tags
    if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern' && isTagsMember(node.init)) {
      for (const prop of node.id.properties) {
        const key = prop.key && (prop.key.name || prop.key.value);
        if (FIELDS.has(key)) findings.push({ file: rel, line, field: key, form: `destructure { ${key} } = .tags` });
      }
    }
  });
  return {};
}

for (const rel of FILES) {
  const res = scanSource(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel);
  if (res.parseError) ok(false, `parse ${rel}`, res.parseError);
}

console.log('\n== E3a raw-read audit (AST) ==');

// PERMANENT PARSER-LEVEL REGRESSION (E3b review finding 3). The sensitivity tests
// below only exercise classify(); a regression in unwrap()/isTagsMember() would
// leave them all green. This fixture drives the REAL detector over the exact
// idioms that must be caught — most importantly `const t = p.tags || {}`, the
// LogicalExpression alias that hid five consumer files from the rev-1 inventory.
// NOTE: each probe uses a DISTINCT alias name on purpose. An earlier version reused
// `t` everywhere, so the ONE bare `const t = p.tags` registered `t` for the whole
// source and the `|| {}` / `?? {}` probes were detected through THAT — the fixture
// passed even with the LogicalExpression fix reverted (found by mutating it).
const FIXTURE = `
  export function probeA(p) { const ta = p.tags || {}; return ta.formation; }      // alias via || {}
  export function probeB(p) { const tb = p?.tags ?? {}; return tb.coverage; }      // alias via ?? {}
  export function probeC(p) { const tc = p.tags; return tc.backfield; }            // bare alias
  export function probeD(p) { return p?.tags?.strength; }                          // optional chain
  export function probeE(p) { return p.tags['qbAlignment']; }                      // bracket literal
  export function probeF(p) { const { coverageFamily } = p.tags; return coverageFamily; } // destructure
  export function probeG(p) { return p.tags.personnel; }                           // NOT one of the six
`;
const fx = { findings: [], flags: [] };
const fxRes = scanSource(FIXTURE, 'FIXTURE', fx);
ok(!fxRes.parseError, 'detector fixture parses');
const fxFields = fx.findings.map(f => f.field).sort();
ok(JSON.stringify(fxFields) === JSON.stringify(['backfield', 'coverage', 'coverageFamily', 'formation', 'qbAlignment', 'strength']),
  'detector catches ALL six raw-read forms incl. the `|| {}` / `?? {}` alias idioms',
  JSON.stringify(fxFields));
ok(fx.findings.some(f => f.form === 'alias ta.formation') && fx.findings.some(f => f.form === 'alias tb.coverage'),
  'detector resolves `const t = X.tags || {}` and `?? {}` as tags ALIASES (the rev-1 blind spot)',
  JSON.stringify(fx.findings.map(f => f.form)));
ok(!fxFields.includes('personnel'), 'detector does not over-report non-projected fields');

// Hard findings, minus the allowlist.
const isAllowed = f => ALLOW.some(a => a.file === f.file && a.line === f.line && a.field === f.field);
const violations = findings.filter(f => !isAllowed(f));
for (const v of violations) console.log(`  FAIL  raw read ${v.file}:${v.line} — ${v.form} (field "${v.field}") must route through StatsEngine.proj`);
ok(violations.length === 0, `zero un-allowlisted raw reads of the six projected fields (found ${findings.length}, allowlisted ${findings.length - violations.length})`);

// Computed flags — classified by (file, expression text) with EXACT MULTIPLICITY,
// validated in BOTH directions (E3a-R4 re-review — the observed-groups-only check
// missed a STALE ACK: if the ACKed expression is removed, no group forms, its
// count:1 is never validated, and the stale approval could later bless a single
// new identical-text read elsewhere):
//   1. every ACK must be observed EXACTLY `count` times — 0 included, so a removed
//      expression fails the ACK as stale (must be deleted from the ACK list);
//   2. every observed computed read must be covered by an ACK.
// Site identity = (file, ENCLOSING METHOD, expression text) + exact multiplicity.
const siteKey = x => `${x.file}\0${x.method}\0${x.code}`;
const classify = (fs) => {
  const bad = [];
  const acked = new Set();
  // Direction 1: ACK → observed count (catches duplicate=up, stale=0, fewer=down).
  for (const a of ACK) {
    acked.add(siteKey(a));
    const n = fs.filter(f => siteKey(f) === siteKey(a)).length;
    if (n !== a.count) {
      const kind = n > a.count ? 'duplicate' : n === 0 ? 'STALE ACK — expression removed/moved, delete it' : 'fewer than acknowledged';
      bad.push({ file: a.file, method: a.method, code: a.code, why: `ACK expects ${a.count} occurrence(s), found ${n} (${kind} — re-classify)` });
    }
  }
  // Direction 2: observed reads with no ACK for that exact site.
  const groups = new Map();
  for (const f of fs) {
    if (!groups.has(siteKey(f))) groups.set(siteKey(f), { file: f.file, method: f.method, code: f.code, lines: [] });
    groups.get(siteKey(f)).lines.push(f.line);
  }
  for (const g of groups.values()) {
    if (!acked.has(siteKey(g))) bad.push({ ...g, why: `no ACK for this expression in ${g.method}()` });
  }
  return bad;
};
const bad = classify(flags);
for (const f of flags) console.log(`  computed ${f.code} at ${f.file}:${f.line}`);
ok(bad.length === 0, `every computed .tags[expr] is acknowledged by exact site + multiplicity (${flags.length} flagged)`,
  bad.map(b => `${b.file} "${b.code}" — ${b.why}`).join('; '));

// PERMANENT sensitivity self-tests (E3a-R4). Each input includes the real ACKed
// read (so the ACK itself is satisfied) plus a probe, and asserts the probe alone
// is caught — proving the ACK neither inherits to nor is bypassed by:
const A = ACK[0];
// A synthetic observation set that satisfies EVERY ACK exactly (count-aware), so a
// probe added to it is the ONLY thing that can fail. Stays correct as ACKs grow.
const baseline = ACK.flatMap(a => Array.from({ length: a.count }, (_, i) =>
  ({ file: a.file, method: a.method, code: a.code, line: 900 + i })));
ok(classify(baseline).length === 0, 'sensitivity baseline: a fully-satisfied ACK set is clean');
// (a) a DIFFERENT computed read in the ACKed file+method.
const differentRead = classify([...baseline, { file: A.file, method: A.method, code: 'p.tags[__unreviewed_expr__]', line: 1 }]);
ok(differentRead.length === 1 && /no ACK/.test(differentRead[0].why),
  'sensitivity: a NEW different computed read in an ACKed file is caught');
// (b) a DUPLICATE of the ACKed expression (the exact bypass text alone would pass).
const duplicateRead = classify([...baseline, { file: A.file, method: A.method, code: A.code, line: 2 }]);
ok(duplicateRead.length === 1 && /found 2/.test(duplicateRead[0].why),
  'sensitivity: a DUPLICATE of the ACKed expression (count 2 > 1) is caught, not inherited');
// (c) a STALE ACK — every ACKed expression GONE (classify([]) must still fail on
//     the unvalidated counts), so a removed read cannot leave a blessing behind.
const staleAck = classify([]);
ok(staleAck.length === ACK.length && staleAck.every(b => /found 0/.test(b.why)),
  'sensitivity: an ACK whose expression is REMOVED (observed 0) fails as stale');
// (d) E3b-P5 — METHOD SCOPING. The SAME expression text in a DIFFERENT method must
//     NOT inherit the ack: play-grid holds an allowed editor read and a forbidden
//     display read with identical text.
const otherMethod = classify([...baseline, { file: A.file, method: '_someDisplayMethod', code: A.code, line: 5 }]);
ok(otherMethod.length === 1 && /_someDisplayMethod/.test(otherMethod[0].why),
  'sensitivity: the SAME expression in a DIFFERENT method is NOT auto-accepted (method-scoped ACK)');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

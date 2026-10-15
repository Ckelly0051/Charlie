/* Parse analytics and display consumers to enforce the shared look-field read.
 * Resolve direct, optional, aliased and destructured tag accesses. Computed
 * accesses require exact method/expression/count acknowledgements; sensitivity
 * probes reject a new site, moved site, duplicate or removed expression. */
import { parse } from 'acorn';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIELDS = new Set(['formationFamily', 'receiverSet', 'backfield', 'strength', 'coverage', 'qbAlignment', 'coverageFamily']);
const FILES = [
  'js/stats-engine.js', 'js/analytics-registry.js', 'tools/e2e-parity.mjs',
  // E3b: analytics DISPLAY/FILTER consumers, added as each is wired. A raw
  // six-field read in any of these is a film-link/analytics divergence.
  'js/advanced-metrics.js', 'js/play-filter.js', 'js/play-grid.js',
  // E3b: exportCsv publishes the six fields to a file the coach opens in Excel and
  // re-imports. A raw read here would ship a CSV that disagrees with every on-screen
  // surface — the same divergence class, just with a longer feedback loop.
  'js/storage.js',
  // E3b: PRESENTATION exports/captions. These may compose alignment+formation into
  // one spoken-call STRING via TagProjection.lookLabel (see tag-projection.js) —
  // that composition is deliberate and lives inside lookLabel, not in these files.
  // A raw `.tags.formationFamily`/`.tags.coverage` etc. read here means the composition
  // was bypassed and a legacy mixed value (e.g. "Shotgun + Trips") would print
  // literally instead of through the projected label.
  'js/call-sheet-builder.js', 'js/plan-export.js', 'js/cutup-exporter.js',
];

// Resolvable raw reads that are LEGITIMATE (must live inside a scanned file). Empty
// today: every six-field read in these files goes through StatsEngine.proj, whose
// own body reads `p.tags` (the object) but none of the six field names.
// Identity is (file, METHOD, field) + exact multiplicity — NOT a line number, which
// every edit above the site would invalidate. Same shape as the computed ACKs.
// (The earlier `_applyEdit` qbAlignment DOT entry is gone: the promote was made
// STRUCTURAL via PROMOTE_ON_COMMIT, so it now reads the sibling by KEY and is
// classified as a computed ACK below. The stale-count check forced this update.)
const ALLOW = [];

/* Computed-read approvals pin file, expression and exact multiplicity.
 * Duplicating or removing an approved read must fail until reclassified. */
const ACK = [
  { file: 'js/analytics-registry.js', method: '_buildDimensions', code: 'p?.tags?.[key]', count: 1, reason: "generic tag(key) helper — verified never called with any of the six fields (formationFamily/receiverSet/backfield/strength/coverage/qbAlignment/coverageFamily all bind SE.proj explicitly)" },
  { file: 'js/stats-engine.js', method: 'projField', code: 'p.tags[key]', count: 1, reason: "E3b: projField IS the sanctioned by-key projection seam — it returns proj(p)[key] for the six PROJECTED_FIELDS and reaches this raw read ONLY for non-projected keys. Method-scoped (E3b-P5): this same expression text is forbidden in a display method." },
  { file: 'js/advanced-metrics.js', method: 'summarize', code: 'x.play.tags[key]', count: 1, reason: "E3b: EPA groupBy() branches on StatsEngine.PROJECTED_FIELDS — the six go through projField(), and this raw read is reachable ONLY for non-projected keys (playType, down, …), which keep their existing 'Unknown' bucket." },
  // PlayGrid presentation reads and native editor seeds go through projField;
  // only the explicit edit commit may write the coach's stored value directly.
  { file: 'js/play-grid.js', method: '_editValues', code: 'play.tags[col.key]', count: 2, reason: "EDITOR writes (an enum column and a free-text detail column such as the RPO defender number): commit the coach's explicit choice to the stored tag. Raw by design — display never writes." },
  // E4-2: the former `_applyEdit` `play.tags[sibling]` ACK (count 2) is GONE on
  // purpose — the promote-then-strip logic moved into
  // TagProjection.reconcileSiblings (tag-projection.js, not a scanned file: it
  // IS the sanctioned seam, same footing as StatsEngine.proj). _applyEdit now
  // calls it as one opaque function; the stale-ACK check caught the removed
  // expression and forced this deletion, exactly the behaviour R4b added.
];

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

/* Unwrap optional chains and logical fallbacks; the tags member is the left
 * operand in X.tags || {} and X.tags ?? {} aliases. */
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
/* Include the enclosing method in site identity: identical expressions can be
 * allowed in editors but forbidden in display methods. */
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

/* Parser fixtures drive the same detector as production-source scans;
 * classify-only tests cannot catch unwrap/isTagsMember regressions. */
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
      findings.push({ file: rel, line, method, field: node.property.name, form: 'dot/optional-chain .tags.' + node.property.name });
    }
    // bracket string literal: X.tags['FIELD']
    if (node.type === 'MemberExpression' && node.computed
      && node.property.type === 'Literal' && FIELDS.has(node.property.value)
      && isTagsMember(node.object)) {
      findings.push({ file: rel, line, method, field: node.property.value, form: "bracket .tags['" + node.property.value + "']" });
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
      findings.push({ file: rel, line, method, field: node.property.name, form: `alias ${node.object.name}.${node.property.name}` });
    }
    // destructuring: const { FIELD, … } = X.tags
    if (node.type === 'VariableDeclarator' && node.id.type === 'ObjectPattern' && isTagsMember(node.init)) {
      for (const prop of node.id.properties) {
        const key = prop.key && (prop.key.name || prop.key.value);
        if (FIELDS.has(key)) findings.push({ file: rel, line, method, field: key, form: `destructure { ${key} } = .tags` });
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

/* Exercise the real parser over optional/logical/destructured aliases. Each
 * probe needs a distinct alias name so one bare alias cannot make broken
 * fallback detection pass. */
const FIXTURE = `
  export function probeA(p) { const ta = p.tags || {}; return ta.formationFamily; }      // alias via || {}
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
ok(JSON.stringify(fxFields) === JSON.stringify(['backfield', 'coverage', 'coverageFamily', 'formationFamily', 'qbAlignment', 'strength']),
  'detector catches ALL six raw-read forms incl. the `|| {}` / `?? {}` alias idioms',
  JSON.stringify(fxFields));
ok(fx.findings.some(f => f.form === 'alias ta.formationFamily') && fx.findings.some(f => f.form === 'alias tb.coverage'),
  'detector resolves `const t = X.tags || {}` and `?? {}` as tags ALIASES (the rev-1 blind spot)',
  JSON.stringify(fx.findings.map(f => f.form)));
ok(!fxFields.includes('personnel'), 'detector does not over-report non-projected fields');

// Hard findings vs the ALLOW list, validated in BOTH directions like the ACKs: an
// allowed site must be observed EXACTLY `count` times (0 => stale entry, more =>
// an unreviewed sibling read slipped in under the same method).
const allowKey = x => `${x.file}\0${x.method}\0${x.field}`;
const allowed = new Set(ALLOW.map(allowKey));
const violations = findings.filter(f => !allowed.has(allowKey(f)));
for (const v of violations) console.log(`  FAIL  raw read ${v.file}:${v.line} [${v.method}] — ${v.form} (field "${v.field}") must route through StatsEngine.proj`);
const allowCountBad = ALLOW.filter(a => findings.filter(f => allowKey(f) === allowKey(a)).length !== a.count);
for (const a of allowCountBad) console.log(`  FAIL  ALLOW ${a.file} ${a.method}() "${a.field}" expects ${a.count}, found ${findings.filter(f => allowKey(f) === allowKey(a)).length}`);
ok(violations.length === 0 && allowCountBad.length === 0,
  `zero un-allowlisted raw reads of the six projected fields (found ${findings.length}, allowlisted ${findings.length - violations.length})`);

/* Validate approvals in both directions: every approval must occur exactly
 * count times, including zero, and every computed read must be approved.
 * Identity includes file, enclosing method and expression. */
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

/* Each self-test supplies the approved read plus a probe, proving the approval
 * does not hide the probe. */
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
/* The same expression in another method must not inherit an approval. */
const otherMethod = classify([...baseline, { file: A.file, method: '_someDisplayMethod', code: A.code, line: 5 }]);
ok(otherMethod.length === 1 && /_someDisplayMethod/.test(otherMethod[0].why),
  'sensitivity: the SAME expression in a DIFFERENT method is NOT auto-accepted (method-scoped ACK)');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

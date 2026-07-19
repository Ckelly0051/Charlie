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
const FILES = ['js/stats-engine.js', 'js/analytics-registry.js', 'tools/e2e-parity.mjs'];

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
  { file: 'js/analytics-registry.js', code: 'p?.tags?.[key]', count: 1, reason: "generic tag(key) helper — the ONLY computed tags read; verified never called with any of the six fields (formation/backfield/strength/coverage/qbAlignment/coverageFamily all bind SE.proj explicitly)" },
];

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const unwrap = n => (n && n.type === 'ChainExpression') ? n.expression : n;
const isTagsMember = (n) => {
  n = unwrap(n);
  return n && n.type === 'MemberExpression' && !n.computed
    && n.property.type === 'Identifier' && n.property.name === 'tags';
};
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) walk(n, visit); return; }
  if (typeof node.type === 'string') visit(node);
  for (const k in node) {
    if (k === 'loc' || k === 'start' || k === 'end' || k === 'range') continue;
    const v = node[k];
    if (v && typeof v === 'object') walk(v, visit);
  }
}

const findings = [];   // hard raw reads
const flags = [];      // computed tags[expr]

for (const rel of FILES) {
  const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  let ast;
  try { ast = parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true }); }
  catch (e) { ok(false, `parse ${rel}`, e.message); continue; }

  // Pass 1 — alias identifiers assigned directly from a `.tags` member.
  const aliases = new Set();
  walk(ast, node => {
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier' && isTagsMember(node.init)) {
      aliases.add(node.id.name);
    }
  });

  // Pass 2 — raw reads of the six fields + computed flags.
  walk(ast, node => {
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
      flags.push({ file: rel, line, code: src.slice(node.start, node.end).replace(/\s+/g, ' ') });
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
}

console.log('\n== E3a raw-read audit (AST) ==');

// Hard findings, minus the allowlist.
const isAllowed = f => ALLOW.some(a => a.file === f.file && a.line === f.line && a.field === f.field);
const violations = findings.filter(f => !isAllowed(f));
for (const v of violations) console.log(`  FAIL  raw read ${v.file}:${v.line} — ${v.form} (field "${v.field}") must route through StatsEngine.proj`);
ok(violations.length === 0, `zero un-allowlisted raw reads of the six projected fields (found ${findings.length}, allowlisted ${findings.length - violations.length})`);

// Computed flags — classified by (file, expression text) with EXACT MULTIPLICITY.
// A group of identical computed reads in a file is acknowledged only when an ACK
// entry names that (file, code) AND its count equals the group size — so a
// duplicate (count up) or a stale ACK (count down) both fail (E3a-R4).
const classify = (fs) => {
  const groups = new Map();   // `${file}\0${code}` -> { file, code, lines:[] }
  for (const f of fs) {
    const key = `${f.file}\0${f.code}`;
    if (!groups.has(key)) groups.set(key, { file: f.file, code: f.code, lines: [] });
    groups.get(key).lines.push(f.line);
  }
  const bad = [];
  for (const g of groups.values()) {
    const ack = ACK.find(a => a.file === g.file && a.code === g.code);
    if (!ack) { bad.push({ ...g, why: 'no ACK for this expression' }); continue; }
    if (ack.count !== g.lines.length) bad.push({ ...g, why: `ACK expects ${ack.count} occurrence(s), found ${g.lines.length} (duplicate/removed — re-classify)` });
  }
  return bad;
};
const bad = classify(flags);
for (const f of flags) console.log(`  computed ${f.code} at ${f.file}:${f.line}`);
ok(bad.length === 0, `every computed .tags[expr] is acknowledged by exact site + multiplicity (${flags.length} flagged)`,
  bad.map(b => `${b.file} "${b.code}" — ${b.why}`).join('; '));

// PERMANENT sensitivity self-test (E3a-R4): the ACK must not inherit to (a) a
// DIFFERENT computed read, nor (b) a DUPLICATE of the ACKed expression. Both must
// be caught. (b) is the exact bypass the re-review named — text alone would pass it.
const ackedSite = ACK[0];   // { file, code, count:1 }
const differentRead = classify([{ file: ackedSite.file, code: 'p.tags[__unreviewed_expr__]', line: 1 }]);
ok(differentRead.length === 1, 'sensitivity: a NEW different computed read in an ACKed file is caught');
const duplicateRead = classify([
  { file: ackedSite.file, code: ackedSite.code, line: 1 },
  { file: ackedSite.file, code: ackedSite.code, line: 2 },   // a second identical site
]);
ok(duplicateRead.length === 1 && /found 2/.test(duplicateRead[0].why),
  'sensitivity: a DUPLICATE of the ACKed expression (count 2 > 1) is caught, not inherited');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

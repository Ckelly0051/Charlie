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
// of the six fields around proj). Identity is (file, EXACT expression text) — NOT
// the filename — so a new/moved/different computed read anywhere in the same file
// is a distinct, unacknowledged site and fails the audit (finding 4).
const ACK = [
  { file: 'js/analytics-registry.js', code: 'p?.tags?.[key]', reason: "generic tag(key) helper — verified never called with any of the six fields (formation/backfield/strength/coverage/qbAlignment/coverageFamily all bind SE.proj explicitly)" },
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

// Computed flags — each must be acknowledged by (file, EXACT expression text).
const isAcked = f => ACK.some(a => a.file === f.file && a.code === f.code);
const unacked = flags.filter(f => !isAcked(f));
for (const f of flags) console.log(`  ${isAcked(f) ? 'ack ' : 'NEW '} computed ${f.code} at ${f.file}:${f.line}`);
ok(unacked.length === 0, `every computed .tags[expr] is acknowledged by exact site (${flags.length} flagged, ${unacked.length} unreviewed)`,
  unacked.map(f => `${f.file}:${f.line} (${f.code})`).join(', '));

// PERMANENT sensitivity self-test (finding 4): the ACK must be site-specific, not
// file-wide — a DIFFERENT computed read in an already-acknowledged file must NOT
// inherit the ack. Synthesize one and assert it classifies as unacknowledged.
const synthetic = { file: 'js/analytics-registry.js', code: 'p.tags[__unreviewed_expr__]' };
ok(!isAcked(synthetic), 'ACK is site-specific: a new computed read in an ACKed file is NOT auto-accepted');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

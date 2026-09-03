/* CSS ownership model — shared by the audit harness and the pruning tool.
 *
 * The question is never "does this string appear somewhere in the repo". It is
 * "can production PRODUCE an element carrying this class". Those differ, and
 * conflating them is what let `.top-bar` (16 occurrences, every one a comment
 * saying it was deleted) and `.stats-overlay` (one occurrence, a querySelector
 * that READS it) survive an earlier sweep as though they were live.
 *
 * PRODUCERS  — class/className attributes, classList.add/toggle/replace,
 *              className assignment, setAttribute('class', …), and the static
 *              parts of any template literal used in those positions. Emitted
 *              HTML strings (print/export paths) count, because they are
 *              class attributes too.
 * READERS    — querySelector/closest/matches/… take a SELECTOR. Reading a class
 *              never creates one; a class only production reads is dead.
 * COMMENTS   — stripped before harvesting. A comment is documentation, and in
 *              this repo it is frequently documentation that the thing is gone.
 * DYNAMIC    — a template fragment ending in `-` immediately before an
 *              interpolation makes its suffix unknowable (`tone-${row.tone}`),
 *              so any class with that prefix is retained, never deleted.
 */
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export const AUDITED = ['css/styles.css', 'css/redesign-stats.css'];

/** Strip line and block comments without disturbing string contents. */
export function stripComments(source) {
  let out = '', i = 0, mode = null, quote = '';
  while (i < source.length) {
    const c = source[i], d = source[i + 1];
    if (mode === null) {
      if (c === '/' && d === '/') { mode = 'line'; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; i += 2; continue; }
      if (c === '"' || c === "'" || c === '`') { mode = 'str'; quote = c; out += c; i++; continue; }
      out += c; i++; continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; i += 2; } else i++; continue; }
    // inside a string
    if (c === '\\') { out += c + (d || ''); i += 2; continue; }
    out += c;
    if (c === quote) mode = null;
    i++;
  }
  return out;
}

const CLASSLIST = /\.classList\.(add|toggle|replace|remove)\(([^)]*)\)/g;

/**
 * Read a balanced `{...}` (or quoted string) after `class=` / `className=`.
 * A regex cannot do this: a JSX class expression contains its own braces via
 * `${...}`, so a non-greedy `\{(.*?)\}` truncates at the first interpolation
 * and silently loses every class after it. That is how `gi-sc-tile`,
 * `rail-row` and `gi-native-toast` first read as unproducible.
 */
function readClassValues(src) {
  const out = [];
  const attr = /\bclass(?:Name)?\s*=\s*/g;
  let m;
  while ((m = attr.exec(src))) {
    let i = m.index + m[0].length;
    const open = src[i];
    if (open === '"' || open === "'") {
      const end = src.indexOf(open, i + 1);
      if (end === -1) continue;
      out.push({ literal: src.slice(i + 1, end) });
      continue;
    }
    if (open !== '{') continue;
    let depth = 0, j = i, quote = null;
    for (; j < src.length; j++) {
      const c = src[j];
      if (quote) {
        if (c === '\\') { j++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
      if (c === '{') depth++;
      else if (c === '}' && --depth === 0) break;
    }
    out.push({ expression: src.slice(i + 1, j) });
  }
  return out;
}
const CLASSNAME_ASSIGN = /\.className\s*(?:\+?=)\s*([^;\n]+)/g;
const SET_ATTR = /setAttribute\(\s*['"]class['"]\s*,\s*([^)]*)\)/g;

/** Collect producible class tokens and dynamic prefixes from production source. */
export function harvestProducers(sources) {
  const classes = new Set();
  const prefixes = new Set();

  const addLiteralRun = text => {
    for (const token of String(text).split(/[\s]+/)) {
      const clean = token.trim();
      if (/^[A-Za-z_][A-Za-z0-9_-]*$/.test(clean)) classes.add(clean);
    }
  };
  // Inside a class-position expression: take static string chunks, and treat a
  // chunk ending in `-` right before an interpolation as an unknowable prefix.
  // Remove balanced `${...}` groups, which may nest and may contain their own
  // template literals -- `gi-sc-tile${row.tone?` tone-${row.tone}`:''}` nests
  // two deep, so a flat /\$\{[^}]*\}/ leaves a mangled token behind.
  const stripInterpolations = expr => {
    let out = '', i = 0;
    while (i < expr.length) {
      if (expr[i] === '$' && expr[i + 1] === '{') {
        let depth = 0, j = i + 1;
        for (; j < expr.length; j++) {
          if (expr[j] === '{') depth++;
          else if (expr[j] === '}' && --depth === 0) break;
        }
        out += ' ';
        i = j + 1;
        continue;
      }
      out += expr[i++];
    }
    return out;
  };
  const addExpression = expr => {
    for (const m of expr.matchAll(/([A-Za-z][A-Za-z0-9_-]*-)\$\{/g)) prefixes.add(m[1]);
    for (const m of expr.matchAll(/([A-Za-z][A-Za-z0-9_-]*-)['"`]\s*\+/g)) prefixes.add(m[1]);
    // Every remaining quoted run is static class text.
    const flat = stripInterpolations(expr);
    for (const m of flat.matchAll(/[`'"]([^`'"]*)[`'"]/g)) addLiteralRun(m[1]);
  };

  for (const raw of sources) {
    const src = stripComments(raw);
    for (const value of readClassValues(src)) {
      if (value.literal !== undefined) addLiteralRun(value.literal);
      else addExpression(value.expression);
    }
    for (const m of src.matchAll(CLASSLIST)) {
      const [method, rawArgs] = [m[1], m[2]];
      const args = splitTopLevel(rawArgs);
      if (method === 'add') args.forEach(addExpression);
      else if (method === 'toggle' && args[0]) addExpression(args[0]);
      else if (method === 'replace' && args[1]) addExpression(args[1]);
      // remove() and replace()'s first argument consume classes; they do not
      // prove that production can ever put those classes on an element.
    }
    for (const m of src.matchAll(CLASSNAME_ASSIGN)) addExpression(m[1]);
    for (const m of src.matchAll(SET_ATTR)) addExpression(m[1]);
    // A class attribute written inside an emitted HTML string, e.g.
    // `<div class="gi-report-row">` built by an export path.
    for (const m of src.matchAll(/class\s*=\s*\\?["']([^"'\\]*)/g)) addLiteralRun(m[1]);
  }
  return { classes, prefixes };
}

/** Ids are produced by id attributes or getElementById-style creation. */
export function harvestIds(sources) {
  const ids = new Set();
  for (const raw of sources) {
    const src = stripComments(raw);
    for (const m of src.matchAll(/\bid\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\})/g)) {
      const v = m[1] ?? m[2] ?? m[3];
      if (v && /^[A-Za-z_][A-Za-z0-9_-]*$/.test(v.trim())) ids.add(v.trim());
    }
    for (const m of src.matchAll(/\.id\s*=\s*['"]([A-Za-z_][A-Za-z0-9_-]*)['"]/g)) ids.add(m[1]);
  }
  return ids;
}

export async function loadProduction(root) {
  const names = (await readdir(resolve(root, 'js'))).filter(n => /\.(js|jsx)$/.test(n));
  const sources = [await readFile(resolve(root, 'index.html'), 'utf8')];
  for (const n of names) sources.push(await readFile(resolve(root, 'js', n), 'utf8'));
  return sources;
}

/** Positive functional selectors are alternatives, but every live member still has to match. */
const FUNCTIONAL_LIST = /:(?:is|where|has|matches|-moz-any|-webkit-any)\(/;
const IGNORED_FUNCTIONAL = /:not\(/;

function sliceGroup(sel, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < sel.length; i++) {
    if (sel[i] === '(') depth++;
    else if (sel[i] === ')' && --depth === 0) return i;
  }
  return sel.length - 1;
}

/** Remove :not() contents -- an absent excluded class cannot make the selector dead. */
export function stripIgnored(sel) {
  let out = sel;
  for (let guard = 0; guard < 60; guard++) {
    const m = IGNORED_FUNCTIONAL.exec(out);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    const close = sliceGroup(out, open);
    out = out.slice(0, m.index) + out.slice(close + 1);
  }
  return out;
}

export function makeProducible({ classes, prefixes, ids }) {
  return (kind, name) => {
    if (kind === 'id') return ids.has(name) ? 'literal' : null;
    if (classes.has(name)) return 'literal';
    for (const p of prefixes) if (name.startsWith(p)) return 'dynamic';
    return null;
  };
}

/**
 * Classify one selector branch.
 * Returns { verdict, missing, deadAlternatives } where deadAlternatives lists
 * positive functional-selector members that can never match and should be
 * pruned from the list.
 */
export function classifyBranch(branch, producible) {
  const deadAlternatives = [];
  let functionalAmbiguous = false;
  let working = stripIgnored(branch);

  // Resolve positive functional groups: the group is satisfiable when at least
  // one alternative is producible. This applies equally to :is(), :where(),
  // and :has(); only :not() is safe to ignore for liveness.
  for (let guard = 0; guard < 40; guard++) {
    const m = FUNCTIONAL_LIST.exec(working);
    if (!m) break;
    const open = m.index + m[0].length - 1;
    const close = sliceGroup(working, open);
    const inner = working.slice(open + 1, close);
    const alts = splitTopLevel(inner);
    const liveAlts = [];
    for (const alt of alts) {
      const result = classifyBranch(alt, producible);
      deadAlternatives.push(...result.deadAlternatives);
      if (result.verdict === 'DEAD') deadAlternatives.push(alt.trim());
      else {
        liveAlts.push(alt);
        if (result.verdict === 'AMBIGUOUS') functionalAmbiguous = true;
      }
    }
    if (liveAlts.length === 0) {
      return { verdict: 'DEAD', missing: alts.map(a => a.trim()), deadAlternatives };
    }
    // Replace the group with a satisfiable placeholder so the rest still parses.
    working = working.slice(0, m.index) + '\u0001' + working.slice(close + 1);
  }

  const ids = requiredIdentifiers(working);
  const missing = ids.filter(i => !producible(i.kind, i.name));
  const soft = ids.filter(i => producible(i.kind, i.name) === 'dynamic');
  return {
    verdict: missing.length ? 'DEAD' : (soft.length || functionalAmbiguous ? 'AMBIGUOUS' : 'LIVE'),
    missing: missing.map(i => (i.kind === 'id' ? '#' : '.') + i.name),
    deadAlternatives,
  };
}

export function splitTopLevel(list) {
  const out = [];
  let depth = 0, cur = '', quote = null, escaped = false;
  for (const ch of list) {
    if (quote) {
      cur += ch;
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    else if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

export function requiredIdentifiers(sel) {
  const bare = stripIgnored(sel);
  const out = [];
  for (const m of bare.matchAll(/\.(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.push({ kind: 'class', name: m[1] });
  for (const m of bare.matchAll(/#(-?[A-Za-z_][A-Za-z0-9_-]*)/g)) out.push({ kind: 'id', name: m[1] });
  return out;
}

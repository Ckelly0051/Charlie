/**
 * PRUNE DEAD CSS (docs/LEGACY-EXCISION-PLAN.md, Pass 1). Removes selector
 * branches the ownership model (tools/css-ownership.mjs) proves DEAD: a branch
 * that requires a class or id no production source can produce. A rule whose
 * branches are all dead is removed; a rule with live branches keeps only them;
 * an @media / @supports block left empty is removed. AMBIGUOUS branches (the
 * model cannot decide) are never touched.
 *
 *   node tools/prune-dead-css.mjs [--apply] [--strict] [css/file.css ...]
 *
 * --strict (always on with --apply): a branch is removed only if the model calls it DEAD *and*
 * none of the identifiers it requires appears ANYWHERE in js/ or index.html,
 * as any token. The model has known blind spots (a class inside a ${cond ?
 * ' x' : ''} expression, a class attribute in an HTML string with an
 * interpolation, class tokens held in value maps), so model-dead alone is not
 * proof; an identifier that appears nowhere in source cannot be produced.
 *
 * Without --apply it only reports. Default: every stylesheet in css/.
 * Proof after applying is tools/compare-builds.mjs (byte-identical screens)
 * and the harnesses for the routes the stylesheet styles.
 */
import postcss from 'postcss';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadProduction, harvestProducers, harvestIds, makeProducible, classifyBranch } from './css-ownership.mjs';

const root = resolve(import.meta.dirname, '..');
const apply = process.argv.includes('--apply');
// Writing is ALWAYS strict (Codex review of f660e09): model-dead alone once
// marked live popover separators and Players column widths as dead.
const strict = apply || process.argv.includes('--strict');
const named = process.argv.slice(2).filter(a => !a.startsWith('--'));
const files = named.length ? named : (await readdir(resolve(root, 'css'))).filter(f => f.endsWith('.css')).map(f => `css/${f}`);

const sources = await loadProduction(root);
const { classes, prefixes } = harvestProducers(sources);
const producible = makeProducible({ classes, prefixes, ids: harvestIds(sources) });
const sourceText = sources.join('\n');
const mentioned = id => new RegExp(`(?<![\\w-])${id.replace(/^[.#]/, '').replace(/[-]/g, '\\-')}(?![\\w-])`).test(sourceText);
const held = [];

let removedRules = 0, trimmedRules = 0, removedBranches = 0;
for (const file of files) {
  const path = resolve(root, file);
  const css = await readFile(path, 'utf8');
  const parsed = postcss.parse(css, { from: file });
  let fileBranches = 0;
  parsed.walkRules(rule => {
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule' && /keyframes/i.test(p.name)) return;
    }
    if (/^:root\b/.test(rule.selector)) return;
    const verdicts = rule.selectors.map(branch => {
      const r = classifyBranch(branch, producible);
      if (r.verdict === 'DEAD' && strict && (r.missing || []).some(mentioned)) { held.push(`${file}: ${branch}`); return { branch, verdict: 'HELD' }; }
      return { branch, verdict: r.verdict };
    });
    const dead = verdicts.filter(v => v.verdict === 'DEAD');
    if (!dead.length) return;
    fileBranches += dead.length;
    if (dead.length === verdicts.length) { rule.remove(); removedRules++; }
    else { rule.selectors = verdicts.filter(v => v.verdict !== 'DEAD').map(v => v.branch); trimmedRules++; }
  });
  // Blocks left with nothing inside.
  let emptied = true;
  while (emptied) {
    emptied = false;
    parsed.walkAtRules(at => {
      if (/^(media|supports|container|layer)$/i.test(at.name) && at.nodes && !at.nodes.some(n => n.type !== 'comment')) { at.remove(); emptied = true; }
    });
  }
  removedBranches += fileBranches;
  if (fileBranches) {
    console.log(`${file}: ${fileBranches} dead branch${fileBranches === 1 ? '' : 'es'}`);
    if (apply) await writeFile(path, parsed.toString());
  }
}
if (strict && held.length) console.log(`\nHeld (model-dead, but an identifier appears in source; review by hand): ${held.length}`);
console.log(`\n${removedBranches} dead branches: ${removedRules} rules removed, ${trimmedRules} rules trimmed${apply ? ' (applied)' : ' (report only; --apply to write)'}`);

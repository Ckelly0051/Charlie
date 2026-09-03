/* CSS ownership guard.
 *
 * Every selector branch in the audited stylesheets must have a production
 * presentation owner. A branch is DEAD when an identifier it REQUIRES cannot be
 * produced by any class/id-producing site in production source.
 *
 * This exists because "the stylesheet is reachable from the Vite graph" is not
 * the same as "its rules can match", and because a text search for a class name
 * is not the same as a producer: `.top-bar` once survived a sweep with sixteen
 * occurrences in production source, every one of them a comment recording that
 * the top bar had been deleted, and `.stats-overlay` survived with a single
 * occurrence that was a querySelector READING it. The model in
 * tools/css-ownership.mjs separates producers from readers and comments.
 *
 * Run: node tools/e2e-css-ownership.mjs        (add --list to print branches) */
import postcss from 'postcss';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  AUDITED, loadProduction, harvestProducers, harvestIds, makeProducible, classifyBranch,
} from './css-ownership.mjs';

const root = resolve(import.meta.dirname, '..');
const list = process.argv.includes('--list');
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const sources = await loadProduction(root);
const { classes, prefixes } = harvestProducers(sources);
const ids = harvestIds(sources);
const producible = makeProducible({ classes, prefixes, ids });

console.log(`producers: ${classes.size} classes, ${ids.size} ids, ${prefixes.size} dynamic prefixes`);

const totals = { branches: 0, live: 0, ambiguous: 0, dead: 0, deadAlts: 0 };
const deadBranches = [];
const deadAlternatives = [];

for (const file of AUDITED) {
  const css = await readFile(resolve(root, file), 'utf8');
  const parsed = postcss.parse(css, { from: file });
  const fileDead = [];
  parsed.walkRules(rule => {
    for (let p = rule.parent; p && p.type !== 'root'; p = p.parent) {
      if (p.type === 'atrule' && /keyframes/i.test(p.name)) return;
    }
    if (/^:root\b/.test(rule.selector)) return;
    for (const branch of rule.selectors) {
      totals.branches++;
      const r = classifyBranch(branch, producible);
      if (r.verdict === 'DEAD') { totals.dead++; fileDead.push({ file, line: rule.source.start.line, branch, missing: r.missing }); }
      else if (r.verdict === 'AMBIGUOUS') totals.ambiguous++;
      else totals.live++;
      for (const alt of r.deadAlternatives) {
        totals.deadAlts++;
        deadAlternatives.push({ file, line: rule.source.start.line, branch, alt });
      }
    }
  });
  deadBranches.push(...fileDead);
  console.log(`  ${file}: ${fileDead.length} dead branches`);
}

console.log(`\nbranches ${totals.branches}  live ${totals.live}  ambiguous ${totals.ambiguous}  dead ${totals.dead}  dead :is() alternatives ${totals.deadAlts}`);

if (list) {
  for (const d of deadBranches.slice(0, 60)) console.log(`  DEAD ${d.file}:${d.line}  ${d.branch}  (${d.missing.join(',')})`);
  for (const d of deadAlternatives.slice(0, 60)) console.log(`  DEAD-ALT ${d.file}:${d.line}  ${d.alt}  in  ${d.branch}`);
}

ok(classes.size > 500 && ids.size > 50,
  'production class/id producers are harvested from real producing sites',
  JSON.stringify({ classes: classes.size, ids: ids.size }));
ok(totals.dead === 0,
  'every selector branch in the audited stylesheets has a production owner',
  deadBranches.slice(0, 6).map(d => `${d.file}:${d.line} ${d.branch}`).join(' | '));
ok(totals.deadAlts === 0,
  'no :is()/:matches() list carries an alternative production can never produce',
  deadAlternatives.slice(0, 6).map(d => `${d.file}:${d.line} ${d.alt}`).join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

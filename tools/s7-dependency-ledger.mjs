/* S7-d0 DEPENDENCY LEDGER — tree-aware, read-only, ADVISORY ONLY.
 *
 * WHY THIS WAS REBUILT
 *
 * The first version regex-matched raw HTML for ids and classified each id in
 * isolation. It was wrong twice, in ways that would have deleted working code:
 *
 *   1. It matched only `getElementById('literal')`, `querySelector('#literal')`
 *      and `'#id'` strings. play-tagger.js:133 holds a `fieldMap` of BARE id
 *      strings resolved in a loop, so all 22 tag-form chip groups — the entire
 *      E1-E4 tag model — read as "no JS reference" and were listed as
 *      removable. It also never matched `querySelectorAll(`.
 *   2. After that repair its three remaining "removable" ids were all
 *      UNREFERENCED PARENTS OF LIVE CHILDREN: `timelineStrip` owns the live
 *      `timelineBar`, `motionGraph` owns `motionGraphCanvas`, and
 *      `legacyGameContextState` owns six live game-context inputs. Classifying
 *      ids individually is meaningless when deletion removes a subtree.
 *
 * So: a real DOM, whole-tree propagation, and evidence beyond ids.
 *
 * WHAT IT DOES
 *
 *   - Parses the AUTHORED index.html through a real DOMParser (no regex over
 *     markup) to get the `#app` element tree as written.
 *   - Boots the BUILT app and snapshots the RUNTIME tree, so descendants that
 *     only exist after mount (Film Room grid rows, injected custom chips) are
 *     counted. Elements adopted out of #app at runtime are still tracked by
 *     their authored position.
 *   - Scores every element against reference evidence: literal ids, selector
 *     strings, bare quoted ids, class navigation, [name=] and [data-] hooks,
 *     and template-built id prefixes.
 *   - PROPAGATES: an element is removable only when it has no evidence of its
 *     own AND every descendant is removable. Output is maximal removable
 *     SUBTREE ROOTS, not a list of ids.
 *
 * WHAT IT IS NOT
 *
 * Not deletion authority. Per the S7-d consultation, static and runtime
 * evidence are advisory: every production checkpoint must cold-start the built
 * app with its retired markup ABSENT. Removing nodes after boot proves nothing,
 * because controllers hold detached references.
 *
 * Usage: node tools/s7-dependency-ledger.mjs [--verbose]
 */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const VERBOSE = process.argv.includes('--verbose');
const rawHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ---------------------------------------------------------------- sources --
const jsDir = path.join(ROOT, 'js');
const sources = new Map(
  fs.readdirSync(jsDir).filter(f => /\.(js|jsx)$/.test(f))
    .map(f => [f, fs.readFileSync(path.join(jsDir, f), 'utf8')]));

/** Every quoted string literal and template chunk in the JS sources. */
function collectEvidence() {
  const idLiterals = new Map();       // id -> [files]      exact reference
  const classHooks = new Map();       // class -> [files]   .foo in a selector
  const attrHooks = new Map();        // attr -> [files]    [name=x] / [data-x]
  const idPrefixes = new Map();       // prefix -> [files]  `tagGrade${role}`
  const add = (map, key, file) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(file);
  };

  for (const [file, body] of sources) {
    // Quoted strings, including template literals (kept raw so we can see ${).
    for (const m of body.matchAll(/(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g)) {
      const s = m[2];
      if (!s || s.length > 400) continue;

      // A template literal that builds an id: `tagGrade${role}` — record the
      // literal prefix, because every id starting with it may be reachable.
      const tpl = s.match(/^([A-Za-z][\w-]*)\$\{/);
      if (m[1] === '`' && tpl) add(idPrefixes, tpl[1], file);
      const tplSel = s.match(/#([A-Za-z][\w-]*)\$\{/);
      if (m[1] === '`' && tplSel) add(idPrefixes, tplSel[1], file);

      // #id anywhere in a selector string (compound and comma lists included).
      for (const sel of s.matchAll(/#([A-Za-z][\w-]*)/g)) add(idLiterals, sel[1], file);

      // A bare id-shaped string: the fieldMap case that broke the first ledger.
      if (/^[A-Za-z][\w-]*$/.test(s)) add(idLiterals, s, file);

      // Class navigation: '.pick', '.st-field', closest('.tag-group')...
      for (const cls of s.matchAll(/\.([a-z][\w-]*)/gi)) {
        // Only treat it as a selector when the string looks like one.
        if (/[.#\[]/.test(s) && !/\.(js|jsx|css|html|json|mjs|png|mp4|mov)$/i.test(s)) {
          add(classHooks, cls[1], file);
        }
      }

      // [name="x"], [data-foo], [data-foo="y"]
      for (const at of s.matchAll(/\[\s*([\w-]+)\s*(?:[~|^$*]?=|\])/g)) add(attrHooks, at[1], file);
    }
    // getElementById(VAR) — a generic resolver. Recorded so the report can say
    // the inventory is not closed by literals alone.
    if (/getElementById\(\s*[A-Za-z_$]/.test(body)) add(attrHooks, '::dynamic-getElementById', file);
  }
  return { idLiterals, classHooks, attrHooks, idPrefixes };
}

const evidence = collectEvidence();
const asObj = map => Object.fromEntries([...map].map(([k, v]) => [k, [...v]]));

// ---------------------------------------------------------------- the DOM --
const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.workspaceShell, { timeout: 20000 });

// Reach the routes that mount legacy-adjacent markup, so runtime-generated
// descendants exist in the snapshot rather than being invisible to it.
await page.evaluate(async () => {
  try {
    await window.app.storage.loadDemoSeason();
    // V2-A: no per-row Open button -- preview the row, then Continue charting.
    const row = document.querySelector('.ws-game-row');
    if (row) row.click();
    document.getElementById('wsContinueCharting')?.click();
  } catch (e) {}
});
await new Promise(r => setTimeout(r, 1200));
try { await page.evaluate(() => window.app.workspaceShell.show('breakdown')); } catch (e) {}
await new Promise(r => setTimeout(r, 900));

const report = await page.evaluate((rawHtml, ev) => {
  const idLiterals = new Set(Object.keys(ev.idLiterals));
  const classHooks = new Set(Object.keys(ev.classHooks));
  const attrHooks = new Set(Object.keys(ev.attrHooks));
  const idPrefixes = Object.keys(ev.idPrefixes);

  // 1. AUTHORED tree — a real parser, not a regex over markup.
  const authored = new DOMParser().parseFromString(rawHtml, 'text/html');
  const appAuthored = authored.getElementById('app');

  // 2. RUNTIME tree — plus anything authored inside #app that has since been
  //    adopted elsewhere (the media subtree lives in the native theater).
  const runtimeRoots = [];
  const live = document.getElementById('app');
  if (live) runtimeRoots.push(live);

  const why = el => {
    const reasons = [];
    const id = el.id || '';
    if (id && idLiterals.has(id)) reasons.push(`id:${id}`);
    if (id && idPrefixes.some(p => id !== p && id.startsWith(p))) reasons.push(`id-prefix:${id}`);
    for (const c of el.classList || []) if (classHooks.has(c)) { reasons.push(`class:.${c}`); break; }
    for (const a of el.getAttributeNames?.() || []) {
      if (a === 'name' && attrHooks.has('name')) { reasons.push('attr:[name]'); break; }
      if (a.startsWith('data-') && attrHooks.has(a)) { reasons.push(`attr:[${a}]`); break; }
    }
    return reasons;
  };

  // Removability propagates in BOTH directions, and the second one is the half
  // the first ledger missed:
  //
  //   UP   — a parent is held open by any live descendant. #legacyGameContextState
  //          has no reference of its own but owns six live game-context inputs.
  //   DOWN — a child of a live element BELONGS to it. An <option> inside
  //          #gamePerspective, or the <svg> inside a bound button, is not
  //          independently deletable just because nothing names it.
  //
  // With both applied, nothing inside a referenced #app is independently
  // removable — which is the honest answer. #app comes out when the owners
  // inside it have been retired by S7-d1..d7, not before.
  const walk = (el, depth = 0, ancestorLive = false) => {
    const reasons = why(el);
    const selfLive = reasons.length > 0;
    const kids = [...el.children].map(k => walk(k, depth + 1, ancestorLive || selfLive));
    const blockedByChild = kids.some(k => !k.removable);
    const removable = !selfLive && !blockedByChild && !ancestorLive;
    return {
      id: el.id || '', tag: el.tagName.toLowerCase(),
      cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 60),
      reasons, removable, blockedByChild, selfLive, ancestorLive, kids, depth,
      descendants: kids.reduce((n, k) => n + 1 + k.descendants, 0),
    };
  };

  const authoredTree = appAuthored ? walk(appAuthored) : null;
  const runtimeTree = live ? walk(live) : null;

  // Maximal removable roots: removable, whose parent is not removable.
  const roots = [];
  const collect = (node, parentRemovable) => {
    if (node.removable && !parentRemovable) roots.push(node);
    node.kids.forEach(k => collect(k, node.removable || parentRemovable));
  };
  if (authoredTree) collect(authoredTree, false);

  // Every authored id, and whether it is blocked by itself or by a descendant.
  const flat = [];
  const flatten = node => { flat.push(node); node.kids.forEach(flatten); };
  if (authoredTree) flatten(authoredTree);

  // Runtime-only descendants: present after boot, absent from the authored
  // markup. These are exactly what a static inventory cannot see.
  const authoredIds = new Set(flat.map(n => n.id).filter(Boolean));
  const runtimeOnly = [];
  const scanRuntime = node => {
    if (node.id && !authoredIds.has(node.id)) runtimeOnly.push(node.id);
    node.kids.forEach(scanRuntime);
  };
  if (runtimeTree) scanRuntime(runtimeTree);

  // Upward propagation (a parent held open by a live child) is REDUNDANT today,
  // because #app is itself referenced and downward propagation already blocks
  // everything inside it. It only becomes load-bearing at S7-d8, when #app is
  // no longer referenced. So it is checked against a synthetic detached tree
  // whose root is unreferenced — otherwise the self-test would pass for the
  // wrong reason, which is the exact defect this ledger exists to catch.
  const synth = document.createElement('div');
  synth.className = 's7-synthetic-probe';           // deliberately unreferenced
  const synthParent = document.createElement('div');
  synthParent.className = 's7-synthetic-parent';    // deliberately unreferenced
  const synthChild = document.createElement('input');
  synthChild.id = 'tagYardage';                     // genuinely referenced
  synthParent.appendChild(synthChild);
  synth.appendChild(synthParent);
  const synthTree = walk(synth);
  const synthetic = {
    rootRemovable: synthTree.removable,
    rootBlockedByChild: synthTree.blockedByChild,
    parentRemovable: synthTree.kids[0].removable,
    childLive: synthTree.kids[0].kids[0].reasons.length > 0,
  };

  return {
    synthetic,
    authoredPresent: !!appAuthored,
    livePresent: !!live,
    totalElements: flat.length,
    totalIds: flat.filter(n => n.id).length,
    blockedSelf: flat.filter(n => n.reasons.length).length,
    blockedByChildOnly: flat.filter(n => !n.reasons.length && n.blockedByChild).length,
    removableElements: flat.filter(n => n.removable).length,
    roots: roots.map(n => ({ id: n.id, tag: n.tag, cls: n.cls, descendants: n.descendants })),
    runtimeOnly: [...new Set(runtimeOnly)],
    reasonSample: flat.filter(n => n.id && n.reasons.length)
      .map(n => ({ id: n.id, reasons: n.reasons })),
    childBlocked: flat.filter(n => n.id && !n.reasons.length && n.blockedByChild)
      .map(n => ({ id: n.id, descendants: n.descendants })),
    // The ids that hold #app open, each with the modules that reference it.
    // This is the S7-d1..d7 worklist: retire the owner, then the markup.
    blocking: flat.filter(n => n.id && n.reasons.length)
      .map(n => ({ id: n.id, owners: ev.idLiterals[n.id] || ev.idLiterals[n.id.replace(/\d+$/, '')] || [] })),
  };
}, rawHtml, {
  idLiterals: asObj(evidence.idLiterals),
  classHooks: asObj(evidence.classHooks),
  attrHooks: asObj(evidence.attrHooks),
  idPrefixes: asObj(evidence.idPrefixes),
});

await browser.close();

// ------------------------------------------------------------------ output --
const line = '-'.repeat(72);
console.log('\n== S7-d0 DEPENDENCY LEDGER (tree-aware) ==\n');
if (!report.authoredPresent) {
  console.log('No #app in index.html — the shell deletion is complete.\n');
  process.exit(0);
}
console.log(`elements inside #app (authored)     ${String(report.totalElements).padStart(5)}`);
console.log(`  of which carry an id              ${String(report.totalIds).padStart(5)}`);
console.log(`blocked by their OWN reference      ${String(report.blockedSelf).padStart(5)}`);
console.log(`blocked ONLY by a live descendant   ${String(report.blockedByChildOnly).padStart(5)}`);
console.log(`removable elements                  ${String(report.removableElements).padStart(5)}`);
console.log(`removable SUBTREE ROOTS             ${String(report.roots.length).padStart(5)}`);

console.log(`\n${line}\nREMOVABLE SUBTREE ROOTS — advisory, never deletion authority`);
if (!report.roots.length) {
  console.log('  (none)');
  console.log('  Expected while #app itself is referenced: a child of a live element');
  console.log('  belongs to it. #app comes out when S7-d1..d7 have retired the owners');
  console.log('  inside it — not by carving pieces out from underneath them.');
}
for (const r of report.roots) {
  const label = r.id ? '#' + r.id : `${r.tag}${r.cls ? '.' + r.cls.split(/\s+/)[0] : ''}`;
  console.log(`  ${label.padEnd(34)} ${r.descendants} descendant(s)`);
}

// The worklist: who still holds #app open. Grouped by owning module so it maps
// onto the S7-d1..d7 checkpoints instead of being a flat id dump.
const byOwner = new Map();
for (const b of report.blocking) {
  const key = (b.owners.length ? b.owners : ['(structural / no module)']).join(', ');
  if (!byOwner.has(key)) byOwner.set(key, []);
  byOwner.get(key).push(b.id);
}
console.log(`\n${line}\nWHAT HOLDS #app OPEN — the S7-d1..d7 worklist`);
console.log(`${report.blocking.length} referenced ids across ${byOwner.size} owner group(s).`);
console.log('Retire the OWNER first; the markup follows.\n');
for (const [owner, ids] of [...byOwner].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${owner}`);
  console.log(`    ${ids.join(', ')}`);
}

console.log(`\n${line}\nUNREFERENCED PARENTS HELD OPEN BY A LIVE DESCENDANT`);
console.log('These read as "no JS reference" and are NOT removable. Deleting one');
console.log('takes its live children with it — the defect that stopped S7-d.');
for (const n of report.childBlocked) console.log(`  #${n.id.padEnd(33)} ${n.descendants} descendant(s)`);

if (report.runtimeOnly.length) {
  console.log(`\n${line}\nRUNTIME-ONLY IDS (exist after boot, absent from index.html)`);
  console.log('A static inventory cannot see these at all.');
  for (const id of report.runtimeOnly) console.log(`  #${id}`);
}

const dyn = evidence.attrHooks.get('::dynamic-getElementById');
if (dyn) {
  console.log(`\n${line}\n⚠ GENERIC RESOLVERS — getElementById(<variable>) in:`);
  console.log(`  ${[...dyn].join(', ')}`);
  console.log('  Ids reached this way cannot be enumerated from source. This is why');
  console.log('  the inventory is advisory and every checkpoint must cold-boot with');
  console.log('  the retired markup ABSENT.');
}

if (VERBOSE) {
  console.log(`\n${line}\nPER-ID EVIDENCE`);
  for (const n of report.reasonSample) console.log(`  #${n.id.padEnd(33)} ${n.reasons.join(', ')}`);
}

console.log(`\n${line}`);
console.log('Advisory input to S7-d1..d8. It asserts nothing and changes nothing.');
console.log('Deletion authority is a cold boot of the built app with the markup gone.\n');

// --------------------------------------------------------------- self-test --
// The ledger was wrong twice in ways that would have deleted working code, so
// it checks itself against those exact defects. Same discipline as
// `run-gate.sh --self-test`: an instrument nobody has watched fail is not an
// instrument. `--self-test` exits non-zero if any invariant breaks.
if (process.argv.includes('--self-test')) {
  const blockingIds = new Set(report.blocking.map(b => b.id));
  const childBlockedIds = new Set(report.childBlocked.map(n => n.id));
  const cases = [
    ['bare ids resolved through a map are seen as referenced (play-tagger fieldMap)',
      ['tagQbAlignment', 'tagBackfield', 'tagStrength', 'tagCoverage', 'tagBlitz', 'tagPlayType']
        .every(id => blockingIds.has(id))],
    // Fixture-independent: naming specific ids went stale twice as S7-d moved
    // markup (legacyGameContextState at d1, timelineStrip at d2). What matters
    // is that the report SURFACES unreferenced parents holding live children —
    // the class that stopped S7-d — not which ones exist this week.
    ['unreferenced parents of live children are reported, not hidden',
      report.childBlocked.length > 0
      && report.childBlocked.some(n => n.descendants > 0)
      && report.childBlocked.every(n => !n.reasons?.length)],
    // Load-bearing only once #app stops being referenced, so it is probed on a
    // synthetic unreferenced root. Without this the case above passes because
    // DOWNWARD propagation already blocks everything — the wrong reason.
    ['upward propagation blocks an unreferenced parent of a live child',
      report.synthetic.childLive === true &&
      report.synthetic.parentRemovable === false &&
      report.synthetic.rootBlockedByChild === true &&
      report.synthetic.rootRemovable === false],
    ['nothing inside a referenced #app is independently removable',
      report.roots.length === 0],
    ['runtime-generated descendants are visible to the inventory',
      report.runtimeOnly.length > 0],
    ['generic getElementById(<variable>) resolvers are disclosed',
      !!evidence.attrHooks.get('::dynamic-getElementById')],
  ];
  let bad = 0;
  console.log(`${line}\nSELF-TEST`);
  for (const [name, okd] of cases) {
    console.log(`  ${okd ? 'PASS' : 'FAIL'}  ${name}`);
    if (!okd) bad++;
  }
  console.log(`\n  ${bad} bad\n`);
  process.exit(bad ? 1 : 0);
}

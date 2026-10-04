/**
 * ROUND TRIP (docs/archive/plans/LEGACY-EXCISION-PLAN.md, Phase 0; source switched in Pass 2
 * step 6). The canonical current-format 2025 JV fixture (test-only charting
 * conversion; not the coach's mapping decisions) is adopted through the real
 * import path, persisted, the page reloaded and the season reopened from
 * storage; then saved again with no change and reopened again. The pre-conversion
 * Documents mirror copy is refused by that same import path (step 6). What a
 * reader, writer or migration does to stored data shows up here as a named
 * difference, before any smoke.
 *
 *   1. The season survives save and reopen unchanged.
 *   2. A save with no change changes nothing (idempotent).
 *   3. Every field of every play (tags, specialTeams, penalties, notes,
 *      players, grades, film identity) matches the ORIGINAL FILE, except the
 *      transforms the app documents (listed below).
 * Run:  node tools/e2e-legacy-roundtrip.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { LIVE_CATALOG } from './audit-legacy.mjs';
import { CANONICAL_SEASON, CANONICAL_SOURCE_MIRROR } from './canonical-season.mjs';
import { SeasonFormat } from '../js/season-format.js';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

if (!existsSync(LIVE_CATALOG) || !existsSync(CANONICAL_SEASON)) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') { console.log('  SKIP  canonical season absent (GIQ_REALDATA_OPTIONAL=1)'); console.log('\n== RESULT: 0 passed, 0 failed =='); process.exit(0); }
  ok(false, 'live catalog and canonical fixture present', `${LIVE_CATALOG}; ${CANONICAL_SEASON}`);
  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`); process.exit(1);
}
const hashBefore = createHash('sha256').update(readFileSync(LIVE_CATALOG)).digest('hex');
const fixtureBytes = readFileSync(CANONICAL_SEASON);
const fixtureHash = createHash('sha256').update(fixtureBytes).digest('hex');
const source = JSON.parse(fixtureBytes.toString('utf8'));
const sourcePlays = source.games.reduce((n, g) => n + (g.plays || []).length, 0);
ok(SeasonFormat.isCurrentSeason(source), 'the canonical fixture is in the current format');

// Fields a save legitimately stamps; they carry no charted data.
const VOLATILE = new Set(['revision', 'savedAt', 'updatedAt', 'lastSaved', 'lastOpened', 'modified']);
const strip = value => JSON.parse(JSON.stringify(value, (key, v) => (VOLATILE.has(key) ? undefined : v)));
function diff(a, b, at = '', out = []) {
  if (out.length > 12) return out;
  if (a === b) return out;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== 'object') { out.push(`${at || '(root)'}: ${JSON.stringify(a)?.slice(0, 60)} -> ${JSON.stringify(b)?.slice(0, 60)}`); return out; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diff(a[k], b[k], at ? `${at}.${k}` : k, out);
  return out;
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const boot = async () => {
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.app?.teamHubScreen && !!window.app?.storage, { timeout: 20000 });
};
await boot();

const adopted = await page.evaluate(async data => {
  const app = window.app, store = app.storage.seasonStore;
  await app.storage.createSeason({ name: 'Roundtrip', team: 'Mavericks', year: '2025' });
  const result = await store.adopt(JSON.parse(JSON.stringify(data)));
  await store.drainWrites?.();
  return { ok: result.ok, id: store.currentSeasonId, data: JSON.parse(JSON.stringify(store.data)) };
}, source);
ok(adopted.ok, 'the canonical season imports through the real adopt path');

if (existsSync(CANONICAL_SOURCE_MIRROR)) {
  const old = JSON.parse(readFileSync(CANONICAL_SOURCE_MIRROR, 'utf8'));
  const refused = await page.evaluate(async data => (await window.app.storage.seasonStore.adopt(data)).oldFormat === true, old);
  ok(refused, 'the pre-conversion mirror copy is refused as an old format');
}

const reopen = async id => {
  await boot();
  return page.evaluate(async sid => {
    const app = window.app;
    const opened = await app.storage.openSeasonById(sid);
    return { opened, data: JSON.parse(JSON.stringify(app.storage.seasonStore.data)) };
  }, id);
};

console.log('\n== 1. Save and reopen: unchanged ==');
const first = await reopen(adopted.id);
ok(first.opened !== false && first.data, 'the season reopens from storage after a reload');
const d1 = diff(strip(adopted.data), strip(first.data));
ok(!d1.length, 'the reopened season equals the imported one', d1.join(' | '));

console.log('\n== 2. A save with no change changes nothing ==');
await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  await store.persist(store.currentSeasonId, store.data);
  await store.drainWrites?.();
});
const second = await reopen(adopted.id);
const d2 = diff(strip(first.data), strip(second.data));
ok(!d2.length, 'a second save and reopen is identical to the first', d2.join(' | '));

console.log('\n== 3. Every play\'s tags survive as imported ==');
// Documented transforms (CLAUDE.md > Binding data rules): a Special Teams play
// may not hold the look fields (SeasonStore.ST_ALIGNMENT_KEYS, stripped at every
// save). Nothing else may move.
const ST_KEYS = await page.evaluate(() => window.app.storage.seasonStore.constructor.ST_ALIGNMENT_KEYS);
const expectTags = play => {
  const t = JSON.parse(JSON.stringify(play.tags || {}));
  if ((t.unit || 'offense') === 'special') for (const k of ST_KEYS) if (t[k]) t[k] = '';
  return t;
};
// The first save also writes the tag schema's empty defaults for fields a
// legacy play never had (playCall: '', ...). That fills a gap with nothing; it
// changes no charted value. So: every value a play HAD survives exactly, and a
// field it lacked may appear only empty.
const isEmpty = v => v === '' || v == null || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v && !Object.keys(v).length);
const changed = [], defaulted = new Set();
let total = 0;
for (const game of source.games) {
  const saved = second.data.games.find(g => g.id === game.id);
  for (const play of game.plays) {
    total++;
    const want = expectTags(play), got = saved?.plays.find(p => p.id === play.id)?.tags ?? {};
    const bad = [];
    for (const k of new Set([...Object.keys(want), ...Object.keys(got)])) {
      if (!(k in want)) { if (isEmpty(got[k])) defaulted.add(k); else bad.push(`${k}: (absent) -> ${JSON.stringify(got[k])}`); continue; }
      const d = diff(want[k], got[k], k);
      if (d.length) bad.push(...d);
    }
    // Every other field of the play, against the ORIGINAL file, not only the
    // post-import state (Codex review, 2026-09-25): specialTeams, penalties,
    // notes, players, grades, timestamps and film identity must survive import,
    // save and reopen exactly; a field the play lacked may appear only empty.
    const savedPlay = saved?.plays.find(p => p.id === play.id) ?? {};
    for (const k of new Set([...Object.keys(play), ...Object.keys(savedPlay)])) {
      if (k === 'tags') continue;
      if (!(k in play)) { if (isEmpty(savedPlay[k])) defaulted.add('play.' + k); else bad.push(`play.${k}: (absent) -> ${JSON.stringify(savedPlay[k])?.slice(0, 60)}`); continue; }
      const d = diff(play[k], savedPlay[k], 'play.' + k);
      if (d.length) bad.push(...d);
    }
    if (bad.length) changed.push(`${game.name} #${play.id}: ${bad.slice(0, 2).join('; ')}`);
  }
}
console.log(`        empty schema defaults added: ${[...defaulted].sort().join(', ') || 'none'}`);
ok(total === sourcePlays && total > 400, `all ${total} plays of the real season were compared`, String(total));
ok(!changed.length, 'every field of every play survives import, save and reopen against the original file; only empty schema defaults and the documented Special Teams strip differ', `${changed.length} changed: ${changed.slice(0, 6).join(' | ')}`);

ok(createHash('sha256').update(readFileSync(LIVE_CATALOG)).digest('hex') === hashBefore, 'the live catalog is unchanged');
ok(createHash('sha256').update(readFileSync(CANONICAL_SEASON)).digest('hex') === fixtureHash, 'the canonical fixture is unchanged');
ok(!errors.length, 'no page errors', errors.slice(0, 3).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

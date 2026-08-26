import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* DATA-INTEGRITY STRESS HARNESS — the test the suite was missing.
   Loads COPIES of the coach's real seasons into the built bundle (headless,
   isolated storage — never touches AppData/Documents) and fuzzes the REAL data
   path: switchToGame, restoreBackup, newGame, removeGame, addFiles, tag edits,
   commitActive, persist+reload, plus a "diabolical" desync that points the active
   pointer at a different game and commits. After EVERY operation it re-checks:
     - INTEGRITY : activeGameId valid; no dup game/play ids; NO two games share a
                   clip name (the cross-game-corruption signature).
     - ISOLATION : an op declares which game(s) it may change; every OTHER game
                   must be byte-identical before/after. (This is what would have
                   caught commitActive writing one game's plays into another.)
     - ROUNDTRIP : re-normalizing never drops a game or changes a play count.
     - NO-THROW  : no exception or console error during the op or any render.
   Seeded + reproducible; logs the exact op sequence on the first violation.

   Run after build:  node tools/e2e-integrity.mjs */
import puppeteer from 'puppeteer';
import fs from 'fs';

const FIXTURE_PATHS = [
  'C:/Users/charl/Downloads/GridIronIQ-mavericks-2025-RECOVERED.json',  // the coach's real 6-game season, when present
];
// Portable fallback so the gate runs anywhere — a synthetic multi-game season
// with distinct clip names per game (enough to exercise every invariant).
function buildSynthetic() {
  const games = [];
  for (let g = 0; g < 4; g++) {
    const plays = [];
    for (let p = 0; p < 12; p++) plays.push({ id: p + 1, timestamp: { start: 0, end: 5 }, clipName: `g${g}_clip${p}`, notes: '', tags: { unit: ['offense', 'defense', 'special'][p % 3], down: String(1 + p % 4), distance: '10', formation: 'Shotgun + Trips', backfield: 'Single', strength: 'Right', playType: p % 3 === 0 ? 'Run Inside' : 'Short Pass', runPass: p % 3 === 0 ? 'Run' : 'Pass', result: 'Gain', yardage: String(p % 9), stType: p % 3 === 2 ? 'Punt' : '', defFront: p % 3 === 1 ? '4-3' : '', coverage: p % 3 === 1 ? 'Cover 3' : '', players: {}, grades: {}, custom: [] } });
    games.push({ id: `synG${g}`, name: `Game ${g + 1}`, gameInfo: { opponent: `Team ${g + 1}` }, status: 'active', plays, annotations: [], nextId: 13, currentPlayId: null, videoFileName: '', clipNames: plays.map(p => p.clipName), isMultiClip: true });
  }
  return { version: 5, type: 'season', id: 'synthetic', seasonName: 'Synthetic Stress Season', games, activeGameId: 'synG0' };
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const OPS_PER_SEED = 80;

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('dialog', async d => { try { await d.dismiss(); } catch (e) {} });   // never let a modal wedge the run
let pageErrors = [];
page.on('pageerror', e => pageErrors.push(String(e.message || e)));
page.on('console', m => { if (m.type() === 'error') pageErrors.push(m.text()); });

const URL = TEST_APP_URL;

// The whole campaign for one (fixture, seed) runs IN-PAGE and returns a report,
// so each op's mutations + invariant checks happen against the live app objects.
const campaign = async (fixture, seed, nOps) => {
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 350));
  pageErrors = [];
  const rep = await page.evaluate(async (fixture, seed, nOps) => {
    // ---- seeded RNG (mulberry32) ----
    let s = seed >>> 0;
    const rnd = () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const ri = n => Math.floor(rnd() * n);
    const pick = a => a[ri(a.length)];

    const sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger, eng = window.app.stats;
    // ---- inject a COPY through the real normalize/load path ----
    store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
    store.currentSeasonId = fixture.id || 'stress';
    store.data.id = store.data.id || 'stress';
    if (!store.data.activeGameId && store.data.games[0]) store.data.activeGameId = store.data.games[0].id;
    sm._loadActiveGame();

    const fp = g => JSON.stringify(g.plays);                 // play-data fingerprint
    const snapFps = () => { const m = {}; for (const g of store.data.games) m[g.id] = fp(g); return m; };
    const integrity = () => {
      const e = [], ids = store.data.games.map(g => g.id);
      if (new Set(ids).size !== ids.length) e.push('duplicate game ids');
      if (store.data.activeGameId && !ids.includes(store.data.activeGameId)) e.push('activeGameId not a real game');
      for (const g of store.data.games) { const p = g.plays.map(x => x.id); if (new Set(p).size !== p.length) e.push(`dup play ids in ${g.id}`); }
      const cn = store.data.games.map(g => ({ id: g.id, set: new Set(g.plays.map(p => p.clipName).filter(Boolean)) }));
      for (let i = 0; i < cn.length; i++) for (let j = i + 1; j < cn.length; j++) for (const c of cn[i].set) if (cn[j].set.has(c)) { e.push(`games ${cn[i].id} & ${cn[j].id} SHARE clip "${c}"`); break; }
      return e;
    };
    const roundtrip = () => {
      const e = [], re = store._normalize(JSON.parse(JSON.stringify(store.data)));
      for (const g of store.data.games) { const r = re.games.find(x => x.id === g.id); if (!r) e.push(`normalize DROPPED game ${g.id}`); else if (r.plays.length !== g.plays.length) e.push(`normalize changed play count ${g.id} ${g.plays.length}->${r.plays.length}`); }
      return e;
    };
    const mkFiles = n => Array.from({ length: n }, (_, i) => new File([new Blob([new Uint8Array(32)])], `stress_${seed}_${ri(1e9)}_${i}.mp4`, { type: 'video/mp4' }));

    // ---- the operations (each returns { affected, note } ) ----
    const ops = {
      async commit() { sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      async tagEdit() { const p = tagger.plays[ri(Math.max(tagger.plays.length, 1))]; if (p) { p.tags.playType = pick(['Run Inside', 'Run Outside', 'Short Pass', 'Deep Pass']); p.tags.runPass = p.tags.playType.includes('Run') ? 'Run' : 'Pass'; p.tags.result = pick(['Gain', 'No Gain', 'Touchdown']); p.tags.yardage = String(ri(25)); } sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      async clearTags() { const p = tagger.getCurrentPlay && tagger.getCurrentPlay(); if (p) { p.tags.playType = ''; p.tags.result = ''; } sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      async addClips() {
        // The stress operation intentionally adds genuinely-new clips. Answer
        // the ghost-prevention confirmation explicitly so the fuzzer tests that
        // path instead of waiting forever on an in-app modal.
        const choice = tagger._choiceDialog;
        tagger._choiceDialog = async () => 'new';
        try { await tagger.playlist.addFiles(mkFiles(1 + ri(3))); }
        finally { tagger._choiceDialog = choice; }
        sm.commitActive();
        return { affected: [store.data.activeGameId] };
      },
      async switchGame() { const old = store.data.activeGameId; sm.switchToGame(pick(store.data.games.map(g => g.id))); return { affected: [old] }; },
      async newGame() { const before = store.data.games.map(g => g.id); sm.newGame(); return { affected: store.data.games.map(g => g.id).filter(i => !before.includes(i)), added: true }; },
      async removeGame() { if (store.data.games.length <= 2) return { skip: 1 }; const id = pick(store.data.games.map(g => g.id)); await sm.removeGame(id); return { affected: [id], removed: 1 }; },
      async finish() { const a = store.data.games.find(g => g.id === store.data.activeGameId); if (a) { (a.gameInfo = a.gameInfo || {}).scoreUs = '21'; a.gameInfo.scoreThem = '14'; } if (store.setGameStatus) store.setGameStatus(store.data.activeGameId, 'final'); return { affected: [store.data.activeGameId] }; },
      async snapshot() { await store.snapshot('stress'); return { affected: [] }; },
      async restore() { const list = await (store.listBackups ? store.listBackups() : []); if (!list || !list.length) return { skip: 1 }; await sm.restoreBackup(pick(list).id); return { affected: 'all' }; },
      // PC-4: this op AWAITS the persist. Its purpose is persist->reload
      // round-trip equality, and a round trip cannot be checked before the
      // write completes. It previously fire-and-forgot the persist and relied
      // on BrowserBackend's localStorage write finishing synchronously inside
      // persist() -- an accident of the browser backend that was never true of
      // the Tauri/SQLite backend the app actually ships, and that stopped
      // holding once PC-4 began ordering concurrent writes to one season.
      // persist() still resolves only after the durable write, so the round-trip
      // guarantee this op exists to check is fully preserved and now holds on
      // BOTH backends rather than only the synchronous one.
      async reload() { sm.commitActive(); await store.persist(); const back = await store.backend.loadSeason(store.currentSeasonId); return { affected: [], reload: back }; },
      async desyncCommit() { const cands = store.data.games.map(g => g.id).filter(i => i !== sm._loadedGameId); if (!cands.length) return { skip: 1 }; store.data.activeGameId = pick(cands); sm.commitActive(); sm._loadActiveGame(); return { affected: [] }; }, // guard must block → nothing changes
      async renderAll() { const reports = window.app.reportsScreen; reports.show(); for (const tab of ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']) reports.selectTab(tab); const opponent = store.data.games.find(game => game.id === store.data.activeGameId)?.gameInfo?.opponent || ''; if (opponent) reports.scoutOpponent(opponent); window.app.workspaceShell.show('breakdown'); return { affected: [] }; },
      async undo() { try { window.app.history && window.app.history.undo && window.app.history.undo(); } catch (e) {} sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      async redo() { try { window.app.history && window.app.history.redo && window.app.history.redo(); } catch (e) {} sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      async delPlay() { if (tagger.plays.length > 1) { const v = pick(tagger.plays); tagger.plays = tagger.plays.filter(p => p.id !== v.id); } sm.commitActive(); return { affected: [store.data.activeGameId] }; },
      // Version-manager ops — the THIRD cross-game corruption path lived here
      // (shared 'ffa_versions_default' key + restore bypassing the commit
      // guard) and the fuzzer never exercised it. Now it does: snapshots and
      // restores must only ever touch the ACTIVE game.
      async vmSnapshot() { const vm = window.app.versions; if (!vm) return { skip: 1 }; vm.snapshot('fuzz', rnd() < 0.5); return { affected: [] }; },
      async vmRestore() {
        const vm = window.app.versions; if (!vm) return { skip: 1 };
        const list = vm._list(); if (!list.length) return { skip: 1 };
        tagger._confirmDialog = async () => true;
        window.confirm = () => true;   // pre-fix builds used native confirm — keep the op runnable there so the fuzzer provably fails on them
        await vm.restore(pick(list).id);
        sm.commitActive();
        return { affected: [store.data.activeGameId] };   // ONLY the active game may change
      },
    };
    const names = Object.keys(ops);

    const violations = [], log = [];
    for (let i = 0; i < nOps; i++) {
      const name = pick(names);
      const before = snapFps();
      const activeAtStart = store.data.activeGameId;   // ANY op may re-commit the active game — that's legit
      let meta;
      try { meta = await ops[name](); } catch (e) { violations.push({ i, op: name, kind: 'THREW', msg: e.message }); log.push(name + '!'); continue; }
      if (meta && meta.skip) { i--; continue; }   // op not applicable in this state; retry slot
      log.push(name);
      // INTEGRITY + ROUNDTRIP (always)
      for (const m of integrity()) violations.push({ i, op: name, kind: 'INTEGRITY', msg: m });
      for (const m of roundtrip()) violations.push({ i, op: name, kind: 'ROUNDTRIP', msg: m });
      // ISOLATION (unless the op legitimately rewrites everything)
      if (meta.affected !== 'all') {
        const aff = new Set(meta.affected || []);
        aff.add(activeAtStart);   // the active game gets re-serialized on commit; only OTHER games changing is corruption
        for (const g of store.data.games) { if (aff.has(g.id) || !(g.id in before)) continue; if (before[g.id] !== fp(g)) violations.push({ i, op: name, kind: 'ISOLATION', msg: `game ${g.id} changed; op only affects [${[...aff]}]` }); }
      }
      // RELOAD round-trip equality
      if (meta.reload) { const b = meta.reload; const liveCounts = store.data.games.map(g => g.plays.length).join(','); const backCounts = (b.games || []).map(g => g.plays.length).join(','); if (liveCounts !== backCounts) violations.push({ i, op: name, kind: 'RELOAD', msg: `persist→reload play counts differ (${liveCounts} vs ${backCounts})` }); }
      if (violations.length > 40) break;   // enough signal for this seed
    }
    return { violations, log, games: store.data.games.length };
  }, fixture, seed, nOps);
  // The fake stress clips are 32 random bytes, so the <video> probe legitimately
  // errors (DEMUXER_ERROR) — that's a test-fixture artifact, not an app fault.
  rep.pageErrors = [...new Set(pageErrors)].filter(e => !/Video error|DEMUXER|FFmpegDemuxer|could not be decoded/i.test(e));
  return rep;
};

// CI/review can force the portable fixture when a large private season exceeds
// the local browser protocol budget; the default still prefers real data.
const realFixtures = process.env.FFA_INTEGRITY_SYNTHETIC
  ? []
  : FIXTURE_PATHS.filter(f => fs.existsSync(f)).map(f => JSON.parse(fs.readFileSync(f, 'utf-8')));
const fixtures = realFixtures.length ? realFixtures : [buildSynthetic()];
for (const fixture of fixtures) {
  console.log(`\n${'='.repeat(72)}\nFIXTURE: ${fixture.seasonName || '(synthetic)'}  (${(fixture.games || []).length} games)`);
  let allViol = [], allErrs = [];
  for (const seed of SEEDS) {
    const r = await campaign(fixture, seed, OPS_PER_SEED);
    const v = r.violations || [];
    allViol = allViol.concat(v.map(x => ({ ...x, seed })));
    if (r.pageErrors && r.pageErrors.length) allErrs = allErrs.concat(r.pageErrors.map(e => ({ seed, e })));
    const tag = v.length ? `🔴 ${v.length} violation(s)` : (r.pageErrors.length ? `⚠ ${r.pageErrors.length} console err` : '✓ clean');
    console.log(`  seed ${seed}: ${r.log.length} ops, ${r.games} games  ${tag}`);
    if (v.length) { console.log(`     first op sequence → …${r.log.slice(Math.max(0, v[0].i - 4), v[0].i + 1).join(' → ')}`); v.slice(0, 4).forEach(x => console.log(`     [op#${x.i} ${x.op}] ${x.kind}: ${x.msg}`)); }
  }
  console.log(`\n  TOTALS — violations: ${allViol.length}   console errors: ${allErrs.length}`);
  const byKind = {}; allViol.forEach(v => byKind[v.kind] = (byKind[v.kind] || 0) + 1);
  if (allViol.length) console.log('  by kind:', JSON.stringify(byKind));
  if (allErrs.length) [...new Set(allErrs.map(x => x.e))].slice(0, 8).forEach(e => console.log('  console:', e));
  ok(allViol.length === 0, `no data-integrity violations across ${SEEDS.length} seeds × ${OPS_PER_SEED} random ops`, JSON.stringify(byKind));
  ok(allErrs.length === 0, 'no console/page errors during the stress run', allErrs.slice(0, 2).map(x => x.e).join(' | '));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

/* REGRESSION: PlaylistManager.addFiles async play-creation must not leak plays
   into another game when the active game changes while duration probes are in
   flight. This is the deterministic form of the cross-game corruption the
   integrity fuzzer caught only under load (two games sharing a clip name):
   _autoCreatePlays() awaited per-clip _probeDuration, THEN pushed each play to
   the LIVE this.tagger.plays — which _deserialize reassigns to the new game's
   array on a switch, so a late push landed clip A's play in game B.

   We force the interleave by blocking _probeDuration on a gate we release only
   AFTER switching games. Buggy code pushes into game B; fixed code (await +
   bound-array guard) does not.

   Run after build:  node tools/e2e-addfiles-race.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const twoGame = () => ({
  version: 5, type: 'season', id: 'racefix', seasonName: 'Race Fixture', activeGameId: 'gameA',
  games: ['gameA', 'gameB'].map(id => ({
    id, name: id, gameInfo: { opponent: id }, status: 'active',
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: `${id}_existing`, notes: '', tags: { unit: 'offense', custom: [] } }],
    annotations: [], nextId: 2, currentPlayId: null, videoFileName: '', clipNames: [`${id}_existing`], isMultiClip: true,
  })),
});

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

// ---- Scenario 1: switch games WHILE probes are blocked (the race) ----
const race = await page.evaluate(async (fixture) => {
  const sm = window.app.storage, store = sm.seasonStore, pl = window.app.tagger.playlist;
  store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
  store.currentSeasonId = 'racefix';
  sm._loadActiveGame();

  // Block every duration probe on a gate we control.
  let releaseGate;
  const gate = new Promise(r => { releaseGate = r; });
  pl._probeDuration = async () => { await gate; return 5; };

  // Fire addFiles like the file-input handler does (NOT awaited by the caller).
  const files = [new File([new Blob([new Uint8Array(32)])], 'RACECLIP_A.mp4', { type: 'video/mp4' })];
  const addP = pl.addFiles(files);

  // Let addFiles reach the blocked probe, then switch to game B mid-flight.
  await new Promise(r => setTimeout(r, 30));
  sm.switchToGame('gameB');

  // Release the probe; let _autoCreatePlays finish its push phase.
  releaseGate();
  try { await addP; } catch (e) {}
  await new Promise(r => setTimeout(r, 60));

  const clipSet = g => new Set((store.data.games.find(x => x.id === g)?.plays || []).map(p => p.clipName));
  // commit whatever is live so any stray push is reflected in the node too
  sm.commitActive();
  const bClips = clipSet('gameB');
  const aClips = clipSet('gameA');
  // cross-game signature: the same clip name present in BOTH games
  const shared = [...aClips].filter(c => bClips.has(c));
  return { bHasRaceclip: bClips.has('RACECLIP_A'), aHasRaceclip: aClips.has('RACECLIP_A'), shared, bClips: [...bClips], aClips: [...aClips] };
}, twoGame());

ok(!race.bHasRaceclip, 'clip added to game A does NOT leak into game B on a mid-probe switch', JSON.stringify(race));
ok(race.shared.length === 0, 'no clip name is shared across games after the race', 'shared=' + JSON.stringify(race.shared));
// The add must not be LOST either: synchronous play creation lands it in game A
// (its own game) even when the coach switches away mid-probe — no orphaned film.
ok(race.aHasRaceclip, 'the added clip is NOT lost — its play lands in game A (its own game)', JSON.stringify(race));

// ---- Scenario 2: normal add (no switch) still lands the play in the game ----
const normal = await page.evaluate(async (fixture) => {
  const sm = window.app.storage, store = sm.seasonStore, pl = window.app.tagger.playlist;
  store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
  store.currentSeasonId = 'racefix';
  sm._loadActiveGame();
  pl._probeDuration = async () => 5;   // fast, no block
  await pl.addFiles([new File([new Blob([new Uint8Array(32)])], 'NORMAL_A.mp4', { type: 'video/mp4' })]);
  sm.commitActive();
  const aClips = new Set((store.data.games.find(x => x.id === 'gameA')?.plays || []).map(p => p.clipName));
  return { aHasNormal: aClips.has('NORMAL_A') };
}, twoGame());

ok(normal.aHasNormal, 'a normal add (no switch) still creates the play in the active game');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

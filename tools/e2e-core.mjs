/* Unit tests for the PURE core logic — the static helpers that drive every
   stat, split, and classification. The integration harnesses exercise these
   indirectly through full renders; this suite pins them in isolation so an edge
   case (empty input, multi-select split, run/pass fallback, HTML escaping)
   fails loudly and specifically.

   These are DOM-free modules, so this harness imports them directly rather than
   booting the app to reach a class. Nothing here needs a browser.

   Run:  node tools/e2e-core.mjs */
import { StatsEngine } from '../js/stats-engine.js';
import { Charts } from '../js/charts.js';
import { isPlayTagged } from '../js/football-rules.js';
import { PlayTagger } from '../js/play-tagger.js';
import { StorageManager } from '../js/storage.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const SE = StatsEngine;
const p = (t) => ({ tags: t });

console.log('\n== 1. Multi-select splitters (" + "-joined strings → component arrays) ==');
let r = {
  form2: SE.splitFormations('Pistol + Spread'),
  formEmpty: SE.splitFormations(''),
  formOne: SE.splitFormations('Shotgun'),
  types: SE.splitPlayTypes('RPO + Short Pass'),
  results: SE.splitResults('Fumble + Touchdown'),
  fronts: SE.splitFronts('Maverick + 5-2'),
  blitzes: SE.splitBlitzes('A-Gap + Edge'),
  players: SE.splitPlayers('55, 22'),
};
ok(JSON.stringify(r.form2) === JSON.stringify(['Pistol', 'Spread']), 'splitFormations splits on " + "', JSON.stringify(r.form2));
ok(JSON.stringify(r.formEmpty) === JSON.stringify([]), 'splitFormations("") → [] (blank formation is OMITTED, not imputed to Unknown — §6.4; an alignment-only play falls out of formation tendencies/cuts, stays counted under qbAlignment)', JSON.stringify(r.formEmpty));
ok(JSON.stringify(r.formOne) === JSON.stringify(['Shotgun']), 'single formation → one-element array', JSON.stringify(r.formOne));
ok(JSON.stringify(r.types) === JSON.stringify(['RPO', 'Short Pass']), 'splitPlayTypes splits', JSON.stringify(r.types));
ok(JSON.stringify(r.results) === JSON.stringify(['Fumble', 'Touchdown']), 'splitResults splits (scoop-and-score)', JSON.stringify(r.results));
ok(JSON.stringify(r.fronts) === JSON.stringify(['Maverick', '5-2']), 'splitFronts splits', JSON.stringify(r.fronts));
ok(JSON.stringify(r.blitzes) === JSON.stringify(['A-Gap', 'Edge']), 'splitBlitzes splits', JSON.stringify(r.blitzes));
ok(JSON.stringify(r.players) === JSON.stringify(['55', '22']), 'splitPlayers splits a shared-tackle list on ","', JSON.stringify(r.players));

console.log('\n== 2. Run/Pass classification (explicit field authoritative; playType fallback) ==');
r = {
  explicitRun: SE.isRun(p({ runPass: 'Run', playType: 'Deep Pass' })),    // explicit wins over playType
  explicitPass: SE.isPass(p({ runPass: 'Pass', playType: 'Run Inside' })),
  fallbackRun: SE.isRun(p({ runPass: '', playType: 'Run Inside' })),       // legacy: infer from playType
  fallbackPass: SE.isPass(p({ runPass: '', playType: 'Screen' })),
  blankNeither: SE.isRun(p({ runPass: '', playType: '' })) || SE.isPass(p({ runPass: '', playType: '' })),
  hasTD: SE.hasResult(p({ result: 'Fumble + Touchdown' }), 'Touchdown'),
  noTD: SE.hasResult(p({ result: 'Gain' }), 'Touchdown'),
};
ok(r.explicitRun, 'isRun honors explicit runPass=Run over a Pass playType', JSON.stringify(r));
ok(r.explicitPass, 'isPass honors explicit runPass=Pass over a Run playType', JSON.stringify(r));
ok(r.fallbackRun, 'isRun falls back to playType inference (legacy data)', JSON.stringify(r));
ok(r.fallbackPass, 'isPass infers Screen as a pass', JSON.stringify(r));
ok(!r.blankNeither, 'a fully blank play is neither run nor pass', JSON.stringify(r));
ok(r.hasTD && !r.noTD, 'hasResult finds a component in a "+"-joined result', JSON.stringify(r));

console.log('\n== 3. playPoints scoring ==');
r = {
  td: SE.playPoints(p({ result: 'Touchdown' })),
  safety: SE.playPoints(p({ result: 'Safety' })),
  gain: SE.playPoints(p({ result: 'Gain' })),
  madeXp: SE.playPoints({ tags: { unit: 'special' }, specialTeams: { unit: 'try', attemptType: 'extraPoint', result: 'converted', outcome: { score: 'extraPoint' } } }),
};
ok(r.td === 6, 'a Touchdown is 6 points', JSON.stringify(r));
ok(r.safety === 2, 'a Safety is 2 points', JSON.stringify(r));
ok(r.gain === 0, 'a plain Gain scores 0', JSON.stringify(r));
ok(r.madeXp === 1, 'a converted extra point (Try unit) is 1 point', JSON.stringify(r));

console.log('\n== 4. HTML escaping (Charts._esc) — the XSS boundary ==');
{
  const esc = Charts._esc;
  r = {
    img: esc('<img src=x onerror=alert(1)>'),
    amp: esc('A&B'),
    quote: esc('say "hi" it\'s'),
    plain: esc('Smith'),
  };
}
ok(!/[<>]/.test(r.img) && r.img.includes('&lt;img'), 'Charts._esc neutralizes an <img onerror> payload', JSON.stringify(r));
ok(r.amp === 'A&amp;B', 'escapes & (entity-safe)', JSON.stringify(r));
ok(r.quote.includes('&quot;') && r.quote.includes('&#39;'), 'escapes both quote styles', JSON.stringify(r));
ok(r.plain === 'Smith', 'leaves a plain name untouched', JSON.stringify(r));

console.log('\n== 5. isPlayTagged — one canonical "is this play tagged?" rule ==');
{
  const t = tags => isPlayTagged({ tags });
  r = {
    offense: t({ playType: 'Run Inside', result: 'Gain' }),
    stKickReturn: t({ unit: 'special', result: 'Fumble' }),  // no playType
    defenseScheme: t({ unit: 'defense', defFront: '4-3', coverage: 'Cover 3' }),     // no playType
    runPassOnly: t({ runPass: 'Run' }),
    formationOnly: t({ formationFamily: 'Spread' }),
    ddOnly: t({ down: '1', distance: '10' }),   // situational pre-fill only → NOT tagged
    blank: t({}),
  };
}
ok(r.offense && r.stKickReturn && r.defenseScheme, 'offense, special-teams (Kick Return), and defense plays all read as TAGGED', JSON.stringify(r));
ok(r.runPassOnly && r.formationOnly, 'a run/pass call or a formation alone counts as tagged', JSON.stringify(r));
ok(!r.ddOnly && !r.blank, 'down/distance pre-fill alone (or nothing) is NOT tagged', JSON.stringify(r));

console.log('\n== 6. Film index survives unloaded and partially loaded playlists ==');
{
  // Exercise the production serializer without constructor event wiring or disk I/O.
  const sm = Object.assign(Object.create(StorageManager.prototype), {
    tagger: { plays: Array.from({ length: 8 }, (_, i) => ({
      id: i + 1, timestamp: { start: 0, end: 10 + i },
      tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', custom: [] },
      annotations: [], notes: '', clipName: `IMG_${100 + i}`,
      clipPath: `Sorrows/IMG_${100 + i}`, clipId: 500 + i,
    })) },
    canvas: { annotations: [] }, _removedClipIds: new Set(),
    playlist: { clips: [], get hasClips() { return this.clips.length > 0; } },
  });
  const a = sm._serialize();
  ok(a.clipRefs.length === 8, 'A: film index keeps all 8 clips when film NOT loaded');
  ok(a.clipNames.length === 8, 'A: clipNames length 8');
  ok(a.isMultiClip === true, 'A: isMultiClip stays true (not flipped to single-video)');
  ok(JSON.stringify(a.clipPaths) === JSON.stringify(sm.tagger.plays.map(p => p.clipPath)),
    'A: clipPaths match the plays');
  sm.playlist.clips = [0, 1, 2].map(i => ({
    id: i + 1, name: `IMG_${100 + i}`, clipPath: `Sorrows/IMG_${100 + i}`,
    file: null, assetUrl: 'x', duration: 10 + i, playId: i + 1,
  }));
  const b = sm._serialize();
  ok(b.clipRefs.length === 8, 'B: partial playlist (3 loaded) still indexes all 8 clips');
  ok(b.isMultiClip === true, 'B: isMultiClip true');
  sm.tagger.plays = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1, timestamp: { start: i * 10, end: i * 10 + 8 },
    tags: { unit: 'offense', custom: [] }, annotations: [], notes: '',
    clipName: '', clipPath: '', clipId: null,
  }));
  sm.playlist.clips = [];
  const c = sm._serialize();
  ok(c.clipRefs.length === 0, 'C: true single-video game stays 0 clips');
  ok(c.isMultiClip === false, 'C: single-video stays isMultiClip=false');
}

console.log('\n== 7. Penalty replays the down in Auto D&D ==');
{
  const tagger = new PlayTagger(null);
  const sit = tagger.computeNextSituation({ tags: {
    down: '2', distance: '7', result: 'Penalty', yardage: '5',
    unit: 'offense', fieldSide: 'own', yardLine: '40',
  } });
  const stillStops = tagger.computeNextSituation({ tags: {
    down: '2', distance: '7', result: 'Interception', yardage: '0', unit: 'offense',
  } });
  ok(sit && sit.down === '2' && sit.distance === '7',
    'penalty pre-fills the SAME down & distance (replay)', JSON.stringify(sit));
  ok(sit && sit.fieldSide === 'own' && sit.yardLine === 40,
    'penalty keeps the previous spot', JSON.stringify(sit));
  ok(stillStops === null, 'possession-ending results still blank the next play');
}

console.log('\n== 8. Restore-point throttling and season ownership ==');
{
  const snapshots = [];
  const storage = Object.assign(Object.create(StorageManager.prototype), {
    vc: { paused: false }, _lastSnapAt: 0, _deferredSnapshot: null, _snapshotIdleTimer: null,
    seasonStore: { currentSeasonId: 'restore-proof',
      async snapshot(label) { snapshots.push({ label, seasonId: this.currentSeasonId }); } },
  });
  storage._maybeSnapshot(false, 'Playback-safe auto');
  ok(snapshots.length === 0 && storage._deferredSnapshot?.label === 'Playback-safe auto'
    && storage._deferredSnapshot?.seasonId === 'restore-proof',
  'Automatic restore point defers during playback and pins the active season');
  storage.vc.paused = true;
  ok(storage._flushDeferredSnapshot() && snapshots.length === 1
    && snapshots.at(-1).label === 'Playback-safe auto' && !storage._deferredSnapshot,
  'Paused playback flushes the deferred restore point exactly once');
  storage.vc.paused = false; storage._lastSnapAt = 0;
  storage._maybeSnapshot(false, 'Superseded auto');
  storage._maybeSnapshot(true, 'Manual safety point');
  ok(snapshots.length === 2 && snapshots.at(-1).label === 'Manual safety point' && !storage._deferredSnapshot,
    'Forced restore point supersedes a deferred automatic point');
  storage._lastSnapAt = 0;
  storage._maybeSnapshot(false, 'Old-season auto');
  storage.seasonStore.currentSeasonId = 'different-season'; storage.vc.paused = true;
  ok(!storage._flushDeferredSnapshot() && snapshots.length === 2 && !storage._deferredSnapshot,
    'Deferred restore point never crosses season ownership');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

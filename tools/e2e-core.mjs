// DOM-free football helpers, situation/carry rules, attribution and storage invariants.
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


// Situation, penalty enforcement, takeaway attribution and non-destructive carry.
{
  // ---- 2. Quarter carry + defense field position ----
  const situ = (() => {
    const t = new PlayTagger(null);
    const out = {};
    // Quarter carries across a possession-ending play (TD).
    const prevTD = { tags: { down: '2', distance: '4', quarter: 'Q2', result: 'Touchdown', yardage: '12', unit: 'offense' } };
    const next1 = { tags: { down: '', distance: '', quarter: '', custom: [] } };
    t.applyNextSituation(prevTD, next1);
    out.qtrAfterTD = next1.tags.quarter;
    // Defensive gains move the ball toward our goal (opp 40 to opp 47).
    const prevDef = { tags: { down: '1', distance: '10', quarter: 'Q3', result: 'Gain', yardage: '7', unit: 'defense', fieldSide: 'opp', yardLine: '40' } };
    const sit = t.computeNextSituation(prevDef);
    out.defSit = sit;
    // Defense goal-to-go: opponent 1st down at our 6 → 1st & 6 (goal).
    const prevDefG = { tags: { down: '1', distance: '10', quarter: 'Q4', result: 'Gain', yardage: '14', unit: 'defense', fieldSide: 'own', yardLine: '20' } };
    out.defGoal = t.computeNextSituation(prevDefG);
    return out;
  })();
  ok(situ.qtrAfterTD === 'Q2', 'quarter carries across a TD (possession end)', JSON.stringify(situ));
  ok(situ.defSit && situ.defSit.down === '2' && situ.defSit.distance === '3' && situ.defSit.fieldSide === 'opp' && String(situ.defSit.yardLine) === '47', 'defense field position advances toward our goal', JSON.stringify(situ.defSit));
  ok(situ.defGoal && situ.defGoal.down === '1' && situ.defGoal.distance === '6' && situ.defGoal.fieldSide === 'own' && String(situ.defGoal.yardLine) === '6', 'defense goal-to-go uses OUR goal line', JSON.stringify(situ.defGoal));

  const penaltySituations = (() => {
    const tagger = new PlayTagger(null);
    const tags = { down:'2', distance:'7', unit:'offense', fieldSide:'own', yardLine:'40', result:'Gain', yardage:'4' };
    const penalty = { team:'subject', phase:'offense', disposition:'accepted', yards:5, playCounts:false };
    const compute = (overrides = {}, tagOverrides = {}) => tagger.computeNextSituation({ tags:{ ...tags, ...tagOverrides }, penalties:[{ ...penalty, ...overrides }] });
    return {
      noPlay: compute(),
      deadBallNoPlayUs: compute({ phase:'deadBall' }),
      deadBallNoPlayThem: compute({ phase:'deadBall', team:'opponent' }),
      defense: compute({ team:'subject' }, { unit:'defense' }),
      declined: compute({ disposition:'declined' }),
      offsetting: compute({ disposition:'offsetting' }),
      deadBall: compute({ phase:'deadBall', playCounts:true }),
      liveBall: compute({ playCounts:true }),
      liveBallAgainstDefense: compute({ playCounts:true, team:'opponent' }),
      fourthLiveBall: compute({ playCounts:true, team:'opponent' }, { down:'4' }),
      fourthDeadBallShort: compute({ phase:'deadBall', playCounts:true, team:'opponent' }, { down:'4' }),
      fourthDeadBallConversion: compute({ phase:'deadBall', playCounts:true }, { down:'4', yardage:'8' }),
      fourthNoPlay: compute({ phase:'deadBall', team:'opponent', yards:10 }, { down:'4' }),
      missingRuling: compute({ playCounts:null }),
      missingYards: compute({ yards:null }),
      legacy: tagger.computeNextSituation({ tags, penalties:[penalty], resultingSituation:{ down:'1', distance:'10', fieldSide:'opp', yardLine:'25', confirmed:true } }),
      applied: (() => {
        const next = { tags:{ down:'', distance:'', quarter:'', fieldSide:'', yardLine:'' } };
        tagger.applyNextSituation({ tags:{ ...tags, quarter:'Q2' }, penalties:[penalty] }, next);
        return { tags:next.tags, auto:next._autoSit };
      })(),
    };
  })();
  ok(penaltySituations.noPlay?.down === '2' && penaltySituations.noPlay?.distance === '12'
    && penaltySituations.noPlay?.fieldSide === 'own' && penaltySituations.noPlay?.yardLine === 35, 'accepted no-play offense penalty replays the down from the enforced spot', JSON.stringify(penaltySituations.noPlay));
  ok(penaltySituations.deadBallNoPlayUs?.down === '2'
    && penaltySituations.deadBallNoPlayUs?.distance === '12'
    && penaltySituations.deadBallNoPlayUs?.yardLine === 35
    && penaltySituations.deadBallNoPlayThem?.down === '2'
    && penaltySituations.deadBallNoPlayThem?.distance === '2'
    && penaltySituations.deadBallNoPlayThem?.yardLine === 45, 'dead-ball no-play penalties move the previous spot in either charged-team direction', JSON.stringify(penaltySituations));
  ok(penaltySituations.defense?.down === '2' && penaltySituations.defense?.distance === '2'
    && penaltySituations.defense?.yardLine === 35, 'defensive perspective applies a penalty toward the opponent goal', JSON.stringify(penaltySituations.defense));
  ok(penaltySituations.declined?.down === '3' && penaltySituations.declined?.distance === '3'
    && penaltySituations.offsetting?.down === '2' && penaltySituations.offsetting?.distance === '7', 'declined and offsetting flags have distinct next-snap rulings', JSON.stringify(penaltySituations));
  ok(penaltySituations.deadBall?.down === '3' && penaltySituations.deadBall?.distance === '8'
    && penaltySituations.deadBall?.yardLine === 39
    && penaltySituations.liveBall === null, 'counted dead-ball fouls enforce from the completed play; live-ball spots stay unresolved', JSON.stringify(penaltySituations));
  ok(penaltySituations.liveBallAgainstDefense === null
    && penaltySituations.fourthLiveBall === null
    && penaltySituations.fourthDeadBallShort === null, 'fourth-down live-ball fouls and dead-ball fouls after a short play do not guess possession', JSON.stringify(penaltySituations));
  ok(penaltySituations.fourthNoPlay?.down === '1'
    && penaltySituations.fourthNoPlay?.distance === '10'
    && penaltySituations.fourthNoPlay?.yardLine === 50, 'fourth-down clear no-play enforcement can move the chains', JSON.stringify(penaltySituations.fourthNoPlay));
  ok(penaltySituations.fourthDeadBallConversion?.down === '1'
    && penaltySituations.fourthDeadBallConversion?.distance === '15'
    && penaltySituations.fourthDeadBallConversion?.yardLine === 43, 'fourth-down conversion followed by a dead-ball foul enforces from the new series', JSON.stringify(penaltySituations.fourthDeadBallConversion));
  ok(penaltySituations.missingRuling === null && penaltySituations.missingYards === null, 'missing penalty ruling or yardage leaves Auto D&D unset', JSON.stringify(penaltySituations));
  ok(penaltySituations.legacy?.down === '1' && penaltySituations.legacy?.yardLine === '25', 'previously confirmed penalty situations remain readable', JSON.stringify(penaltySituations.legacy));
  ok(penaltySituations.applied?.auto === true && penaltySituations.applied?.tags?.down === '2'
    && penaltySituations.applied?.tags?.distance === '12'
    && penaltySituations.applied?.tags?.yardLine === '35'
    && penaltySituations.applied?.tags?.quarter === 'Q2', 'Save-and-next Auto D&D writes the structured penalty result to the next snap', JSON.stringify(penaltySituations.applied));

  // ---- 3. Takeaway crediting ----
  const takeaway = (() => {
    const se = new StatsEngine(null);
    const mk = (id, tags) => ({ id, timestamp: { start: id * 10, end: id * 10 + 5 }, tags });
    const plays = [
      // Interception credit is explicit and independent of tackle credit.
      mk(1, { unit: 'defense', playType: 'Deep Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { takeaway: '21' }, custom: [] }),
      // A tackler alone does not prove who recovered a fumble.
      mk(2, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Fumble', yardage: '2', players: { tackler: '55' }, custom: [] }),
      // Confirmed recovery: the Takeaway role receives the FR credit.
      mk(3, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Fumble', fumbleRecovery: 'subject', yardage: '1', players: { takeaway: '44' }, custom: [] }),
    ];
    const stats = se.compute(plays);
    const p21 = stats.individuals.tacklers.find(x => x.num === '21');
    const p55 = stats.individuals.tacklers.find(x => x.num === '55');
    const p44 = stats.individuals.tacklers.find(x => x.num === '44');
    return { p21, p55, p44 };
  })();
  ok(takeaway.p21 && takeaway.p21.ints === 1 && takeaway.p21.tackles === 0, 'Takeaway role credits INT without a tackle', JSON.stringify(takeaway.p21));
  ok(takeaway.p55 && takeaway.p55.fumblesRec === 0 && takeaway.p55.tackles === 1, 'tackler-only fumble with unknown recovery gets no false FR credit', JSON.stringify(takeaway.p55));
  ok(takeaway.p44 && takeaway.p44.fumblesRec === 1 && takeaway.p44.tackles === 0, 'confirmed fumble recovery credits the Takeaway player', JSON.stringify(takeaway.p44));

  // ---- 4. Carry scheme ----
  const carry = (() => {
    const t = new PlayTagger(null);
    t.carryScheme = true;
    const prev = { tags: { formationFamily: 'Wing-T', personnel: '21', defFront: '', coverage: '', custom: [] } };
    const next = { tags: { formationFamily: '', personnel: '', defFront: '', coverage: '', custom: [] } };
    t.applyCarryScheme(prev, next);
    const blocked = { tags: { formationFamily: 'Spread', personnel: '', custom: [] } };
    t.applyCarryScheme(prev, blocked);
    return { f: next.tags.formationFamily, p: next.tags.personnel, kept: blocked.tags.formationFamily, filled: blocked.tags.personnel };
  })();
  ok(carry.f === 'Wing-T' && carry.p === '21', 'carry-scheme fills blank formation/personnel', JSON.stringify(carry));
  ok(carry.kept === 'Spread' && carry.filled === '21', 'carry-scheme never overwrites a tagged look', JSON.stringify(carry));

}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

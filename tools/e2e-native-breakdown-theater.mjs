import fs from 'node:fs';
import path from 'node:path';
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
const shotDir = process.env.GIQ_S5A_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

console.log('\n== 1. Native ownership, drive grouping, and data no-op ==');
const mounted = await page.evaluate(async () => {
  const app = window.app;
  app.workspaceShell.disable();
  await app.storage.createSeason({ name: 'S5a Theater', team: 'Mavericks', year: '2026' });
  const game = app.storage.seasonStore.activeGame();
  game.plays = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, timestamp: { start: index * 8, end: index * 8 + 6 },
    tags: { unit: 'offense', driveNumber: index < 4 ? '1' : index < 9 ? '2' : '',
      down: String(index % 4 + 1), distance: index === 6 ? '26' : '10',
      formation: index % 2 ? 'Power-I' : 'Ace', qbAlignment: index % 2 ? 'Under Center' : 'Shotgun',
      runPass: index % 2 ? 'Run' : 'Pass', playType: index === 6 ? 'Deep Pass + Play Action' : index % 2 ? 'Run Outside' : 'Short Pass',
      result: index === 6 ? 'Interception + Touchdown' : index === 9 ? 'Touchdown' : 'Gain',
      yardage: index === 6 ? '-12' : String(index + 2), players: {}, grades: {}, custom: [] }, notes: '', analysis: null,
  }));
  app.tagger.plays = game.plays; app.tagger.nextId = 13; app.tagger._updateFormEnabled();  app.tagger._emit('plays-loaded'); app.tagger.selectPlay(1);
  const before = JSON.stringify(app.storage.seasonStore.data);
  const media = document.getElementById('videoContainer');
  const host = document.createElement('div'); host.id = 's5aTestHost';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--gi-film)';
  document.body.appendChild(host); const didMount = app.breakdownTheater.mount(host);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { didMount, native: document.querySelectorAll('[data-native-breakdown-theater]').length,
    sameMedia: document.querySelector('[data-native-media-slot] > #videoContainer') === media,
    legacyControls: !!host.querySelector('.playback-controls, .video-play-controls, .breakdown-play-strip'),
    dataSame: before === JSON.stringify(app.storage.seasonStore.data),
    cards: host.querySelectorAll('[data-native-play-id]').length,
    drives: [...host.querySelectorAll('.gi-drive-group h3')].map(node => node.textContent) };
});
ok(mounted.didMount && mounted.native === 1 && mounted.sameMedia, 'One native theater adopts the one canonical media node', JSON.stringify(mounted));
ok(!mounted.legacyControls, 'Native theater owns its controls and strip instead of legacy chrome');
ok(mounted.dataSame, 'Mounting the theater is a season-data no-op');
ok(mounted.cards === 12 && mounted.drives.join('|') === 'Drive 1|Drive 2|No drive', 'Strip preserves order and groups plays by drive', JSON.stringify(mounted));

let state = await page.evaluate(() => {
  document.querySelector('[data-drive-scroll]').style.maxWidth = '500px';
  const cards = [...document.querySelectorAll('.gi-play-card')];
  const long = document.querySelector('[data-native-play-id="7"] small');
  const row = long?.getBoundingClientRect();
  const children = [...(long?.children || [])];
  return { widths: [...new Set(cards.map(card => Math.round(card.getBoundingClientRect().width)))],
    text: long?.textContent, fits: children.filter(node => node.getClientRects().length).every(node => node.getBoundingClientRect().right <= row.right + 1),
    fullLabel: document.querySelector('[data-native-play-id="7"]')?.title,
    internal: document.querySelector('[data-drive-scroll]').scrollWidth > document.querySelector('[data-drive-scroll]').clientWidth,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
ok(state.widths.length === 1 && state.widths[0] === 78, 'Mid-width play strip uses the approved 78px footprint', JSON.stringify(state));
ok(state.fits && /Interception \+ Touchdown: -12/.test(state.text || '') && /Interception/.test(state.fullLabel || ''), 'Compact strip preserves full football copy in its accessible label and tooltip', JSON.stringify(state));
ok(state.internal && !state.pageOverflow, 'High play counts scroll inside the strip without page overflow', JSON.stringify(state));

await page.evaluate(() => { document.querySelector('[data-drive-scroll]').style.maxWidth = ''; });
await page.setViewport({width:1280,height:720});
await page.click('[aria-label="Show play strip"]');
await new Promise(resolve => setTimeout(resolve, 50));
state = await page.evaluate(() => ({
  dialog: document.querySelector('.gi-drive-strip').getAttribute('role'),
  visible: !!document.querySelector('[data-drive-scroll]').getClientRects().length,
  expanded: document.querySelector('[aria-label="Show play strip"]')?.getAttribute('aria-expanded'),
}));
ok(state.dialog === 'dialog' && state.visible && state.expanded === 'true',
  'Narrow play browser opens explicitly without permanently consuming film space', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.setViewport({width:1440,height:900});

// == 1b. Chyron data and semantic contract (Codex review 2d4a5df) ==========
// Direct, discriminating assertions against _chyron() itself — none of the
// existing focused harnesses had any chyron-content assertion at all, which
// is exactly how a structured-ST blank and inverted result colours shipped
// unnoticed. Each case below is a hand-built play object, not driven through
// the UI, because the contract being pinned is the pure data/colour mapping,
// not rendering.
console.log('\n== 1b. Chyron data and semantic contract ==');
state = await page.evaluate(() => {
  const screen = window.app.breakdownTheater;
  const c = play => screen._chyron(play);
  const base = { id: 1, notes: '', analysis: null };

  // Structured Special Teams must be read first — a coach who charts through
  // the live structured editor must never see a blank lower-third just
  // because legacy stType/kickOutcome were never written.
  const puntDowned = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'punt', outcome: { status: 'downed' } } });
  const stTouchdownOurs = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'kickoffReturn', outcome: { status: 'returned', score: 'touchdown', scoredBy: 'subject' } } });
  const stTouchdownTheirs = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'kickoff', outcome: { status: 'returned', score: 'touchdown', scoredBy: 'opponent' } } });
  const stLegacyFallback = c({ ...base, tags: { unit: 'special', stType: 'Punt', result: 'Punt' } });

  // Offense/defense football-relative colour: green/red mean genuinely
  // good/bad for the CHARTED unit's own job, not a blind substring match.
  const offTd = c({ ...base, tags: { unit: 'offense', result: 'Touchdown', yardage: '22' } });
  const offInt = c({ ...base, tags: { unit: 'offense', result: 'Interception', yardage: '0' } });
  const offNoGood = c({ ...base, tags: { unit: 'offense', result: 'No Good', yardage: '0' } });
  const defLoss = c({ ...base, tags: { unit: 'defense', result: 'Loss', yardage: '3' } });
  const defSack = c({ ...base, tags: { unit: 'defense', result: 'Sack', yardage: '6' } });
  const defInt = c({ ...base, tags: { unit: 'defense', result: 'Interception', yardage: '0' } });
  // Opponent offense scores on our defense — genuinely bad for the defense.
  const defTdAgainst = c({ ...base, tags: { unit: 'defense', result: 'Touchdown', yardage: '18' } });
  // A pick-six charted on defense is a defensive success, not a defeat.
  const defPickSix = c({ ...base, tags: { unit: 'defense', result: 'Interception + Touchdown', yardage: '0' } });

  // Fumbles: ownership-aware, never a blanket "Fumble is bad".
  const fumbleUnknown = c({ ...base, tags: { unit: 'offense', result: 'Fumble', yardage: '0', fumbleRecovery: '' } });
  const fumbleSubjectRecovered = c({ ...base, tags: { unit: 'offense', result: 'Fumble', yardage: '0', fumbleRecovery: 'subject' } });
  const fumbleOpponentRecovered = c({ ...base, tags: { unit: 'offense', result: 'Fumble', yardage: '0', fumbleRecovery: 'opponent' } });
  // Possession retained on a fumble is NOT itself a successful result — a
  // joined "Fumble + Loss" recovered by our own offense must still read the
  // Loss, not the recovery.
  const fumbleSubjectRecoveredLoss = c({ ...base, tags: { unit: 'offense', result: 'Fumble + Loss', yardage: '4', fumbleRecovery: 'subject' } });

  // Codex re-review (aa9a80a): compound-outcome ownership must be resolved
  // BEFORE generic Touchdown tone, mirrored on BOTH units — the first repair
  // only pinned the defensive direction (defPickSix above), leaving the
  // offense direction (a pick-six or scoop-and-score AGAINST us) unproven.
  const offPickSixAgainstUs = c({ ...base, tags: { unit: 'offense', result: 'Interception + Touchdown', yardage: '-58' } });
  const offScoopAndScoreAgainstUs = c({ ...base, tags: { unit: 'offense', result: 'Fumble + Touchdown', yardage: '0', fumbleRecovery: 'opponent' } });
  const defOpponentScoopAndScore = c({ ...base, tags: { unit: 'defense', result: 'Fumble + Touchdown', yardage: '0', fumbleRecovery: 'opponent' } });

  // Structured Special Teams: a failed attempt is not automatically neutral
  // just because it produced no score — it is negative for the attempting
  // subject and positive for the defending subject; a genuine No Play stays
  // neutral, never guessed either way.
  const stMissedFieldGoal = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'fieldGoal', outcome: { status: 'noGood' } } });
  const stBlockedByUs = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'fieldGoalBlock', outcome: { status: 'blocked' } } });
  const stFailedTry = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'try', attemptType: 'twoPoint', result: 'failed' } });
  const stStoppedTheirTry = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'tryDefense', attemptType: 'extraPoint', result: 'failed' } });
  const stNoPlayTry = c({ ...base, tags: { unit: 'special' },
    specialTeams: { unit: 'try', attemptType: 'extraPoint', result: 'noPlay' } });

  // Honesty gaps: field side must never be invented, and the defensive call
  // must compose Front + Coverage Call + Coverage Family + Blitz in full.
  const missingFieldSide = c({ ...base, tags: { unit: 'offense', yardLine: '34' } });
  const fullDefCall = c({ ...base, tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 3', coverageFamily: 'Zone', blitz: 'Edge' } });

  return {
    puntDowned: { ourValue: puntDowned.ourValue, result: puntDowned.result },
    stTouchdownOurs: { tone: stTouchdownOurs.resultTone, result: stTouchdownOurs.result },
    stTouchdownTheirs: { tone: stTouchdownTheirs.resultTone },
    stLegacyFallback: { ourValue: stLegacyFallback.ourValue },
    offTd: offTd.resultTone, offInt: offInt.resultTone, offNoGood: offNoGood.resultTone,
    defLoss: defLoss.resultTone, defSack: defSack.resultTone, defInt: defInt.resultTone,
    defTdAgainst: defTdAgainst.resultTone, defPickSix: defPickSix.resultTone,
    fumbleUnknown: fumbleUnknown.resultTone, fumbleSubjectRecovered: fumbleSubjectRecovered.resultTone,
    fumbleOpponentRecovered: fumbleOpponentRecovered.resultTone,
    fumbleSubjectRecoveredLoss: fumbleSubjectRecoveredLoss.resultTone,
    offPickSixAgainstUs: offPickSixAgainstUs.resultTone,
    offScoopAndScoreAgainstUs: offScoopAndScoreAgainstUs.resultTone,
    defOpponentScoopAndScore: defOpponentScoopAndScore.resultTone,
    stMissedFieldGoal: stMissedFieldGoal.resultTone, stBlockedByUs: stBlockedByUs.resultTone,
    stFailedTry: stFailedTry.resultTone, stStoppedTheirTry: stStoppedTheirTry.resultTone,
    stNoPlayTry: stNoPlayTry.resultTone,
    missingFieldSide: missingFieldSide.ball,
    fullDefCall: fullDefCall.ourValue,
  };
});
ok(state.puntDowned.ourValue === 'Punt' && state.puntDowned.result === 'Downed',
  'Structured Special Teams reads play.specialTeams, not blank legacy fields', JSON.stringify(state.puntDowned));
ok(state.stTouchdownOurs.tone === 'pos' && /Touchdown/.test(state.stTouchdownOurs.result),
  'Structured ST scored by the subject colours positive via SpecialTeamsModel.scoringTeam', JSON.stringify(state.stTouchdownOurs));
ok(state.stTouchdownTheirs.tone === 'neg', 'Structured ST scored by the opponent colours negative', JSON.stringify(state.stTouchdownTheirs));
ok(state.stLegacyFallback.ourValue === 'Punt', 'Legacy stType is used only when no structured event exists', JSON.stringify(state.stLegacyFallback));
const railSpecial = await page.evaluate(() => {
  const screen = app.breakdownTheater;
  const view = specialTeams => screen._playView({id:1,tags:{unit:'special'},specialTeams});
  return {
    selected: view({unit:'kickoffReturn'}),
    returned: view({unit:'kickoffReturn',outcome:{status:'returned'}}),
    retry: view({unit:'try',attemptType:'extraPoint',result:'noPlay'}),
    legacy: screen._playView({id:2,tags:{unit:'special',stType:'Punt',kickOutcome:'Downed'}}),
  };
});
ok(railSpecial.selected.call === 'Kick Return' && railSpecial.selected.result === 'No result', 'Play rail recognizes a structured phase without inventing an outcome', JSON.stringify(railSpecial));
ok(railSpecial.returned.result === 'Returned' && railSpecial.returned.label.includes('Kick Return, Returned'), 'Play rail and accessible label use the structured outcome', JSON.stringify(railSpecial));
ok(railSpecial.retry.result === 'No Play / Retry' && railSpecial.legacy.call === 'Punt' && railSpecial.legacy.result === 'Downed', 'Play rail preserves try rulings and legacy display compatibility', JSON.stringify(railSpecial));
ok(state.offTd === 'pos', 'Offense Touchdown is positive');
ok(state.offInt === 'neg', 'Offense Interception is negative');
ok(state.offNoGood === 'neg', '"No Good" is negative, not the inverted green from the original defect');
ok(state.defLoss === 'pos', 'Defense Loss (a tackle for loss) is positive, not the inverted red from the original defect');
ok(state.defSack === 'pos', 'Defense Sack is positive');
ok(state.defInt === 'pos', 'Defense Interception is positive');
ok(state.defTdAgainst === 'neg', 'A plain opponent Touchdown against our defense is negative');
ok(state.defPickSix === 'pos', 'A defensive pick-six is positive, not treated as a Touchdown allowed');
ok(state.fumbleUnknown === '', 'A fumble with unresolved recovery stays neutral rather than guessing bad');
ok(state.fumbleSubjectRecovered === 'pos', 'A fumble recovered by the subject is positive');
ok(state.fumbleOpponentRecovered === 'neg', 'A fumble lost to the opponent on an offense-unit play is negative');
ok(state.fumbleSubjectRecoveredLoss === 'neg',
  'Retaining a fumble is not itself a success -- "Fumble + Loss" recovered by our own offense still reads the Loss', JSON.stringify(state.fumbleSubjectRecoveredLoss));
ok(state.offPickSixAgainstUs === 'neg',
  'An offense-unit "Interception + Touchdown" (a pick-six thrown by our own offense) is negative, not green', JSON.stringify(state.offPickSixAgainstUs));
ok(state.offScoopAndScoreAgainstUs === 'neg',
  'An offense-unit "Fumble + Touchdown" recovered by the opponent (scoop-and-score against us) is negative, not green', JSON.stringify(state.offScoopAndScoreAgainstUs));
ok(state.defOpponentScoopAndScore === 'neg',
  'A defense-unit "Fumble + Touchdown" the opponent kept and scored on is negative for our defense', JSON.stringify(state.defOpponentScoopAndScore));
ok(state.stMissedFieldGoal === 'neg', 'A missed Field Goal is negative for the attempting subject, not neutral', JSON.stringify(state.stMissedFieldGoal));
ok(state.stBlockedByUs === 'pos', 'A Field Goal we blocked is positive for the defending subject, not neutral', JSON.stringify(state.stBlockedByUs));
ok(state.stFailedTry === 'neg', 'A failed Try is negative for the attempting subject, not neutral', JSON.stringify(state.stFailedTry));
ok(state.stStoppedTheirTry === 'pos', 'Stopping the opponent\'s Try is positive for the defending subject, not neutral', JSON.stringify(state.stStoppedTheirTry));
ok(state.stNoPlayTry === '', 'A structured Try ruled No Play stays honestly neutral', JSON.stringify(state.stNoPlayTry));
ok(state.missingFieldSide === '—', 'A yard line with no valid field side renders the honest blank, never a bare number', JSON.stringify(state.missingFieldSide));
ok(state.fullDefCall === '4-3 · Cover 3 · Zone · Edge',
  'The defensive call composes Front + Coverage Call + Coverage Family + Blitz in full', JSON.stringify(state.fullDefCall));

console.log('\n== 2. Native commands drive canonical controllers ==');
await page.click('[data-native-play-id="7"]');
state = await page.evaluate(() => ({ current: window.app.tagger.currentPlayId,
  active: document.querySelector('.gi-play-card.is-current')?.dataset.nativePlayId,
  call: document.querySelector('[data-native-play-id="7"] small')?.textContent }));
ok(state.current === 7 && state.active === '7', 'Native play selection drives canonical PlayTagger identity', JSON.stringify(state));
ok(/Interception \+ Touchdown: -12/.test(state.call || ''), 'Selected play keeps complete result and yardage', state.call);

await page.evaluate(() => {
  const screen = window.app.breakdownTheater;
  const calls = { play: 0, back: 0, forward: 0, prev: 0, next: 0, loop: 0, draw: 0, angle: 0, copy: 0 };
  const bind = (owner, key, counter) => { owner[key] = () => { calls[counter]++; }; };
  bind(window.app.vc, 'togglePlay', 'play'); bind(window.app.vc, 'stepBack', 'back');
  bind(window.app.vc, 'stepForward', 'forward'); bind(window.app.vc, 'toggleLoopPlay', 'loop');
  bind(window.app.playlist, 'prevClip', 'prev'); bind(window.app.playlist, 'nextClip', 'next');
  bind(screen, 'openDrawing', 'draw'); bind(screen, 'addAngle', 'angle');
  bind(window.app.tagger, 'copyFromPrevious', 'copy'); window.__s5aCalls = calls;
});
for (const label of ['Previous clip', 'Step back one frame', 'Play film', 'Step forward one frame', 'Next clip', 'Loop current play', 'Drawing tools']) {
  await page.click(`[aria-label="${label}"]`);
}
await page.click('[aria-label="Add camera angle"]');
await page.click('.gi-theater-actions-primary button:nth-child(3)');
state = await page.evaluate(() => window.__s5aCalls);
ok(Object.values(state).every(value => value === 1), 'Transport, drawing, angle, and Copy Last delegate exactly once', JSON.stringify(state));

await page.click('.gi-autoplay-toggle input');
state = await page.evaluate(() => ({ app: window.app.autoPlayNext,
  stored: localStorage.getItem('ffa_autoplay_next'), obsoleteControl: !!document.getElementById('autoplayNextToggle') }));
ok(state.app === false && state.stored === '0' && state.obsoleteControl === false,
  'Autoplay persists through native state with no hidden compatibility control', JSON.stringify(state));

if (shotDir) await (await page.$('.gi-breakdown-theater')).screenshot({ path: path.join(shotDir, 'breakdown-theater-1440.png') });
console.log('\n== 3. Theater geometry spends the viewport on film ==');
const geometryAt = async (width, height) => {
  await page.setViewport({ width, height });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const media = document.getElementById('videoContainer').getBoundingClientRect();
    const pictureWidth = Math.min(media.width, media.height * 16 / 9);
    const theater = document.querySelector('.gi-breakdown-theater').getBoundingClientRect();
    const transport = document.querySelector('.gi-theater-transport').getBoundingClientRect();
    const strip = document.querySelector('.gi-drive-strip').getBoundingClientRect();
    const actions = document.querySelector('.gi-theater-actions').getBoundingClientRect();
    const pictureHeight = Math.min(media.height, media.width * 9 / 16);
    return { media: [Math.round(media.width), Math.round(media.height)], picture: [Math.round(pictureWidth), Math.round(pictureHeight)],
      theater: [Math.round(theater.top), Math.round(theater.bottom)],
      rows: [transport, strip, actions].map(row => [Math.round(row.top), Math.round(row.bottom), Math.round(row.height)]),
      contained: theater.top >= 0 && actions.bottom <= innerHeight
        && transport.height > 0 && strip.height > 0 && actions.height > 0
        && transport.top >= media.bottom - 1 && actions.top >= transport.bottom - 1 && strip.top >= actions.bottom - 1,
      type: Object.fromEntries(Object.entries({
        chyron: '.gi-chyron-k',
        action: '.gi-theater-actions button',
        autoplay: '.gi-autoplay-toggle',
        playMeta: '.gi-play-card > span',
      }).map(([key, selector]) => [key, parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)])),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
};
// Broadcast Density Part 1 (CLAUDE.md, 2026-08-16) adds a REQUIRED live
// below-film lower-third — the brief's own words: "Add the information strip
// below the video." A fixed-height row below the stage necessarily takes some
// picture height from the stage's minmax(...,1fr) row; there is no amount of
// padding-trimming that makes a visible, legible strip cost zero pixels.
//
// CORRECTED (Codex review of 2d4a5df caught the same class of false claim in
// the sibling e2e-breakdown-geometry.mjs; fixed here for consistency rather
// than leaving an identical inaccuracy uncorrected two files over). The
// original comment here compared the post-chyron picture against an
// unrelated, much older, much smaller historical number (1060x596, from a
// pre-S5a UX-1 investigation) and called that "still materially exceeds" —
// true of that stale figure, but not an honest description of what this
// FILE's own pre-Part-1 threshold actually was. This file's threshold before
// Part 1 was >=1200x675 (desktop) / >=1500x840 (wide); the measured picture
// with the required lower-third is smaller than both, a real and modest
// reduction, same as the split/focus cases in e2e-breakdown-geometry.mjs.
//
//   1440 desktop: was >=1200x675 -> measured ~1121x631
//   1920 wide:    was >=1500x840 -> measured ~1441x811
// Floors below assert the accepted post-chyron picture budget with a small
// safety margin, not "still exceeds legacy" — do not lower them further
// without the same kind of honest re-measurement.
const desktop = await geometryAt(1440, 900);
ok(desktop.picture[0] >= 1100 && desktop.picture[1] >= 615,
  '1440 theater meets the accepted post-chyron picture budget (a small, disclosed reduction from the pre-Part-1 1200x675)', JSON.stringify(desktop));
const wide = await geometryAt(1920, 1080);
ok(wide.picture[0] >= 1400 && wide.picture[1] >= 795,
  '1920 theater meets the accepted post-chyron picture budget (a small, disclosed reduction from the pre-Part-1 1500x840)', JSON.stringify(wide));
ok(desktop.contained && wide.contained,
  'Desktop theater keeps transport, strip, and play actions inside the working viewport', JSON.stringify({ desktop, wide }));
// The approved comp reserves 11px for terse metadata; commands stay 12px.
ok(desktop.type.chyron >= 11 && desktop.type.action >= 12
  && desktop.type.autoplay >= 12 && desktop.type.playMeta >= 11,
  'Desktop theater follows the approved command and metadata type hierarchy', JSON.stringify(desktop.type));
const tablet = await geometryAt(768, 1024);
if (shotDir) console.log('  QA    desktop geometry', JSON.stringify({ desktop, wide }));
await page.setViewport({ width: 1920, height: 1080 });
await page.click('[aria-label="Full screen"]');
await page.waitForFunction(() => (document.fullscreenElement || document.webkitFullscreenElement)?.matches?.('[data-native-player-surface]'));
state = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
  window.app.canvas._syncSize();
  const media = document.getElementById('videoContainer').getBoundingClientRect();
  const wrapper = document.getElementById('angleWrapper1').getBoundingClientRect();
  const canvas = document.getElementById('drawingCanvas');
  const drawing = canvas.getBoundingClientRect();
  resolve({
    target: (document.fullscreenElement || document.webkitFullscreenElement)?.matches?.('[data-native-player-surface]') || false,
    transportInside: !!(document.fullscreenElement || document.webkitFullscreenElement)?.querySelector?.('.gi-theater-transport'),
    transportVisible: document.querySelector('.gi-theater-transport').getBoundingClientRect().height > 0,
    media: [Math.round(media.width), Math.round(media.height)],
    canvasAligned: Math.abs(drawing.left - wrapper.left) <= 1
      && Math.abs(drawing.top - wrapper.top) <= 1
      && Math.abs(drawing.width - wrapper.width) <= 1
      && Math.abs(drawing.height - wrapper.height) <= 1,
    canvasPixels: [canvas.width, canvas.height],
    expectedPixels: [Math.round(wrapper.width * devicePixelRatio), Math.round(wrapper.height * devicePixelRatio)],
  });
})));
ok(state.target && state.transportInside && state.transportVisible && state.media[0] === 1920 && state.media[1] < 1080,
  'Full screen uses the complete player surface with visible transport and a viewport-width media stage', JSON.stringify(state));
ok(state.canvasAligned && state.canvasPixels.join('x') === state.expectedPixels.join('x'),
  'Drawing canvas stays pixel-aligned after native reparent and full screen', JSON.stringify(state));
state = await page.evaluate(() => {
  const theater = window.app.breakdownTheater;
  const originalPublish = theater._publish;
  let publishes = 0;
  theater._publish = () => { publishes++; };
  for (let index = 0; index < 20; index++) window.app.vc._emit('time-update', { time: index / 10 });
  const scrub = document.querySelector('.gi-theater-scrub');
  window.app.vc.videoElement.currentTime = 7;
  Object.defineProperty(window.app.vc.videoElement, 'duration', { configurable: true, value: 10 });
  window.app.vc._emit('time-update', { time: 7 });
  const transportLive = scrub.value === '0.7' && document.querySelectorAll('.gi-theater-time')[0].textContent === '0:07';
  const canvas = document.getElementById('drawingCanvas');
  const dormant = canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'hidden';
  window.app._selectTool('line');
  const armed = !canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'visible';
  window.app._selectTool(null);
  const disarmed = canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'hidden';
  theater._publish = originalPublish;
  return { publishes, transportLive, dormant, armed, disarmed };
});
ok(state.publishes === 0 && state.transportLive,
  'Fullscreen playback ticks update the visible transport without re-rendering the play strip', JSON.stringify(state));
ok(state.dormant && state.armed && state.disarmed,
  'Transparent drawing canvas leaves fullscreen composition until a drawing tool needs it', JSON.stringify(state));
await page.evaluate(() => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document));
await page.waitForFunction(() => !(document.fullscreenElement || document.webkitFullscreenElement));
const mobile = await geometryAt(390, 844);
ok(!desktop.pageOverflow && !wide.pageOverflow && !tablet.pageOverflow && !mobile.pageOverflow,
  'Theater has zero page-level horizontal overflow at all release widths', JSON.stringify({ desktop, wide, tablet, mobile }));
await page.click('[aria-label="Show play strip"]');
await new Promise(resolve => setTimeout(resolve, 50));
state = await page.evaluate(() => {
  const hits = [...document.querySelectorAll('.gi-breakdown-theater button')].filter(node => node.getClientRects().length).map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim(), height: node.getBoundingClientRect().height }));
  return { minHit: Math.min(...hits.map(item => item.height)), short: hits.filter(item => item.height < 44),
    internal: document.querySelector('[data-drive-scroll]').scrollHeight > document.querySelector('[data-drive-scroll]').clientHeight };
});
ok(state.minHit >= 44 && state.internal, 'Visible mobile controls meet touch targets and the open play browser scrolls internally', JSON.stringify(state));
await page.keyboard.press('Escape');
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'breakdown-theater-390.png') });

console.log('\n== 4. Exact restore leaves current route ownership untouched ==');
state = await page.evaluate(() => {
  const media = document.getElementById('videoContainer');
  const original = window.app.breakdownTheater._home.parent;
  const before = JSON.stringify(window.app.storage.seasonStore.data);
  const restored = window.app.breakdownTheater.restore();
  return { restored, mediaHome: media.parentElement === original,
    nativeGone: !document.querySelector('[data-native-breakdown-theater]'),
    dataSame: before === JSON.stringify(window.app.storage.seasonStore.data),
    obsoleteOwnerAbsent: !window.app.breakdownVideo
      && !document.querySelector('.breakdown-player-controls, .breakdown-play-strip') };
});
ok(state.restored && state.mediaHome && state.nativeGone && state.obsoleteOwnerAbsent,
  'Restore returns media without reviving the retired legacy presentation', JSON.stringify(state));
ok(state.dataSame, 'The complete native theater journey does not rewrite season payloads');
// ===================== S7-d2: the permanent media foundation ==============
//
// The one canonical media subtree now lives in #giMediaHost on BODY, not inside
// #app. It is adopted into the route while mounted and parked back in the
// permanent host on restore, so S7-d8 cannot take film with the legacy shell.
console.log('\n== S7-d2: media has a permanent home outside the legacy shell ==');
const d2 = await page.evaluate(async () => {
  const app = window.app;
  const media = document.getElementById('videoContainer');
  const host = document.getElementById('giMediaHost');
  const theater = app.breakdownTheater;
  const mountedIn = media?.closest('#app') ? 'app' : (media?.closest('#giMediaHost') ? 'host' : 'route');
  // Park it: restore must return the media to the PERMANENT host, never to #app.
  const restored = theater.restore();
  const parked = document.getElementById('videoContainer');
  const out = {
    hostExists: !!host,
    hostOutsideApp: !!host && !host.closest('#app'),
    mountedIn,
    restored,
    parkedInHost: !!parked?.closest('#giMediaHost'),
    parkedInApp: !!parked?.closest('#app'),
    // The theater's captured home must BE the permanent host, not legacy markup.
    homeOutsideApp: !!theater._home?.parent && !theater._home.parent.closest('#app'),
    // The permanent host owns media only; controls belong to the native theater.
    mediaPieces: ['videoPlayer', 'drawingCanvas', 'angleWrapper2', 'videoPlayer2',
                  'videoPlaceholder', 'videoLoadState']
      .filter(id => !!document.getElementById(id)?.closest('#giMediaHost, .gi-theater-media-slot')),
    retiredControls: ['btnPlayPause', 'scrubBar', 'timelineBar', 'playSelect',
                      'btnMarkStart', 'btnMarkEnd', 'angleControls']
      .filter(id => !!document.getElementById(id)),
  };
  await app.workspaceShell.show('breakdown');
  await new Promise(r => setTimeout(r, 400));
  out.remountedOutsideApp = !document.getElementById('videoContainer')?.closest('#app');
  return out;
});
ok(d2.hostExists && d2.hostOutsideApp,
  'A permanent media host exists on body, outside the legacy shell', JSON.stringify(d2));
ok(d2.parkedInHost && !d2.parkedInApp && d2.homeOutsideApp,
  'Restoring the theater parks the media in the permanent host, never back inside #app', JSON.stringify(d2));
ok(d2.mediaPieces.length === 6 && d2.retiredControls.length === 0,
  'The permanent host parks canonical media while native theater owns all controls', JSON.stringify(d2));
ok(d2.remountedOutsideApp,
  'Re-entering Break Down re-adopts the media without reaching into the legacy shell', JSON.stringify(d2));

// VideoController kept the film name in #fileLabel.textContent and read it back
// on an error. That top-bar label, its folder badge, and the drop zone were all
// deleted with #giLegacyEngineHost (Final Engine Independence) -- the name now
// lives on the controller and the label was always an optional mirror, so
// removing it at runtime here matches genuine cold-boot absence.
const d2b = await page.evaluate(() => {
  const vc = window.app.vc;
  const label = document.getElementById('fileLabel');
  const badge = document.getElementById('folderLoadBadge');
  const zone = document.getElementById('videoDropZone');
  [label, badge, zone].forEach(el => el?.remove());
  vc.fileLabel = document.getElementById('fileLabel');
  vc.folderLoadBadge = document.getElementById('folderLoadBadge');
  let threw = null;
  try {
    vc.loadUrl('asset://localhost/x.mp4', 'Week 3 vs Alpha.mp4');
    vc._showFolderBadge([{ name: 'a.mp4' }, { name: 'b.mp4' }]);
  } catch (e) { threw = String(e); }
  return { threw, remembered: vc.currentFileName, labelGone: !document.getElementById('fileLabel') };
});
ok(d2b.threw === null && d2b.labelGone && d2b.remembered === 'Week 3 vs Alpha.mp4',
  'Film loading survives the top-bar label and folder badge being gone, and the film name has a real owner', JSON.stringify(d2b));

ok(errors.length === 0, 'Native S5a journey has zero page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

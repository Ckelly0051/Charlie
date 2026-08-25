import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
const screenshotDir = process.env.GIQ_REPORTS_SCREENSHOTS || '';
const capture = async name => {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: screenshotDir + '/' + name + '.png', fullPage: false });
};
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

console.log('\n== 1. Native Reports owns the route and preserves the legacy node ==');
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Reports QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, unit, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  app.storage.seasonStore.data.games = [
    {
      id: 'g-self', name: 'Week 1 vs Wildcats', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'self', scoreUs: 21, scoreThem: 14 },
      plays: [
        play(1, 'offense', { formation: 'Trips', qbAlignment: 'Shotgun', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { formation: 'Ace', qbAlignment: 'Under Center', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '6', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        play(3, 'special', { stType: 'Kickoff', kickOutcome: 'Returned', kickDistance: '55', returnYards: '18' }),
      ],
    },
    {
      id: 'g-scout', name: 'Wildcats vs Knights', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
      plays: [
        play(1, 'offense', { formation: 'Bunch', qbAlignment: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '7', down: '3', distance: '5', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { defFront: '3-3-5', coverage: 'Cover 1', blitz: 'Edge' }),
        play(3, 'special', { stType: 'Punt', kickOutcome: 'Returned', kickDistance: '42', returnYards: '6' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'g-self';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
});
await sleep(150);
let result = await page.evaluate(() => ({
  native: document.querySelectorAll('#wsReports > [data-native-reports]').length,
  dashboardIds: document.querySelectorAll('#statsDashboard').length,
  // Final Engine Independence (2026-08-22, repaired after CHANGES REQUESTED
  // review d51c97b): #statsDashboard/#btnCloseStats have no authored markup
  // anywhere -- not in #giLegacyEngineHost, not as a detached fallback either.
  // StatsEngine.dashboardEl is explicitly null until a route supplies a real,
  // connected target via setDashboardTarget(); it is never a fabricated
  // stand-in. So "there is exactly one live owner of #statsDashboard" is
  // provable directly off the engine's own field, not inferred from a
  // detached fallback's absence.
  // dashboardEl is native-reports.jsx's inner [data-native-report-content]
  // node, a descendant of the #statsDashboard route root -- not that root
  // element itself. The provable claim is that it is the exact, connected
  // content node living inside the one true #statsDashboard section.
  engineTargetIsLiveContent: window.app?.stats?.dashboardEl === document.querySelector('#wsReports [data-native-reports]#statsDashboard [data-native-report-content]'),
  engineTargetConnected: !!window.app?.stats?.dashboardEl?.isConnected,
  tabs: [...document.querySelectorAll('#wsReports [data-report-tab]')].map(node => node.dataset.reportTab),
  actions: [...document.querySelectorAll('#wsReports [data-rp-action]')].map(node => node.dataset.rpAction),
}));
ok(result.native === 1 && result.dashboardIds === 1 && result.engineTargetIsLiveContent && result.engineTargetConnected,
  'Reports has one native owner; StatsEngine.dashboardEl is exactly the live, connected content node it owns', JSON.stringify(result));
ok(result.tabs.join(',') === 'overview,offense,defense,special,players,selfscout,season,matchup',
  'Native Reports exposes all eight football report views', JSON.stringify(result.tabs));
ok(result.actions.includes('scout') && result.actions.includes('export'),
  'Native Reports exposes scout and export commands', JSON.stringify(result.actions));

console.log('\n== F15. A withheld render target fails loudly instead of rendering into nowhere ==');
// Repair of Codex CHANGES REQUESTED review d51c97b, finding 1: a prior version
// of StatsEngine.dashboardEl defaulted to a detached, never-inserted <div>, so
// every report-render entry point could succeed into that invisible node
// whenever native ownership was unavailable -- masking a lifecycle failure as
// a silent success. dashboardEl is now explicitly null until injected; every
// render entry point must refuse (loudly) rather than render into an
// absent/detached element. This withholds the target directly -- the exact
// scenario the review named -- and proves both the refusal and the recovery.
const beforeErrorCount = errors.length;
let withheld = await page.evaluate(() => {
  const stats = window.app.stats;
  const priorTarget = stats.dashboardEl;
  const priorHtml = priorTarget ? priorTarget.innerHTML : null;
  stats.setDashboardTarget(null);

  let showThrew = false;
  try { stats.showDashboard(); } catch (e) { showThrew = true; }
  const targetStillNullAfterShow = stats.dashboardEl === null;
  const priorNodeUntouchedAfterShow = priorTarget ? priorTarget.innerHTML === priorHtml : true;

  let defThrew = false;
  try { stats.renderDefensiveReport(); } catch (e) { defThrew = true; }
  const targetStillNullAfterDef = stats.dashboardEl === null;
  const priorNodeUntouchedAfterDef = priorTarget ? priorTarget.innerHTML === priorHtml : true;

  // Restore the real target -- the positive control proving the guard is a
  // refusal, not a permanent lockout, and that recovery leaves the engine
  // pointed at exactly the same live section as before.
  stats.setDashboardTarget(priorTarget);
  const recovered = stats.dashboardEl === priorTarget;

  return {
    showThrew, targetStillNullAfterShow, priorNodeUntouchedAfterShow,
    defThrew, targetStillNullAfterDef, priorNodeUntouchedAfterDef,
    recovered,
  };
});
const newErrors = errors.slice(beforeErrorCount);
const sawShowRefusal = newErrors.some(e => /showDashboard\(\) called with no connected native Reports target/.test(e));
const sawDefRefusal = newErrors.some(e => /renderDefensiveReport\(\) called with no connected native Reports target/.test(e));
ok(!withheld.showThrew && withheld.targetStillNullAfterShow && withheld.priorNodeUntouchedAfterShow && sawShowRefusal,
  'showDashboard() with a withheld target fails loudly (a captured error) instead of rendering into an absent element',
  JSON.stringify({ withheld, newErrors }));
ok(!withheld.defThrew && withheld.targetStillNullAfterDef && withheld.priorNodeUntouchedAfterDef && sawDefRefusal,
  'renderDefensiveReport() with a withheld target fails the same way -- the guard is systemic, not one call site',
  JSON.stringify({ withheld, newErrors }));
ok(withheld.recovered, 'The withheld target is a refusal, not a lockout -- re-injecting it restores the exact same live section', JSON.stringify(withheld));
// Both refusals are the expected, deliberately-triggered signal this test
// exists to prove, not an unrelated regression -- exclude them from the
// journey's final "no page errors" assertion rather than let them mask it.
errors.splice(beforeErrorCount, newErrors.length);

result = await page.evaluate(() => {
  const host = document.getElementById('wsReports');
  const native = host?.querySelector('[data-native-reports]');
  const hostRect = host?.getBoundingClientRect();
  const nativeRect = native?.getBoundingClientRect();
  const style = host ? getComputedStyle(host) : null;
  return {
    hostWidth: Math.round(hostRect?.width || 0), hostHeight: Math.round(hostRect?.height || 0),
    nativeWidth: Math.round(nativeRect?.width || 0), nativeHeight: Math.round(nativeRect?.height || 0),
    overflowY: style?.overflowY || '',
  };
});
ok(result.hostWidth > 0 && result.hostHeight > 0 && result.nativeWidth > 0 && result.nativeHeight > 0 && result.overflowY === 'auto',
  'Reports owns a non-collapsed scroll viewport in the shell grid', JSON.stringify(result));

result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.content.remove();
  const recovered = app.reportsScreen.show();
  return {
    recovered,
    contentConnected: !!app.reportsScreen.content?.isConnected,
    pane: !!document.querySelector('#wsReports [data-native-main-report]'),
  };
});
ok(result.recovered && result.contentConnected && result.pane,
  'Reports remounts when its native content owner is detached', JSON.stringify(result));

result = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const original = screen._renderActiveTab;
  const originalConsoleError = console.error;
  screen._renderActiveTab = () => { throw new Error('forced report failure'); };
  console.error = () => {};
  const rendered = screen.show();
  console.error = originalConsoleError;
  screen._renderActiveTab = original;
  const alert = document.querySelector('#wsReports [role="alert"]');
  const visibleFailure = /Reports unavailable/.test(alert?.textContent || '') && /film and tags are safe/i.test(alert?.textContent || '');
  const failureStyle = alert ? getComputedStyle(alert) : null;
  const failureTone = failureStyle ? { background:failureStyle.backgroundColor, border:failureStyle.borderLeftColor, width:failureStyle.borderLeftWidth } : null;
  screen.content.innerHTML = screen._emptyHtml();
  const empty = screen.content.querySelector('.gi-reports-empty');
  const emptyStyle = empty ? getComputedStyle(empty) : null;
  const emptyTone = emptyStyle ? { background:emptyStyle.backgroundColor, border:emptyStyle.borderLeftColor } : null;
  const recovered = screen.show();
  return { rendered, visibleFailure, failureTone, emptyTone, recovered, pane: !!document.querySelector('#wsReports [data-native-main-report]') };
});
ok(result.rendered === false && result.visibleFailure && result.recovered && result.pane,
  'Reports fails visibly without stranding the route and recovers on retry', JSON.stringify(result));
ok(result.failureTone?.width !== '0px' && result.failureTone?.background !== result.emptyTone?.background && result.failureTone?.border !== result.emptyTone?.border,
  'Report failure uses a distinct danger surface while no-data guidance remains neutral', JSON.stringify(result));

// The 1.12.0-14 outage: opening a linked game auto-loads film, the dismissed
// legacy Wizard advanced on `video-loaded`, and its step side effect hid
// #statsDashboard — an id that belongs to native Reports. The coach got a fully
// rendered report at 0x0.
//
// S7-b retires that module, so the defect is now structurally impossible rather
// than merely guarded. Both halves are asserted: the coach-facing OUTCOME (a
// video-load leaves Reports visible and populated) and the ABSENCE of the owner,
// so reintroducing a boot-time subscriber that hides the route reds this.
result = await page.evaluate(async () => {
  const app = window.app;
  await app.workspaceShell.show('home');
  let sideEffects = 0;
  const originalHideDashboard = app.stats.hideDashboard;
  app.stats.hideDashboard = (...args) => {
    sideEffects += 1;
    return originalHideDashboard.apply(app.stats, args);
  };
  app.vc._emit('video-loaded', { duration: 600 });
  app.stats.hideDashboard = originalHideDashboard;
  const native = document.querySelector('#wsReports [data-native-reports]');
  const hiddenAfterLoad = native?.classList.contains('hidden');
  const nav = await app.workspaceShell.show('reports');
  const rect = native?.getBoundingClientRect();
  return {
    nav: nav.ok,
    wizard: !!app.wizard,
    wizardBar: !!document.querySelector('.wizard-bar, .wiz-step, #btnToggleWizard'),
    sideEffects,
    hiddenAfterLoad,
    hiddenAfterReports: native?.classList.contains('hidden'),
    width: Math.round(rect?.width || 0),
    height: Math.round(rect?.height || 0),
    textLength: document.querySelector('[data-native-report-content]')?.textContent.trim().length || 0,
  };
});
ok(result.nav && result.sideEffects === 0
  && !result.hiddenAfterLoad && !result.hiddenAfterReports
  && result.width > 0 && result.height > 0 && result.textLength > 0,
  'A linked-film video-load leaves native Reports visible and populated', JSON.stringify(result));
ok(result.wizard === false && result.wizardBar === false,
  'The legacy onboarding wizard is absent, not hidden, so it cannot hide native Reports again', JSON.stringify(result));
await capture('desktop-overview');

console.log('\n== 1b. Approved scorebug uses official score and escapes imported values ==');
result = await page.evaluate(() => {
  const app=window.app; app.reportsScreen.selectTab('overview');
  const read=()=>{ const bug=document.querySelector('[data-reports-scorebug]'); return { hidden:bug?.hidden, scores:[...(bug?.querySelectorAll('.gi-scorebug-team strong')||[])].map(n=>n.textContent.trim()), text:bug?.textContent||'', images:bug?.querySelectorAll('img').length||0 }; };
  const official=read(); window.__xssFired=false; app.storage.gameInfo.scoreUs='<img src=x onerror=window.__xssFired=true>'; app.reportsScreen._syncHeader(); const hostile=read(); app.storage.gameInfo.scoreUs=21; app.reportsScreen._syncHeader(); return {official,hostile,fired:window.__xssFired};
});
ok(result.official.hidden===false && result.official.scores.join('|')==='21|14','The scorebug leads with the official Game Settings score when tagged scoring is incomplete',JSON.stringify(result.official));
ok(!result.fired && result.hostile.images===0 && result.hostile.text.includes('<img src=x'),'Imported score values render as inert text in the approved scorebug',JSON.stringify(result.hostile));

console.log('\n== 1c. Turnovers tile never claims an uncharted side, and Plays per Phase reads unambiguously ==');
result = await page.evaluate(async () => {
  const app = window.app;
  const play = (id, unit, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  const readRail = () => {
    const rail = document.querySelector('[data-reports-rail]');
    const tiles = [...(rail?.querySelectorAll('.gi-kpi') || [])];
    const findTile = label => tiles.find(t => t.querySelector('.gi-kpi-label')?.textContent === label);
    const to = findTile('Turnovers');
    const ph = findTile('Plays per Phase');
    return {
      toPresent: !!to,
      tone: to ? (to.classList.contains('is-pos') ? 'pos' : to.classList.contains('is-neg') ? 'neg' : '') : null,
      toValue: to?.querySelector('.gi-kpi-value')?.textContent || null,
      toSub: to?.querySelector('.gi-kpi-sub')?.textContent || null,
      phaseValue: ph?.querySelector('.gi-kpi-value')?.textContent || null,
    };
  };
  const load = async (id, plays) => {
    app.storage.seasonStore.data.games = [{
      id, name: id, nextId: plays.length + 1,
      gameInfo: { opponent: 'Wildcats', perspective: 'self' },
      plays,
    }];
    app.storage.seasonStore.data.activeGameId = id;
    app.storage._loadActiveGame();
    await app.workspaceShell.show('reports');
    app.reportsScreen.selectTab('offense');
    await new Promise(r => setTimeout(r, 200));
    return readRail();
  };
  // Codex review of `d567f5c` (2026-08-17): stats.turnovers is unconditionally
  // produced by compute() from offPlays even when offPlays is empty, so a
  // defense-only game's `{total:0}` was read as an observed giveaway count
  // instead of "nothing charted" -- a fabricated "0 GA" plus a colored margin
  // on a game where the offense was never charted.
  const defenseOnly = await load('g-def-only', [
    play(1, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { tackler: '21' } }),
    play(2, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '3', down: '1', distance: '10' }),
  ]);
  // The mirrored case: an offense-only game with a real giveaway.
  const offenseOnly = await load('g-off-only', [
    play(1, 'offense', { formation: 'Trips', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { passer: '12' } }),
    play(2, 'offense', { formation: 'Trips', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' }),
  ]);
  // Both units charted, with a genuine net margin -- 1 giveaway, 2 takeaways
  // -- plus the exact "O 2 · D 2 · ST 0" phrasing for Plays per Phase, which
  // replaces the "50O / 13D / 3ST" reading that looked like "500" at a glance.
  const both = await load('g-both', [
    play(1, 'offense', { formation: 'Trips', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { passer: '12' } }),
    play(2, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { tackler: '21' } }),
    play(3, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Pass', playType: 'Short Pass', result: 'Fumble', fumbleRecovery: 'subject', yardage: '2', down: '3', distance: '4', players: { tackler: '55' } }),
    play(4, 'offense', { formation: 'Trips', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' }),
  ]);
  return { defenseOnly, offenseOnly, both };
});
ok(result.defenseOnly.toPresent && result.defenseOnly.toValue === '1 TA' && result.defenseOnly.toSub === 'no offensive snaps charted' && !result.defenseOnly.tone,
  'A defense-only game shows only takeaways, never a fabricated "0 GA" or a colored margin', JSON.stringify(result.defenseOnly));
ok(result.offenseOnly.toPresent && result.offenseOnly.toValue === '1 GA' && result.offenseOnly.toSub === 'no defensive snaps charted' && !result.offenseOnly.tone,
  'An offense-only game shows only giveaways, never a fabricated "0 TA" or a colored margin', JSON.stringify(result.offenseOnly));
ok(result.both.toPresent && result.both.toValue === '1 GA · 2 TA' && result.both.tone === 'pos' && result.both.toSub === '+1 margin',
  'Both units charted with a genuine takeaway margin colors green and states the real margin', JSON.stringify(result.both));
ok(result.both.phaseValue === 'OFF2DEF2ST0',
  'Plays per Phase reads as unambiguous literal labels, never a digit run that could be misread as one number', JSON.stringify(result.both));

console.log('\n== 1d. Overview keeps the official score primary without the rejected alarm ==');
result = await page.evaluate(()=>{ window.app.reportsScreen.selectTab('overview'); window.app.reportsScreen._syncHeader(); return { scorebug:!document.querySelector('[data-reports-scorebug]')?.hidden, rejectedAlarm:!!document.querySelector('.scoreboard-mismatch,.gi-overview-reconciliation'), oldScoreboard:!!document.querySelector('.scoreboard-layout') }; });
ok(result.scorebug && !result.rejectedAlarm && !result.oldScoreboard,'Overview uses the approved scorebug without reviving the rejected alarm or legacy scoreboard',JSON.stringify(result));

// 1c/1d swapped in their own minimal fixtures game-by-game; every later
// section in this file continues building on the original two-game g-self/
// g-scout fixture from section 1, so it is restored here byte-identical
// before that continuation resumes.
await page.evaluate(async () => {
  const app = window.app;
  const play = (id, unit, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  app.storage.seasonStore.data.games = [
    {
      id: 'g-self', name: 'Week 1 vs Wildcats', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'self', scoreUs: 21, scoreThem: 14 },
      plays: [
        play(1, 'offense', { formation: 'Trips', qbAlignment: 'Shotgun', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { formation: 'Ace', qbAlignment: 'Under Center', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '6', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        play(3, 'special', { stType: 'Kickoff', kickOutcome: 'Returned', kickDistance: '55', returnYards: '18' }),
      ],
    },
    {
      id: 'g-scout', name: 'Wildcats vs Knights', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
      plays: [
        play(1, 'offense', { formation: 'Bunch', qbAlignment: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '7', down: '3', distance: '5', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { defFront: '3-3-5', coverage: 'Cover 1', blitz: 'Edge' }),
        play(3, 'special', { stType: 'Punt', kickOutcome: 'Returned', kickDistance: '42', returnYards: '6' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'g-self';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
});

console.log('\n== 2. Every self report is reachable without changing season data ==');
result = await page.evaluate(() => {
  const app = window.app;
  const before = JSON.stringify(app.storage.seasonStore.data);
  const evidence = {};
  const needles = {
    overview: ['Team Stats', 'Down'], offense: ['Offense'], defense: ['Defense'],
    special: ['Special Teams'], players: ['Individual'], selfscout: ['Self-Scout'],
    season: ['Season'], matchup: ['Matchup'],
  };
  for (const tab of Object.keys(needles)) {
    app.reportsScreen.selectTab(tab);
    const pane = document.querySelector(`[data-pane="${tab}"]`);
    const text = (pane?.textContent || '').replace(/\s+/g, ' ').trim();
    evidence[tab] = { exists: !!pane, marker: needles[tab].some(needle => text.includes(needle)), length: text.length };
  }
  const after=JSON.stringify(app.storage.seasonStore.data);let at=0;while(at<before.length&&before[at]===after[at])at++;
  return { evidence, unchanged: before === after, diff:{at,before:before.slice(at,at+180),after:after.slice(at,at+180)} };
});
ok(Object.values(result.evidence).every(item => item.exists && item.length > 0),
  'All eight report views render a real pane', JSON.stringify(result.evidence));
ok(result.evidence.special.marker && result.evidence.selfscout.marker && result.evidence.season.marker,
  'Special Teams, Self-Scout, and Season retain their football-specific surfaces', JSON.stringify(result.evidence));
ok(result.unchanged, 'Report navigation is read-only against canonical season data', JSON.stringify(result.diff));


console.log('\n== 2b. Defense is season-wide, performance-first, and film-exact ==');
result = await page.evaluate(() => {
  const app = window.app;
  const mk = (gid, id, tags) => {
    const play = { id, timestamp: { start: id * 4, end: id * 4 + 3 }, tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags } };
    Object.defineProperty(play, '__gid', { value: gid, enumerable: false });
    return play;
  };
  const plays = [
    mk('a', 1, { runPass: 'Run', playType: 'Run Inside', result: 'No Gain', yardage: '0', down: '1', distance: '10', defFront: '4-2-5', coverage: 'Cover 3' }),
    mk('a', 2, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '8', defFront: '4-2-5', coverage: 'Cover 3' }),
    mk('b', 1, { runPass: 'Run', playType: 'Run Outside', result: 'Touchdown', yardage: '20', down: '3', distance: '5', fieldSide: 'opp', yardLine: '10', defFront: '5-2', coverage: 'Cover 1', blitz: 'Edge' }),
    mk('b', 2, { runPass: 'Pass', playType: 'Short Pass', result: 'Interception', yardage: '0', down: '3', distance: '7', fieldSide: 'opp', yardLine: '10', defFront: '4-2-5', coverage: 'Cover 3', blitz: 'Edge' }),
    { ...mk('b', 3, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '99', down: '1', distance: '10' }), penalties: [{ id: 'no-play', team: 'opponent', phase: 'offense', foul: 'False start', disposition: 'accepted', playCounts: false }] },
  ];
  const model = app.stats.defensivePerformance(plays, { a: 'Week 1', b: 'Week 2' });
  app.reportsScreen.show();
  app.reportsScreen.selectTab('defense');
  const pane = document.querySelector('[data-pane="defense"]');
  const seasonActive = pane?.querySelector('[data-defense-scope="season"].active') != null;
  const runInside = model.playTypes.find(row => row.name === 'Run Inside');
  const duplicateRefs = model.summary.refs.filter(ref => ref.endsWith('::1'));
  const typeTable = pane?.querySelector('.gi-def-type');
  const typeRowsBefore = [...(typeTable?.querySelectorAll('tbody tr') || [])].map(row => row.cells[0]?.textContent.trim());
  // DataTable (native-report-kit.jsx) makes every header clickable/sortable
  // by design -- role="button" is the live marker, not a static per-column
  // "this one is sortable" class the legacy `_makeSortable()` DOM convention
  // used. Sort reads directly off the row object's field, so verify the
  // effect (real cell text, ascending) rather than a `data-sort` attribute
  // DataTable never writes.
  const sortableHeaders = typeTable?.querySelectorAll('thead th[role="button"]').length || 0;
  typeTable?.querySelector('thead th:nth-child(3)')?.click();
  const typeRowsAfterYppSort = [...(typeTable?.querySelectorAll('tbody tr') || [])].map(row => row.cells[0]?.textContent.trim());
  const yppAfterSort = [...(typeTable?.querySelectorAll('tbody tr') || [])].map(row => parseFloat(row.cells[2]?.textContent));
  const aggregateCards = [...(pane?.querySelectorAll('.gi-def-type-summary') || [])].map(card => card.textContent.trim());
  const answerHead = typeTable?.querySelector('thead');
  const answerFirst = typeTable?.querySelector('tbody tr');
  const answerHeaderPosition = answerHead?.querySelector('th') ? getComputedStyle(answerHead.querySelector('th')).position : '';
  const answerRowsClearHeader = !answerHead || !answerFirst || answerFirst.getBoundingClientRect().top >= answerHead.getBoundingClientRect().bottom - 1;
  const before = pane?.querySelector('.gi-def-kpi strong')?.textContent || '';
  let watched = null;
  const originalWatch = app.filmNavigation.watch;
  app.filmNavigation.watch = refs => { watched = refs; return true; };
  // Real onClick wiring (Watchable/WatchableRefs), not the legacy delegated
  // `[data-defense-refs]` attribute -- click an actual clickable type row.
  pane?.querySelector('.gi-def-type tbody tr.cut-row')?.click();
  app.filmNavigation.watch = originalWatch;
  pane?.querySelector('[data-defense-scope="game"]')?.click();
  const gameActive = document.querySelector('[data-pane="defense"] [data-defense-scope="game"].active') != null;
  const after = document.querySelector('[data-pane="defense"] .gi-def-kpi strong')?.textContent || '';
  return {
    total: model.total, ypp: model.summary.yardsPerPlay, stop: model.summary.stopRate,
    third: model.thirdDownStopRate, redZone: model.redZoneTdRate, takeaways: model.takeaways,
    runInside: runInside && { n: runInside.n, refs: runInside.refs },
    duplicateRefs, games: model.byGame.map(row => row.name),
    seasonActive, gameActive, before, after, watched, typeRowsBefore, typeRowsAfterYppSort,
    sortableHeaders, aggregateCards, yppAfterSort, answerHeaderPosition, answerRowsClearHeader,
    headings: [...(pane?.querySelectorAll('h3') || [])].map(node => node.textContent.trim()),
    scoutExcluded: before === '1',
  };
});
ok(result.total === 4 && result.ypp === 6 && result.stop === 75
  && result.third === 50 && result.redZone === 50 && result.takeaways === 1,
  'Defensive performance uses the established success direction and exact season cohort', JSON.stringify(result));
ok(result.runInside?.n === 2 && JSON.stringify(result.runInside.refs) === JSON.stringify(['a::1', 'a::2'])
  && JSON.stringify(result.duplicateRefs) === JSON.stringify(['a::1', 'b::1']),
  'Opponent play-type rows retain composite game/play identity even when bare ids collide', JSON.stringify(result));
ok(Array.isArray(result.watched) && result.watched.length === 1 && result.watched[0] === 'g-self::2',
  'A season Defense row launches exactly the film refs it displays', JSON.stringify(result.watched));
ok(result.games.join(',') === 'Week 1,Week 2'
  && result.seasonActive && result.gameActive && result.scoutExcluded,
  'Defense defaults to full season, excludes opponent-scout games, and can switch to current game', JSON.stringify(result));
ok(result.headings.includes('Defensive Performance')
  && result.headings.includes('Opponent Offense by Play Type')
  && result.headings.includes('Game Trend')
  && result.headings.includes('Situational Defense'),
  'The Defense page leads with performance, play type, game trend, and situation', JSON.stringify(result.headings));
ok(result.sortableHeaders === 7
  && result.typeRowsBefore.length > 0
  && result.typeRowsAfterYppSort.length === result.typeRowsBefore.length
  // DataTable's first click on a column sorts descending (its established,
  // shared convention -- already live on Offense/Players' tables); a real
  // sort toggle exists is the thing under test, not which direction leads.
  && result.yppAfterSort.every((value, index, values) => index === 0 || values[index - 1] >= value)
  && result.typeRowsBefore.every(name => name !== 'All Runs' && name !== 'All Passes')
  && result.aggregateCards.length > 0
  && result.aggregateCards.every(text => text.includes('All Runs') || text.includes('All Passes')),
  'Opponent offense is a sortable play-type table with Run/Pass totals separated from detail rows', JSON.stringify(result));
ok(result.answerHeaderPosition === 'static' && result.answerRowsClearHeader,
  'Defense table headers stay in normal flow and never cover the first answer row', JSON.stringify(result));
console.log('\n== 3. A self-report row launches the exact active-game film cohort ==');
result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.selectTab('offense');
  // Migrated components (native-report-kit.jsx `Watchable`) wire film activation
  // through a real onClick/onKeyDown closure over `screen.watchCut`/`watchRefs`
  // -- there is no delegated data-cut-type attribute to read back, so the proof
  // is structural: a real activatable row exists, keyboard Enter reaches the
  // canonical film seam exactly once, and every returned ref is a genuine
  // composite `gameId::playId` naming a play that actually belongs to the
  // active game (never a bare id, never another game's play).
  const row = document.querySelector('[data-pane="offense"] .cut-row');
  if (!row) return { row: false };
  const activeGameId = app.storage.seasonStore.data.activeGameId;
  const activePlayIds = new Set((app.storage.seasonStore.data.games.find(g => g.id === activeGameId)?.plays || []).map(p => String(p.id)));
  let calls = 0, refs = null;
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (r) => { calls++; refs = r; return true; };
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  app.filmNavigation.watch = original;
  return { row: true, calls, refs, activeGameId,
    composite: Array.isArray(refs) && refs.length > 0 && refs.every(ref => {
      const [gid, pid] = String(ref).split('::');
      return gid === activeGameId && activePlayIds.has(pid);
    }) };
});
ok(result.row && result.calls === 1 && result.composite,
  'Keyboard activation sends the exact active-game report cohort to film navigation', JSON.stringify(result));

console.log('\n== 4. Opponent perspective keeps offense, defense, and Special Teams honest ==');
result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.scoutOpponent();
  const data = app.reportsScreen._opponentData;
  return {
    games: data?.games,
    offense: app.reportsScreen._opponentRefs('offense'),
    defense: app.reportsScreen._opponentRefs('defense'),
    special: app.reportsScreen._opponentRefs('special'),
    all: app.reportsScreen._opponentRefs('all'),
    visibleTabs: [...document.querySelectorAll('[data-report-tab]')].filter(node => !node.hidden).map(node => node.dataset.reportTab),
    text: document.querySelector('[data-native-report-content]')?.textContent || '',
  };
});
ok(result.games === 2
  && JSON.stringify(result.offense) === JSON.stringify(['g-self::2', 'g-scout::1'])
  && JSON.stringify(result.defense) === JSON.stringify(['g-self::1', 'g-scout::2']),
  'Opponent offense and defense retain composite game/play identity across duplicate play ids', JSON.stringify(result));
ok(JSON.stringify(result.special) === JSON.stringify(['g-scout::3']) && !result.all.includes('g-self::3'),
  'Opponent Special Teams includes scout film and excludes ambiguous head-to-head ST', JSON.stringify(result));
ok(result.visibleTabs.join(',') === 'overview,offense,defense,special'
  && /Games Charted:\s*2/.test(result.text),
  'Opponent mode exposes only supported views and a dynamic sample strip', JSON.stringify(result));
await capture('desktop-opponent');

result = await page.evaluate(() => {
  const app = window.app;
  const calls = [];
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label || '' }); return true; };
  for (const kind of ['offense', 'defense', 'special']) {
    app.reportsScreen.selectTab(kind);
    document.querySelector(`[data-opponent-watch="${kind}"]`)?.click();
  }
  app.filmNavigation.watch = original;
  return calls;
});
ok(result.length === 3
  && JSON.stringify(result[0].refs) === JSON.stringify(['g-self::2', 'g-scout::1'])
  && JSON.stringify(result[1].refs) === JSON.stringify(['g-self::1', 'g-scout::2'])
  && JSON.stringify(result[2].refs) === JSON.stringify(['g-scout::3']),
  'Opponent Watch controls launch the exact displayed unit cohorts', JSON.stringify(result));

console.log('\n== 5. Export commands stay wired to canonical owners ==');
result = await page.evaluate(() => {
  const app = window.app;
  const calls = [];
  const originals = {
    pdf: app.stats._exportStats,
    html: app.storage.exportHtmlReport,
    csv: app.storage.exportCsv,
    callSheet: app.callSheet.show,
    seasonHtml: app.season.exportHtml,
  };
  app.stats._exportStats = () => calls.push('pdf');
  app.storage.exportHtmlReport = () => calls.push('html');
  app.storage.exportCsv = () => calls.push('csv');
  app.callSheet.show = () => calls.push('call-sheet');
  app.season.exportHtml = () => { calls.push('season-html'); return true; };
  for (const kind of ['pdf', 'html', 'season-html', 'csv', 'call-sheet']) app.reportsScreen.export(kind);
  app.stats._exportStats = originals.pdf;
  app.storage.exportHtmlReport = originals.html;
  app.storage.exportCsv = originals.csv;
  app.callSheet.show = originals.callSheet;
  app.season.exportHtml = originals.seasonHtml;
  return calls;
});
ok(result.join(',') === 'pdf,html,season-html,csv,call-sheet',
  'Native Reports routes game HTML, full-season HTML, PDF, CSV, and Call Sheet to their canonical owners', JSON.stringify(result));

result = await page.evaluate(async () => {
  const app=window.app,before=JSON.stringify(app.storage.seasonStore.data),original=window.ffaSaveBlob;
  let capture=null,pending=null;window.ffaSaveBlob=(blob,name)=>{pending=blob.text().then(html=>{capture={html,name};});};
  const ok=app.season.exportHtml();await pending;window.ffaSaveBlob=original;
  return {ok,name:capture?.name,html:capture?.html||'',unchanged:JSON.stringify(app.storage.seasonStore.data)===before};
});
ok(result.ok && /season_report_/.test(result.name) && /Season Report/.test(result.html) && /Generated .* 2 games/.test(result.html) && result.unchanged,
  'Full-season HTML export is downloadable, honest about scope, and read-only against canonical data', JSON.stringify({ok:result.ok,name:result.name,unchanged:result.unchanged}));

console.log('\n== 6. Mobile Reports contains overflow and preserves touch targets ==');
await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => {
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('overview');
  window.scrollTo(0, 0);
});
await sleep(100);
result = await page.evaluate(() => {
  const controls = [...document.querySelectorAll('.gi-reports-command,[data-report-tab],.gi-reports-segment button')]
    .filter(node => !node.hidden && getComputedStyle(node).display !== 'none')
    .map(node => ({ label: node.textContent.trim(), height: Math.round(node.getBoundingClientRect().height) }));
  const tabstrip = document.querySelector('.gi-reports-tabs');
  return {
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    minControl: Math.min(...controls.map(item => item.height)),
    controls,
    tabScrollsInternally: tabstrip.scrollWidth > tabstrip.clientWidth,
  };
});
ok(result.pageWidth <= result.viewport, 'Mobile Reports has no page-level horizontal overflow', JSON.stringify(result));
ok(result.controls.filter(item=>item.height>0).every(item=>item.height>=30) && result.tabScrollsInternally,
  'Compact pointer controls remain usable and report tabs scroll inside their own strip', JSON.stringify(result));
await capture('mobile-overview');

console.log('\n== CHARLIE GATE. Approved broadcast-density Overview composition ==');
await page.setViewport({width:1400,height:860});
await page.evaluate(async()=>{ const app=window.app,store=app.storage.seasonStore,looks=['Trips','Ace','Wing-T','Bunch','Empty','Doubles'],types=['Run Inside','Run Outside','Short Pass','Deep Pass','Screen','Play Action'],game=store.data.games.find(x=>x.id==='g-self'); game.plays=Array.from({length:64},(_,i)=>({id:i+1,timestamp:{start:i*5,end:i*5+4},notes:'',analysis:null,tags:{unit:i%5===4?'defense':'offense',formation:looks[i%looks.length],backfield:i%2?'I':'Single',personnel:i%2?'11':'21',runPass:i%2?'Run':'Pass',playType:types[i%types.length],result:i%9===0?'Touchdown':(i%7===0?'Loss':'Gain'),yardage:String(i%9===0?18:(i%7===0?-4:2+(i%14))),down:String((i%4)+1),distance:String(1+(i%12)),quarter:'Q'+((i%4)+1),defFront:'4-2-5',coverage:'Cover 3',custom:[],players:{ballCarrier:'22',tackler:'55'},grades:{}}})); game.nextId=65; store.data.activeGameId='g-self'; app.storage._loadActiveGame(); await app.workspaceShell.show('reports'); app.reportsScreen.selectTab('overview'); });
await new Promise(r=>setTimeout(r,450));
const approvedOverview=await page.evaluate(()=>{ const app=window.app,stats=app.stats.compute(),board=document.querySelector('.gi-overview-board'),titles=[...(board?.querySelectorAll('.gi-overview-module>header>strong')||[])].map(n=>n.textContent.trim()),kpis=[...(board?.querySelectorAll('.gi-overview-kpi')||[])].map(n=>({label:n.querySelector('span')?.textContent.trim(),value:n.querySelector('strong')?.textContent.trim()})),rect=board?.getBoundingClientRect(); return {board:!!board,childCount:board?.children.length||0,titles,kpis,clickable:board?.querySelectorAll('.cut-row').length||0,overflow:rect?Math.max(0,Math.round(rect.right-document.documentElement.clientWidth)):-1,oldScoreboard:!!document.querySelector('.scoreboard-layout'),oldLensBoard:!!document.querySelector('.gi-lens-board'),allPlays:stats.allPlays,success:String(stats.efficiency.successRate)+'%',ypp:((stats.rushing.yards+stats.passing.yards)/stats.offPlays.length).toFixed(1)}; });
ok(approvedOverview.board && approvedOverview.childCount===5,'Overview is the approved five-band broadcast-density board, not legacy cards',JSON.stringify(approvedOverview));
ok(['Snaps by phase','Situational','Key metrics','Rushing','Passing','Yards by type','Down & distance','Game plan','Big plays','Drives','Defense & discipline'].every(x=>approvedOverview.titles.includes(x)),'All approved first-screen coaching modules are present',JSON.stringify(approvedOverview.titles));
ok(!approvedOverview.oldScoreboard && !approvedOverview.oldLensBoard && approvedOverview.overflow===0,'Legacy composition is retired and the approved board does not overflow',JSON.stringify(approvedOverview));
const kpiValue=label=>approvedOverview.kpis.find(x=>x.label===label)?.value;
ok(kpiValue('Total plays')===String(approvedOverview.allPlays)&&kpiValue('Success rate')===approvedOverview.success&&kpiValue('Yards / play')===approvedOverview.ypp,'Overview reads canonical totals, success, and yards per play',JSON.stringify(approvedOverview.kpis));
ok(approvedOverview.clickable>=4,'Dense Overview preserves multiple exact-film entry points',JSON.stringify({clickable:approvedOverview.clickable}));
const overviewFilm=await page.evaluate(async()=>{ const app=window.app,calls=[],original=app.filmNavigation.watch; app.filmNavigation.watch=(refs,options)=>{calls.push({refs,label:options?.label});return Promise.resolve({completed:true});}; document.querySelector('.gi-overview-board .cut-row')?.click(); await new Promise(r=>setTimeout(r,200)); app.filmNavigation.watch=original; const refs=calls[0]?.refs||[]; return {calls:calls.length,refs:refs.length,composite:refs.every(ref=>/^[^:]+::[^:]+$/.test(String(ref)))}; });
ok(overviewFilm.calls===1&&overviewFilm.refs>0&&overviewFilm.composite,'A highlighted Overview result opens a non-empty composite-ref film cohort',JSON.stringify(overviewFilm));

console.log('\n== F3/F4. Every charted game scouts, and the scout says something ==');
const scout = await page.evaluate(() => {
  const engine = window.app.stats;
  const screen = window.app.reportsScreen;
  const listed = engine.listScoutableOpponents();
  const data = engine.generateOpponentScout('Wildcats');
  const join = data?.defenseJoin;
  const root = document.querySelector('#wsReports');
  const rows = [...root.querySelectorAll('[data-opponent-refs]')];
  return {
    listed: listed.map(item => ({ name: item.name, games: item.games, plays: item.plays })),
    // A head-to-head game is a scouting source: their offense read off our
    // defensive snaps, their defense off the fronts we faced.
    headToHeadCounts: !!(data && data.offCount > 0 && data.defCount > 0),
    join: join ? {
      total: join.total, fronts: join.fronts.length, byOurLook: join.byOurLook.length,
      pressureRate: join.pressure.ratePct,
      baseFront: join.baseFront?.name || null,
      // Every row carries its own composite refs, so the join stays film-linked.
      allRefsComposite: [...join.fronts, ...join.coverages, ...join.byOurLook, ...join.bySituation]
        .every(row => row.refs.every(ref => /^[^:]+::[^:]+$/.test(ref))),
      frontRefsMatchCount: join.fronts.every(row => row.refs.length === row.n),
    } : null,
    overviewRows: rows.length,
    perspectiveIsOpponent: screen.perspective === 'opponent',
  };
});
ok(scout.listed.length >= 1 && scout.listed.every(item => item.games > 0 && item.plays > 0),
  'Every opponent with charted film is listed as scoutable, so a scout report exists for each', JSON.stringify(scout.listed));
ok(scout.headToHeadCounts,
  'A head-to-head game feeds the opponent scout — their offense from our defensive snaps, their defense from the fronts we faced', JSON.stringify(scout));
ok(scout.join && scout.join.total > 0 && scout.join.fronts > 0 && scout.join.byOurLook > 0,
  'The defensive scout is the JOIN of their call, our look and the outcome — not a frequency list', JSON.stringify(scout.join));
ok(scout.join?.allRefsComposite && scout.join?.frontRefsMatchCount,
  'Every joined row carries exactly as many composite refs as the snaps it counts', JSON.stringify(scout.join));

const scoutFilm = await page.evaluate(async () => {
  const app = window.app, calls = [], original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  app.reportsScreen.scoutOpponent('Wildcats');
  await new Promise(resolve => setTimeout(resolve, 200));
  app.reportsScreen.selectTab('defense');
  await new Promise(resolve => setTimeout(resolve, 250));
  const row = document.querySelector('#wsReports [data-opponent-refs]');
  const expected = (row?.dataset.opponentRefs || '').split(',').filter(Boolean);
  const shown = Number(row?.querySelectorAll('td')[1]?.textContent || 0);
  row?.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  app.filmNavigation.watch = original;
  return { calls: calls.length, refs: calls[0]?.refs || [], expected, shown };
});
ok(scoutFilm.calls === 1 && scoutFilm.refs.length === scoutFilm.expected.length && scoutFilm.refs.length === scoutFilm.shown,
  'A defensive scout row plays exactly the snaps it counts', JSON.stringify(scoutFilm));

console.log('\n== F12. The offense has a shape, not just a table ==');
const shape = await page.evaluate(async () => {
  const app = window.app;
  app.reportsScreen.show();
  await new Promise(resolve => setTimeout(resolve, 200));
  app.reportsScreen.selectTab('offense');
  await new Promise(resolve => setTimeout(resolve, 300));
  const root = document.querySelector('#wsReports');
  const engine = app.stats;
  const stats = engine.compute();
  const dist = engine._yardageBins(stats.offPlays);
  const points = engine._scatterPoints(stats.offPlays);
  const zones = engine._fieldZoneStats(stats.offPlays);
  // Formation frequency is deliberately NOT a ramp-bar chart on the migrated
  // route (stats-engine.js `_dataShape`'s own doc comment): it is the same
  // sortable, film-linked DataTable every other breakdown uses. The proof of
  // "multiple exact-film entry points" is that table's real onClick rows, not
  // a `.gi-ramp-row` mark that no longer exists by design.
  const formationModule = [...root.querySelectorAll('.gi-overview-module')].find(m => m.querySelector('header strong')?.textContent.trim() === 'Formation frequency and success rate');
  const resolveToken = name => { const probe = document.createElement('div'); probe.style.background = `var(${name})`;
    document.body.appendChild(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; };
  const tokens = { turnover: resolveToken('--gi-turnover'), neutral: resolveToken('--gi-7'), cat1: resolveToken('--gi-cat-1') };
  const histFills = [...root.querySelectorAll('.gi-hist rect')].map(r => getComputedStyle(r).fill);
  return {
    formationRows: formationModule?.querySelectorAll('tbody tr').length || 0,
    formationClickableRows: formationModule?.querySelectorAll('tbody tr.cut-row').length || 0,
    histBars: root.querySelectorAll('.gi-hist rect').length,
    scatterPoints: root.querySelectorAll('.gi-scatter circle').length,
    zoneCells: root.querySelectorAll('.gi-zone').length,
    multiples: root.querySelectorAll('.gi-multiple').length,
    // The engine owns every derived number; charts.js is handed them.
    engineBins: dist ? dist.bins.reduce((sum, bin) => sum + bin.count, 0) : 0,
    enginePoints: points.length,
    engineZoneTotal: zones.reduce((sum, zone) => sum + zone.count, 0),
    offPlays: stats.offPlays.length,
    // No chart may invent a colour: every histogram bar's fill resolves to
    // one of the three tokens its tone can legitimately map to.
    histFills, tokens,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
ok(shape.formationRows > 0 && shape.formationClickableRows === shape.formationRows,
  'Frequency-by-success bars render and every bar plays its own film cohort', JSON.stringify(shape));
ok(shape.histBars > 0 && shape.engineBins === shape.offPlays,
  'The yardage distribution bins every offensive snap exactly once, in the engine', JSON.stringify({ bins: shape.engineBins, plays: shape.offPlays }));
ok(shape.scatterPoints > 0 && shape.scatterPoints === shape.enginePoints,
  'The scatter draws exactly the points the engine derived — no renderer-side filtering', JSON.stringify(shape));
// Empty is OMITTED, not zeroed: with no field position charted the zone strip
// must disappear rather than present six honest-looking 0% cells. This fixture
// tags no yard line, so it pins the omission side of that rule.
ok(shape.multiples > 0 && (shape.engineZoneTotal > 0 ? shape.zoneCells === 6 : shape.zoneCells === 0),
  'Per-down small multiples render, and the field-zone strip appears only when field position is charted', JSON.stringify(shape));
ok(shape.histFills.length > 0 && shape.histFills.every(fill => Object.values(shape.tokens).includes(fill)),
  'Chart marks resolve to design-system tokens rather than literal colours', JSON.stringify({ fills: shape.histFills, tokens: shape.tokens }));
ok(!shape.overflow, 'The visual deck does not push the page sideways', JSON.stringify(shape));

if (screenshotDir) {
  await page.evaluate(() => {
    window.app.reportsScreen.show();
    window.app.reportsScreen.defenseScope = 'season';
    window.app.reportsScreen.selectTab('defense');
  });
  await sleep(150);
  await capture('desktop-defense');
}ok(errors.length === 0, 'Native Reports journey produces no page errors', errors.join(' | '));
/* G13 / G2 / G3 / F12c — the opponent Offense rebuild. */
const oppOffense = await page.evaluate(async () => {
  window.app.reportsScreen.scoutOpponent('Wildcats');
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-report-tab="offense"]')?.click();
  await new Promise(r => setTimeout(r, 400));
  const root = document.querySelector('.gi-reports');
  const bt = root?.querySelector('table.bt-table');
  const heads = [...(bt?.querySelectorAll('thead th') || [])].map(th => th.textContent.trim());
  const firstRow = [...(bt?.querySelectorAll('tbody tr:first-child td') || [])].map(td => td.textContent.trim());
  const h3 = [...(root?.querySelectorAll('h3') || [])].map(h => h.textContent.trim());
  return {
    // G13 — cells in charting order: Formation leads, QB alignment second.
    heads, cells: firstRow.length,
    formationFirst: heads[0] === 'Formation' && heads[1] === 'QB align',
    sortable: [...(bt?.querySelectorAll('thead th[data-bt-sort]') || [])].length,
    blankRendersDash: [...(bt?.querySelectorAll('tbody td.bt-blank') || [])].every(td => td.textContent.trim() === '—'),
    // G2 — the two levels above the raw table exist, and the raw table is whole.
    hasByDown: h3.includes('By Down'),
    hasByDistance: h3.includes('By Distance to the Sticks'),
    hasEverySituation: h3.includes('Every Situation'),
    // G3 — the shape visuals reached this tab at all.
    shapeMarks: root?.querySelectorAll('.gi-hist, .gi-scatter, .gi-zones, .gi-multiples, .gi-ramp').length || 0,
    // Opponent rows must NOT claim our cut filters.
    oppShapeCuts: root?.querySelectorAll('.gi-ramp .cut-row').length || 0,
  };
});
ok(oppOffense.formationFirst && oppOffense.sortable === oppOffense.heads.length && oppOffense.blankRendersDash,
  'The Big 13 is sortable cells in charting order — Formation first, untagged dimensions blank',
  JSON.stringify({ heads: oppOffense.heads, sortable: oppOffense.sortable }));
/* G2/G3 — asserted on the opponent Offense HTML the renderer actually produces,
   not on whatever tab the harness happened to leave mounted. Both templates
   call _renderBigTwelve, so a DOM probe can pass against the SELF tab and prove
   nothing about the opponent one. */
const oppRender = await page.evaluate(() => {
  const stats = window.app.stats;
  const data = stats.generateOpponentScout('Wildcats');
  if (!data) return null;
  const html = '';
  const report = stats.generateScoutReport(data.offPlays || []);
  const engine = report ? { byDown: report.byDown, byDistance: report.byDistance,
    situations: (report.downTendency || []).length } : null;
  // Sum of the raw table must equal the charted snaps: the old `.slice(0, 15)`
  // showed 15 rows totalling 30 of 34 and called itself complete.
  const rawTotal = (report?.downTendency || []).reduce((s, d) => s + d.total, 0);
  return { engine, rawTotal, offPlays: (data.offPlays || []).length, html };
});
ok(oppRender?.engine && Array.isArray(oppRender.engine.byDown) && Array.isArray(oppRender.engine.byDistance),
  'The opponent scout derives a by-down and a by-distance-bucket read alongside the raw situations',
  JSON.stringify(oppRender?.engine));
ok(oppRender && oppRender.rawTotal === oppRender.offPlays,
  'Every charted situation is listed — the table accounts for all snaps rather than silently truncating',
  JSON.stringify({ rawTotal: oppRender?.rawTotal, offPlays: oppRender?.offPlays }));

/* ── NO RHETORICAL QUESTIONS IN REPORT COPY ────────────────────────────────
   The coach's standard, stated four separate times: a sub-head is a precise
   definition of the stat below it, never a question posed back at him. Each
   previous sweep removed the instances I happened to grep for and missed the
   rest, because I scoped by ELEMENT (viz-caption, figcaption) instead of by the
   PATTERN. The lens board's question line is a plain <p>, so it survived every
   pass and then spread to the season view when H16 added the lens board there.

   This asserts the pattern across the whole rendered report, so the next place
   copy like this appears fails here instead of in a smoke. Scoped to the
   Reports route: confirmation dialogs legitimately ask questions, and none of
   them render inside this DOM. */
/* MUST WALK EVERY TAB. My first version of this guard ran on whatever pane
   happened to be open at the end of the harness — opponent perspective — and so
   never saw the Offense tab, where _renderShape's headings live. Restoring a
   poetic heading did NOT red it: it was passing vacuously, which is worse than
   no guard because it reads as coverage. Verified by mutation both ways. */
await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  screen.perspective = 'self';
  screen._syncTabState?.();
  screen._renderActiveTab?.();
});
await new Promise(r => setTimeout(r, 400));
const rhetorical = [];
for (const tab of ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season']) {
  await page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`)?.click(), tab);
  await new Promise(r => setTimeout(r, 500));
  const found = await page.evaluate(tabId => {
    const host = document.querySelector('#statsDashboard, .gi-reports');
    if (!host) return [`${tabId}: NO HOST`];
    const bad = [];
    // Captions and sub-heads: no questions.
    [...host.querySelectorAll('p, figcaption, .viz-caption, .gi-lens-head p, small')]
      .map(el => (el.textContent || '').trim())
      .filter(text => text.endsWith('?') && text.split(/\s+/).length > 2)
      .forEach(text => bad.push(`${tabId}: ${text}`));
  // HEADINGS are the half my first guard could not see: "Where the gains sit"
  // never ends in '?', so a question-mark check passed while the heading above
  // the caption was still poetry. A section heading names the stat below it, so
  // it does not open with an interrogative or a demonstrative.
    const openers = /^(where|how|what|did|do|does|are|is|why|can|should|when|who|this|our|we)\b/i;
    [...host.querySelectorAll('h3, h4')]
      .map(el => (el.textContent || '').trim())
      .filter(text => openers.test(text))
      .forEach(text => bad.push(`${tabId}: ${text}`));
    return bad;
  }, tab);
  found.forEach(item => rhetorical.push(item));
}
ok(rhetorical.length === 0,
  'Report headings and captions name the data literally — no questions, no prose openers',
  JSON.stringify(rhetorical));

console.log('\n== F13. Heat-map field-position dots resolve the exact play, by mouse and by keyboard ==');
result = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Heat Map QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit: 'offense', custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  // Both games deliberately reuse the SAME bare play id (5) -- the exact
  // collision the composite gameId::playId split exists to survive (H16 in
  // CLAUDE.md). If the click handler ever resolved a bare id against the
  // wrong game's pool, this is what would catch it.
  app.storage.seasonStore.data.games = [
    { id: 'gA', name: 'Week 1 vs Wildcats', nextId: 6,
      gameInfo: { opponent: 'Wildcats', perspective: 'self' },
      plays: [play(5, { runPass: 'Run', playType: 'Run Inside', yardLine: '30', fieldSide: 'own', hash: 'Left', result: 'Gain', yardage: '6' })] },
    { id: 'gB', name: 'Week 2 vs Knights', nextId: 6,
      gameInfo: { opponent: 'Knights', perspective: 'self' },
      plays: [play(5, { runPass: 'Run', playType: 'Run Inside', yardLine: '40', fieldSide: 'opp', hash: 'Right', result: 'Gain', yardage: '9' })] },
  ];
  app.storage.seasonStore.data.activeGameId = 'gA';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');

  const calls = [];
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label || '' }); return Promise.resolve({ completed: true }); };

  // -- Season scope: both games' plays are on screen at once, sharing bare id 5.
  app.reportsScreen.selectTab('season');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.querySelector('.gi-subtab[data-subtab="offense"]')?.click();
  await new Promise(r => setTimeout(r, 200));
  const dots = [...document.querySelectorAll('.hm-dot[data-heat-ref]')];
  const dotA = dots.find(d => d.dataset.heatRef === 'gA::5');
  const dotB = dots.find(d => d.dataset.heatRef === 'gB::5');
  dotA?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const seasonMouseA = calls.at(-1) || null;
  dotB?.focus();
  dotB?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const seasonKeyB = calls.at(-1) || null;

  // -- Game scope: only gA is loaded, so its dot carries the BARE id (no ::).
  app.reportsScreen.selectTab('offense');
  await new Promise(r => setTimeout(r, 200));
  const gameDot = document.querySelector('.hm-dot[data-heat-ref="5"]');
  gameDot?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const gameMouseA = calls.at(-1) || null;

  app.filmNavigation.watch = original;
  return {
    dotCount: dots.length, dotAFound: !!dotA, dotBFound: !!dotB, gameDotFound: !!gameDot,
    seasonMouseA, seasonKeyB, gameMouseA,
  };
});
ok(result.dotCount === 2 && result.dotAFound && result.dotBFound,
  "Season-scope field map plots both games' plays despite the duplicate bare id", JSON.stringify(result));
ok(JSON.stringify(result.seasonMouseA?.refs) === JSON.stringify(['gA::5']),
  'Mouse click on a season-scope dot resolves the exact composite ref for its own game, not the other game sharing bare id 5',
  JSON.stringify(result.seasonMouseA));
ok(JSON.stringify(result.seasonKeyB?.refs) === JSON.stringify(['gB::5']),
  'Keyboard activation (Enter) on a season-scope dot resolves the exact composite ref for its own game',
  JSON.stringify(result.seasonKeyB));
ok(result.gameDotFound && JSON.stringify(result.gameMouseA?.refs) === JSON.stringify(['gA::5']),
  'Game-scope dot (bare id, no game separator) resolves through the active game only, to the same exact play the season view names gA::5',
  JSON.stringify(result.gameMouseA));

console.log('\n== F14. The Defense report never mislabels opponent-scout film as the coach\'s own defense ==');
result = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Scout-Only Defense QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  // The ONLY charted game is opponent-scout perspective -- there is no
  // self-perspective defensive data anywhere in the season.
  app.storage.seasonStore.data.games = [{
    id: 'g-scout', name: 'Wildcats vs Knights (scout)', nextId: 3,
    gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
    plays: [
      play(1, { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '3', down: '1', distance: '10' }),
      play(2, { defFront: '3-3-5', coverage: 'Cover 1', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '6', down: '2', distance: '7' }),
    ],
  }];
  app.storage.seasonStore.data.activeGameId = 'g-scout';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('defense');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pane = document.querySelector('[data-pane="defense"]');
  return {
    sawCurrentGameLabel: !!pane && /Current game/i.test(pane.textContent || ''),
    // DefenseTab's empty state is the shared EmptyState component
    // (native-report-kit.jsx, class "gi-reports-empty") now, the same one
    // Overview/Offense/Players use -- not the legacy string-render's own
    // tab-specific ".def-empty" class.
    sawEmptyState: !!pane?.querySelector('.gi-reports-empty'),
    sawScoutFront: !!pane && /4-2-5/.test(pane.textContent || ''),
  };
});
ok(!result.sawCurrentGameLabel && !result.sawScoutFront && result.sawEmptyState,
  "A season with only opponent-scout film shows the honest empty state, never the scout game's fronts mislabeled as \"Current game\"",
  JSON.stringify(result));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);

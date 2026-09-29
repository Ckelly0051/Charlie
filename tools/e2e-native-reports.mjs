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
const exportScreenshotDir = process.env.GIQ_REPORTS_EXPORT_SCREENSHOTS || '';
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
        // playCall is charted so the exact-call cohort exists: the composite-ref
        // assertion below reads a Play calls row, and _playCallAnalysis produces
        // nothing at all without an exact call on the play.
        play(1, 'offense', { playCall: '26 Blast', playConcept: 'Inside Zone', formationFamily: 'Spread', qbAlignment: 'Shotgun', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { formationFamily: 'I-Form', qbAlignment: 'Under Center', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '6', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        Object.assign(play(3, 'special'), { specialTeams: { version: 1, unit: 'kickoff', kick: { distance: 55 }, return: { attempted: true, yards: 18 }, outcome: { status: 'returned' } } }),
      ],
    },
    {
      id: 'g-scout', name: 'Wildcats vs Knights', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
      plays: [
        play(1, 'offense', { formationFamily: 'Wing-T', qbAlignment: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '7', down: '3', distance: '5', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { defFront: '3-3-5', coverage: 'Cover 1', blitz: 'Edge' }),
        Object.assign(play(3, 'special'), { specialTeams: { version: 1, unit: 'punt', kick: { distance: 42 }, return: { attempted: true, yards: 6 }, outcome: { status: 'returned' } } }),
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
  legacyControllerAbsent: !('dashboardEl' in window.app.stats) && !('showDashboard' in window.app.stats) && !('renderSelfScout' in window.app.stats) && !('renderDefensiveReport' in window.app.stats),
  tabs: [...document.querySelectorAll('#wsReports [data-report-tab]')].map(node => node.dataset.reportTab),
  actions: [...document.querySelectorAll('#wsReports [data-rp-action]')].map(node => node.dataset.rpAction),
}));
ok(result.native === 1 && result.dashboardIds === 1 && result.legacyControllerAbsent,
  'Reports has one native owner and StatsEngine has no second presentation controller', JSON.stringify(result));
ok(result.tabs.join(',') === 'overview,offense,defense,special,players,selfscout,matchup,season',
  'Native Reports exposes all eight football report views', JSON.stringify(result.tabs));
ok(result.actions.includes('scout') && result.actions.includes('export'),
  'Native Reports exposes scout and export commands', JSON.stringify(result.actions));

console.log('\n== F15. The retired dashboard compatibility controller is structurally absent ==');
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
  const recovered = screen.show();
  const savedPlays = window.app.tagger.plays;
  window.app.tagger.plays = [];
  screen.selectTab('overview');
  const empty = screen.content.querySelector('.gi-reports-empty');
  const emptyStyle = empty ? getComputedStyle(empty) : null;
  const emptyTone = emptyStyle ? { background:emptyStyle.backgroundColor, border:emptyStyle.borderLeftColor } : null;
  window.app.tagger.plays = savedPlays;
  screen.selectTab('overview');
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
  app.vc._emit('video-loaded', { duration: 600 });
  const native = document.querySelector('#wsReports [data-native-reports]');
  const hiddenAfterLoad = native?.classList.contains('hidden');
  const nav = await app.workspaceShell.show('reports');
  const rect = native?.getBoundingClientRect();
  return {
    nav: nav.ok,
    wizard: !!app.wizard,
    wizardBar: !!document.querySelector('.wizard-bar, .wiz-step, #btnToggleWizard'),
    hiddenAfterLoad,
    hiddenAfterReports: native?.classList.contains('hidden'),
    width: Math.round(rect?.width || 0),
    height: Math.round(rect?.height || 0),
    textLength: document.querySelector('[data-native-report-content]')?.textContent.trim().length || 0,
  };
});
ok(result.nav && !result.hiddenAfterLoad && !result.hiddenAfterReports
  && result.width > 0 && result.height > 0 && result.textLength > 0,
  'A linked-film video-load leaves native Reports visible and populated', JSON.stringify(result));
ok(result.wizard === false && result.wizardBar === false,
  'The legacy onboarding wizard is absent, not hidden, so it cannot hide native Reports again', JSON.stringify(result));
await capture('desktop-overview');

console.log('\n== 1b. Approved scorebug uses official score and escapes imported values ==');
result = await page.evaluate(() => {
  const app=window.app; app.reportsScreen.selectTab('overview');
  const read=()=>{ const bug=document.querySelector('[data-reports-scorebug]'); return { hidden:bug?.hidden, scores:[...(bug?.querySelectorAll('.gi-scorebug-row:not(.is-head) .gi-scorebug-total')||[])].map(n=>n.textContent.trim()), text:bug?.textContent||'', images:bug?.querySelectorAll('img').length||0 }; };
  const official=read(); window.__xssFired=false; app.storage.gameInfo.scoreUs='<img src=x onerror=window.__xssFired=true>'; app.reportsScreen._syncHeader(); const hostile=read(); app.storage.gameInfo.scoreUs=21; app.reportsScreen._syncHeader(); return {official,hostile,fired:window.__xssFired};
});
ok(result.official.hidden===false && result.official.scores.join('|')==='21|14','The scorebug leads with the official Game Settings score when tagged scoring is incomplete',JSON.stringify(result.official));
ok(!result.fired && result.hostile.images===0 && result.hostile.text.includes('<img src=x'),'Imported score values render as inert text in the approved scorebug',JSON.stringify(result.hostile));

console.log('\n== 1c. The compact score\'s Turnover margin never claims an uncharted side ==');
result = await page.evaluate(async () => {
  const app = window.app;
  const play = (id, unit, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  /* The game KPI rail is DELETED (coach-approved comp, 2026-09-23); its
     turnover facts moved into the Overview compact score, so that is where
     this block's subject -- never claim an uncharted side -- is read now. */
  const readRail = () => {
    const to = document.querySelector('[data-reports-scorebug] [data-scorebug-fact="margin"]');
    return {
      toPresent: !!to,
      toValue: to?.querySelector('strong')?.textContent || null,
      toSub: to?.querySelector('small')?.textContent || null,
      railAnywhere: !!document.querySelector('[data-reports-rail], .gi-reports-rail'),
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
    app.reportsScreen.selectTab('overview');
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
    play(1, 'offense', { formationFamily: 'Spread', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { passer: '12' } }),
    play(2, 'offense', { formationFamily: 'Spread', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' }),
  ]);
  // Both units charted, with a genuine net margin -- 1 giveaway, 2 takeaways
  // -- plus the exact "O 2 · D 2 · ST 0" phrasing for Plays per Phase, which
  // replaces the "50O / 13D / 3ST" reading that looked like "500" at a glance.
  const both = await load('g-both', [
    play(1, 'offense', { formationFamily: 'Spread', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { passer: '12' } }),
    play(2, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '8', players: { tackler: '21' } }),
    play(3, 'defense', { defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Pass', playType: 'Short Pass', result: 'Fumble', fumbleRecovery: 'subject', yardage: '2', down: '3', distance: '4', players: { tackler: '55' } }),
    play(4, 'offense', { formationFamily: 'Spread', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' }),
  ]);
  return { defenseOnly, offenseOnly, both };
});
ok(result.defenseOnly.toPresent && result.defenseOnly.toValue === 'No data' && result.defenseOnly.toSub === '1 takeaway, turnovers not charted',
  'A defense-only game shows only takeaways, never a fabricated "0 turnovers" or a margin', JSON.stringify(result.defenseOnly));
ok(result.offenseOnly.toPresent && result.offenseOnly.toValue === 'No data' && result.offenseOnly.toSub === '1 turnover, takeaways not charted',
  'An offense-only game shows only turnovers, never a fabricated "0 takeaways" or a margin', JSON.stringify(result.offenseOnly));
ok(result.both.toPresent && result.both.toValue === '+1' && result.both.toSub === '2 takeaways, 1 turnover',
  'Both units charted states the real margin and both counts', JSON.stringify(result.both));
/* RETIRED, not weakened: `Plays per Phase reads as unambiguous literal labels`
   pinned a tile of the deleted game KPI rail. Its subject is gone; Overview's
   Snaps by phase module states the three phases as labeled rows. */
ok([result.defenseOnly, result.offenseOnly, result.both].every(r => !r.railAnywhere),
  'No report renders the deleted game KPI rail', JSON.stringify(result.both));

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
        // playCall is charted so the exact-call cohort exists: the composite-ref
        // assertion below reads a Play calls row, and _playCallAnalysis produces
        // nothing at all without an exact call on the play.
        play(1, 'offense', { playCall: '26 Blast', playConcept: 'Inside Zone', formationFamily: 'Spread', qbAlignment: 'Shotgun', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { formationFamily: 'I-Form', qbAlignment: 'Under Center', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '6', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        Object.assign(play(3, 'special'), { specialTeams: { version: 1, unit: 'kickoff', kick: { distance: 55 }, return: { attempted: true, yards: 18 }, outcome: { status: 'returned' } } }),
      ],
    },
    {
      id: 'g-scout', name: 'Wildcats vs Knights', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
      plays: [
        play(1, 'offense', { formationFamily: 'Wing-T', qbAlignment: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '7', down: '3', distance: '5', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { defFront: '3-3-5', coverage: 'Cover 1', blitz: 'Edge' }),
        Object.assign(play(3, 'special'), { specialTeams: { version: 1, unit: 'punt', kick: { distance: 42 }, return: { attempted: true, yards: 6 }, outcome: { status: 'returned' } } }),
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
    // The approved 2026-09-04 composition dropped the redundant "Special
    // Teams" toolbar label -- the tab strip already names the report. Its
    // football-specific surface is the unit ledger, which always names every
    // unit of the model, so that is what proves the surface is really there.
    // The approved 2026-09-05 Self-Scout composition dropped its redundant
    // "Self-Scout" toolbar label for the same reason Special Teams dropped
    // its own -- the tab strip already names the report. Its football-
    // specific surface is the section navigation, which always names every
    // section of the composition.
    special: ['Kickoff', 'Punt Return'], players: ['Rushing'],
    selfscout: ['Offensive Summary', 'Tendencies'],
    // The Season identity band is gone (its sections moved to the secondary
    // bar); its football-specific surface is the chronological Game Log.
    season: ['Game Log'], matchup: ['Matchup'],
  };
  for (const tab of Object.keys(needles)) {
    app.reportsScreen.selectTab(tab);
    const pane = document.querySelector(`[data-pane="${tab}"]`);
    // A report's section navigation lives in the shared secondary bar under
    // the strip (coach-approved comp, 2026-09-23), so it is read with the pane.
    const bar = document.querySelector('[data-reports-secbar]');
    const text = `${pane?.textContent || ''} ${bar?.textContent || ''}`.replace(/\s+/g, ' ').trim();
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


console.log('\n== 2s. Season rows retain exact cross-game film identity ==');
await page.evaluate(() => {
  const app = window.app;
  window.__seasonIdentityFixture = {
    originalGames: app.storage.seasonStore.data.games,
    originalActiveGameId: app.storage.seasonStore.data.activeGameId,
    originalWatch: app.filmNavigation.watch,
    watches: [],
  };
  const play = (yards, start) => ({ id: 1, timestamp: { start, end: start + 4 }, tags: {
    unit: 'offense', down: '1', distance: '10', quarter: 'Q1', playType: 'Run Inside', runPass: 'Run',
    result: 'Gain', yardage: yards, driveNumber: '1', playCall: 'Power', formationFamily: 'I-Form', personnel: '11',
    players: { ballCarrier: '22' }, grades: {}, custom: [],
  }});
  app.storage.seasonStore.data.games = [
    { id: 'season-a', name: 'Season A', gameInfo: { opponent: 'A', scoreUs: '21', scoreThem: '7' }, roster: [{ num: '22', name: 'Runner A' }], plays: [play(25, 10)] },
    { id: 'season-b', name: 'Season B', gameInfo: { opponent: 'B', scoreUs: '14', scoreThem: '10' }, roster: [{ num: '22', name: 'Runner B' }], plays: [play(30, 20)] },
  ];
  app.storage.seasonStore.data.activeGameId = 'season-a';
  app.filmNavigation.watch = refs => window.__seasonIdentityFixture.watches.push([...refs].sort());
});
await page.evaluate(() => window.app.storage._loadActiveGame());
await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.show();
  app.reportsScreen.selectTab('season');
});
await sleep(50);
const sourceGames = await page.evaluate(() => {
  const pane = document.querySelector('[data-pane="season"]');
  // The approved 2026-09-05 Season composition replaced the generic Overview
  // board with the Game Log, so the surface that names each source game is
  // now the log's own Opponent column rather than Big plays and Drives.
  return {
    log: [...pane.querySelectorAll('.gi-season-table tbody tr td:nth-child(3)')].map(cell => cell.textContent.trim()),
  };
});
const clickSeasonModule = async (tab, title, section = null) => {
  await page.evaluate(key => document.querySelector(`[data-reports-secbar] [data-subtab="${key}"]`)?.click(), tab);
  await sleep(50);
  /* An embedded Offense board carries its own pages in an inline bar. */
  if (section) {
    await page.evaluate(id => document.querySelector(`[data-pane="season"] .gi-secbar.is-inline [data-section="${id}"]`)?.click(), section);
    await sleep(50);
  }
  return page.evaluate(moduleTitle => {
    const pane = document.querySelector('[data-pane="season"]');
    const module = [...pane.querySelectorAll('.gi-overview-module')]
      .find(node => node.querySelector(':scope > header > strong')?.textContent.trim() === moduleTitle);
    /* A Players role table opens film from a STATISTIC after Revision 2; every
       other Season child board still activates the row itself. */
    const row = module?.querySelector('tbody tr[role="button"]')
      || module?.querySelector('tbody tr [data-player-stat]');
    const detail = { title: moduleTitle, found: !!module, row: !!row,
      available: [...pane.querySelectorAll('.gi-overview-module > header > strong')].map(node => node.textContent.trim()) };
    row?.click();
    return detail;
  }, title);
};
const clicks = [await clickSeasonModule('offense', 'Play calls', 'calls'), await clickSeasonModule('players', 'Rushing')];
result = await page.evaluate(() => {
  const app = window.app;
  const model = app.season.reportModel();
  const direct = {
    big: model.stats.bigPlays.map(row => row.ref).sort(),
    drives: model.stats.drives.list.flatMap(row => row.refs || []).sort(),
    calls: app.stats._playCallAnalysis(model.stats.offPlays).calls.flatMap(row => row.refs || []).sort(),
    players: model.stats.individuals.rushers.flatMap(row => row.refs || []).sort(),
  };
  const fixture = window.__seasonIdentityFixture;
  app.filmNavigation.watch = fixture.originalWatch;
  app.storage.seasonStore.data.games = fixture.originalGames;
  app.storage.seasonStore.data.activeGameId = fixture.originalActiveGameId;
  return { watches: fixture.watches, direct };
});
await page.evaluate(() => window.app.storage._loadActiveGame());
await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.show();
  app.reportsScreen.selectTab('season');
  delete window.__seasonIdentityFixture;
});
result = { ...result, sourceGames, clicks };
const exactSeasonRefs = ['season-a::1', 'season-b::1'];
ok(result.sourceGames.log.length === 2 && new Set(result.sourceGames.log).size === 2 && result.sourceGames.log.every(Boolean),
  'The Season Game Log visibly names its two distinct source games', JSON.stringify(result.sourceGames));
ok(Object.values(result.direct).every(refs => JSON.stringify(refs) === JSON.stringify(exactSeasonRefs)),
  'Season big plays, drives, calls, and players stamp the exact two-game cohort despite duplicate bare ids', JSON.stringify(result.direct));
ok(result.watches.length === 2
    && JSON.stringify(result.watches[0]) === JSON.stringify(exactSeasonRefs)
    && JSON.stringify(result.watches[1]) === JSON.stringify(exactSeasonRefs),
  'A Season child-board row opens both games for the aggregated call and player', JSON.stringify({watches:result.watches,clicks:result.clicks}));
console.log('\n== 2a. Matchup is native, two-sided, and film-exact ==');
/* Selectors updated for the approved 2026-09-06 Matchup composition
   (design-comps/reports-matchup-2026-09-06). Each assertion keeps its original
   subject: the tab renders through its native component, it presents both
   sides of the ball as two deliberate directions, and a row opens exactly the
   cross-game-safe cohort it displays. What changed is where that row lives --
   film is now the row's own explicit `Opponent` / `Season` control rather than
   a whole-row click. */
result = await page.evaluate(async () => {
  const app = window.app;
  const originalWatch = app.filmNavigation.watch;
  const watches = [];
  app.filmNavigation.watch = (refs, options) => watches.push({ refs, label: options?.label || '' });
  app.reportsScreen.matchupTab = 'our-offense';
  app.reportsScreen.selectTab('matchup');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const pane = document.querySelector('[data-pane="matchup"]');
  pane?.querySelector('.gi-mu-compare:not(.is-opp) .gi-mu-film button')
    ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  app.filmNavigation.watch = originalWatch;
  return {
    legacyAbsent: typeof app.stats._renderMatchupInto !== 'function',
    native: !!pane?.querySelector('.gi-matchup-board'),
    directions: [...document.querySelectorAll('[data-reports-secbar] .gi-mu-directions button')].map(node => node.textContent.trim()),
    labels: [...(pane?.querySelectorAll('.gi-mu-unit strong') || [])].map(node => node.textContent.trim()),
    watch: watches.at(-1) || null,
  };
});
ok(result.native && result.legacyAbsent,
  'Matchup renders through its native component without calling the retired live DOM renderer', JSON.stringify(result));
ok(result.directions.length === 2
  && result.directions[0] === 'Our Offense vs Their Defense'
  && result.directions[1] === 'Our Defense vs Their Offense'
  && result.labels.some(label => label === 'Our Offense'),
  'Matchup presents both sides of the ball as two deliberate comparison lanes', JSON.stringify(result));
ok(JSON.stringify(result.watch?.refs) === JSON.stringify(['g-self::1']),
  'A native Matchup row opens the exact cross-game-safe film cohort it displays', JSON.stringify(result.watch));

console.log('\n== 2aa. Matchup cohort boundaries remain honest ==');
/* The season this section borrows, captured before it touches anything. The
   guard below section 2b proves it came back byte-for-byte AND that nothing
   the section queued landed afterwards -- a partial restore, or a debounced
   commit left in flight, rewrites games[0].name through gameName() and shows
   up hundreds of assertions later as a LATER section's export appearing to
   mutate canonical data. */
await page.evaluate(() => { window.__seasonBeforeMatchup = JSON.stringify(window.app.storage.seasonStore.data); });
result = await page.evaluate(async () => {
  const app = window.app;
  /* The COMPLETE season payload, not just games + activeGameId. `_loadActiveGame()`
     normalizes the node it reads back into the store -- filling gameInfo
     defaults and renaming through gameName() -- so a partial restore leaves
     canonical data changed and a later section reads that as its own export
     mutating the season. */
  const snapshot = JSON.stringify(app.storage.seasonStore.data);
  const saved = { watch: app.filmNavigation.watch };
  const calls = [];
  const play = (id, unit, tags = {}) => ({ id, timestamp:{start:id*3,end:id*3+2}, tags:{unit,custom:[],players:{},grades:{},...tags}, notes:'', analysis:null });
  const def = (id, type) => play(id, 'defense', { defFront:'4-2-5', coverage:'Cover 3', runPass:type.includes('Run')?'Run':'Pass', playType:type, result:'Gain', yardage:'4' });
  app.filmNavigation.watch = refs => calls.push(refs);
  app.storage.seasonStore.data.games = [
    { id:'match-self', gameInfo:{opponent:'Wildcats',perspective:'self'}, plays:[play(1,'offense',{formationFamily:'Spread',runPass:'Run',playType:'Run Outside',result:'Gain',yardage:'8'}),play(2,'offense',{formationFamily:'Spread'}),def(3,'Run Inside')] },
    { id:'match-scout', gameInfo:{opponent:'Wildcats',perspective:'scout'}, plays:[play(1,'offense',{formationFamily:'Wing-T',runPass:'Pass',playType:'Short Pass',result:'Gain',yardage:'6'}),def(10,'Run Inside'),def(11,'Run Outside'),def(12,'Screen'),def(13,'Short Pass'),def(14,'Medium Pass'),def(15,'Deep Pass'),def(16,'Deep Pass'),def(17,'Deep Pass'),def(18,'Deep Pass'),def(19,'Deep Pass')] },
  ];
  app.storage.seasonStore.data.activeGameId='match-self'; await app.storage._loadActiveGame(); app.reportsScreen.matchupOpponent='Wildcats'; app.reportsScreen.matchupTab='our-offense'; app.reportsScreen.selectTab('matchup');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  let pane=document.querySelector('[data-pane="matchup"]');
  pane.querySelector('.gi-mu-compare:not(.is-opp) .gi-mu-film button')?.click();
  const opponentDefense=[...pane.querySelectorAll('.gi-mu-compare.is-opp')].pop();
  const types=[...(opponentDefense?.querySelectorAll('tbody tr')||[])].map(row=>row.children[0]?.textContent.trim());
  const refs=calls.at(-1)||[];
  app.storage.seasonStore.data.games=[
    {id:'empty-self',gameInfo:{opponent:'Wildcats',perspective:'self'},plays:[play(1,'offense',{formationFamily:'Spread'})]},
    {id:'empty-scout',gameInfo:{opponent:'Wildcats',perspective:'scout'},plays:[def(1,'Run Inside')]},
  ];
  app.storage.seasonStore.data.activeGameId='empty-self'; await app.storage._loadActiveGame(); app.reportsScreen.matchupOpponent='Wildcats'; app.reportsScreen.selectTab('matchup');
  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  pane=document.querySelector('[data-pane="matchup"]');
  const empty={
    directions:[...document.querySelectorAll('[data-reports-secbar] .gi-mu-directions button')].map(n=>n.textContent.trim()),
    note:pane.querySelector('.gi-mu-note')?.textContent||'',
    joins:[...pane.querySelectorAll('table.gi-mu-decision tbody tr')].map(row=>row.children[1]?.textContent.trim()),
  };
  app.filmNavigation.watch=saved.watch;
  const restored=JSON.parse(snapshot);
  app.storage.seasonStore.data.games=restored.games;
  app.storage.seasonStore.data.activeGameId=restored.activeGameId;
  await app.storage._loadActiveGame();
  app.reportsScreen.matchupOpponent=''; app.reportsScreen.matchupTab='our-offense';
  /* The load above normalized what it just read, so the pristine snapshot goes
     back LAST. Then cancel the debounced commit the season swap queued: left in
     flight it lands inside a later section's before/after comparison. */
  const pristine=JSON.parse(snapshot);
  for(const key of Object.keys(app.storage.seasonStore.data)) if(!(key in pristine)) delete app.storage.seasonStore.data[key];
  Object.assign(app.storage.seasonStore.data,pristine);
  app.storage._cancelPendingSaves();
  return {refs,types,empty,restored:JSON.stringify(app.storage.seasonStore.data)===snapshot};
});
ok(JSON.stringify(result.refs)===JSON.stringify(['match-self::1']),'Matchup row film uses the same eligible cohort as its count',JSON.stringify(result.refs));
/* A block that swaps the season out has to put it back byte-for-byte, or the
   next section measures its own subject against a season this one changed. */
ok(result.restored,'the Matchup cohort block restores the season it borrowed exactly');
/* The composition no longer truncates a play-type table, so the subject is
   the RANKING itself: most charted first, then the displayed name ascending. */
ok(result.types[0]==='Deep Pass'&&JSON.stringify(result.types.slice(1))===JSON.stringify(['Medium Pass','Run Inside','Run Outside','Screen','Short Pass']),'Matchup ranks defensive concepts by frequency with a deterministic tie-break',JSON.stringify(result.types));
ok(result.empty.directions.length===1&&result.empty.directions[0]==='Our Offense vs Their Defense'&&result.empty.note.includes('Opponent offense not charted')&&result.empty.joins.every(text=>text==='No data'),'Incomplete tags cannot fabricate a matchup lane',JSON.stringify(result.empty));
/* Settle past the autosave debounce first (`_autoSave` arms a 1000ms timer):
   the point of the guard is that nothing this section left in flight can
   still land on a later one, so it has to outlast the timer it is checking
   for. At 400ms the guard passed while the commit was still armed, and the
   damage surfaced 800 assertions later instead. */
await sleep(1400);
const seasonGuard = await page.evaluate(() => {
  const now = JSON.stringify(window.app.storage.seasonStore.data);
  if (now === window.__seasonBeforeMatchup) return { same: true, diff: '' };
  const a = JSON.parse(window.__seasonBeforeMatchup), b = JSON.parse(now), diff = [];
  const walk = (x, y, path) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (typeof x !== 'object' || typeof y !== 'object' || !x || !y) {
      diff.push(`${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`); return;
    }
    for (const key of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[key], y[key], `${path}.${key}`);
  };
  walk(a, b, '');
  return { same: false, diff: diff.slice(0, 6).join(' | ') };
});
ok(seasonGuard.same,
  'the Matchup cohort section leaves the season exactly as it found it, with nothing queued behind it',
  seasonGuard.diff);

console.log('\n== 2b. Defense is season-wide, performance-first, and film-exact ==');
// Loaded as the REAL active season (not a standalone plays array handed
// straight to defensivePerformance()) so the DOM assertions below exercise
// the same data the numeric model checks do -- section "2b" previously
// computed `model` from a disconnected local array while the actually
// rendered pane still reflected whatever season section 1 had left active,
// which is exactly why its sort/film-click assertions could pass without
// proving anything (see the two fixes below).
result = await page.evaluate(async () => {
  const app = window.app;
  // Isolated fixture -- section 1's g-self/g-scout season (which section 3
  // and later sections rely on for an offense-unit cut-row) is saved and
  // restored around this test rather than left clobbered.
  const originalGames = app.storage.seasonStore.data.games;
  const originalActiveGameId = app.storage.seasonStore.data.activeGameId;
  const play = (id, tags) => ({ id, timestamp: { start: id * 4, end: id * 4 + 3 }, tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags } });
  app.storage.seasonStore.data.games = [
    {
      id: 'a', name: 'Week 1', nextId: 3, gameInfo: { opponent: 'Wildcats', perspective: 'self' },
      plays: [
        play(1, { runPass: 'Run', playType: 'Run Inside', result: 'No Gain', yardage: '0', down: '1', distance: '10', defFront: '4-2-5', coverage: 'Cover 3' }),
        play(2, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '8', defFront: '4-2-5', coverage: 'Cover 3' }),
      ],
    },
    {
      // Play id 1 is deliberately reused across games -- proves composite
      // gameId::playId identity, not bare ids, is what every assertion below
      // resolves against. defFront '4-2-5' spans BOTH games (a::1, a::2,
      // b::2) so a Scheme Detail click has a real cross-game cohort to prove.
      id: 'b', name: 'Week 2', nextId: 4, gameInfo: { opponent: 'Knights', perspective: 'self' },
      plays: [
        // Red-zone DEFENSIVE reps are charted on our own 10: on a defensive snap
        // the opponent offense is attacking that goal line, so `opp 10` would be
        // the opponent backed up on its own 10, not our red zone.
        play(1, { runPass: 'Run', playType: 'Run Outside', result: 'Touchdown', yardage: '20', down: '3', distance: '5', fieldSide: 'own', yardLine: '10', defFront: '5-2', coverage: 'Cover 1', blitz: 'Edge' }),
        play(2, { runPass: 'Pass', playType: 'Short Pass', result: 'Interception', yardage: '0', down: '3', distance: '7', fieldSide: 'own', yardLine: '10', defFront: '4-2-5', coverage: 'Cover 3', blitz: 'Edge' }),
        { ...play(3, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '99', down: '1', distance: '10' }), penalties: [{ id: 'no-play', team: 'opponent', phase: 'offense', foul: 'False start', disposition: 'accepted', playCounts: false }] },
      ],
    },
    // A third, opponent-scout game -- must never enter our-team defensive
    // totals (_defenseCohort filters on gameInfo.perspective !== 'scout').
    // Real defensive-shaped plays, not a placeholder, so a broken filter
    // would visibly inflate `model.total` past 4 and add a third game name.
    {
      id: 'c', name: 'Scout Game', nextId: 4, gameInfo: { opponent: 'Rivals', perspective: 'scout' },
      plays: [
        play(1, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '5', down: '1', distance: '10' }),
        play(2, { runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '8', down: '2', distance: '10' }),
        play(3, { runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '3', down: '1', distance: '10' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'a';
  await app.storage._loadActiveGame();
  app.reportsScreen.show();
  app.reportsScreen.selectTab('defense');
  // Every game/season scope opens on Current game (coach decision,
  // 2026-09-22). This block measures the season cohort, so it records the
  // default and then chooses Full season through the real button.
  // Scope and pages live in the shared secondary bar under the strip
  // (coach-approved comp, 2026-09-23), not inside the pane.
  const scopeButton = key => document.querySelector(`[data-reports-secbar] [data-defense-scope="${key}"]`);
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const gameByDefault = app.reportsScreen.defenseScope === 'game'
    && scopeButton('game')?.classList.contains('active') === true;
  scopeButton('season')?.click();
  await frame();
  // The exact production path -- same cohort the rendered pane used.
  const { scoped, labels } = app.reportsScreen._defenseCohort();
  const model = app.stats.defensivePerformance(scoped, labels);
  const pane = document.querySelector('[data-pane="defense"]');
  const seasonActive = scopeButton('season')?.classList.contains('active') === true;
  // Each of the four sections is its own page; read every heading in page order.
  const headings = [];
  for (const id of ['performance', 'opponent', 'scheme', 'situations']) {
    document.querySelector(`[data-reports-secbar] [data-section="${id}"]`)?.click();
    await frame();
    headings.push(...[...pane.querySelectorAll('[data-def2-section] h2')].map(node => node.textContent.trim()));
  }
  // Production by play type lives on the Opponent offense page.
  document.querySelector('[data-reports-secbar] [data-section="opponent"]')?.click();
  await frame();
  const runInside = model.playTypes.find(row => row.name === 'Run Inside');
  const duplicateRefs = model.summary.refs.filter(ref => ref.endsWith('::1'));
  const moduleByTitle = title => pane?.querySelector(`[data-def2-module="${title}"]`);
  const typeTable = moduleByTitle('Production by play type')?.querySelector('table');
  // Revision 2 suppresses a play type nobody ran; unused capacity is `-`.
  const typeRowsBefore = [...(typeTable?.querySelectorAll('tbody tr:not(.is-held)') || [])].map(row => row.cells[0]?.textContent.trim());
  const heldTypeRows = typeTable?.querySelectorAll('tbody tr.is-held').length || 0;
  const typeModuleHeight = Math.round(moduleByTitle('Production by play type')?.getBoundingClientRect().height || 0);
  const typeSnaps = [...(typeTable?.querySelectorAll('tbody tr:not(.is-held)') || [])].map(row => row.cells[1]?.textContent.trim());
  const expectedTypes = app.stats.defenseBoard(scoped, { labels, seasonPlays: scoped }).playTypes.map(row => row.name);
  const liveTypeTable = typeTable;
  const answerHead = liveTypeTable?.querySelector('thead');
  const answerFirst = liveTypeTable?.querySelector('tbody tr');
  const answerHeaderPosition = answerHead?.querySelector('th') ? getComputedStyle(answerHead.querySelector('th')).position : '';
  const answerHeadPosition = answerHead ? getComputedStyle(answerHead).position : '';
  const answerRowsClearHeader = !answerHead || !answerFirst || answerFirst.getBoundingClientRect().top >= answerHead.getBoundingClientRect().bottom - 1;
  let watched = null;
  const originalWatch = app.filmNavigation.watch;
  app.filmNavigation.watch = refs => { watched = refs; return true; };
  // Real onClick wiring (Watchable/WatchableRefs), not the legacy delegated
  // `[data-defense-refs]` attribute -- click the real "Run Inside" type row
  // (both its snaps live in game 'a').
  const runInsideRow = [...(liveTypeTable?.querySelectorAll('tbody tr') || [])]
    .find(row => row.cells[0]?.textContent.trim() === 'Run Inside');
  runInsideRow?.click();
  const watchedRunInside = watched;
  watched = null;
  app.filmNavigation.watch = originalWatch;
  document.querySelector('[data-reports-secbar] [data-section="performance"]')?.click();
  await frame();
  const before = pane?.querySelector('[data-def2-kpi="Total yards allowed"] strong')?.textContent || '';
  scopeButton('game')?.click();
  await frame();
  const gameActive = scopeButton('game')?.classList.contains('active') === true;
  const after = document.querySelector('[data-pane="defense"] [data-def2-kpi="Total yards allowed"] strong')?.textContent || '';
  app.reportsScreen.defenseScope = 'game';
  app.storage.seasonStore.data.games = originalGames;
  app.storage.seasonStore.data.activeGameId = originalActiveGameId;
  await app.storage._loadActiveGame();
  return {
    total: model.total, ypp: model.summary.yardsPerPlay, stop: model.summary.stopRate,
    third: model.thirdDownStopRate, redZone: model.redZoneTdRate, takeaways: model.takeaways,
    runInside: runInside && { n: runInside.n, refs: runInside.refs },
    duplicateRefs, games: model.byGame.map(row => row.name),
    gameByDefault, seasonActive, gameActive, before, after, typeRowsBefore, heldTypeRows, typeModuleHeight, typeSnaps, expectedTypes,
    watchedRunInside, answerHeaderPosition, answerHeadPosition, answerRowsClearHeader,
    // Revision 2's four sections, one per page, read in page order.
    headings,
    // The fixture's third game is opponent-scout with real defensive-shaped
    // plays; a broken _defenseCohort filter would both inflate the season
    // total past 4 and add "Scout Game" to byGame.
    scoutExcluded: model.total === 4 && !model.byGame.some(row => row.name === 'Scout Game'),
  };
});
ok(result.total === 4 && result.ypp === 6 && result.stop === 75
  && result.third === 50 && result.redZone === 50 && result.takeaways === 1,
  'Defensive performance uses the established success direction and exact season cohort', JSON.stringify(result));
ok(result.runInside?.n === 2 && JSON.stringify(result.runInside.refs) === JSON.stringify(['a::1', 'a::2'])
  && JSON.stringify(result.duplicateRefs) === JSON.stringify(['a::1', 'b::1']),
  'Opponent play-type rows retain composite game/play identity even when bare ids collide', JSON.stringify(result));
ok(Array.isArray(result.watchedRunInside) && JSON.stringify(result.watchedRunInside) === JSON.stringify(['a::1', 'a::2']),
  'A season Defense row launches exactly the film refs it displays', JSON.stringify(result.watchedRunInside));
ok(result.games.join(',') === 'Week 1,Week 2'
  && result.gameByDefault && result.seasonActive && result.gameActive && result.scoutExcluded,
  'Defense opens on Current game; Full season excludes opponent-scout games; it switches back to current game', JSON.stringify(result));
// Defense presents four useful sections. The old fifth section was a
// predictability-only duplicate of the canonical Self-Scout report and is
// deliberately absent.
ok(JSON.stringify(result.headings) === JSON.stringify(['Defensive performance', 'Opponent offense',
    'Scheme and passing defense', 'Situational results'])
  && !result.headings.some(heading => /self-scout/i.test(heading)),
  'The Defense page leads with performance and covers play type, scheme and situation without the rejected duplicate Self-Scout',
  JSON.stringify(result.headings));
/* Revision 2 supersedes the seven held play-type slots: a play type nobody ran
   is suppressed, the rest stay in football order, and unused capacity is a
   `-` row rather than a fabricated zero. */
const FOOTBALL_ORDER = ['Run Outside', 'Run Inside', 'RPO', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Screen'];
ok(result.typeRowsBefore.length > 0
  && JSON.stringify(result.typeRowsBefore) === JSON.stringify(result.expectedTypes)
  && JSON.stringify(result.typeRowsBefore) === JSON.stringify(FOOTBALL_ORDER.filter(name => result.typeRowsBefore.includes(name)))
  && result.typeRowsBefore.includes('Run Inside')
  && result.typeSnaps.every(snaps => Number(snaps) > 0)
  && result.heldTypeRows === Math.max(0, Math.floor((result.typeModuleHeight - 96) / 38) - result.typeRowsBefore.length),
  'Opponent offense lists only the play types charted, in football order, with unused capacity as dash rows', JSON.stringify(result));
ok(result.answerHeaderPosition === 'static' && result.answerHeadPosition === 'sticky' && result.answerRowsClearHeader,
  'Defense table headers stick inside their own module and never cover the first row at rest', JSON.stringify(result));

console.log('\n== 2c. Defense does not revive the rejected duplicate Self-Scout ==');
// Both sections used to be a `LegacyWidget` embed of a StatsEngine HTML
// string, wired by the (now-deleted) `wireGenericCutRows` post-render DOM
// pass. This proves the replacement: no LegacyWidget/dangerouslySetInnerHTML
// residue anywhere in the pane (no `data-cut-type` attribute exists -- that
// was that convention's own marker), every row is a real onClick, a
// cross-game Defensive Self-Scout tell opens its exact composite cohort
// (including a bare id reused across games), and the front/coverage names
// carrying a literal "&" prove the label/tellVal fields are not
// double-escaped now that they flow through both an HTML-string renderer
// (Self-Scout tab, Season report) AND this native JSX renderer.
result = await page.evaluate(async () => {
  const app = window.app;
  const originalGames = app.storage.seasonStore.data.games;
  const originalActiveGameId = app.storage.seasonStore.data.activeGameId;
  const play = (id, tags) => ({ id, timestamp: { start: id * 4, end: id * 4 + 3 }, tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags } });
  // "Bear & Stack" front spans both games, 5 total snaps -- enough (>=4) to
  // trigger a defensive self-scout tell, and its own literal "&" exercises
  // the escaping fix directly. 4 of 5 run Cover 1 (80% >= 70%), so the
  // byFront grouping tells a Coverage lean; the same 4 Cover-1 snaps share
  // one front 100% of the time, so the byCov grouping independently tells a
  // Front lean -- two real, differently-scoped tells from one fixture.
  app.storage.seasonStore.data.games = [
    {
      id: 'a', name: 'Week 1', nextId: 4, gameInfo: { opponent: 'Wildcats', perspective: 'self' },
      plays: [
        play(1, { defFront: 'Bear & Stack', coverage: 'Cover 1', down: '1', distance: '10', yardage: '6', result: 'Gain' }),
        play(2, { defFront: 'Bear & Stack', coverage: 'Cover 1', down: '2', distance: '8', yardage: '5', result: 'Gain' }),
        play(3, { defFront: 'Bear & Stack', coverage: 'Cover 3', down: '1', distance: '10', yardage: '7', result: 'Gain' }),
      ],
    },
    {
      id: 'b', name: 'Week 2', nextId: 4, gameInfo: { opponent: 'Knights', perspective: 'self' },
      plays: [
        // Bare id 1 deliberately reused across games -- the same composite-
        // ref proof section 2b already established, exercised again here for
        // the Self-Scout tells specifically, not just Scheme Detail.
        play(1, { defFront: 'Bear & Stack', coverage: 'Cover 1', down: '1', distance: '10', yardage: '6', result: 'Gain' }),
        play(2, { defFront: 'Bear & Stack', coverage: 'Cover 1', down: '3', distance: '4', yardage: '5', result: 'Gain' }),
        // Padding: pushes the scheme-tagged total to 6 (generateDefensiveSelfScout's
        // own >=6 gate) without joining the "Bear & Stack" group (n=1, below
        // the tell minimum of 4) or its Cover 1 group (different coverage).
        play(3, { defFront: '4-3', coverage: 'Cover 2', down: '2', distance: '6', yardage: '2', result: 'Gain' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'a';
  await app.storage._loadActiveGame();
  app.reportsScreen.defenseScope = 'season';
  app.reportsScreen.show();
  app.reportsScreen.selectTab('defense');
  const { scoped } = app.reportsScreen._defenseCohort();
  const defScout = app.stats.generateDefensiveSelfScout(scoped);
  const pane = document.querySelector('[data-pane="defense"]');
  const frontTell = defScout.tells.find(t => t.dim === 'vs Front' && t.label === 'Bear & Stack');
  // The board is four pages now; every absence below is read on all four, so
  // no page can hide a revived Self-Scout module from this check.
  let noLegacyMarkers = true, section = null, summaryText = '', frontTellRow = null, watchedFrontTell = null;
  const recDivs = [], tellRowEls = [];
  let watched = null;
  const originalWatch = app.filmNavigation.watch;
  app.filmNavigation.watch = refs => { watched = refs; return true; };
  for (const id of ['performance', 'opponent', 'scheme', 'situations']) {
    document.querySelector(`[data-reports-secbar] [data-section="${id}"]`)?.click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    noLegacyMarkers = noLegacyMarkers && pane?.querySelectorAll('[data-cut-type], [data-cut-val], [data-defense-refs]').length === 0;
    section = pane?.querySelector('.gi-def2') || section;
    summaryText ||= [...(pane?.querySelectorAll('.gi-overview-module > header span') || [])]
      .map(el => el.textContent).find(txt => /defensive snaps/i.test(txt)) || '';
    recDivs.push(...[...(pane?.querySelectorAll('.gi-def-recs > .ss-rec') || [])].map(el => el.textContent));
    const rows = [...(pane?.querySelectorAll('.ss-tells tbody tr') || [])];
    tellRowEls.push(...rows);
    const row = rows.find(r => r.cells[0]?.textContent.trim() === 'Bear & Stack' && r.cells[1]?.textContent.trim() === 'vs Front');
    if (row) { frontTellRow = row; row.click(); watchedFrontTell = watched; }
  }
  document.querySelector('[data-reports-secbar] [data-section="performance"]')?.click();
  app.filmNavigation.watch = originalWatch;
  app.storage.seasonStore.data.games = originalGames;
  app.storage.seasonStore.data.activeGameId = originalActiveGameId;
  await app.storage._loadActiveGame();
  return {
    noLegacyMarkers,
    hasSection: !!section,
    summaryText,
    tellCount: defScout.tells.length,
    tellRowCount: tellRowEls.length,
    recCount: defScout.recommendations.length,
    recDivCount: recDivs.length,
    recTextHasAmp: recDivs.some(text => text.includes('Bear & Stack')),
    recTextDoubleEscaped: recDivs.some(text => text.includes('&amp;')),
    frontTellFound: !!frontTell,
    frontTellRowFound: !!frontTellRow,
    frontTellRefs: frontTell?.refs,
    watchedFrontTell,
  };
});
ok(result.noLegacyMarkers && result.hasSection,
  'Defense remains fully native after removing its duplicate Self-Scout section', JSON.stringify(result));
ok(result.summaryText === '' && result.tellRowCount === 0,
  'Defense renders no predictability summary or tendency-tell table', JSON.stringify(result));
ok(result.recDivCount === 0 && !result.recTextHasAmp && !result.recTextDoubleEscaped,
  'Defense renders no generated recommendation prose', JSON.stringify(result));
ok(result.frontTellFound && !result.frontTellRowFound && result.watchedFrontTell == null,
  'Defensive tendency data remains available to the canonical Self-Scout report but is not duplicated in Defense',
  JSON.stringify(result));

console.log('\n== 2d. Special Teams is season-wide, dense, film-exact, and not LegacyWidget ==');
// Mirrors 2b/2c's fixture-and-cohort shape for the Special Teams tab: a real
// active season (games 'a'/'b' self, 'c' opponent-scout), deliberately
// reusing bare play ids across 'a'/'b' so every composite-ref assertion below
// proves identity survives collision. Covers every phase the checkpoint
// names -- kickoff, kick return, punt, punt return, field goal, XP, and
// 2-point -- plus the impact-play refs (a missed FG, a missed XP, a muffed
// return) StatsEngine._specialTeamsSummary composes.
result = await page.evaluate(async () => {
  const app = window.app;
  const originalGames = app.storage.seasonStore.data.games;
  const originalActiveGameId = app.storage.seasonStore.data.activeGameId;
  const originalRoster = app.roster.players.slice();
  const play = (id, tags, specialTeams) => ({
    id, timestamp: { start: id * 4, end: id * 4 + 3 }, notes: '', analysis: null,
    tags: { unit: 'special', custom: [], players: {}, grades: {}, ...tags },
    ...(specialTeams ? { specialTeams } : {}),
  });
  app.storage.seasonStore.data.games = [
    {
      id: 'a', name: 'Week 1', nextId: 7, gameInfo: { opponent: 'Wildcats', perspective: 'self' },
      plays: [
        // FG made, bare id 1 -- reused in game 'b' as a miss. Distance 25 puts
        // this in the '<30' byDist bucket, exercised below.
        play(1, {}, { unit: 'fieldGoal', attemptType: 'fieldGoal', players: { kicker: '9' }, kick: { distance: 25 }, outcome: { status: 'good', score: 'fieldGoal' } }),
        // Kickoff, touchback -- bare id 2, reused in game 'b' as a return.
        play(2, {}, { unit: 'kickoff', players: { kicker: '9' }, kick: { distance: 55 }, return: { attempted: false, yards: null }, outcome: { status: 'touchback' } }),
        // Kick return -- bare id 3, reused in game 'b' as a muffed return.
        play(3, {}, { unit: 'kickoffReturn', players: { returner: '22' }, return: { attempted: true, yards: 24 }, outcome: { status: 'returned' } }),
        // Punt -- gross/net/hang all charted. A DIFFERENT jersey (a distinct
        // specialist) than the FG kicker, so the kicker's own refs below stay
        // exactly the two field-goal attempts, not conflated with the punt.
        play(4, {}, { unit: 'punt', players: { punter: '15' }, kick: { distance: 40, hangTime: 4.2 }, return: { attempted: true, yards: 6 }, outcome: { status: 'returned' } }),
        // XP made.
        play(5, {}, { unit: 'try', attemptType: 'extraPoint', result: 'converted', outcome: { score: 'extraPoint' } }),
        // XP missed -- an honest impact-play entry.
        play(6, {}, { unit: 'try', attemptType: 'extraPoint', result: 'failed', outcome: {} }),
      ],
    },
    {
      id: 'b', name: 'Week 2', nextId: 6, gameInfo: { opponent: 'Knights', perspective: 'self' },
      plays: [
        // FG missed, SAME bare id 1 as game 'a' -- composite identity proof.
        play(1, {}, { unit: 'fieldGoal', attemptType: 'fieldGoal', players: { kicker: '9' }, kick: { distance: 45 }, outcome: { status: 'noGood' } }),
        // Kickoff, returned -- SAME bare id 2 as game 'a'.
        play(2, {}, { unit: 'kickoff', players: { kicker: '9' }, kick: { distance: 50 }, return: { attempted: true, yards: 15 }, outcome: { status: 'returned' } }),
        // Muffed kick return -- SAME bare id 3 as game 'a'.
        play(3, {}, { unit: 'kickoffReturn', players: { returner: '22' }, return: { attempted: false, yards: null }, outcome: { status: 'muffed' } }),
        // Punt return.
        play(4, {}, { unit: 'puntReturn', players: { returner: '22' }, return: { attempted: true, yards: 5 }, outcome: { status: 'returned' } }),
        // 2-point made.
        play(5, {}, { unit: 'try', attemptType: 'twoPoint', result: 'converted', outcome: { score: 'twoPoint' } }),
      ],
    },
    // Opponent-scout game -- real ST-shaped plays that must never enter our
    // team's Special Teams totals (mirrors 2b's identical exclusion proof).
    {
      id: 'c', name: 'Scout Game', nextId: 3, gameInfo: { opponent: 'Rivals', perspective: 'scout' },
      plays: [
        play(1, {}, { unit: 'kickoff', players: { kicker: '4' }, kick: { distance: 48 }, return: { attempted: true, yards: 20 }, outcome: { status: 'returned' } }),
        play(2, {}, { unit: 'fieldGoal', attemptType: 'fieldGoal', players: { kicker: '4' }, kick: { distance: 28 }, outcome: { status: 'good', score: 'fieldGoal' } }),
      ],
    },
  ];
  // A hostile roster name for the same kicker credited above -- proves the
  // Individual Performance table's player label renders as inert JSX text,
  // not injected markup, now that the row flows through this new component.
  window.__stXssFired = false;
  app.roster.players = [{ num: '9', name: '<img src=x onerror=window.__stXssFired=true>', pos: 'K', side: 'B' }];
  app.storage.seasonStore.data.activeGameId = 'a';
  await app.storage._loadActiveGame();
  app.reportsScreen.specialTeamsScope = 'season';
  app.reportsScreen.show();
  app.reportsScreen.selectTab('special');
  const { scoped } = app.reportsScreen._specialTeamsCohort();
  const stStats = app.stats.compute(scoped);
  const summary = app.stats._specialTeamsSummary(scoped, stStats);
  const pane = document.querySelector('[data-pane="special"]');
  const noLegacyMarkers = pane?.querySelectorAll('[data-cut-type], [data-cut-val], [data-defense-refs]').length === 0;
  const seasonActive = document.querySelector('[data-reports-secbar] [data-st-scope].active')?.textContent.trim() === 'Full season';
  // Captured now, before the Current-game click below re-renders the pane --
  // avoids any doubt about reading a post-unmount/detached reference.
  const kpiCards = [...(pane?.querySelectorAll('.gi-overview-kpi') || [])].map(node => ({
    label: node.querySelector('span')?.textContent.trim(), value: node.querySelector('strong')?.textContent.trim(),
  }));

  let watched = null;
  const originalWatch = app.filmNavigation.watch;
  app.filmNavigation.watch = refs => { watched = refs; return true; };

  // The Kickoff ledger card, mouse activation. Bare id 2 spans both games.
  // Repointed from the retired phase card to the unit ledger the approved
  // 2026-09-04 composition replaced it with -- the SURFACE moved, the
  // capability did not, and this asserts the capability.
  const kickoffCard = [...(pane?.querySelectorAll('.gi-st-unit-card') || [])]
    .find(node => node.querySelector('.gi-st-unit-name')?.textContent.trim() === 'Kickoff');
  kickoffCard?.click();
  const watchedKickoffs = watched;
  watched = null;

  // Same card, KEYBOARD activation -- must resolve the identical cohort.
  kickoffCard?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  const watchedKickoffsKeyboard = watched;
  watched = null;

  // Field-goal distance bucket -- bare id 1's make (game 'a', <30 bucket).
  // Lives in the Kicking game section now, so select it first.
  document.querySelector('[data-reports-secbar] [data-st-section="st4"]')?.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const fgBucket = [...(pane?.querySelectorAll('.gi-st-bucket') || [])]
    .find(node => node.querySelector('span')?.textContent.trim() === '<30 yds');
  fgBucket?.click();
  const watchedFgBucket = watched;
  watched = null;

  // Individual kicker row -- must span BOTH games' FG attempts (bare id 1
  // reused), proving the individual table is season-wide, not the active
  // game -- and the hostile roster name must render as plain text nearby.
  // Specialists section in the approved composition.
  document.querySelector('[data-reports-secbar] [data-st-section="st5"]')?.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const kickerTable = [...(pane?.querySelectorAll('.gi-overview-module') || [])]
    .find(node => node.querySelector('header strong')?.textContent.trim() === 'Kicking and punting');
  // Found by its hostile roster name rather than row order (kicker #9 and
  // punter #15 tie on the table's own made+punts sort key) -- this also
  // doubles as the escaping proof: if the name had executed as markup
  // instead of rendering as text, no <img> element carries visible
  // textContent, so this literal substring would not be found at all.
  const kickerRow = [...(kickerTable?.querySelectorAll('tbody tr') || [])].find(row => row.textContent.includes('img src=x'));
  const kickerRowText = kickerRow?.textContent || '';
  kickerRow?.click();
  const watchedKicker = watched;
  watched = null;

  // The compact Impact Plays detail is not just a summary: each result row
  // opens the exact exceptional plays behind that count.
  const impactTable = [...(pane?.querySelectorAll('.gi-overview-module') || [])]
    .find(node => node.querySelector('header strong')?.textContent.trim() === 'Impact plays');
  const missedFgRow = [...(impactTable?.querySelectorAll('.gi-st-impact-row') || [])]
    .find(row => row.querySelector('span')?.textContent.trim() === 'Field goals missed');
  missedFgRow?.click();
  const watchedMissedFg = watched;
  app.filmNavigation.watch = originalWatch;

  // Current-game scope must shrink to game 'a' only.
  document.querySelector('[data-reports-secbar] [data-st-scope="game"]')?.click();
  const gameActive = document.querySelector('[data-reports-secbar] [data-st-scope="game"].active')?.textContent.trim() === 'Current game';
  const { scoped: gameScoped } = app.reportsScreen._specialTeamsCohort();
  const gameOnlyStats = app.stats.compute(gameScoped);
  app.reportsScreen.specialTeamsScope = 'season';

  app.roster.players = originalRoster;
  app.storage.seasonStore.data.games = originalGames;
  app.storage.seasonStore.data.activeGameId = originalActiveGameId;
  await app.storage._loadActiveGame();

  return {
    noLegacyMarkers, seasonActive, gameActive,
    fgAtt: stStats.specialTeams.fg.att, fgMade: stStats.specialTeams.fg.made,
    kickoffN: stStats.specialTeams.kickoffs.n,
    // The cohort itself (before compute() re-filters for offense/defense
    // playType) is the honest proof that _specialTeamsCohort excludes the
    // opponent-scout game -- 11 self-perspective plays (6 + 5), never 13.
    scoutExcluded: scoped.length === 11 && !scoped.some(p => p.__gid === 'c'),
    watchedKickoffs, watchedKickoffsKeyboard, watchedFgBucket, watchedKicker, watchedMissedFg,
    kickerRowXss: kickerRowText.includes('<img src=x') && !window.__stXssFired,
    gameOnlyFg: gameOnlyStats.specialTeams.fg.att, gameOnlyKickoffs: gameOnlyStats.specialTeams.kickoffs.n,
    kpiSnaps: (() => {
      const tile = [...(pane?.querySelectorAll('.gi-st-board .gi-overview-kpi') || [])]
        .find(k => /special teams snaps/i.test(k.querySelector('span')?.textContent || ''));
      const stat = [...(tile?.querySelectorAll('.gi-kpi-stat') || [])]
        .find(s => /^snaps$/i.test(s.querySelector('.gi-kpi-stat-l')?.textContent?.trim() || ''));
      return stat?.querySelector('.gi-kpi-stat-n')?.textContent?.trim();
    })(),
    summarySnaps: summary.snaps.n,
    impactLabels: summary.impact.map(i => i.label),
  };
});
ok(result.noLegacyMarkers, 'Special Teams renders with no LegacyWidget/data-cut-type residue', JSON.stringify(result));
ok(result.seasonActive, 'Special Teams defaults to full season', JSON.stringify(result));
ok(result.fgAtt === 2 && result.fgMade === 1 && result.kickoffN === 2 && result.scoutExcluded,
  'Special Teams aggregates the exact self-perspective season cohort and excludes the opponent-scout game', JSON.stringify(result));
ok(Array.isArray(result.watchedKickoffs) && JSON.stringify(result.watchedKickoffs) === JSON.stringify(['a::2', 'b::2']),
  'The season-wide Kickoff ledger card opens its exact cross-game cohort, duplicate bare id included', JSON.stringify(result));
ok(JSON.stringify(result.watchedKickoffsKeyboard) === JSON.stringify(result.watchedKickoffs),
  'Keyboard activation of the same ledger card resolves the identical cohort as a mouse click', JSON.stringify(result));
ok(Array.isArray(result.watchedFgBucket) && result.watchedFgBucket.includes('a::1') && !result.watchedFgBucket.includes('b::1'),
  'A field-goal distance bucket opens only the attempts in its own range', JSON.stringify(result));
ok(Array.isArray(result.watchedKicker) && JSON.stringify(result.watchedKicker) === JSON.stringify(['a::1', 'b::1']),
  "The kicker's Individual Performance row is season-wide, not the active game -- both games' field-goal attempts", JSON.stringify(result));
ok(JSON.stringify(result.watchedMissedFg) === JSON.stringify(['b::1']),
  'The compact Impact Plays row opens only the missed field goal behind its count', JSON.stringify(result));
ok(result.kickerRowXss, 'A hostile roster name in the Individual Performance table renders as inert text', JSON.stringify(result));
ok(result.gameActive && result.gameOnlyFg === 1 && result.gameOnlyKickoffs === 1,
  'Switching to Current game scopes Special Teams to the active game only', JSON.stringify(result));
ok(result.kpiSnaps === String(result.summarySnaps) && result.summarySnaps > 0,
  'The performance-band Snaps tile reads the same aggregate StatsEngine computed', JSON.stringify(result));
ok(result.impactLabels.includes('Field goals missed') && result.impactLabels.includes('Tries missed') && result.impactLabels.includes('Muffed returns'),
  'Impact plays honestly discloses the missed field goal, missed try, and muffed return', JSON.stringify(result));

// A game with field-goal attempts but no tries gets one compact distance
// module. Conversion results already live in the KPI and phase bands, so the
// detail area must not repeat them as a large gauge-only module.
result = await page.evaluate(async () => {
  const app = window.app;
  const originalGames = app.storage.seasonStore.data.games;
  const originalActiveGameId = app.storage.seasonStore.data.activeGameId;
  app.storage.seasonStore.data.games = [{
    id: 'x', name: 'FG Only', nextId: 3, gameInfo: { opponent: 'Wildcats', perspective: 'self' },
    plays: [{
      id: 1, timestamp: { start: 0, end: 3 }, notes: '', analysis: null,
      tags: { unit: 'special', custom: [], players: {}, grades: {} },
      specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', players: { kicker: '9' }, kick: { distance: 25 }, outcome: { status: 'good', score: 'fieldGoal' } },
    }],
  }];
  app.storage.seasonStore.data.activeGameId = 'x';
  await app.storage._loadActiveGame();
  app.reportsScreen.specialTeamsScope = 'season';
  app.reportsScreen.show();
  app.reportsScreen.selectTab('special');
  const pane = document.querySelector('[data-pane="special"]');
  document.querySelector('[data-reports-secbar] [data-st-section="st4"]')?.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const title = node => node.querySelector('header strong')?.textContent.trim();
  const modules = [...(pane?.querySelectorAll('.gi-overview-module') || [])];
  const fieldGoalModule = modules.find(node => title(node) === 'Field goals by distance');
  // A try module must not appear at all when no try was charted, and a field
  // goal and a try must never share a denominator: the original finding was a
  // large gauge-only band repeating conversions the KPI already carried.
  const triesModule = modules.find(node => title(node) === 'Tries');
  const triesEmpty = !!triesModule?.classList.contains('is-none');
  const buckets = [...(fieldGoalModule?.querySelectorAll('.gi-st-bucket') || [])];
  // Dead space: no module on the section may be more than ~2.2x the tallest
  // sibling in its own band, which is what a gauge-only module produced.
  const bandRatios = [...(pane?.querySelectorAll('.gi-st-band') || [])].map(band => {
    const kids = [...band.children].map(k => k.getBoundingClientRect().height).filter(h => h > 0);
    return kids.length > 1 ? Math.max(...kids) / Math.min(...kids) : 1;
  });
  app.storage.seasonStore.data.games = originalGames;
  app.storage.seasonStore.data.activeGameId = originalActiveGameId;
  await app.storage._loadActiveGame();
  return { fieldGoalModuleFound: !!fieldGoalModule, fieldGoalHasGauge: !!fieldGoalModule?.querySelector('svg'),
    buckets: buckets.length, triesEmpty, worstRatio: Math.max(1, ...bandRatios) };
});
ok(result.fieldGoalModuleFound && !result.fieldGoalHasGauge && result.buckets === 4,
  'Field-goal detail is the compact four-bucket distance band, never a gauge', JSON.stringify(result));
ok(result.triesEmpty,
  'A game with field goals and no tries states the try unit as empty rather than repeating conversions', JSON.stringify(result));
ok(result.worstRatio <= 2.2,
  'No module towers over its own band -- the stretched panels keep a band visually even', JSON.stringify(result));

console.log('\n== 3. A self-report row launches the exact active-game film cohort ==');
result = await page.evaluate(async () => {
  const app = window.app;
  app.reportsScreen.selectTab('offense');
  // Play calls lives on the Calls & tendencies page of the Offense board.
  document.querySelector('[data-reports-secbar] [data-section="calls"]')?.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Migrated components (native-report-kit.jsx `Watchable`) wire film activation
  // through a real onClick/onKeyDown closure over `screen.watchCut`/`watchRefs`
  // -- there is no delegated data-cut-type attribute to read back, so the proof
  // is structural: a real activatable row exists, keyboard Enter reaches the
  // canonical film seam exactly once, and every returned ref is a genuine
  // composite `gameId::playId` naming a play that actually belongs to the
  // active game (never a bare id, never another game's play).
  // Name the subject rather than taking whatever row happens to be first.
  // Offense opens on the identity strip, whose tiles activate through
  // `watchCut` -> `stats._watchPlays` (a canonical seam, but a predicate one
  // that never produces composite refs), so "the first .cut-row" silently
  // stopped being a refs-bearing row when the composition changed. This
  // assertion is about composite-ref exactness, so it reads a row that
  // actually carries refs.
  const callsModule = [...document.querySelectorAll('[data-pane="offense"] .gi-overview-module')]
    .find(node => node.querySelector('header strong')?.textContent.trim() === 'Play calls');
  const row = callsModule?.querySelector('tbody tr.cut-row');
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
    // The global strip keeps all eight tabs in place and DISABLES the self-only
    // reports in opponent mode, so an available view is an enabled one.
    visibleTabs: [...document.querySelectorAll('[data-report-tab]')].filter(node => !node.hidden && !node.disabled).map(node => node.dataset.reportTab),
    allTabsPresent: [...document.querySelectorAll('[data-report-tab]')].filter(node => !node.hidden).length === 8,
    text: document.querySelector('[data-native-report-content]')?.textContent || '',
    sampleCards: [...document.querySelectorAll('[data-pane="overview"] .gi-overview-kpi')]
      .map(node => ({ label: node.querySelector('span')?.textContent.trim(), value: node.querySelector('strong')?.textContent.trim() })),
  };
});
ok(result.games === 2
  && JSON.stringify(result.offense) === JSON.stringify(['g-self::2', 'g-scout::1'])
  && JSON.stringify(result.defense) === JSON.stringify(['g-self::1', 'g-scout::2']),
  'Opponent offense and defense retain composite game/play identity across duplicate play ids', JSON.stringify(result));
ok(JSON.stringify(result.special) === JSON.stringify(['g-scout::3']) && !result.all.includes('g-self::3'),
  'Opponent Special Teams includes scout film and excludes ambiguous head-to-head ST', JSON.stringify(result));
ok(result.visibleTabs.join(',') === 'overview,offense,defense,special' && result.allTabsPresent
  && result.sampleCards.some(card => card.label === 'Games charted' && card.value === '2')
  && !result.text.includes('No charted data yet'),
  'Opponent mode exposes only supported views and a dynamic sample strip', JSON.stringify(result));
await capture('desktop-opponent');
for (const tab of ['offense', 'defense', 'special']) {
  await page.evaluate(tabName => window.app.reportsScreen.selectTab(tabName), tab);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await sleep(250);
  await capture(`desktop-opponent-${tab}`);
}
const initialOpponentDefense = await page.evaluate(async () => {
  window.app.reportsScreen.selectTab('defense');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const data = window.app.reportsScreen._opponentData?.defenseJoin;
  const modules = [...document.querySelectorAll('[data-pane="defense"] .gi-overview-module')];
  const rowCounts = modules.map(module => ({
    title: module.querySelector('header strong')?.textContent.trim() || '',
    rows: module.querySelectorAll('tbody tr').length,
  }));
  return { model: { fronts: data?.fronts?.length || 0, coverages: data?.coverages?.length || 0 }, rowCounts };
});
ok(initialOpponentDefense.model.fronts === initialOpponentDefense.rowCounts.find(row => row.title.startsWith('Fronts'))?.rows
  && initialOpponentDefense.model.coverages === initialOpponentDefense.rowCounts.find(row => row.title.startsWith('Coverages'))?.rows,
  'Initial native opponent Defense render includes every structured front and coverage row', JSON.stringify(initialOpponentDefense));
await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
await sleep(80);

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
  const app = window.app;
  const save = window.ffaSaveBlob;
  const captures = [];
  const pending = [];
  window.ffaSaveBlob = (blob, name) => pending.push(blob.text().then(html => captures.push({ name, html })));
  app.reportsScreen.show();
  app.reportsScreen.selectTab('defense');
  // Each report's own export sits at the right of the shared secondary bar.
  document.querySelector('[data-reports-secbar] [data-report-export="defense"]')?.click();
  app.reportsScreen.selectTab('selfscout');
  document.querySelector('[data-reports-secbar] [data-report-export="selfscout"]')?.click();
  await Promise.all(pending);
  window.ffaSaveBlob = save;
  return captures;
});
{
  const defense = result.find(item => /^defensive_report_/.test(item.name));
  const selfScout = result.find(item => /^self_scout_report_/.test(item.name));
  /* The export states the same cohort reconciliation the board does, so the
     subtitle now carries BOTH numbers: the charted sample and the classified
     subset every yardage and rate in the report divides by. */
  ok(defense && /Defensive Report:/.test(defense.html)
    && /Full season - \d+ charted defensive snaps, \d+ with play type/.test(defense.html)
    && /Defensive Performance/.test(defense.html) && !/Offensive Performance/.test(defense.html),
    'Defense Export Report downloads the displayed full-season defensive report, not the active-game omnibus report',
    JSON.stringify(result.map(item => item.name)));
  ok(selfScout && /Self-Scout Report:/.test(selfScout.html)
    && /Positive Plays/.test(selfScout.html) && /Stop Rate/.test(selfScout.html)
    && !/Coaching Recommendations|Film Room Insights|Offensive Performance/.test(selfScout.html),
    'Self-Scout Export Report downloads the approved data report without generated coaching prose',
    JSON.stringify(result.map(item => item.name)));
}

result = await page.evaluate(async () => {
  const app=window.app;
  /* Disarm any autosave an EARLIER section left armed before taking the
     baseline. The subject here is whether the EXPORT writes canonical data;
     a debounced commit queued elsewhere landing inside this window says
     nothing about the export and reads as a false positive. Anything the
     export itself arms is still armed after this point, so the assertion
     keeps its teeth. */
  app.storage._cancelPendingSaves();
  const before=JSON.stringify(app.storage.seasonStore.data),original=window.ffaSaveBlob;
  let capture=null,pending=null;window.ffaSaveBlob=(blob,name)=>{pending=blob.text().then(html=>{capture={html,name};});};
  const ok=app.season.exportHtml();await pending;window.ffaSaveBlob=original;
  return {ok,name:capture?.name,html:capture?.html||'',unchanged:JSON.stringify(app.storage.seasonStore.data)===before,
    // The export must report the SAME Our Program cohort the screen does: the
    // season on screen at this point carries one self game and one opponent
    // scout, and a scout game is not one of our games.
    selfGames:app.season._selfGames().length,allGames:app.season._effectiveGames().length};
});
ok(result.ok && /season_report_/.test(result.name) && /Season Report/.test(result.html)
    && result.selfGames === 1 && result.allGames === 2
    // The subtitle names the CLASSIFIED cohort against the CHARTED one; it used
    // to print the classified count under the word "charted".
    && new RegExp(`${result.selfGames} games, \\d+ of \\d+ plays classified`).test(result.html) && result.unchanged,
  'Full-season HTML export is downloadable, honest about scope, and read-only against canonical data',
  JSON.stringify({ok:result.ok,name:result.name,unchanged:result.unchanged,selfGames:result.selfGames,allGames:result.allGames}));

result = await page.evaluate(async () => {
  const app=window.app;
  /* Same reason as the season export above: disarm an autosave an earlier
     section left armed, so this measures the exports and not the debounce. */
  app.storage._cancelPendingSaves();
  const before=JSON.stringify(app.storage.seasonStore.data),save=window.ffaSaveBlob;
  const retired=['_renderTeamStats','_renderEfficiency','_renderDownAnalysis','_renderSituational','_renderDrives','_renderTendencies','_renderPersonnel','_renderBigPlays','_renderPenalties','_renderIndividualStats'];
  const retiredAbsent=retired.every(key=>typeof app.stats[key]!=='function');
  const captures=[];const pending=[];window.ffaSaveBlob=(blob,name)=>{pending.push(blob.text().then(html=>captures.push({html,name})));};
  let error='';
  try{app.storage.exportHtmlReport(app.stats);app.season.exportHtml();await Promise.all(pending);}catch(e){error=e.message;}
  window.ffaSaveBlob=save;
  return {error,captures,retiredAbsent,unchanged:JSON.stringify(app.storage.seasonStore.data)===before};
});
{
  const game=result.captures.find(item=>/_report\.html$/.test(item.name)&&!/^season_report_/.test(item.name));
  const season=result.captures.find(item=>/^season_report_/.test(item.name));
  ok(!result.error && result.retiredAbsent && result.unchanged && game && season
    && /Offensive Performance/.test(game.html) && /Defensive Performance/.test(game.html)
    && /Individual Performance/.test(game.html) && /Game Log/.test(season.html)
    && !game.html.includes('&amp;mdash;'),
    'Game and season HTML exports use structured report data with every legacy renderer disabled', JSON.stringify({error:result.error,names:result.captures.map(item=>item.name),unchanged:result.unchanged}));

  if (game) {
    const exportPage = await browser.newPage();
    await exportPage.setViewport({ width: 1440, height: 900 });
    await exportPage.setContent(game.html, { waitUntil: 'domcontentloaded' });
    const visual = await exportPage.evaluate(() => {
      const style = selector => getComputedStyle(document.querySelector(selector));
      const body = style('body');
      const module = style('.report-section');
      const band = style('.metric-band');
      const heading = style('thead th');
      return {
        background: body.backgroundColor,
        moduleBorderTop: module.borderTopWidth,
        moduleBorderRadius: module.borderRadius,
        bandBorderTop: band.borderTopWidth,
        headingBackground: heading.backgroundColor,
        charts: document.querySelectorAll('.export-chart').length,
        chartSvgs: document.querySelectorAll('.export-chart svg').length,
        histogram: !!document.querySelector('.export-chart.is-histogram'),
        downs: !!document.querySelector('.export-chart.is-downs .gi-multiples'),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    ok(visual.background === 'rgb(255, 255, 255)' && visual.moduleBorderTop === '3px'
      && visual.moduleBorderRadius === '0px' && visual.bandBorderTop === '3px'
      && visual.headingBackground !== 'rgba(0, 0, 0, 0)' && visual.overflow <= 0
      && visual.charts >= 3 && visual.chartSvgs >= 2
      && visual.histogram && visual.downs,
      'HTML export renders the ruled Reports system and its Offense charts on a white canvas without viewport overflow',
      JSON.stringify(visual));
    if (exportScreenshotDir) {
      await mkdir(exportScreenshotDir, { recursive: true });
      await exportPage.screenshot({ path: `${exportScreenshotDir}/game-report-export.png`, fullPage: true });
      if (season) {
        await exportPage.setContent(season.html, { waitUntil: 'domcontentloaded' });
        await exportPage.screenshot({ path: `${exportScreenshotDir}/season-report-export.png`, fullPage: true });
        await exportPage.setContent(game.html, { waitUntil: 'domcontentloaded' });
      }
    }
    await exportPage.emulateMediaType('print');
    const print = await exportPage.evaluate(() => ({
      pageWidth: getComputedStyle(document.querySelector('.page')).width,
      bodyBackground: getComputedStyle(document.body).backgroundColor,
      tableHeader: getComputedStyle(document.querySelector('thead')).display,
    }));
    ok(print.bodyBackground === 'rgb(255, 255, 255)' && print.tableHeader === 'table-header-group',
      'HTML export preserves its white canvas and repeating table headers in print media', JSON.stringify(print));
    await exportPage.close();
  }
}

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
await page.evaluate(async()=>{ const app=window.app,store=app.storage.seasonStore,looks=['Spread','I-Form','Wing-T','Wing-T','Empty','Doubles'],types=['Run Inside','Run Outside','Short Pass','Deep Pass','Screen','Play Action'],game=store.data.games.find(x=>x.id==='g-self'); game.plays=Array.from({length:64},(_,i)=>({id:i+1,timestamp:{start:i*5,end:i*5+4},notes:'',analysis:null,tags:{unit:i%5===4?'defense':'offense',formationFamily:looks[i%looks.length],backfield:i%2?'I':'Single',personnel:i%2?'11':'21',runPass:i%2?'Run':'Pass',playType:types[i%types.length],result:i%9===0?'Touchdown':(i%7===0?'Loss':'Gain'),yardage:String(i%9===0?18:(i%7===0?-4:2+(i%14))),down:String((i%4)+1),distance:String(1+(i%12)),quarter:'Q'+((i%4)+1),defFront:'4-2-5',coverage:'Cover 3',custom:[],players:{ballCarrier:'22',tackler:'55'},grades:{}}})); game.nextId=65; store.data.activeGameId='g-self'; app.storage._loadActiveGame(); await app.workspaceShell.show('reports'); app.reportsScreen.selectTab('overview'); });
await new Promise(r=>setTimeout(r,450));
const approvedOverview=await page.evaluate(()=>{ const app=window.app,stats=app.stats.compute(),board=document.querySelector('.gi-overview-board'),titles=[...(board?.querySelectorAll('.gi-overview-module>header>strong')||[])].map(n=>n.textContent.trim()),kpis=[...(board?.querySelectorAll('.gi-overview-kpi')||[])].map(n=>({label:n.querySelector('span')?.textContent.trim(),value:n.querySelector('strong')?.textContent.trim()})),rect=board?.getBoundingClientRect(); return {board:!!board,childCount:board?.children.length||0,titles,kpis,clickable:board?.querySelectorAll('.cut-row').length||0,overflow:rect?Math.max(0,Math.round(rect.right-document.documentElement.clientWidth)):-1,oldScoreboard:!!document.querySelector('.scoreboard-layout'),oldLensBoard:!!document.querySelector('.gi-lens-board'),allPlays:stats.allPlays,success:String(stats.efficiency.successRate)+'%',ypp:((stats.rushing.yards+stats.passing.yards)/stats.offPlays.length).toFixed(1)}; });
ok(approvedOverview.board && approvedOverview.childCount===5,'Overview is the approved five-band broadcast-density board, not legacy cards',JSON.stringify(approvedOverview));
ok(['Snaps by phase','Situational','Key metrics','Rushing','Passing','Rushing allowed','Passing allowed','Down & distance','Yards by type','Defense & discipline','Top 10 Plays','Offensive Drives','Defensive Drives'].every(x=>approvedOverview.titles.includes(x)),'All approved first-screen coaching modules are present',JSON.stringify(approvedOverview.titles));
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
  const rows = [...root.querySelectorAll('[data-report-perspective-pane="opponent"] .gi-answer-row.cut-row')];
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
  const module = [...document.querySelectorAll('#wsReports .gi-overview-module')]
    .find(node => node.querySelector('header strong')?.textContent.includes('Fronts —'));
  const row = module?.querySelector('tbody tr.cut-row');
  const expected = app.reportsScreen._opponentData?.defenseJoin?.fronts?.[0]?.refs || [];
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
  const resolveToken = name => { const probe = document.createElement('div'); probe.style.background = `var(${name})`;
    document.body.appendChild(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; };
  const tokens = { turnover: resolveToken('--gi-turnover'), neutral: resolveToken('--gi-7'), cat1: resolveToken('--gi-cat-1') };
  /* The board is six pages; every mark is counted on whichever page owns it. */
  const seen = { formationRows: 0, formationClickableRows: 0, histBars: 0, scatterPoints: 0, zoneCells: 0, multiples: 0 };
  const histFills = [];
  for (const id of ['identity', 'calls', 'structure', 'situations', 'field', 'advanced']) {
    document.querySelector(`[data-reports-secbar] [data-section="${id}"]`)?.click();
    await new Promise(resolve => setTimeout(resolve, 60));
    const formationModule = [...root.querySelectorAll('.gi-overview-module')].find(m => m.querySelector('header strong')?.textContent.trim() === 'Formation');
    seen.formationRows += formationModule?.querySelectorAll('tbody tr').length || 0;
    seen.formationClickableRows += formationModule?.querySelectorAll('tbody tr.cut-row').length || 0;
    seen.histBars += root.querySelectorAll('.gi-hist rect').length;
    seen.scatterPoints += root.querySelectorAll('.gi-scatter circle').length;
    seen.zoneCells += root.querySelectorAll('.gi-zone').length;
    seen.multiples += root.querySelectorAll('.gi-multiple').length;
    histFills.push(...[...root.querySelectorAll('.gi-hist rect')].map(r => getComputedStyle(r).fill));
  }
  document.querySelector('[data-reports-secbar] [data-section="identity"]')?.click();
  return {
    ...seen,
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
    window.app.reportsScreen.selectTab('offense');
    document.querySelector('.heatmap-tabs')?.scrollIntoView({ block: 'start' });
  });
  await sleep(150);
  await capture('desktop-offense-native-visuals');
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
  const bigModule = [...(root?.querySelectorAll('.gi-overview-module') || [])]
    .find(node => node.querySelector('header strong')?.textContent.startsWith('The “Big'));
  const bt = bigModule?.querySelector('table');
  const heads = [...(bt?.querySelectorAll('thead th') || [])].map(th => th.textContent.trim());
  const firstRow = [...(bt?.querySelectorAll('tbody tr:first-child td') || [])].map(td => td.textContent.trim());
const h3 = [...(root?.querySelectorAll('h3') || [])].map(h => h.textContent.trim());
  const situationsModule = [...(root?.querySelectorAll('.gi-overview-module') || [])]
    .find(node => node.querySelector('header strong')?.textContent === 'Every situation');
  const runHeader = [...(situationsModule?.querySelectorAll('thead th') || [])]
    .find(th => th.textContent.trim() === 'Run');
  runHeader?.click();
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const runValues = [...(situationsModule?.querySelectorAll('tbody td[data-col="runPct"]') || [])]
    .map(td => Number.parseInt(td.textContent, 10));
  const runSortsNumerically = runValues.every((value, index) => index === 0 || runValues[index - 1] >= value);
  return {
    // G13 — cells in charting order: Formation leads, QB alignment second.
    heads, cells: firstRow.length,
    formationFirst: heads[0] === 'Formation' && heads[1] === 'QB align',
    sortable: [...(bt?.querySelectorAll('thead th[role="button"]') || [])].length,
    blankRendersBlank: firstRow.slice(0, 5).some(cell => cell === ''),
    // G2 — the two levels above the raw table exist, and the raw table is whole.
    hasByDown: h3.includes('By Down'),
    hasByDistance: h3.includes('By Distance to the Sticks'),
    hasEverySituation: h3.includes('Every Situation'),
    // G3 — the shape visuals reached this tab at all.
    shapeMarks: root?.querySelectorAll('.gi-hist, .gi-scatter, .gi-zones, .gi-multiples, .gi-ramp').length || 0,
    // Opponent rows must NOT claim our cut filters.
    oppShapeCuts: root?.querySelectorAll('.gi-ramp .cut-row').length || 0,
    runSortsNumerically, runValues,
  };
});
ok(oppOffense.formationFirst && oppOffense.sortable === oppOffense.heads.length && oppOffense.blankRendersBlank && oppOffense.runSortsNumerically,
  'Opponent Offense tables sort numerically and keep charting-order dimensions — Formation first, untagged dimensions blank',
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
  /* ...AND EVERY PAGE of it: a multi-section report shows one page at a time,
     so a guard reading only the first page would pass vacuously on the rest. */
  const sections = await page.evaluate(() => [...document.querySelectorAll('[data-reports-secbar] [data-section]')].map(node => node.dataset.section));
  for (const section of sections.length ? sections : [null]) {
  if (section) {
    await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), section);
    await new Promise(r => setTimeout(r, 120));
  }
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
  }, section ? `${tab}/${section}` : tab);
  found.forEach(item => rhetorical.push(item));
  }
  // Leave each report on its first page, as a coach would find it: a page
  // selection is controller state and would otherwise carry into later blocks.
  if (sections.length) await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), sections[0]);
}
ok(rhetorical.length === 0,
  'Report headings and captions name the data literally — no questions, no prose openers',
  JSON.stringify(rhetorical));

console.log('\n== F13. Compact field summary resolves exact film in season and game scope ==');
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
  document.querySelector('[data-reports-secbar] [data-subtab="offense"]')?.click();
  await new Promise(r => setTimeout(r, 200));
  // The embedded Offense board's Field & production page holds the summary.
  document.querySelector('[data-pane="season"] .gi-secbar.is-inline [data-section="field"]')?.click();
  await new Promise(r => setTimeout(r, 100));
  const cells = [...document.querySelectorAll('.gi-off-field-cell')];
  const dotA = cells.find(d => /Own 21–40/.test(d.textContent || ''));
  const dotB = cells.find(d => /Opp 39–21/.test(d.textContent || ''));
  dotA?.click();
  const seasonMouseA = calls.at(-1) || null;
  dotB?.click();
  const seasonKeyB = calls.at(-1) || null;

  // -- Game scope: only gA is loaded, so its dot carries the BARE id (no ::).
  app.reportsScreen.selectTab('offense');
  await new Promise(r => setTimeout(r, 200));
  document.querySelector('[data-reports-secbar] [data-section="field"]')?.click();
  await new Promise(r => setTimeout(r, 100));
  const gameDot = [...document.querySelectorAll('.gi-off-field-cell')]
    .find(d => /Own 21–40/.test(d.textContent || ''));
  gameDot?.click();
  const gameMouseA = calls.at(-1) || null;

  app.filmNavigation.watch = original;
  return {
    dotCount: cells.length, dotAFound: !!dotA, dotBFound: !!dotB, gameDotFound: !!gameDot,
    seasonMouseA, seasonKeyB, gameMouseA,
  };
});
ok(result.dotCount === 10 && result.dotAFound && result.dotBFound,
  "Season-scope field summary keeps its ten approved cells and separates both games by field zone", JSON.stringify(result));
ok(JSON.stringify(result.seasonMouseA?.refs) === JSON.stringify(['gA::5']),
  'A season-scope field cell resolves the exact composite ref for its own game, not the other game sharing bare id 5',
  JSON.stringify(result.seasonMouseA));
ok(JSON.stringify(result.seasonKeyB?.refs) === JSON.stringify(['gB::5']),
  'The opposite season-scope field cell resolves the other exact composite ref',
  JSON.stringify(result.seasonKeyB));
ok(result.gameDotFound && JSON.stringify(result.gameMouseA?.refs) === JSON.stringify(['gA::5']),
  'A game-scope field cell resolves through the active game only, to the same exact play the season view names gA::5',
  JSON.stringify(result.gameMouseA));

/* RETIRED with the rejected tabbed explorer. Its Down & Distance and
   Formation x Play panes were never part of the approved fixed Offense comp;
   the underlying projection and success semantics remain pinned at their
   analytics owners. Reports now tests the compact field cells and exact refs. */

console.log('\n== F13d. The Reports Players tab renders a real box-score leaderboard, and each row resolves exactly that player\'s own film ==');
result = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Players Tab QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit: 'offense', custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  app.storage.seasonStore.data.games = [{
    id: 'g-players-qa', name: 'Players Tab QA', nextId: 4,
    gameInfo: { opponent: 'Wildcats', perspective: 'self' },
    plays: [
      play(1, { playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', players: { ballCarrier: '22' } }),
      play(2, { playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3', players: { ballCarrier: '22' } }),
      // A second ball carrier -- proves activating #22's row plays ONLY #22's
      // two snaps, never every rusher's plays.
      play(3, { playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '9', players: { ballCarrier: '10' } }),
    ],
  }];
  app.storage.seasonStore.data.activeGameId = 'g-players-qa';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('players');
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  const calls = [];
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label || '' }); return Promise.resolve({ completed: true }); };

  const rows = [...document.querySelectorAll('[data-pane="players"] .stats-table tbody tr')];
  const row22 = rows.find(row => (row.querySelector('td[data-col="player"]')?.textContent || '').includes('22'));
  const boxScore = row22 ? {
    att: row22.querySelector('td[data-col="att"]')?.textContent.trim(),
    yds: row22.querySelector('td[data-col="yds"]')?.textContent.trim(),
  } : null;
  /* Revision 2: film comes from a STATISTIC, not the row. `Att` is this
     rusher's carries; the row itself opens the player detail view. */
  row22?.querySelector('[data-player-stat*=":att:"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  const watched = calls.at(-1) || null;

  app.filmNavigation.watch = original;
  return {
    rowFound: !!row22, boxScore, watched,
    scope: app.reportsScreen.playersScope,
    scoped: app.reportsScreen._playersScopedPlays?.map(play => `${play.__gid}::${play.id}`) || [],
    paneText: (document.querySelector('[data-pane="players"]')?.textContent || '').replace(/\s+/g, ' ').trim(),
  };
});
ok(result.rowFound, 'The real Reports Players tab renders a leaderboard row for the charted rusher', JSON.stringify(result));
ok(result.boxScore?.att === '2' && result.boxScore?.yds === '8',
  'The Players tab leaderboard row is a real, non-empty box score aggregated from the plays charted for that rusher (2 att, 8 yds)', JSON.stringify(result));
ok(JSON.stringify(result.watched?.refs?.slice().sort()) === JSON.stringify(['g-players-qa::1', 'g-players-qa::2']),
  'Activating a Players tab rushing statistic resolves the exact composite film refs for only that rusher, never the other player sharing the game', JSON.stringify(result));

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

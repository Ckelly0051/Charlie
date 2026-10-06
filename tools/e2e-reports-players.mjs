/**
 * Reports > Players — the approved composition, its role schemas, its absence
 * contract, and the three production dependencies the design record required:
 * role-specific composite film references, full season through the existing
 * multi-game assembly, and the Grade mapping.
 *
 * Comp and decision record: design-comps/reports-players-2026-09-04/
 * (`players.html`, `RATIONALE.md`, final composition in RATIONALE section 16).
 *
 * Every assertion drives the real route and reads the rendered result. None of
 * it searches source text: a test that greps for a selector passes against a
 * file that never renders. Where a test is about column geometry it measures
 * the rendered cell against its own content box, because `table-layout:fixed`
 * overflows silently rather than growing.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* DEFERRED TYPE FLOOR. `docs/VISUAL-SYSTEM-RULES.md` sets 12.5px as the shared
   coach-facing floor. This board has NOT been migrated to it: raising its labels
   means re-deriving the fixed row math its approved comp pins, so the migration
   is open work in `docs/OPEN-DEFECTS.md`. THIS HARNESS RUNS A SYNTHETIC
   FIXTURE, so it cannot establish the value -- `CLAUDE.md` is explicit that
   synthetic data cannot establish Reports visual parity. The number below is
   measured on the canonical season by `tools/e2e-reports-typefloor-realdata.mjs`
   and mirrored here as a same-fixture regression guard only. The
   canonical minimum for this board is 11px. Pinning it here means the board
   cannot drift further from the floor while it waits, and the number moves only
   when the migration moves it -- it is a deferral, not a second standard. */
const PLAYERS_TYPE_FLOOR_DEFERRED = 11;


const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Players QA', team: 'Ridgebacks', year: '2026', level: 'Varsity' });
});

/* One game exercising every role, a charted grade and an ungraded rep in the
   same table, a negative rushing line, a measured zero, and a jersey with no
   roster name so the label falls back to the bare number. */
/* Structured Special Teams events (the old stType / kickOutcome / returnYards /
   kickDistance shape was retired, 2026-09-26). `__st` rides on a fixture row and
   becomes the play's `specialTeams`. */
const STE = (unit, { status = null, distance = null, yards = null, score = null } = {}) => ({
  version: 1, unit, attemptType: unit === 'fieldGoal' ? 'fieldGoal' : null,
  kick: { distance }, return: { attempted: yards != null ? true : null, yards, end: {} },
  outcome: { status, score, scoredBy: null, recoveredBy: null },
});
const GAME_A = [
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '8', players: { ballCarrier: '22' }, grades: { ballCarrier: 2 } },
  { unit: 'offense', playType: 'Run Outside', runPass: 'Run', result: 'Touchdown', yardage: '31', players: { ballCarrier: '22' }, grades: { ballCarrier: 3 } },
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Fumble', yardage: '2', players: { ballCarrier: '5' } },
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Loss', yardage: '-3', players: { ballCarrier: '34' }, grades: { ballCarrier: -1 } },
  { unit: 'offense', playType: 'Quick Pass', runPass: 'Pass', result: 'Gain', yardage: '14', players: { passer: '12', receiver: '84' }, grades: { passer: 1, receiver: 2 } },
  { unit: 'offense', playType: 'Quick Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', players: { passer: '12', receiver: '84' } },
  { unit: 'offense', playType: 'Deep Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { passer: '12' }, grades: { passer: -2 } },
  { unit: 'offense', playType: 'Dropback', runPass: 'Pass', result: 'Sack', yardage: '-7', players: { passer: '12' } },
  { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'No Gain', yardage: '1', players: { tackler: '44 + 51' }, grades: { tackler: 1 } },
  { unit: 'defense', playType: 'Dropback', runPass: 'Pass', result: 'Sack', yardage: '-9', players: { tackler: '51' } },
  { unit: 'defense', playType: 'Quick Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { tackler: '44', takeaway: '27' } },
  /* The longest representative roster name in the NINE-column Tackles table --
     the tightest identity column on the board, and the one that truncated. */
  { unit: 'defense', playType: 'Run Outside', runPass: 'Run', result: 'No Gain', yardage: '2', players: { tackler: '22' } },
  { unit: 'special', players: { returner: '7' }, __st: STE('kickoffReturn', { status: 'returned', yards: 24 }) },
  { unit: 'special', players: { returner: '16' }, __st: STE('puntReturn', { status: 'returned', yards: 0 }) },
  { unit: 'special', players: { kicker: '3' }, __st: STE('fieldGoal', { status: 'good', score: 'fieldGoal', distance: 28 }) },
  { unit: 'special', players: { kicker: '3' }, __st: STE('fieldGoal', { status: 'noGood', distance: 44 }) },
  { unit: 'special', yardage: '38', players: { kicker: '3' }, __st: STE('punt', { status: 'fairCatch', distance: 38 }) },
];
/* A second game at full-season magnitude: a four-digit passing yardage and a
   three-digit attempt count are what the column steps must actually hold, and
   sizing them against one game is what let `1054` and `174/261` overrun. */
const GAME_B = [
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '12', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } },
  { unit: 'defense', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '-2', players: { tackler: '23' }, grades: { tackler: 2 } },
  { unit: 'special', players: { returner: '7' }, __st: STE('kickoffReturn', { status: 'returned', yards: 44 }) },
  ...Array.from({ length: 190 }, (_, i) => ({
    unit: 'offense', playType: 'Quick Pass', runPass: 'Pass',
    result: i % 3 === 0 ? 'Incomplete' : 'Gain', yardage: i % 3 === 0 ? '0' : '13',
    players: { passer: '12', receiver: '84' },
  })),
];
const ROSTER = {
  22: 'Terrance Whitfield-Boateng', 5: 'Malik Cordero', 12: 'Jaylen Ruiz',
  84: 'Christopher Vanderhoeven', 7: 'Devonte Ashworth', 51: 'Dominic Ferraro-Nwosu',
  44: 'Josiah Pemberton', 23: 'Elias Mbeki', 27: 'Trey Alderson', 16: 'Cody Fairbanks',
  3: 'Nikolas Petrakis',
};

/** Loads one or two games and opens the Players tab. */
const load = async (games, roster = ROSTER) => {
  await page.evaluate(async (list, names) => {
    const store = window.app.storage.seasonStore;
    const build = rows => rows.map(({ __st, ...row }, i) => ({
      id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [],
      tags: { custom: [], players: {}, grades: {}, quarter: 'Q1', ...row }, ...(__st ? { specialTeams: __st } : {}),
    }));
    store.data.games = list.map((plays, index) => ({
      id: `g-${index}`, name: `Week ${index + 1}`, nextId: plays.length + 1, plays: build(plays),
      gameInfo: { opponent: `Opp ${index + 1}`, date: `2026-09-0${index + 1}`, week: String(index + 1),
        projectName: `Opp ${index + 1}`, perspective: 'self', scoreUs: 21, scoreThem: 7 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }));
    store.data.activeGameId = `g-${list.length - 1}`;
    window.app.roster.loadFrom(Object.entries(names)
      .map(([num, name]) => ({ num: String(num), name, pos: '', side: 'B' })), { persist: false });
    await window.app.storage._loadActiveGame();
  }, games, roster);
  await sleep(450);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(300);
  await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
  await sleep(650);
};
const setScope = async scope => {
  await page.evaluate(s => {
    [...document.querySelectorAll('[data-reports-secbar] [data-players-scope]')]
      .find(b => b.textContent.trim() === (s === 'game' ? 'Current game' : 'Full season'))?.click();
  }, scope);
  await sleep(500);
};
const setSection = async title => {
  await page.evaluate(t => {
    [...document.querySelectorAll('[data-reports-secbar] .gi-players-roles button')]
      .find(b => b.textContent.trim().startsWith(t))?.click();
  }, title);
  await sleep(300);
};
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

/* ══ 1. The approved composition ══════════════════════════════════════════ */
console.log('\n== 1. The approved composition renders ==');
await load([GAME_A, GAME_B]);

const comp = await page.evaluate(() => {
  const board = document.querySelector('.gi-players-board');
  const report = document.querySelector('.gi-players-report');
  // Role navigation and scope live in the shared secondary bar under the strip
  // (coach-approved comp, 2026-09-23); the board's own toolbar keeps the sample.
  const bar = document.querySelector('[data-reports-secbar] [data-reports-secbar-bar]');
  const toolbar = bar?.querySelector('.gi-secbar-scope');
  const nav = bar?.querySelector('.gi-players-roles');
  const row = document.querySelector('.gi-player-table tbody tr');
  const td = document.querySelector('.gi-player-table tbody td');
  const navBadge = nav?.querySelector('button > b');
  const roleHead = document.querySelector('.gi-player-module > header strong');
  return {
    board: !!board,
    // Scope and role navigation must share ONE control row: the toolbar and the
    // nav sit on the same grid row of the report, not stacked full width.
    sameRow: toolbar && nav
      ? Math.abs((toolbar.getBoundingClientRect().top + toolbar.getBoundingClientRect().bottom) / 2
        - (nav.getBoundingClientRect().top + nav.getBoundingClientRect().bottom) / 2) < 2
        && bar.getBoundingClientRect().height <= 46 : false,
    barUnderStrip: bar ? Math.abs(bar.getBoundingClientRect().top - document.querySelector('[data-reports-strip]').getBoundingClientRect().bottom) < 0.5 : false,
    sectionStrip: !!document.querySelector('.gi-players-rule'),
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : null,
    dataFont: td ? getComputedStyle(td).fontSize : null,
    // A role count is plain text, not a boxed badge.
    badgeBackground: navBadge ? getComputedStyle(navBadge).backgroundColor : null,
    badgePadding: navBadge ? getComputedStyle(navBadge).padding : null,
    badgeBorder: navBadge ? getComputedStyle(navBadge).borderTopWidth : null,
    roleHeadFamily: roleHead ? getComputedStyle(roleHead).fontFamily : null,
    roleHeadTransform: roleHead ? getComputedStyle(roleHead).textTransform : null,
    roleHeadSpacing: roleHead ? getComputedStyle(roleHead).letterSpacing : null,
    roleHeadSize: roleHead ? getComputedStyle(roleHead).fontSize : null,
    // Role headers carry the role name and the player count, nothing else.
    metas: [...document.querySelectorAll('.gi-player-module > header span')].map(s => s.textContent.trim()),
    // The report canvas is capped on a wide display.
    canvasCap: report ? getComputedStyle(report).maxWidth : null,
  };
});
ok(comp.board, 'the Players tab renders the approved board');
ok(comp.sameRow && comp.barUnderStrip,
  'scope and role navigation share one compact control row: the secondary bar directly under the strip',
  `sameRow=${comp.sameRow} underStrip=${comp.barUnderStrip}`);
ok(!comp.sectionStrip, 'the redundant section-title strip is not rendered');
ok(comp.rowHeight === 38, 'a data row is 38px tall', `measured ${comp.rowHeight}`);
ok(comp.dataFont === '13px', 'data text is 13px', `measured ${comp.dataFont}`);
ok(comp.badgeBackground === 'rgba(0, 0, 0, 0)' && comp.badgePadding === '0px' && comp.badgeBorder === '0px',
  'role counts are plain text, not boxed badges',
  `background=${comp.badgeBackground} padding=${comp.badgePadding} border=${comp.badgeBorder}`);
ok(/IBM Plex Sans"?,/.test(comp.roleHeadFamily) && !/Condensed/.test(comp.roleHeadFamily)
  && comp.roleHeadTransform === 'none' && comp.roleHeadSpacing === 'normal'
  && parseFloat(comp.roleHeadSize) >= 12,
  'role headings are readable IBM Plex Sans with no forced uppercase or tracking',
  `${comp.roleHeadFamily} ${comp.roleHeadSize} ${comp.roleHeadTransform} ${comp.roleHeadSpacing}`);
ok(comp.metas.length > 0 && comp.metas.every(m => /^\d+ players?$/.test(m)),
  'a role header carries only the role name and its player count',
  JSON.stringify(comp.metas));

/* ══ 2. Role schemas ══════════════════════════════════════════════════════ */
console.log('\n== 2. The six approved role schemas ==');
const SCHEMA = {
  Rushing: ['Player', 'Att', 'Yds', 'Avg', 'Long', 'TD', 'Fum', 'Grade'],
  Passing: ['Player', 'C/A', 'Pct', 'Yds', 'TD', 'INT', 'Sck', 'Grade'],
  Receiving: ['Player', 'Rec', 'Yds', 'Long', 'TD', 'Grade'],
  Tackles: ['Player', 'Tkl', 'Solo', 'Ast', 'Sack', 'TFL', 'INT', 'FR', 'Grade'],
  'Return Game': ['Player', 'Ret', 'Yds', 'Avg', 'Long', 'TD'],
  'Kicking / Punting': ['Player', 'FG (M/A)', 'Punts', 'Punt Avg'],
};
await setScope('season');
const schemas = await page.evaluate(() => Object.fromEntries(
  [...document.querySelectorAll('.gi-player-module')].map(m => [
    m.querySelector('header strong').textContent.trim(),
    [...m.querySelectorAll('thead th')].map(t => t.textContent.trim()),
  ])));
for (const [role, cols] of Object.entries(SCHEMA)) {
  ok(JSON.stringify(schemas[role]) === JSON.stringify(cols),
    `${role} renders its approved columns`, JSON.stringify(schemas[role]));
}

/* ══ 3. Column geometry ═══════════════════════════════════════════════════
   `table-layout:fixed` honours the colgroup exactly. Auto layout discards
   every declared column width the moment the identity column asks for 100%,
   which silently content-sizes the measurements and makes the stated widths
   fiction -- so the geometry is measured, never assumed. */
console.log('\n== 3. Fixed column geometry and the identity anchor ==');
const geo = await page.evaluate(() => {
  const t = document.querySelector('.gi-player-table');
  const cg = t?.querySelector('colgroup');
  const cs = getComputedStyle(document.querySelector('.gi-players-board'));
  return {
    layout: t ? getComputedStyle(t).tableLayout : null,
    hasColgroup: !!cg,
    identFloor: cs.getPropertyValue('--p-ident').trim(),
    // Every table's identity column starts at the same offset inside its panel.
    identOffsets: [...document.querySelectorAll('.gi-players-col')].map(b =>
      [...b.querySelectorAll('.gi-player-module')].map(m => {
        const cell = m.querySelector('td.tl');
        return cell ? Math.round(cell.getBoundingClientRect().left - m.getBoundingClientRect().left) : null;
      }).filter(v => v != null)),
    // A declared column width is honoured, not a preference the browser drops.
    honoured: cg ? [...cg.children].every(c => c.className === 'ident'
      || Math.abs(parseFloat(getComputedStyle(c).width)
        - parseFloat(cs.getPropertyValue(`--p-${c.className}`))) < 0.6) : false,
  };
});
ok(geo.layout === 'fixed' && geo.hasColgroup,
  'each role table declares its column geometry and the browser honours it',
  `layout=${geo.layout} colgroup=${geo.hasColgroup}`);
ok(geo.honoured, 'every measurement column renders at its declared step width');
ok(geo.identFloor === '208px', 'the identity column keeps its declared floor', geo.identFloor);
ok(geo.identOffsets.every(column => column.every(offset => offset === column[0])),
  'every module in a phase column starts its identity column at the same offset',
  JSON.stringify(geo.identOffsets));

/* Column edges must not move when a sort reorders rows. */
const colsOf = () => page.evaluate(() => [...document.querySelectorAll('.gi-player-module')]
  .slice(0, 1).flatMap(m => [...m.querySelectorAll('thead th')].map(t => Math.round(t.getBoundingClientRect().width))));
const colsBefore = await colsOf();
await page.evaluate(() => {
  const m = document.querySelector('.gi-player-module');
  [...m.querySelectorAll('thead th')].find(t => t.textContent.trim() === 'Long')?.click();
});
await frame();
const colsAfter = await colsOf();
ok(JSON.stringify(colsBefore) === JSON.stringify(colsAfter),
  'a sort reorders rows and moves no column edge', `${colsBefore} -> ${colsAfter}`);

/* The route-wide `th{position:sticky;top:42px}` is measured against the scroll
   container once the table wrap becomes one, which pins every header 42px down
   OVER its own first data row. Asserted geometrically, because a covered row is
   still in the DOM and reads as present to any content check. */
const headerOverlay = await page.evaluate(() => [...document.querySelectorAll('.gi-player-table')]
  .map(t => {
    const th = t.querySelector('thead th');
    const tr = t.querySelector('tbody tr');
    if (!th || !tr) return null;
    return { role: t.closest('.gi-player-module').querySelector('header strong').textContent.trim(),
      position: getComputedStyle(th).position,
      top: getComputedStyle(th).top,
      overlap: Math.round(th.getBoundingClientRect().bottom - tr.getBoundingClientRect().top) };
  }).filter(Boolean));
ok(headerOverlay.every(h => h.overlap <= 1),
  'no column header is pinned over its own first data row',
  JSON.stringify(headerOverlay.filter(h => h.overlap > 1)));
/* The 1.12.0-90 REVISE gave each module body its own row capacity, so the column
   header is now DELIBERATELY sticky — but against that body's top, not the
   route's 42px offset. The claim is unchanged in substance and stronger in
   form: the header may never sit over its own first data row (asserted above),
   and its offset must be the body's own zero. */
ok(headerOverlay.every(h => h.position === 'sticky' && h.top === '0px'),
  'the Players column header sticks to its own module body, not to the route offset',
  JSON.stringify(headerOverlay.map(h => `${h.role}:${h.position}`)));

/* ══ 4. No clipping, no page overflow, at every release width ═════════════ */
console.log('\n== 4. Every release width, both scopes, every section ==');
const inspect = async label => {
  const r = await page.evaluate(floorPx => {
    const over = [];
    document.querySelectorAll('.gi-player-table th,.gi-player-table td').forEach(c => {
      if (!c.getClientRects().length) return;
      // The identity cell truncates rather than overrunning into the
      // measurements, so it is measured against its own ellipsis, not excused.
      const rg = document.createRange(); rg.selectNodeContents(c);
      const cs = getComputedStyle(c);
      const avail = c.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      if (rg.getBoundingClientRect().width > avail + 0.6) over.push(c.textContent.trim().slice(0, 28));
    });
    return {
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...new Set(over)].slice(0, 6),
      scrollers: [...document.querySelectorAll('.gi-player-module .gi-table-wrap')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).length,
      tiny: [...new Set([...document.querySelectorAll('.gi-players-board *')]
        .filter(el => el.getClientRects().length && el.textContent.trim() && !el.children.length
          && parseFloat(getComputedStyle(el).fontSize) < floorPx)
        .map(el => `${el.tagName}.${el.className}`.slice(0, 40)))],
    };
  }, PLAYERS_TYPE_FLOOR_DEFERRED);
  ok(r.pageOverflow <= 0, `${label}: no page-level horizontal scrolling`, `${r.pageOverflow}px`);
  ok(!r.clipped.length, `${label}: no clipped header, name or value`, r.clipped.join('; '));
  ok(!r.scrollers, `${label}: no table scroller engages`, String(r.scrollers));
  ok(!r.tiny.length,
    `${label}: no text below the deferred ${PLAYERS_TYPE_FLOOR_DEFERRED}px board floor, pending migration to the shared 12.5px floor`,
    r.tiny.join('; '));
};
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720]]) {
  await page.setViewport({ width: w, height: h });
  await frame();
  for (const scope of ['game', 'season']) {
    await setScope(scope);
    for (const sec of ['All roles', 'Offense', 'Defense', 'Special Teams']) {
      await setSection(sec);
      await inspect(`${w} ${scope} ${sec}`);
    }
    await setSection('All roles');
  }
}

/* ══ 5. Per-band stacking ═════════════════════════════════════════════════ */
console.log('\n== 5. A band stacks only when its own content requires it ==');
await page.setViewport({ width: 1440, height: 900 });
await setScope('season');
await setSection('All roles');
await frame();
/* The 1.12.0-90 REVISE replaced two-at-a-time pairing with phase columns, so
   these assert the composition that replaced it: two columns at 1440 carrying
   Offense and Defense+Special Teams, and one column below the 1420px
   breakpoint, where a column can no longer hold Passing's or Tackles' table. */
const bands1440 = await page.evaluate(() => ({
  columns: [...document.querySelectorAll('.gi-players-col')]
    .map(col => [...col.querySelectorAll('.gi-player-module header strong')].map(s => s.textContent.trim())),
  grid: getComputedStyle(document.querySelector('.gi-players-sections')).gridTemplateColumns.split(' ').length,
}));
ok(bands1440.grid === 2 && bands1440.columns.length === 2
  && bands1440.columns[0].join(',') === 'Rushing,Passing,Receiving'
  && bands1440.columns[1].join(',') === 'Tackles,Return Game,Kicking / Punting',
  'at 1440 the board is two phase columns: Offense in one, Defense then Special Teams in the other',
  JSON.stringify(bands1440));
await page.setViewport({ width: 1280, height: 720 });
await frame();
await sleep(200);
const bands1280 = await page.evaluate(() => ({
  grid: getComputedStyle(document.querySelector('.gi-players-sections')).gridTemplateColumns.split(' ').length,
  order: [...document.querySelectorAll('.gi-player-module header strong')].map(s => s.textContent.trim()),
  phases: [...document.querySelectorAll('[data-players-phase]')].map(p => p.dataset.playersPhase),
}));
ok(bands1280.grid === 1
  && bands1280.order.join(',') === 'Rushing,Passing,Receiving,Tackles,Return Game,Kicking / Punting'
  && bands1280.phases.join(',') === 'off,def,st',
  'at 1280 the columns stack into one and the phase order and role order are unchanged',
  JSON.stringify(bands1280));

/* ══ 6. Absence contract ══════════════════════════════════════════════════ */
console.log('\n== 6. Zero versus absence, and the two absence surfaces ==');
await page.setViewport({ width: 1440, height: 900 });
/* Season scope: the ungraded rep, the negative grade, the zero-yard return and
   the tackle-less takeaway are all charted in the first game. */
await setScope('season');
await frame();
const absence = await page.evaluate(() => {
  const cell = (role, col, num) => {
    const m = [...document.querySelectorAll('.gi-player-module')]
      .find(x => x.querySelector('header strong').textContent.trim() === role);
    const tr = [...m.querySelectorAll('tbody tr')].find(r => r.querySelector('td.tl').textContent.includes(`#${num}`));
    const td = tr?.querySelector(`td[data-col="${col}"]`);
    return td ? { text: td.textContent.trim(), cls: td.className, weight: getComputedStyle(td).fontWeight } : null;
  };
  return {
    ungraded: cell('Rushing', 'grade', '5'),
    negativeGrade: cell('Rushing', 'grade', '34'),
    positiveGrade: cell('Rushing', 'grade', '22'),
    measuredZeroReturn: cell('Return Game', 'yds', '16'),
    zeroTackles: cell('Tackles', 'tkl', '27'),
  };
});
ok(absence.ungraded?.text === 'No data' && /blank/.test(absence.ungraded.cls),
  'an ungraded rep reads the absence literal, never a grade of 0.0', JSON.stringify(absence.ungraded));
ok(absence.negativeGrade?.text === '-1.0' && /grade-neg/.test(absence.negativeGrade.cls),
  'a negative charted grade keeps its sign and its loss colour', JSON.stringify(absence.negativeGrade));
ok(absence.positiveGrade?.text.startsWith('+') && /grade-pos/.test(absence.positiveGrade.cls),
  'a positive charted grade is signed and coloured', JSON.stringify(absence.positiveGrade));
ok(absence.measuredZeroReturn?.text === '0' && !/blank/.test(absence.measuredZeroReturn.cls),
  'a return fielded for no yards renders a measured 0 at full strength', JSON.stringify(absence.measuredZeroReturn));
ok(absence.zeroTackles?.text === '0' && !/blank/.test(absence.zeroTackles.cls),
  'a takeaway credited with no tackle keeps a measured 0, not an absence', JSON.stringify(absence.zeroTackles));

/* ══ 7. Sparse and empty states ═══════════════════════════════════════════ */
console.log('\n== 7. Sparse consolidation and the approved empty state ==');
await load([[
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '11', players: { ballCarrier: '22' } },
  { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'No Gain', yardage: '1', players: { tackler: '51' } },
]]);
const sparse = await page.evaluate(() => {
  const s = document.querySelector('.gi-player-empty-summary');
  return {
    modules: [...document.querySelectorAll('.gi-player-module > header strong')].map(h => h.textContent.trim()),
    label: s?.querySelector('span')?.textContent.trim() || null,
    roles: s?.querySelector('strong')?.textContent.trim() || null,
    zeros: /\b0\b/.test(s?.textContent || ''),
  };
});
ok(JSON.stringify(sparse.modules) === JSON.stringify(['Rushing', 'Tackles']),
  'a sparse state renders the populated roles as ordinary tables', JSON.stringify(sparse.modules));
ok(sparse.label === 'No data'
  && sparse.roles === 'Passing · Receiving · Return Game · Kicking / Punting',
  'roles with no attribution consolidate into one literal summary row that names them',
  `${sparse.label} | ${sparse.roles}`);
ok(!sparse.zeros, 'the summary shows no zero -- unattributed is not zero production');

await load([[
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4' },
]]);
const empty = await page.evaluate(() => {
  const e = document.querySelector('.gi-reports-empty');
  return e ? {
    title: e.querySelector('h3')?.textContent.trim(),
    body: e.querySelector('p')?.textContent.trim(),
    action: e.querySelector('.gi-reports-empty-cta')?.textContent.trim(),
    titleFamily: getComputedStyle(e.querySelector('h3')).fontFamily,
    titleTransform: getComputedStyle(e.querySelector('h3')).textTransform,
  } : null;
});
ok(empty?.title === 'No player attribution', 'the empty state carries the approved title', empty?.title);
ok(empty?.body === 'No players are attributed to charted plays.',
  'the empty state carries the approved body verbatim', empty?.body);
ok(empty?.action === 'Open Break Down', 'the empty state offers the approved action', empty?.action);
ok(!/Condensed/.test(empty?.titleFamily || '') && empty?.titleTransform !== 'uppercase',
  'the empty-state heading uses the readable Sans treatment, not a condensed uppercase label',
  `${empty?.titleFamily} ${empty?.titleTransform}`);

/* ══ 8. Film references ═══════════════════════════════════════════════════
   Every row opens its OWN role cohort through the shared film-navigation
   service. The Players cohort once stamped no game id, so every row fell back
   to a generic jersey cut-up; that fallback must be gone, not bypassed. */
console.log('\n== 8. Role-specific composite film references, in both scopes ==');
await load([GAME_A, GAME_B]);
for (const scope of ['game', 'season']) {
  await setScope(scope);
  const refs = await page.evaluate(() => {
    const screen = window.app.reportsScreen;
    const { scoped } = screen._playersCohort();
    const stats = window.app.stats.compute(scoped);
    const known = new Set(scoped.filter(p => p.__gid != null && p.id != null).map(p => `${p.__gid}::${p.id}`));
    let rows = 0, empty = 0, unresolved = 0;
    for (const list of Object.values(stats.individuals)) {
      if (!Array.isArray(list)) continue;
      for (const row of list) {
        rows++;
        if (!row.refs?.length) { empty++; continue; }
        if (!row.refs.every(ref => known.has(ref))) unresolved++;
      }
    }
    return { rows, empty, unresolved,
      games: new Set(scoped.map(p => String(p.__gid))).size, plays: scoped.length,
      /* Revision 2 moved the affordance OFF the row: identity opens the player
         and each measured value with clips of its own is its own button, so a
         row without an identity button is the defect now. */
      /* A HELD row is unused capacity, not a player: it carries the dash in
         every column and is deliberately not interactive, so it is excluded
         here rather than counted as a row missing its identity control. */
      unclickable: [...document.querySelectorAll('.gi-player-table tbody tr')]
        .filter(tr => !tr.classList.contains('is-absent'))
        .filter(tr => !tr.querySelector('[data-player-open]')).length,
      heldRows: [...document.querySelectorAll('.gi-player-table tbody tr.is-absent')].length,
      heldInteractive: [...document.querySelectorAll('.gi-player-table tbody tr.is-absent')]
        .filter(tr => tr.querySelector('button, [data-player-open], [data-player-stat]')).length,
      firstRow: (document.querySelector('.gi-player-table tbody tr')?.innerHTML || '').slice(0, 160) };
  });
  ok(refs.rows > 0 && refs.empty === 0,
    `${scope} scope: every row carries composite references for its own role`,
    `${refs.empty} of ${refs.rows} rows had none`);
  ok(refs.unresolved === 0,
    `${scope} scope: every reference resolves to a play in the scoped cohort`, String(refs.unresolved));
  ok(refs.unclickable === 0,
    `${scope} scope: every row opens its player through its identity cell`,
    JSON.stringify({ rows: refs.unclickable, firstRow: refs.firstRow }));
  ok(refs.heldInteractive === 0,
    `${scope} scope: a held capacity row carries no film or player action`,
    JSON.stringify({ held: refs.heldRows, interactive: refs.heldInteractive }));
  if (scope === 'season') {
    ok(refs.games === 2 && refs.plays > 190,
      'full season is assembled from the existing multi-game cohort, not a Players-local aggregation',
      `${refs.plays} plays across ${refs.games} games`);
  }
}

const watched = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const seen = [];
  const original = screen.watchRefs.bind(screen);
  screen.watchRefs = (refs, label) => seen.push({ refs: [...refs], label });
  const module = [...document.querySelectorAll('.gi-player-module')]
    .find(m => m.querySelector('header strong').textContent.trim() === 'Receiving');
  // Revision 2: a STATISTIC opens film, never the whole row. `Rec` is this
  // player's receptions bucket in this role.
  module.querySelector('tbody tr [data-player-stat*=":rec:"]').click();
  screen.watchRefs = original;
  return seen;
});
ok(watched.length === 1, 'a statistic click reaches the shared film-navigation service exactly once',
  JSON.stringify(watched));
ok(/Receiving Rec$/.test(watched[0]?.label || ''),
  'the film cohort is labelled with the row\'s own role and the exact statistic clicked',
  watched[0]?.label);
ok((watched[0]?.refs || []).length > 0 && watched[0].refs.every(r => /^[^:]+::\d+$/.test(r)),
  'the cohort is composite gameId::playId references, never a generic jersey cut-up',
  JSON.stringify(watched[0]?.refs));

/* The receiving cohort must be the receiving plays, not every snap the jersey
   appears in -- #84 is charted on receptions only, #22 on runs and none of
   these receptions. */
const cohorts = await page.evaluate(() => {
  const stats = window.app.stats.compute(window.app.reportsScreen._playersCohort().scoped);
  const rec = stats.individuals.receivers.find(r => String(r.num) === '84');
  const rush = stats.individuals.rushers.find(r => String(r.num) === '22');
  const recv22 = stats.individuals.receivers.find(r => String(r.num) === '22');
  return { rec: rec?.refs || [], rush: rush?.refs || [], recv22: recv22?.refs || [] };
});
ok(cohorts.rec.length && cohorts.rush.length
  && !cohorts.rec.some(r => cohorts.rush.includes(r)),
  'a role cohort holds only that role\'s own contributing plays',
  `receiving ${cohorts.rec.length}, rushing ${cohorts.rush.length}`);

/* ══ 9. Grades ════════════════════════════════════════════════════════════
   `individualStats` once returned `{text, cls}` and spread it into the row, so
   DataTable looked up a `grade` key that did not exist and every Grade cell
   rendered empty. The repair is asserted at the rendered cell. */
console.log('\n== 9. The Grade column ==');
await setScope('season');
const grades = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.gi-player-table td[data-col="grade"]')];
  return { total: cells.length, blank: cells.filter(c => !c.textContent.trim()).length,
    values: cells.map(c => c.textContent.trim()).slice(0, 6),
    classed: cells.filter(c => /grade-(pos|neg)/.test(c.className)).length };
});
ok(grades.total > 0 && grades.blank === 0,
  'every Grade cell renders a value or the absence literal, never an empty cell',
  `${grades.blank} of ${grades.total} blank`);
ok(grades.classed > 0, 'a charted grade carries its sign colour class', String(grades.classed));

/* Sorting on Grade must hold the absence last in BOTH directions -- an
   ungraded player floating above a negative grade reads as the worst grade. */
const gradeSort = async () => page.evaluate(() => {
  const m = [...document.querySelectorAll('.gi-player-module')]
    .find(x => x.querySelector('header strong').textContent.trim() === 'Rushing');
  // Held capacity rows are not cohort members and carry the dash in every
  // column, so the sort claim is asserted over the real rows only.
  return [...m.querySelectorAll('tbody tr:not(.is-absent) td[data-col="grade"]')].map(td => td.textContent.trim());
});
await page.evaluate(() => {
  const m = [...document.querySelectorAll('.gi-player-module')]
    .find(x => x.querySelector('header strong').textContent.trim() === 'Rushing');
  const th = [...m.querySelectorAll('thead th')].find(t => t.textContent.trim() === 'Grade');
  th.click();
});
await frame();
const desc = await gradeSort();
await page.evaluate(() => {
  const m = [...document.querySelectorAll('.gi-player-module')]
    .find(x => x.querySelector('header strong').textContent.trim() === 'Rushing');
  [...m.querySelectorAll('thead th')].find(t => t.textContent.trim() === 'Grade').click();
});
await frame();
const asc = await gradeSort();
ok(desc[desc.length - 1] === 'No data' && asc[asc.length - 1] === 'No data',
  'an absent grade sorts last in both directions', `desc ${desc.join('|')} / asc ${asc.join('|')}`);

/* ══ 10. Interaction states ═══════════════════════════════════════════════ */
console.log('\n== 10. Hover, focus and pointer feedback ==');
const interaction = await page.evaluate(() => {
  const tr = document.querySelector('.gi-player-table tbody tr');
  const td = tr.querySelector('td.tl');
  const th = document.querySelector('.gi-player-table thead th');
  const nav = document.querySelector('[data-reports-secbar] .gi-players-roles button');
  const scope = document.querySelector('[data-reports-secbar] [data-players-scope]');
  const box = () => { const r = tr.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const before = box();
  tr.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  tr.focus();
  const after = box();
  return {
    role: tr.getAttribute('role'), tab: tr.tabIndex, title: tr.getAttribute('title'),
    cursor: getComputedStyle(tr).cursor,
    identTag: tr.querySelector('[data-player-open]')?.tagName || null,
    identTab: tr.querySelector('[data-player-open]')?.tabIndex ?? -1,
    identCursor: tr.querySelector('[data-player-open]') ? getComputedStyle(tr.querySelector('[data-player-open]')).cursor : null,
    statTag: tr.querySelector('[data-player-stat]')?.tagName || null,
    statTab: tr.querySelector('[data-player-stat]')?.tabIndex ?? -1,
    statCursor: tr.querySelector('[data-player-stat]') ? getComputedStyle(tr.querySelector('[data-player-stat]')).cursor : null,
    chevron: getComputedStyle(td, '::before').content,
    thCursor: getComputedStyle(th).cursor, thRole: th.getAttribute('role'), thTab: th.tabIndex,
    navCursor: getComputedStyle(nav).cursor, scopeCursor: getComputedStyle(scope).cursor,
    resized: JSON.stringify(before) !== JSON.stringify(after),
    box: before,
  };
});
/* Revision 2: the row itself is no longer one button. The identity cell opens
   the player and every clickable statistic is its own control, so the
   affordance is asserted where it now lives — each is a real <button>, focusable
   and pointer-affordant, which is stronger than a row-level role attribute. */
ok(interaction.identTag === 'BUTTON' && interaction.identTab === 0 && interaction.identCursor === 'pointer',
  'the identity cell is a pointer-affordant, keyboard-activatable control', JSON.stringify(interaction));
ok(interaction.statTag === 'BUTTON' && interaction.statTab === 0 && interaction.statCursor === 'pointer',
  'a clickable statistic is a pointer-affordant, keyboard-activatable control', JSON.stringify(interaction));
ok(!interaction.resized, 'hover and focus change no layout dimension', JSON.stringify(interaction.box));
ok(interaction.thRole === 'button' && interaction.thTab === 0 && interaction.thCursor === 'pointer',
  'a sortable header is pointer-affordant and keyboard-activatable', JSON.stringify(interaction));
ok(interaction.navCursor === 'pointer' && interaction.scopeCursor === 'pointer',
  'the role navigation and scope controls are pointer-affordant');

/* The sorted column is marked with the comp's underline and direction arrow. */
const sortMark = await page.evaluate(() => {
  const th = document.querySelector('.gi-player-table th.is-sorted');
  if (!th) return null;
  const cs = getComputedStyle(th);
  const marker = getComputedStyle(th, '::before');
  return { shadow: cs.boxShadow, glyph: marker.content, size: marker.fontSize,
    desc: th.classList.contains('is-desc') };
});
ok(sortMark && /↓|↑/.test(sortMark.glyph),
  'the sorted column carries the comp\'s up/down direction arrow', JSON.stringify(sortMark));
ok(sortMark && sortMark.shadow !== 'none',
  'the sorted column carries the comp\'s underline', sortMark?.shadow);
ok(sortMark && parseFloat(sortMark.size) >= 10.5,
  'the direction arrow is the comp\'s 11px, not an 8px triangle', sortMark?.size);

/* ══ 11. Scope switching moves everything together ════════════════════════ */
console.log('\n== 11. Scope switching updates counts, rows, metrics and references together ==');
const snapshot = async () => page.evaluate(() => ({
  sample: document.querySelector('.gi-players-sample')?.textContent.trim(),
  navCounts: [...document.querySelectorAll('[data-reports-secbar] .gi-players-roles button > b')].map(b => b.textContent.trim()),
  rows: document.querySelectorAll('.gi-player-table tbody tr').length,
  passYds: (() => {
    const m = [...document.querySelectorAll('.gi-player-module')]
      .find(x => x.querySelector('header strong').textContent.trim() === 'Passing');
    return m?.querySelector('tbody td[data-col="yds"]')?.textContent.trim();
  })(),
  refs: window.app.stats.compute(window.app.reportsScreen._playersCohort().scoped)
    .individuals.passers.flatMap(p => p.refs || []).length,
}));
await setScope('game');
const gameSnap = await snapshot();
await setScope('season');
const seasonSnap = await snapshot();
ok(gameSnap.sample !== seasonSnap.sample, 'the sample line changes with scope',
  `${gameSnap.sample} -> ${seasonSnap.sample}`);
ok(JSON.stringify(gameSnap.navCounts) !== JSON.stringify(seasonSnap.navCounts)
  || gameSnap.rows !== seasonSnap.rows, 'the role counts and rows change with scope',
  `${JSON.stringify(gameSnap.navCounts)} -> ${JSON.stringify(seasonSnap.navCounts)}`);
ok(Number(seasonSnap.passYds) > Number(gameSnap.passYds),
  'a metric recomputes over the wider cohort', `${gameSnap.passYds} -> ${seasonSnap.passYds}`);
ok(seasonSnap.refs > gameSnap.refs, 'the film references widen with the cohort',
  `${gameSnap.refs} -> ${seasonSnap.refs}`);
/* Default scope, asserted on a freshly opened route rather than after the
   switching above — the tab must open on the current game. */
await page.evaluate(() => { window.app.reportsScreen.playersScope = 'game'; });
await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
await sleep(300);
await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
await sleep(600);
const opened = await page.evaluate(() => ({
  scope: window.app.reportsScreen.playersScope,
  active: [...document.querySelectorAll('[data-reports-secbar] [data-players-scope]')]
    .find(b => b.classList.contains('active'))?.textContent.trim(),
}));
ok(opened.scope === 'game' && opened.active === 'Current game',
  'the tab opens on Current game', JSON.stringify(opened));

/* ══ 12. The three repairs on top of 7066844 ═════════════════════════════ */
console.log('\n== 12. Long names, section persistence, and the sparse denominator ==');
await load([GAME_A, GAME_B]);
await page.setViewport({ width: 1440, height: 900 });
await frame();
await setScope('season');
await setSection('All roles');

/* 12a. A representative long roster name renders in FULL at 1440, including in
   the nine-column Tackles table -- the tightest identity column on the board.
   Measured against the cell's own content box, not against the ellipsis: an
   ellipsised cell reports its truncated width, so `scrollWidth` alone would
   pass on the very defect this asserts. */
const LONG_NAME = '#22 Terrance Whitfield-Boateng';
const longName = await page.evaluate(name => [...document.querySelectorAll('.gi-player-module')]
  .map(m => {
    const cell = [...m.querySelectorAll('td.tl')].find(c => c.textContent.trim() === name);
    if (!cell) return null;
    const rg = document.createRange(); rg.selectNodeContents(cell);
    const cs = getComputedStyle(cell);
    return {
      role: m.querySelector('header strong').textContent.trim(),
      need: Math.ceil(rg.getBoundingClientRect().width),
      avail: Math.round(cell.getBoundingClientRect().width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      ellipsised: cell.scrollWidth > cell.clientWidth + 0.5,
    };
  }).filter(Boolean), LONG_NAME);
ok(longName.length >= 2,
  `the long representative name appears in more than one role table`,
  JSON.stringify(longName.map(r => r.role)));
ok(longName.every(r => r.need <= r.avail && !r.ellipsised),
  `"${LONG_NAME}" renders in full at 1440 in every role table that holds it`,
  JSON.stringify(longName));
const tackles = longName.find(r => r.role === 'Tackles');
ok(tackles && tackles.avail - tackles.need >= 0,
  'the nine-column Tackles identity column holds the name with room to spare',
  JSON.stringify(tackles));

/* Revision 2 retired the row marker with the row action. The identity control
   that replaced it must still cost the column no width, or it takes that room
   straight back off the name. */
const marker = await page.evaluate(() => {
  const td = document.querySelector('.gi-player-table tbody td.tl');
  const button = td.querySelector('[data-player-open]');
  const style = getComputedStyle(button);
  return { marker: getComputedStyle(td, '::before').content,
    padding: [style.paddingLeft, style.paddingRight].join(' '), border: style.borderLeftWidth,
    fits: Math.ceil(button.getBoundingClientRect().width) <= Math.ceil(td.getBoundingClientRect().width) };
});
ok(marker.padding === '0px 0px' && marker.border === '0px' && marker.fits,
  'the identity control is inline and unpadded, so it costs the identity column no width',
  JSON.stringify(marker));

/* 12b. The selected role section survives a scope change. It was local view
   state, and a scope change re-renders the tab, so the board snapped back to
   All roles under the coach's hands. */
for (const [title, other] of [['Offense', 'season'], ['Defense', 'game'], ['Special Teams', 'season']]) {
  await setSection(title);
  const before = await page.evaluate(() =>
    document.querySelector('[data-reports-secbar] .gi-players-roles button.active')?.textContent.trim());
  await setScope(other);
  const after = await page.evaluate(() => ({
    active: document.querySelector('[data-reports-secbar] .gi-players-roles button.active')?.textContent.trim(),
    controller: window.app.reportsScreen.playersSection,
  }));
  ok(after.active?.startsWith(title),
    `${title} stays selected across a scope change`,
    `${before} -> ${after.active} (controller ${after.controller})`);
}

/* Scope still resets the table sort, because the cohort changed under it. */
await setSection('All roles');
await setScope('game');
await page.evaluate(() => {
  const m = document.querySelector('.gi-player-module');
  [...m.querySelectorAll('thead th')].find(t => t.textContent.trim() === 'Long')?.click();
});
await frame();
const sortedBefore = await page.evaluate(() =>
  document.querySelector('.gi-player-module th.is-sorted')?.textContent.trim());
await setScope('season');
const sortedAfter = await page.evaluate(() =>
  document.querySelector('.gi-player-module th.is-sorted')?.textContent.trim());
ok(sortedBefore === 'Long' && sortedAfter === 'Yds',
  'a scope change resets the table sort to the engine order, it is not carried across cohorts',
  `${sortedBefore} -> ${sortedAfter}`);

/* 12c. The role count keeps its denominator whenever a role is unattributed. */
await setScope('season');
await setSection('All roles');
const fullSample = await page.evaluate(() =>
  document.querySelector('.gi-players-sample')?.textContent.trim());
ok(fullSample === '12 players · 6 roles · 210 charted plays',
  'a fully populated board reads the plain role count, with nothing absent to name',
  fullSample);

await load([[
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '11', players: { ballCarrier: '22' } },
  { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'No Gain', yardage: '1', players: { tackler: '51' } },
]]);
const sparseSample = await page.evaluate(() =>
  document.querySelector('.gi-players-sample')?.textContent.trim());
ok(sparseSample === '2 players · 2/6 roles · 2 charted plays',
  'a sparse board keeps the denominator, so 2 roles cannot read as the whole set',
  sparseSample);

await load([[
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '11', players: { ballCarrier: '22' } },
  { unit: 'offense', playType: 'Quick Pass', runPass: 'Pass', result: 'Gain', yardage: '9', players: { passer: '12', receiver: '84' } },
  { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'No Gain', yardage: '1', players: { tackler: '51' } },
  { unit: 'special', players: { returner: '7' }, __st: STE('kickoffReturn', { status: 'returned', yards: 20 }) },
]]);
const fiveSample = await page.evaluate(() =>
  document.querySelector('.gi-players-sample')?.textContent.trim());
ok(fiveSample === '5 players · 5/6 roles · 4 charted plays',
  'five populated roles read 5/6, exactly the approved sparse format', fiveSample);

/* ══ Special Teams field authority ════════════════════════════════════════
   The dedicated ST fields are authoritative, and the Players rollup used to
   read the generic `tags.yardage` instead: punt distance came from `yardage`
   (never charted on this season, so a blank read as 0 and produced averages
   of 2.8 and 0.0) and return yardage came from `yardage` rather than
   `returnYards`. The team report reads the dedicated fields, so the two
   surfaces disagreed about the same plays. Both read the same field now, and
   an uncharted measurement is an absence, not a zero. */
console.log('\n== Special Teams: dedicated fields are authoritative ==');
await load([[
  // A punt and two returns charted the way this coach's season charts them:
  // a specialist and an outcome, and NO dedicated distance or return yardage.
  { unit: 'special', result: 'No Gain', yardage: '11', players: { kicker: '27' }, __st: STE('punt') },
  { unit: 'special', result: 'Gain', yardage: '18', players: { returner: '42' }, __st: STE('puntReturn', { status: 'returned' }) },
  // One return that DOES carry its own return yards.
  { unit: 'special', result: 'Gain', yardage: '99', players: { returner: '42' }, __st: STE('puntReturn', { status: 'returned', yards: 5 }) },
]]);
const stRows = await page.evaluate(() => {
  const table = [...document.querySelectorAll('.gi-player-module')].map(m => ({
    title: m.querySelector('header strong')?.textContent.trim(),
    rows: [...m.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
  }));
  return Object.fromEntries(table.map(t => [t.title, t.rows]));
});
const kicking = (stRows['Kicking / Punting'] || [])[0] || [];
ok(kicking.includes('No data'),
  'punt average is No data when the kick distance is not charted, never derived from generic yardage',
  JSON.stringify(kicking));
ok(!kicking.includes('11.0') && !kicking.includes('2.8'),
  'no punt average is fabricated from tags.yardage', JSON.stringify(kicking));
const returns = (stRows['Return Game'] || [])[0] || [];
ok(returns.includes('5') && !returns.includes('23') && !returns.includes('117'),
  'return yards come from the return\'s own yards only — the unmeasured return adds none',
  JSON.stringify(returns));
/* The two surfaces must agree about the same plays. */
const crossSurface = await page.evaluate(() => {
  const app = window.app;
  const { scoped } = app.reportsScreen._playersCohort();
  const ind = app.stats.compute(scoped).individuals;
  const st = app.stats._specialTeamsStats(scoped);
  const playerReturnYards = (ind.returners || []).reduce((s, r) => s + (r.measured ? r.yards : 0), 0);
  const teamReturnYards = (st.returns?.punt?.yards || 0) + (st.returns?.kick?.yards || 0);
  const playerReturns = (ind.returners || []).reduce((s, r) => s + (r.measured || 0), 0);
  const playerReturnEvents = (ind.returners || []).reduce((s, r) => s + (r.returns || 0), 0);
  const teamReturns = (st.returns?.punt?.attempts || 0) + (st.returns?.kick?.attempts || 0);
  return { playerReturnYards, teamReturnYards, playerReturns, playerReturnEvents, teamReturns,
    playerPuntsMeasured: (ind.kickers || []).reduce((s, k) => s + (k.puntsMeasured || 0), 0) };
});
/* THE COUNT IS PART OF THE COHORT. Players agreed with the team report on
 * yardage while still printing every return EVENT in the Ret column, so the
 * board read 11 returns for 5 yards at a 5.0 average — a count from one cohort
 * beside a total and an average from another. */
ok(crossSurface.playerReturns === crossSurface.teamReturns,
  'Players and the team Special Teams report agree on the MEASURED return count',
  JSON.stringify(crossSurface));
ok(crossSurface.playerReturnEvents > crossSurface.playerReturns,
  'the canonical season really does chart unmeasured return events, so this cohort test can fail',
  JSON.stringify(crossSurface));
const retColumn = (stRows['Return Game'] || []).map(row => Number(row[1]) || 0);
ok(retColumn.reduce((s, n) => s + n, 0) === crossSurface.teamReturns,
  'the rendered Ret column prints the measured return count, not the event count',
  JSON.stringify(retColumn));
ok(crossSurface.playerReturnYards === crossSurface.teamReturnYards,
  'Players and the team Special Teams report agree on return yardage, because they read one field',
  JSON.stringify(crossSurface));
ok(crossSurface.playerPuntsMeasured === 0,
  'a punt with no charted kick distance contributes no measured distance', JSON.stringify(crossSurface));

/* ══ Revision 2 ═══════════════════════════════════════════════════════════
   The leaderboard is the entry point; the analysis lives one click deeper. Every
   assertion below drives the real board and reads the rendered result. */
console.log('\n== Revision 2: detail, exact cohorts, selected games, columns, export ==');
/* TWO games, every role, one player (#22) credited in three of them — the case
   the detail view exists for: separate labelled sections, no merged score, and
   game rows that must sum back to the totals above them. */
const R2_G1 = [
  /* This run carries the coverage we FACED, which our offensive charting does
     record. It makes the role/dimension guard load-bearing: without it a rushing
     cohort would produce a Coverage breakdown describing the opponent's call,
     not the runner's production. */
  { unit: 'offense', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', distance: '10',
    hash: 'Left', playDir: 'Left', coverage: 'Cover 3', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } },
  { unit: 'offense', runPass: 'Run', playType: 'Run Inside', result: 'Touchdown', yardage: '12', down: '2', distance: '4',
    players: { ballCarrier: '22' } },
  { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '14', down: '3', distance: '7',
    players: { passer: '7', receiver: '22' } },
  { unit: 'offense', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '2', distance: '9',
    players: { passer: '7' } },
  { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', result: 'Sack', yardage: '-7', down: '3', distance: '8',
    players: { passer: '7' } },
  { unit: 'defense', runPass: 'Run', playType: 'Run Outside', result: 'Loss', yardage: '-3', down: '2', distance: '7',
    defFront: '4-2-5', coverage: 'Cover 1', players: { tackler: '55' } },
  { unit: 'defense', runPass: 'Pass', playType: 'Short Pass', result: 'Sack', yardage: '-6', down: '3', distance: '9',
    defFront: 'Bear', coverage: 'Cover 0', players: { tackler: '55' } },
  { unit: 'defense', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '3', distance: '12',
    defFront: '4-2-5', coverage: 'Cover 3', players: { takeaway: '55' } },
  { unit: 'special', result: 'Gain', players: { returner: '22' }, __st: STE('kickoffReturn', { status: 'returned', yards: 24 }) },
];
const R2_G2 = [
  { unit: 'offense', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10',
    hash: 'Right', playDir: 'Right', players: { ballCarrier: '22' } },
  { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '9', down: '1', distance: '10',
    players: { passer: '7', receiver: '22' } },
  { unit: 'defense', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '2', down: '1', distance: '10',
    defFront: 'Bear', coverage: 'Cover 2', players: { tackler: '55' } },
];
await load([R2_G1, R2_G2], { 22: 'Reggie Barnes', 7: 'Tyler Voss', 55: 'Devin Cross' });
await setScope('season');
await setSection('All roles');
await page.evaluate(() => window.app.reportsScreen.closePlayerDetail());
await sleep(300);

/* EVERY CLICKABLE STATISTIC OPENS ITS OWN EVENTS, and the engine's buckets are
   what it opens. Asserted against the credit index so the board and the owner
   cannot drift: a touchdown cell opens touchdowns, an interception cell opens
   interceptions, never the role's whole cohort. */
const exact = await page.evaluate(() => {
  const app = window.app;
  const screen = app.reportsScreen;
  const scoped = screen._playersScopedPlays || [];
  const board = app.stats.playersBoard(scoped, {});
  const seen = [];
  const original = screen.watchRefs.bind(screen);
  screen.watchRefs = (refs, label) => seen.push({ refs: [...refs].sort(), label });
  const out = [];
  document.querySelectorAll('.gi-player-table [data-player-stat]').forEach(button => {
    const [roleKey, column, num] = button.dataset.playerStat.split(':');
    seen.length = 0;
    button.click();
    const opened = seen[0]?.refs || [];
    const role = board.players.find(p => p.num === num)?.roles.find(r => r.key === roleKey);
    /* THE EXPECTATION IS DERIVED FROM THE PLAYS, not from the view model's own
       bucket map — a test that reuses the mapping it is checking validates the
       implementation against itself. Each predicate below is the football
       meaning of the column, written out here independently. */
    const yards = play => parseInt(play.tags.yardage, 10) || 0;
    const has = (play, result) => String(play.tags.result || '').split('+').map(s => s.trim()).includes(result);
    const cohort = role?.plays || [];
    const predicate = {
      rushing: { att: () => true, yds: () => true, avg: () => true, tds: p => has(p, 'Touchdown'), fum: p => has(p, 'Fumble') },
      passing: { ca: p => has(p, 'Gain') || has(p, 'No Gain') || has(p, 'Touchdown') || has(p, 'Incomplete') || has(p, 'Interception'),
        pct: p => has(p, 'Gain') || has(p, 'No Gain') || has(p, 'Touchdown') || has(p, 'Incomplete') || has(p, 'Interception'),
        yds: p => has(p, 'Gain') || has(p, 'No Gain') || has(p, 'Touchdown'),
        tds: p => has(p, 'Touchdown'), ints: p => has(p, 'Interception'), sacks: p => has(p, 'Sack') },
      receiving: { rec: () => true, yds: () => true, tds: p => has(p, 'Touchdown') },
      tackles: { tkl: p => String(p.tags.players?.tackler || '').includes(num),
        solo: p => String(p.tags.players?.tackler || '').match(/\d+/g)?.length === 1 && String(p.tags.players?.tackler || '').includes(num),
        ast: p => (String(p.tags.players?.tackler || '').match(/\d+/g)?.length || 0) > 1 && String(p.tags.players?.tackler || '').includes(num),
        sacks: p => has(p, 'Sack'), tfl: p => !has(p, 'Sack') && yards(p) < 0,
        ints: p => has(p, 'Interception'), fr: p => has(p, 'Fumble') },
      returns: { ret: p => Number.isFinite(p.specialTeams?.return?.yards),
        yds: p => Number.isFinite(p.specialTeams?.return?.yards),
        avg: p => Number.isFinite(p.specialTeams?.return?.yards), tds: p => p.specialTeams?.outcome?.score === 'touchdown' },
      kicking: { fg: () => true, punts: () => true, puntAvg: () => true },
    }[roleKey]?.[column];
    let expectedPlays = predicate ? cohort.filter(predicate) : null;
    if (column === 'long') {
      // The long is the play (or plays tying it) that produced the value.
      const measure = roleKey === 'returns'
        ? play => (Number.isFinite(play.specialTeams?.return?.yards) ? play.specialTeams.return.yards : NaN)
        : play => yards(play);
      const measured = cohort.filter(play => Number.isFinite(measure(play)));
      const best = measured.length ? Math.max(...measured.map(measure)) : null;
      expectedPlays = best == null ? [] : measured.filter(play => measure(play) === best);
    }
    const expected = expectedPlays
      ? [...new Set(expectedPlays.map(play => `${play.__gid}::${play.id}`))].sort()
      : null;
    out.push({ key: button.dataset.playerStat,
      ok: expected == null ? null : JSON.stringify(opened) === JSON.stringify(expected),
      opened: opened.length, expected: expected == null ? null : expected.length,
      label: seen[0]?.label || '' });
  });
  screen.watchRefs = original;
  return out;
});
ok(exact.length >= 12 && exact.every(item => item.ok !== false)
  && exact.filter(item => item.ok === true).length >= 12,
  'every clickable statistic opens exactly its own credited events, never the role cohort',
  JSON.stringify(exact.filter(item => item.ok === false).slice(0, 4)));
const longs = exact.filter(item => /:long:/.test(item.key));
ok(longs.length > 0 && longs.every(item => item.ok === true && item.opened >= 1),
  'Long opens only the play that produced it, not every measured play in the bucket',
  JSON.stringify(longs));
ok(exact.some(item => /:tds:/.test(item.key)) && exact.some(item => /:ints:/.test(item.key))
  && exact.some(item => /:sacks:/.test(item.key)) && exact.some(item => /:tfl:/.test(item.key)),
  'touchdowns, interceptions, sacks and tackles for loss each carry their own distinct cohort',
  JSON.stringify(exact.map(item => item.key)));

/* A `No data` cell and a measured zero with no clips stay visible and stay
   unclickable: there is no playlist to open, so there is no button. */
const clipless = await page.evaluate(() => {
  const cells = [...document.querySelectorAll('.gi-player-table tbody td')];
  const noData = cells.filter(td => td.textContent.trim() === 'No data');
  const zeros = cells.filter(td => td.textContent.trim() === '0');
  return {
    noData: noData.length,
    noDataClickable: noData.filter(td => td.querySelector('button')).length,
    zeros: zeros.length,
    zeroClickable: zeros.filter(td => td.querySelector('button')).length,
  };
});
ok(clipless.noData > 0 && clipless.noDataClickable === 0,
  'a No data cell is visible and is never a film action', JSON.stringify(clipless));
ok(clipless.zeros > 0 && clipless.zeroClickable === 0,
  'a measured zero stays visible and is not clickable when it has no clips', JSON.stringify(clipless));

/* IDENTITY OPENS THE PLAYER, not a playlist. */
const identity = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  const watched = [];
  const original = screen.watchRefs.bind(screen);
  screen.watchRefs = (refs, label) => watched.push(label);
  document.querySelector('.gi-player-table [data-player-open]')?.click();
  screen.watchRefs = original;
  await new Promise(r => setTimeout(r, 300));
  const detail = document.querySelector('[data-player-detail]');
  return { watched, opened: detail?.dataset.playerDetail || null,
    heading: detail?.querySelector('h3')?.textContent?.replace(/\s+/g, ' ').trim() || '',
    scope: detail?.querySelector('.gi-pd-scope')?.textContent?.trim() || '',
    back: !!detail?.querySelector('[data-pd-back]'),
    leaderboard: !!document.querySelector('.gi-player-table') };
});
ok(identity.watched.length === 0 && identity.opened,
  'the identity cell opens player detail rather than a generic role playlist', JSON.stringify(identity));
ok(/^#\d+/.test(identity.heading) && identity.scope && identity.back,
  'detail names the player literally, states the active scope and offers Back to all players',
  JSON.stringify(identity));

/* MULTIPLE ROLES, ONE PLAYER, NO MERGED SCORE — and the game rows reconcile
   EXACTLY to the totals above them. */
const detailModel = await page.evaluate(num => {
  const app = window.app;
  const scoped = app.reportsScreen._playersScopedPlays || [];
  const detail = app.stats.playerDetail(scoped, num, {});
  const totals = {}, summed = {};
  detail.roles.forEach(role => {
    Object.entries(role.stats).forEach(([key, fact]) => {
      if (key.startsWith('__')) return;
      totals[`${role.key}.${key}`] = { n: fact.n, total: fact.total };
      summed[`${role.key}.${key}`] = detail.games.reduce((sum, game) => {
        const inGame = game.roles[role.key];
        return { n: sum.n + (inGame?.stats[key]?.n || 0), total: sum.total + (inGame?.stats[key]?.total || 0) };
      }, { n: 0, total: 0 });
    });
  });
  return { roles: detail.roles.map(role => role.key), games: detail.games.map(game => game.opponent),
    totals, summed, sections: document.querySelectorAll('.gi-pd-role').length };
}, identity.opened);
ok(detailModel.roles.length >= 1 && detailModel.sections === detailModel.roles.length,
  'a player credited in several roles appears once, with one labelled section per role',
  JSON.stringify(detailModel.roles));
ok(JSON.stringify(detailModel.totals) === JSON.stringify(detailModel.summed),
  'every game row sums back to the role totals above it, with nothing double counted',
  JSON.stringify({ totals: detailModel.totals, summed: detailModel.summed }));

/* SITUATIONAL rows reconcile to the same role cohort, and each row's film is
   exactly its own contributing plays. */
const situ = await page.evaluate(num => {
  const app = window.app;
  const scoped = app.reportsScreen._playersScopedPlays || [];
  const detail = app.stats.playerDetail(scoped, num, {});
  const role = detail.roles[0];
  const rows = app.stats.playerSituational(scoped, num, role.key, 'quarter');
  const schema = app.stats.constructor.PLAYER_ROLES.find(item => item.key === role.key);
  const roleRefs = new Set(role.refs);
  /* Quarter is exclusive, so the split partitions the role cohort: the plays and
     EVERY measure must sum back to the role's own totals. */
  const measureTotals = {}, measureExpected = {};
  schema.measures.forEach(measure => {
    measureTotals[measure.key] = rows.reduce((sum, row) =>
      sum + (row.measures.find(item => item.key === measure.key)?.value || 0), 0);
    const fact = role.stats[measure.key];
    measureExpected[measure.key] = fact ? (measure.read === 'total' ? fact.total : fact.n) : 0;
  });
  return {
    role: role.key,
    volume: rows.reduce((sum, row) => sum + row.n, 0),
    expected: role.plays.length,
    measureTotals, measureExpected,
    within: rows.every(row => row.refs.every(ref => roleRefs.has(ref))),
    rows: rows.length,
  };
}, identity.opened);
ok(situ.rows > 0 && situ.volume === situ.expected,
  'situational rows reconcile to the selected player-role cohort', JSON.stringify(situ));
ok(JSON.stringify(situ.measureTotals) === JSON.stringify(situ.measureExpected),
  'every situational measure sums back to the role total above it', JSON.stringify(situ));
ok(situ.within,
  'a situation row opens only plays from that player-role cohort', JSON.stringify(situ));

/* ONLY DIMENSIONS THE ROLE CAN ANSWER. A rusher is never offered coverage or a
   Special Teams outcome; a tackler is never offered our own formation. */
const relevance = await page.evaluate(num => {
  const app = window.app;
  const scoped = app.reportsScreen._playersScopedPlays || [];
  const detail = app.stats.playerDetail(scoped, num, {});
  const dims = app.stats.constructor.PLAYER_DIMENSIONS;
  const offered = role => dims.filter(item => item.roles.includes(role)).map(item => item.key);
  const rendered = [...document.querySelectorAll('.gi-pd-situ select')]
    .at(-1)?.querySelectorAll('option');
  return {
    roles: detail.roles.map(role => role.key),
    rushing: offered('rushing'), tackles: offered('tackles'), returns: offered('returns'),
    renderedCount: rendered ? rendered.length : 0,
    empty: dims.filter(item => app.stats.playerSituational(scoped, num, 'rushing', item.key).length
      && !item.roles.includes('rushing')).map(item => item.key),
  };
}, identity.opened);
ok(!relevance.rushing.includes('coverage') && !relevance.rushing.includes('defFront')
  && !relevance.rushing.includes('stUnit'),
  'a rushing cohort is never offered a defensive or Special Teams dimension', JSON.stringify(relevance.rushing));
ok(!relevance.tackles.includes('formationFamily') && !relevance.tackles.includes('personnel')
  && relevance.tackles.includes('coverage'),
  'a tackles cohort is offered the defense it played, not our own offensive structure',
  JSON.stringify(relevance.tackles));
ok(relevance.returns.includes('stUnit') && !relevance.returns.includes('downDistance'),
  'a return cohort is offered its Special Teams dimensions and not down and distance',
  JSON.stringify(relevance.returns));
ok(relevance.empty.length === 0,
  'no dimension outside a role\'s own list can produce rows for it', JSON.stringify(relevance.empty));

/* SELECTED GAMES recomputes everything together. */
const selected = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  screen.closePlayerDetail();
  screen.setPlayersScope('selected');
  await new Promise(r => setTimeout(r, 300));
  const games = screen._playersSelectableGames();
  const all = screen._playersCohort().scoped.length;
  screen.togglePlayersGame(games[0].id);
  await new Promise(r => setTimeout(r, 400));
  const one = screen._playersCohort().scoped;
  const board = window.app.stats.playersBoard(one, {});
  return {
    games: games.map(game => game.label), all, one: one.length,
    everyRefInGame: board.players.every(player => player.roles.every(role =>
      role.refs.every(ref => ref.startsWith(`${games[0].id}::`)))),
    sample: (document.querySelector('.gi-players-sample')?.textContent || '').replace(/\s+/g, ' ').trim(),
    label: screen._playersSelectedLabel(),
    rows: document.querySelectorAll('.gi-player-table tbody tr').length,
  };
});
ok(selected.games.length >= 2 && selected.games.every(label => /\S/.test(label)),
  'the game picker names the program season\'s games', JSON.stringify(selected.games));
ok(selected.one > 0 && selected.one < selected.all,
  'selecting one game narrows the cohort every table is computed from', JSON.stringify(selected));
ok(selected.everyRefInGame,
  'every film reference in the selected-games cohort belongs to a selected game', JSON.stringify(selected));
ok(selected.sample.includes(selected.label),
  'the sample line states the resulting cohort literally', JSON.stringify(selected));

/* COLUMN VISIBILITY is presentation only. */
const columns = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  screen.setPlayersScope('season');
  await new Promise(r => setTimeout(r, 400));
  const table = () => document.querySelector('.gi-player-module .gi-player-table');
  const before = { cols: table().querySelectorAll('thead th').length,
    firstRow: [...table().querySelectorAll('tbody tr:first-child td')].map(td => td.textContent.trim()) };
  const engineBefore = JSON.stringify(window.app.stats.playersBoard(screen._playersScopedPlays || [], {})
    .players.map(p => p.roles.map(r => [r.key, r.stats.att?.n ?? null])));
  document.querySelector('.gi-player-module .gi-player-colbtn').click();
  await new Promise(r => setTimeout(r, 150));
  const items = [...document.querySelectorAll('.gi-player-colpanel input')];
  const identityOffered = [...document.querySelectorAll('.gi-player-colpanel .gi-player-colitem')]
    .some(item => /player/i.test(item.textContent));
  items[0]?.click();
  await new Promise(r => setTimeout(r, 200));
  const after = { cols: table().querySelectorAll('thead th').length,
    ident: !!table().querySelector('tbody [data-player-open]') };
  const engineAfter = JSON.stringify(window.app.stats.playersBoard(screen._playersScopedPlays || [], {})
    .players.map(p => p.roles.map(r => [r.key, r.stats.att?.n ?? null])));
  return { before, after, identityOffered, same: engineBefore === engineAfter };
});
ok(columns.after.cols === columns.before.cols - 1 && columns.after.ident,
  'hiding an optional column removes it and never removes the player identity', JSON.stringify(columns));
ok(!columns.identityOffered, 'the column menu does not offer to hide the player identity');
ok(columns.same, 'column visibility changes no calculation', JSON.stringify(columns.same));

/* A ROLE WHOSE CREDITS ARE HETEROGENEOUS STILL APPEARS. A kicker's group may
   hold punts and no field goal; a defender's may hold a takeaway and no tackle.
   Filtering on one "volume" stat dropped both from the split and printed `0 FG`
   / `0 tkl` in the game row beside real production. */
const heterogeneous = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const play = (id, tags, extra = {}) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 }, notes: '', annotations: [],
    tags: { quarter: 'Q1', custom: [], players: {}, grades: {}, ...tags }, ...extra });
  store.data.games = [{
    id: 'g-het', name: 'Week 1', nextId: 9,
    gameInfo: { opponent: 'Hetero', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays: [
      // A punt with no field goal anywhere: fgAtt is 0 for this kicker.
      play(1, { unit: 'special', players: { kicker: '19' } },
        { specialTeams: { version: 1, unit: 'punt', outcome: { status: 'downed' },
          kick: { distance: 40 }, return: {}, players: { punter: '19' } } }),
      // A takeaway credited through the dedicated role: no tackle for #21.
      play(2, { unit: 'defense', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception',
        yardage: '0', down: '3', distance: '10', players: { takeaway: '21' } }),
    ],
    annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
  }];
  store.data.activeGameId = 'g-het';
  await app.storage._loadActiveGame();
  app.reportsScreen.setPlayersScope('season');
  await new Promise(r => setTimeout(r, 500));
  const scoped = app.reportsScreen._playersScopedPlays || [];
  const kicker = app.stats.playerSituational(scoped, '19', 'kicking', 'quarter');
  const defender = app.stats.playerSituational(scoped, '21', 'tackles', 'quarter');
  const kickerDetail = app.stats.playerDetail(scoped, '19', {});
  const defenderDetail = app.stats.playerDetail(scoped, '21', {});
  app.reportsScreen.openPlayerDetail('19');
  await new Promise(r => setTimeout(r, 300));
  const kickerCell = [...document.querySelectorAll('[data-pd-game]')].map(b => b.textContent.trim());
  app.reportsScreen.openPlayerDetail('21');
  await new Promise(r => setTimeout(r, 300));
  const defenderCell = [...document.querySelectorAll('[data-pd-game]')].map(b => b.textContent.trim());
  return {
    kickerRows: kicker.map(row => ({ n: row.n, measures: row.measures.map(m => [m.label, m.value]) })),
    defenderRows: defender.map(row => ({ n: row.n, measures: row.measures.map(m => [m.label, m.value]) })),
    kickerGames: kickerDetail.games.length, defenderGames: defenderDetail.games.length,
    kickerCell, defenderCell,
  };
});
ok(heterogeneous.kickerRows.length === 1 && heterogeneous.kickerRows[0].n === 1,
  'a punt-only kicking group survives the split instead of being filtered out by field-goal attempts',
  JSON.stringify(heterogeneous.kickerRows));
ok(JSON.stringify(heterogeneous.kickerRows[0]?.measures) === JSON.stringify([['FG att', 0], ['Punts', 1], ['Punt yds', 40]]),
  'the kicking split states punts and punt yards beside a measured zero field-goal attempt',
  JSON.stringify(heterogeneous.kickerRows));
ok(heterogeneous.defenderRows.length === 1
  && JSON.stringify(heterogeneous.defenderRows[0].measures) === JSON.stringify([['Tkl', 0], ['INT', 1], ['FR', 0]]),
  'a takeaway-only defender survives the split and states the interception, not 0 tackles alone',
  JSON.stringify(heterogeneous.defenderRows));
ok(heterogeneous.kickerCell.some(text => /1 punts, 40 punt yds/.test(text)),
  'the game row states the punt and its yards instead of an ambiguous 0 FG',
  JSON.stringify(heterogeneous.kickerCell));
ok(heterogeneous.defenderCell.some(text => /1 int/i.test(text)),
  'the game row states the takeaway instead of 0 tkl', JSON.stringify(heterogeneous.defenderCell));

/* The situational table is one SORTABLE results table. */
const situSort = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  screen.openPlayerDetail('21');
  await new Promise(r => setTimeout(r, 300));
  const table = document.querySelector('.gi-pd-situ-table');
  const heads = [...(table?.querySelectorAll('th') || [])];
  const head = heads.find(th => th.textContent.trim() === 'Plays') || heads[1];
  head?.click();
  await new Promise(r => setTimeout(r, 120));
  return { table: !!table, heads: heads.map(th => th.textContent.trim()),
    role: heads.every(th => th.getAttribute('role') === 'button'),
    tab: heads.every(th => th.tabIndex === 0),
    sorted: !!table?.querySelector('th.is-sorted') };
});
ok(situSort.table && situSort.role && situSort.tab,
  'the situational results table is sortable by mouse and keyboard on every column',
  JSON.stringify(situSort));
ok(situSort.sorted, 'the sorted situational column is marked', JSON.stringify(situSort));

/* SORT ORDER IS ASSERTED, NOT THE AFFORDANCE. A clickable header and a sorted
   marker say nothing about where a measured zero, a negative value or an
   unmeasured one lands. One passer, four quarters: a positive completion, a
   measured zero, a completion behind the line, and a sack — which is not an
   attempt, so its Att and Yds are UNMEASURED, and which carries no grade. */
const sortOrder = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const play = (id, quarter, result, yardage, grade) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 },
    notes: '', annotations: [],
    tags: { unit: 'offense', quarter, runPass: 'Pass', playType: 'Quick Pass',
      result, yardage: String(yardage),
      down: '1', distance: '10', custom: [], players: { passer: '12' },
      grades: grade == null ? {} : { passer: grade } } });
  store.data.games = [{
    id: 'g-sort', name: 'Week 1', nextId: 9,
    gameInfo: { opponent: 'Sorters', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays: [play(1, 'Q1', 'Gain', 12, 2), play(2, 'Q2', 'No Gain', 0, -1),
      play(3, 'Q3', 'Gain', -4, 1), play(4, 'Q4', 'Sack', -6, null)],
    annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
  }];
  store.data.activeGameId = 'g-sort';
  await app.storage._loadActiveGame();
  app.reportsScreen.setPlayersScope('season');
  await new Promise(r => setTimeout(r, 400));
  app.reportsScreen.playersSituRole = 'passing';
  app.reportsScreen.playersSituDimension = 'quarter';
  app.reportsScreen.openPlayerDetail('12');
  await new Promise(r => setTimeout(r, 400));
  const table = document.querySelector('.gi-pd-situ-table');
  const head = label => [...table.querySelectorAll('th')].find(th => th.textContent.trim() === label);
  const read = () => [...table.querySelectorAll('tbody tr')].map(tr => {
    const cells = [...tr.cells].map(td => td.textContent.trim());
    return { value: cells[0], yds: cells[3], grade: cells[4] };
  });
  const out = { headers: [...table.querySelectorAll('th')].map(th => th.textContent.trim()) };
  head('Yds').click(); await new Promise(r => setTimeout(r, 120));
  out.ydsDesc = read();
  head('Yds').click(); await new Promise(r => setTimeout(r, 120));
  out.ydsAsc = read();
  head('Grade').click(); await new Promise(r => setTimeout(r, 120));
  out.gradeDesc = read();
  head('Grade').click(); await new Promise(r => setTimeout(r, 120));
  out.gradeAsc = read();
  return out;
});
ok(JSON.stringify(sortOrder.ydsDesc?.map(row => row.yds)) === JSON.stringify(['12', '0', '-4', 'No data']),
  'a production column sorts descending through positive, measured zero and negative values, with the unmeasured row last',
  JSON.stringify(sortOrder.ydsDesc));
ok(JSON.stringify(sortOrder.ydsAsc?.map(row => row.yds)) === JSON.stringify(['-4', '0', '12', 'No data']),
  'ascending reverses the measured values and still leaves the unmeasured row last, never read as zero',
  JSON.stringify(sortOrder.ydsAsc));
ok(JSON.stringify(sortOrder.gradeDesc?.map(row => row.grade)) === JSON.stringify(['+2', '+1', '-1', 'No data']),
  'Grade sorts on its number, with the ungraded row last rather than read as zero',
  JSON.stringify(sortOrder.gradeDesc));
ok(JSON.stringify(sortOrder.gradeAsc?.map(row => row.grade)) === JSON.stringify(['-1', '+1', '+2', 'No data']),
  'ascending Grade keeps the ungraded row last, never above the negative grade',
  JSON.stringify(sortOrder.gradeAsc));

/* LONG IS THE LONGEST RESULT, AND ITS FILM IS THAT PLAY. */
const longValues = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const run = (id, num, yardage) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 },
    notes: '', annotations: [],
    tags: { unit: 'offense', quarter: 'Q1', runPass: 'Run', playType: 'Run Inside',
      result: yardage < 0 ? 'Loss' : 'Gain', yardage: String(yardage), down: '1', distance: '10',
      custom: [], players: { ballCarrier: num }, grades: {} } });
  store.data.games = [{
    id: 'g-long', name: 'Week 1', nextId: 20,
    gameInfo: { opponent: 'Longs', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays: [
      run(1, '41', -3),                                   // a single negative carry
      run(2, '42', -3), run(3, '42', -7),                 // all negative, one longest
      run(4, '43', -2), run(5, '43', -2), run(6, '43', -9), // tied negative longest
      run(7, '44', 11), run(8, '44', 4),                  // ordinary positive longest
    ],
    annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
  }];
  store.data.activeGameId = 'g-long';
  await app.storage._loadActiveGame();
  app.reportsScreen.closePlayerDetail();
  app.reportsScreen.setPlayersScope('season');
  await new Promise(r => setTimeout(r, 400));
  const scoped = app.reportsScreen._playersScopedPlays || [];
  const board = app.stats.playersBoard(scoped, {});
  const rushers = app.stats.compute(scoped).individuals.rushers;
  const cell = num => {
    const row = [...document.querySelectorAll('.gi-player-table tbody tr')]
      .find(tr => tr.querySelector(`[data-player-open="${num}"]`));
    return { long: row?.querySelector('[data-player-stat*=":long:"]')?.textContent.trim()
      ?? row?.cells[4]?.textContent.trim() };
  };
  const refsFor = num => board.players.find(p => p.num === num)?.roles
    .find(r => r.key === 'rushing').stats.yds.longRefs;
  return {
    displayed: Object.fromEntries(['41', '42', '43', '44']
      .map(num => [num, rushers.find(r => String(r.num) === num)?.long])),
    refs: Object.fromEntries(['41', '42', '43', '44'].map(num => [num, refsFor(num)])),
    rendered: Object.fromEntries(['41', '42', '43', '44'].map(num => [num, cell(num).long])),
  };
});
ok(longValues.displayed['41'] === -3 && JSON.stringify(longValues.refs['41']) === JSON.stringify(['g-long::1']),
  'a single negative carry reports its true long and links that play', JSON.stringify(longValues));
ok(longValues.displayed['42'] === -3 && JSON.stringify(longValues.refs['42']) === JSON.stringify(['g-long::2']),
  'with every carry negative the longest is the least negative, and only that play is linked',
  JSON.stringify(longValues));
ok(longValues.displayed['43'] === -2
  && JSON.stringify(longValues.refs['43']) === JSON.stringify(['g-long::4', 'g-long::5']),
  'tied negative longest carries stay linked together', JSON.stringify(longValues));
ok(longValues.displayed['44'] === 11 && JSON.stringify(longValues.refs['44']) === JSON.stringify(['g-long::7']),
  'an ordinary positive longest is unchanged', JSON.stringify(longValues));
ok(longValues.rendered['41'] === '-3' && longValues.rendered['43'] === '-2',
  'the board renders the negative long the film opens, not a clamped zero', JSON.stringify(longValues.rendered));

/* THE EXPORT SUMMARISES A GAME THE WAY THE SCREEN DOES. */
const exportSummary = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const play = (id, tags, extra = {}) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 },
    notes: '', annotations: [], tags: { quarter: 'Q1', custom: [], players: {}, grades: {}, ...tags }, ...extra });
  store.data.games = [{
    id: 'g-sum', name: 'Week 1', nextId: 9,
    gameInfo: { opponent: 'Summaries', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays: [
      play(1, { unit: 'special', players: { kicker: '19' } },
        { specialTeams: { version: 1, unit: 'punt', outcome: { status: 'downed' },
          kick: { distance: 40 }, return: {}, players: { punter: '19' } } }),
      play(2, { unit: 'defense', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception',
        yardage: '0', down: '3', distance: '10', players: { takeaway: '21' } }),
    ],
    annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
  }];
  store.data.activeGameId = 'g-sum';
  await app.storage._loadActiveGame();
  app.reportsScreen.setPlayersScope('season');
  await new Promise(r => setTimeout(r, 400));
  const capture = async num => {
    app.reportsScreen.openPlayerDetail(num);
    await new Promise(r => setTimeout(r, 300));
    const onScreen = [...document.querySelectorAll('[data-pd-game]')].map(b => b.textContent.trim());
    let saved = null;
    const prior = window.ffaSaveBlob;
    window.ffaSaveBlob = blob => { saved = blob; };
    app.reportsScreen.export('html');
    const html = saved ? await saved.text() : '';
    window.ffaSaveBlob = prior;
    const body = html.match(/<h2>Game by game<\/h2>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/)?.[1] || '';
    const cells = [...body.matchAll(/<td>([^<]*)<\/td>/g)].map(match => match[1].trim());
    return { onScreen, cells };
  };
  return { kicker: await capture('19'), defender: await capture('21') };
});
ok(exportSummary.kicker.cells.includes('1 punts, 40 punt yds')
  && !exportSummary.kicker.cells.some(cell => /0 field goal/.test(cell)),
  'a punt-only game exports the punt production, never 0 field goal attempts',
  JSON.stringify(exportSummary.kicker));
ok(exportSummary.defender.cells.includes('1 int')
  && !exportSummary.defender.cells.some(cell => /0 tackles/.test(cell)),
  'a takeaway-only game exports the interception, never 0 tackles',
  JSON.stringify(exportSummary.defender));
ok(JSON.stringify(exportSummary.kicker.cells.filter(cell => /punt/.test(cell)))
    === JSON.stringify(exportSummary.kicker.onScreen)
  && JSON.stringify(exportSummary.defender.cells.filter(cell => /int/.test(cell)))
    === JSON.stringify(exportSummary.defender.onScreen),
  'the exported game summary is the same string the screen shows',
  JSON.stringify(exportSummary));

/* PLAYER EXPORT matches the selection on screen. */
const exported = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  // Back to the leaderboard first: a previous block left a player open.
  screen.closePlayerDetail();
  await new Promise(r => setTimeout(r, 300));
  const num = document.querySelector('.gi-player-table [data-player-open]')?.dataset.playerOpen;
  screen.openPlayerDetail(num);
  await new Promise(r => setTimeout(r, 300));
  let saved = null;
  const prior = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => { saved = blob; };
  const result = screen.export('html');
  const html = saved ? await saved.text() : '';
  window.ffaSaveBlob = prior;
  return { num, result, html, isPlayer: /Player Report:/.test(html) };
});
ok(exported.result && exported.isPlayer,
  'Export produces the player report while a player is open, never the leaderboard', String(exported.result));
ok(exported.html.includes(`#${exported.num}`) && /Game by game/.test(exported.html)
  && /::/.test(exported.html),
  'the player export carries the identity, the game split and composite play references',
  exported.html.slice(0, 120));

/* THE EXPORT PRINTS THE BREAKDOWN ON SCREEN. It used to choose the first
   permitted dimension of every role independently, so the report could not match
   the analysis the coach was looking at. */
const exportMatch = await page.evaluate(async () => {
  const screen = window.app.reportsScreen;
  const selects = [...document.querySelectorAll('.gi-pd-situ select')];
  const dimSelect = selects.at(-1);
  const options = [...(dimSelect?.options || [])].map(option => ({ value: option.value, label: option.textContent.trim() }));
  /* The LAST permitted dimension, deliberately: picking the first cannot tell an
     export that honours the selection from one that always takes `permitted[0]`.
     The heading is printed whether or not the dimension produced rows, so this
     stays discriminating without depending on the fixture's tags. */
  const pick = options[options.length - 1];
  screen.playersSituDimension = pick.value;
  screen._renderActiveTab();
  await new Promise(r => setTimeout(r, 350));
  const onScreen = (document.querySelector('.gi-pd-situ-table th')?.textContent || '').trim();
  const selected = [...(document.querySelectorAll('.gi-pd-situ select')[1]?.options || [])]
    .find(option => option.selected)?.textContent.trim() || '';
  let saved = null;
  const prior = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => { saved = blob; };
  screen.export('html');
  const html = saved ? await saved.text() : '';
  window.ffaSaveBlob = prior;
  // The situational headings only — `Game by game` is its own section.
  const headings = [...html.matchAll(/<h2>([^<]*by[^<]*)<\/h2>/g)]
    .map(match => match[1]).filter(text => text !== 'Game by game');
  return { picked: pick, onScreen, selected, headings, options: options.map(o => o.label) };
});
// The export escapes coach-entered and label text at the HTML sink, so the
// heading carries `&amp;` where the control reads `&`.
const escapedPick = exportMatch.picked.label.replace(/&/g, '&amp;');
ok(exportMatch.headings.length === 1 && exportMatch.headings[0].endsWith(`by ${escapedPick}`),
  'the export prints the ACTIVE situational dimension, and only that one',
  JSON.stringify(exportMatch));
ok(exportMatch.selected === exportMatch.picked.label
  && (exportMatch.onScreen === '' || exportMatch.onScreen === exportMatch.picked.label),
  'the exported dimension is the one selected on screen', JSON.stringify(exportMatch));

/* === The REVISE composition from the 1.12.0-90 installed smoke ===
   Phase grouping, deliberate row capacity, held dash rows, and internal scroll
   only past capacity. The rejected layout paired populated roles two at a time
   in board order, which put Receiving beside Tackles — offense and defense in
   one band — and let a sparse module sit as dead space beside a tall one. */
console.log('\n== Revision 2 composition: phase groups and row capacity ==');
const composition = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const play = (id, tags, extra = {}) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 },
    notes: '', annotations: [], tags: { quarter: 'Q1', down: '1', distance: '10', custom: [], players: {}, grades: {}, ...tags }, ...extra });
  // Five rushers (over the 6-slot cap? no — under it), one passer, one receiver,
  // one tackler, one returner, one kicker: every phase populated, Passing sparse.
  const plays = [];
  let id = 1;
  ['30', '31', '32', '33'].forEach(num => plays.push(play(id++, { unit: 'offense', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: '5', players: { ballCarrier: num } })));
  plays.push(play(id++, { unit: 'offense', runPass: 'Pass', playType: 'Quick Pass', result: 'Gain',
    yardage: '9', players: { passer: '12', receiver: '80' } }));
  plays.push(play(id++, { unit: 'defense', runPass: 'Run', playType: 'Run Inside', result: 'Loss',
    yardage: '-2', players: { tackler: '55' } }));
  plays.push(Object.assign(play(id++, { unit: 'special', players: { returner: '18' } }), { specialTeams: { version: 1, unit: 'kickoffReturn', return: { attempted: true, yards: 12 }, outcome: { status: 'returned' } } }));
  plays.push(Object.assign(play(id++, { unit: 'special', players: { kicker: '19' } }), { specialTeams: { version: 1, unit: 'punt', kick: { distance: 35 }, outcome: {} } }));
  store.data.games = [{ id: 'g-comp', name: 'Week 1', nextId: 99,
    gameInfo: { opponent: 'Composition', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays, annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1 }];
  store.data.activeGameId = 'g-comp';
  await app.storage._loadActiveGame();
  app.reportsScreen.playersPlayer = null;
  app.reportsScreen.playersSection = 'all';
  app.reportsScreen.setPlayersScope('game');
  await new Promise(r => setTimeout(r, 600));
  const read = () => {
    const text = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
    const cols = [...document.querySelectorAll('.gi-players-col')];
    return {
      phases: [...document.querySelectorAll('[data-players-phase]')].map(p => p.dataset.playersPhase),
      // Module order as rendered, per column, so contiguity is observable.
      columns: cols.map(col => [...col.querySelectorAll('.gi-player-module')]
        .map(m => text(m.querySelector('h3, header strong')))),
      phaseOfModule: [...document.querySelectorAll('[data-players-phase]')].map(p => ({
        phase: p.dataset.playersPhase,
        modules: [...p.querySelectorAll('.gi-player-module')].map(m => text(m.querySelector('h3, header strong'))),
      })),
      modules: [...document.querySelectorAll('.gi-player-module')].map(m => {
        const body = m.querySelector('.gi-player-body');
        const rows = [...m.querySelectorAll('tbody tr')];
        return {
          title: text(m.querySelector('h3, header strong')),
          cap: Number(body?.dataset.playerCap),
          rows: rows.length,
          held: rows.filter(tr => tr.classList.contains('is-absent')).length,
          heldCells: rows.filter(tr => tr.classList.contains('is-absent'))
            .map(tr => [...tr.cells].map(td => text(td))),
          scrolls: body ? body.scrollHeight > body.clientHeight + 1 : null,
          headerMoves: (() => {
            const head = m.querySelector('thead th');
            if (!body || !head) return null;
            const before = head.getBoundingClientRect().top;
            body.scrollTop = 200;
            const after = head.getBoundingClientRect().top;
            body.scrollTop = 0;
            return Math.abs(after - before) > 1;
          })(),
        };
      }),
    };
  };
  const all = read();
  app.reportsScreen.playersSection = 'off';
  app.reportsScreen._renderActiveTab();
  await new Promise(r => setTimeout(r, 400));
  const offense = read();
  app.reportsScreen.playersSection = 'all';
  app.reportsScreen._renderActiveTab();
  await new Promise(r => setTimeout(r, 400));
  const geometryBefore = [...document.querySelectorAll('.gi-player-module')]
    .map(m => Math.round(m.getBoundingClientRect().height));
  // A sort must not resize a module: capacity owns the height, not the cohort.
  document.querySelector('.gi-player-module table.gi-player-table th')?.click();
  await new Promise(r => setTimeout(r, 250));
  const geometryAfterSort = [...document.querySelectorAll('.gi-player-module')]
    .map(m => Math.round(m.getBoundingClientRect().height));
  return { all, offense, geometryBefore, geometryAfterSort };
});
const modOf = (snapshot, title) => snapshot.modules.find(m => m.title === title);
ok(JSON.stringify(composition.all.phases) === JSON.stringify(['off', 'def', 'st']),
  'the board renders the approved phase order: Offense, Defense, Special Teams',
  JSON.stringify(composition.all.phases));
ok(JSON.stringify(composition.all.phaseOfModule.find(p => p.phase === 'off')?.modules)
  === JSON.stringify(['Rushing', 'Passing', 'Receiving']),
  'the offensive roles are contiguous and in their approved order',
  JSON.stringify(composition.all.phaseOfModule));
ok(JSON.stringify(composition.all.phaseOfModule.find(p => p.phase === 'st')?.modules)
  === JSON.stringify(['Return Game', 'Kicking / Punting']),
  'the Special Teams roles are contiguous', JSON.stringify(composition.all.phaseOfModule));
ok(composition.all.columns.every(col => {
  const phases = col.map(title => ['Rushing', 'Passing', 'Receiving'].includes(title) ? 'off'
    : title === 'Tackles' ? 'def' : 'st');
  // Every phase in a column occupies one unbroken run — no checkerboard.
  return phases.every((phase, i) => i === 0 || phase === phases[i - 1] || !phases.slice(0, i).includes(phase));
}), 'no column interleaves two phases — each phase is one unbroken run',
  JSON.stringify(composition.all.columns));
ok(modOf(composition.all, 'Passing')?.cap === 3 && modOf(composition.all, 'Passing')?.rows === 3,
  'Passing reserves exactly three visible data-row slots',
  JSON.stringify(modOf(composition.all, 'Passing')));
ok(modOf(composition.all, 'Passing')?.held === 2
  && modOf(composition.all, 'Passing').heldCells.every(cells => cells.every(cell => cell === '–')),
  'a sparse Passing module fills its unused capacity with formatted dash rows, not dead space',
  JSON.stringify(modOf(composition.all, 'Passing')));
ok(composition.all.modules.every(m => m.rows === Math.max(m.cap, m.rows) && m.rows >= m.cap),
  'every module renders at least its full row capacity', JSON.stringify(composition.all.modules));
ok(composition.all.modules.every(m => m.scrolls === false),
  'a cohort within capacity never scrolls internally', JSON.stringify(composition.all.modules.map(m => [m.title, m.scrolls])));
ok(composition.all.modules.every(m => m.headerMoves === false),
  'the column header stays put while the module body scrolls',
  JSON.stringify(composition.all.modules.map(m => [m.title, m.headerMoves])));
ok(JSON.stringify(composition.offense.phases) === JSON.stringify(['off'])
  && JSON.stringify(composition.offense.modules.map(m => m.title)) === JSON.stringify(['Rushing', 'Passing', 'Receiving'])
  && composition.offense.modules.every(m => m.rows >= m.cap),
  'a phase-filtered view uses the same capacities, order and held rows',
  JSON.stringify(composition.offense.modules.map(m => [m.title, m.cap, m.rows])));
ok(JSON.stringify(composition.geometryBefore) === JSON.stringify(composition.geometryAfterSort),
  'sorting changes no module height — capacity owns the geometry, not the cohort',
  JSON.stringify([composition.geometryBefore, composition.geometryAfterSort]));

/* Over capacity: the body scrolls and nothing else moves. */
const overflow = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const plays = [];
  // Eight passers is well past Passing's three slots.
  ['1', '2', '3', '4', '5', '6', '7', '8'].forEach((num, index) => plays.push({
    id: index + 1, timestamp: { start: index * 10, end: index * 10 + 6 }, notes: '', annotations: [],
    tags: { unit: 'offense', quarter: 'Q1', runPass: 'Pass', playType: 'Quick Pass', result: 'Gain',
      yardage: '8', down: '1', distance: '10', custom: [], players: { passer: num, receiver: '80' }, grades: {} },
  }));
  store.data.games = [{ id: 'g-over', name: 'Week 1', nextId: 99,
    gameInfo: { opponent: 'Overflow', date: '2026-09-01', week: '1', perspective: 'self', scoreUs: 7, scoreThem: 0 },
    plays, annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1 }];
  store.data.activeGameId = 'g-over';
  await app.storage._loadActiveGame();
  app.reportsScreen.playersSection = 'all';
  app.reportsScreen.setPlayersScope('game');
  await new Promise(r => setTimeout(r, 600));
  const text = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  const mod = [...document.querySelectorAll('.gi-player-module')]
    .find(m => text(m.querySelector('h3, header strong')) === 'Passing');
  const body = mod.querySelector('.gi-player-body');
  const head = mod.querySelector('thead th');
  const moduleHeader = mod.querySelector('header');
  const headTop = head.getBoundingClientRect().top;
  const modHeadTop = moduleHeader.getBoundingClientRect().top;
  body.scrollTop = 150;
  await new Promise(r => setTimeout(r, 120));
  const after = { head: head.getBoundingClientRect().top, modHead: moduleHeader.getBoundingClientRect().top };
  const rows = [...mod.querySelectorAll('tbody tr')];
  return { rows: rows.length, held: rows.filter(tr => tr.classList.contains('is-absent')).length,
    scrolls: body.scrollHeight > body.clientHeight + 1,
    capHeight: body.clientHeight,
    headStayed: Math.abs(after.head - headTop) <= 1, moduleHeadStayed: Math.abs(after.modHead - modHeadTop) <= 1 };
});
ok(overflow.rows === 8 && overflow.held === 0 && overflow.scrolls,
  'a cohort past capacity keeps every row and scrolls inside the module body',
  JSON.stringify(overflow));
ok(overflow.headStayed && overflow.moduleHeadStayed,
  'neither the module header nor the column header moves when the body scrolls',
  JSON.stringify(overflow));
ok(overflow.capHeight === 3 * 38 + 38,
  'the Passing body is exactly three data rows plus its column header',
  JSON.stringify(overflow));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
process.exit(fail || errors.length ? 1 : 0);

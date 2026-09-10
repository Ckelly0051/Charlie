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
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

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
  { unit: 'special', stType: 'Kick Return', kickOutcome: 'Returned', returnYards: '24', players: { returner: '7' } },
  { unit: 'special', stType: 'Punt Return', kickOutcome: 'Returned', returnYards: '0', players: { returner: '16' } },
  { unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', kickDistance: '28', players: { kicker: '3' } },
  { unit: 'special', stType: 'Field Goal', kickOutcome: 'Miss', kickDistance: '44', players: { kicker: '3' } },
  { unit: 'special', stType: 'Punt', kickOutcome: 'Fair Catch', kickDistance: '38', yardage: '38', players: { kicker: '3' } },
];
/* A second game at full-season magnitude: a four-digit passing yardage and a
   three-digit attempt count are what the column steps must actually hold, and
   sizing them against one game is what let `1054` and `174/261` overrun. */
const GAME_B = [
  { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '12', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } },
  { unit: 'defense', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '-2', players: { tackler: '23' }, grades: { tackler: 2 } },
  { unit: 'special', stType: 'Kick Return', kickOutcome: 'Returned', returnYards: '44', players: { returner: '7' } },
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
    const build = rows => rows.map((row, i) => ({
      id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [],
      tags: { custom: [], players: {}, grades: {}, quarter: 'Q1', ...row },
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
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, games, roster);
  await sleep(450);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(300);
  await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
  await sleep(650);
};
const setScope = async scope => {
  await page.evaluate(s => {
    [...document.querySelectorAll('.gi-players-scope button')]
      .find(b => b.textContent.trim() === (s === 'game' ? 'Current game' : 'Full season'))?.click();
  }, scope);
  await sleep(500);
};
const setSection = async title => {
  await page.evaluate(t => {
    [...document.querySelectorAll('.gi-players-nav button')]
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
  const toolbar = document.querySelector('.gi-players-toolbar');
  const nav = document.querySelector('.gi-players-nav');
  const row = document.querySelector('.gi-player-table tbody tr');
  const td = document.querySelector('.gi-player-table tbody td');
  const navBadge = nav?.querySelector('button > b');
  const roleHead = document.querySelector('.gi-player-module > header strong');
  return {
    board: !!board,
    // Scope and role navigation must share ONE control row: the toolbar and the
    // nav sit on the same grid row of the report, not stacked full width.
    sameRow: toolbar && nav
      ? Math.abs(toolbar.getBoundingClientRect().top - nav.getBoundingClientRect().top) < 2 : false,
    reportColumns: report ? getComputedStyle(report).gridTemplateColumns.split(' ').length : 0,
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
ok(comp.sameRow && comp.reportColumns === 2,
  'scope and role navigation share one compact control row',
  `sameRow=${comp.sameRow} columns=${comp.reportColumns}`);
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
    identOffsets: [...document.querySelectorAll('.gi-player-band')].map(b =>
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
ok(geo.identOffsets.every(band => band.length < 2 || band[0] === band[1]),
  'both panels of a paired band start their identity column at the same offset',
  JSON.stringify(geo.identOffsets));

/* Column edges must not move when a sort reorders rows. */
const colsOf = () => page.evaluate(() => [...document.querySelectorAll('.gi-player-band .gi-player-module')]
  .slice(0, 1).flatMap(m => [...m.querySelectorAll('thead th')].map(t => Math.round(t.getBoundingClientRect().width))));
const colsBefore = await colsOf();
await page.evaluate(() => {
  const m = document.querySelector('.gi-player-band .gi-player-module');
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
      overlap: Math.round(th.getBoundingClientRect().bottom - tr.getBoundingClientRect().top) };
  }).filter(Boolean));
ok(headerOverlay.every(h => h.overlap <= 1),
  'no column header is pinned over its own first data row',
  JSON.stringify(headerOverlay.filter(h => h.overlap > 1)));
ok(headerOverlay.every(h => h.position !== 'sticky'),
  'the Players tables opt out of the route-wide sticky header',
  JSON.stringify(headerOverlay.map(h => `${h.role}:${h.position}`)));

/* ══ 4. No clipping, no page overflow, at every release width ═════════════ */
console.log('\n== 4. Every release width, both scopes, every section ==');
const inspect = async label => {
  const r = await page.evaluate(() => {
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
          && parseFloat(getComputedStyle(el).fontSize) < 9.5)
        .map(el => `${el.tagName}.${el.className}`.slice(0, 40)))],
    };
  });
  ok(r.pageOverflow <= 0, `${label}: no page-level horizontal scrolling`, `${r.pageOverflow}px`);
  ok(!r.clipped.length, `${label}: no clipped header, name or value`, r.clipped.join('; '));
  ok(!r.scrollers, `${label}: no table scroller engages`, String(r.scrollers));
  ok(!r.tiny.length, `${label}: no text below the 9.5px floor`, r.tiny.join('; '));
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
const bands1440 = await page.evaluate(() => [...document.querySelectorAll('.gi-player-band')]
  .map(b => ({ roles: [...b.querySelectorAll('header strong')].map(s => s.textContent.trim()),
    columns: getComputedStyle(b).gridTemplateColumns.split(' ').length })));
ok(bands1440.length === 3 && bands1440.every(b => b.columns === 2),
  'at 1440 every band pairs -- no table needs more than a band half',
  JSON.stringify(bands1440));
await page.setViewport({ width: 1280, height: 720 });
await frame();
await sleep(200);
const bands1280 = await page.evaluate(() => [...document.querySelectorAll('.gi-player-band')]
  .map(b => ({ roles: [...b.querySelectorAll('header strong')].map(s => s.textContent.trim()),
    columns: getComputedStyle(b).gridTemplateColumns.split(' ').length })));
const paired1280 = bands1280.filter(b => b.columns === 2);
ok(paired1280.length === 1 && paired1280[0].roles.join(',') === 'Return Game,Kicking / Punting',
  'at 1280 only the bands whose own tables exceed the half stack -- Return Game and Kicking / Punting stay paired',
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
      unclickable: [...document.querySelectorAll('.gi-player-table tbody tr')]
        .filter(tr => tr.getAttribute('role') !== 'button').length };
  });
  ok(refs.rows > 0 && refs.empty === 0,
    `${scope} scope: every row carries composite references for its own role`,
    `${refs.empty} of ${refs.rows} rows had none`);
  ok(refs.unresolved === 0,
    `${scope} scope: every reference resolves to a play in the scoped cohort`, String(refs.unresolved));
  ok(refs.unclickable === 0,
    `${scope} scope: no row renders without a film action`, String(refs.unclickable));
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
  module.querySelector('tbody tr').click();
  screen.watchRefs = original;
  return seen;
});
ok(watched.length === 1, 'a row click reaches the shared film-navigation service exactly once',
  JSON.stringify(watched));
ok(/ — Receiving$/.test(watched[0]?.label || ''),
  'the film cohort is labelled with the row\'s own role, so a receiving cut-up is distinguishable from a rushing one',
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
  return [...m.querySelectorAll('tbody td[data-col="grade"]')].map(td => td.textContent.trim());
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
  const nav = document.querySelector('.gi-players-nav button');
  const scope = document.querySelector('.gi-players-scope button');
  const box = () => { const r = tr.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height) }; };
  const before = box();
  tr.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
  tr.focus();
  const after = box();
  return {
    role: tr.getAttribute('role'), tab: tr.tabIndex, title: tr.getAttribute('title'),
    cursor: getComputedStyle(tr).cursor,
    chevron: getComputedStyle(td, '::before').content,
    thCursor: getComputedStyle(th).cursor, thRole: th.getAttribute('role'), thTab: th.tabIndex,
    navCursor: getComputedStyle(nav).cursor, scopeCursor: getComputedStyle(scope).cursor,
    resized: JSON.stringify(before) !== JSON.stringify(after),
    box: before,
  };
});
ok(interaction.role === 'button' && interaction.tab === 0 && interaction.cursor === 'pointer',
  'a player row is pointer-affordant and keyboard-activatable', JSON.stringify(interaction));
ok(/▸/.test(interaction.chevron), 'a player row carries the hover chevron', interaction.chevron);
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
  navCounts: [...document.querySelectorAll('.gi-players-nav button > b')].map(b => b.textContent.trim()),
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
  active: [...document.querySelectorAll('.gi-players-scope button')]
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

/* The row marker must cost the identity column no width, or it takes that room
   straight back off the name. */
const marker = await page.evaluate(() => {
  const td = document.querySelector('.gi-player-table .cut-row td.tl');
  return getComputedStyle(td, '::before').position;
});
ok(marker === 'absolute',
  'the row marker is outside the flow, so it costs the identity column no width', marker);

/* 12b. The selected role section survives a scope change. It was local view
   state, and a scope change re-renders the tab, so the board snapped back to
   All roles under the coach's hands. */
for (const [title, other] of [['Offense', 'season'], ['Defense', 'game'], ['Special Teams', 'season']]) {
  await setSection(title);
  const before = await page.evaluate(() =>
    document.querySelector('.gi-players-nav button.active')?.textContent.trim());
  await setScope(other);
  const after = await page.evaluate(() => ({
    active: document.querySelector('.gi-players-nav button.active')?.textContent.trim(),
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
  const m = document.querySelector('.gi-player-band .gi-player-module');
  [...m.querySelectorAll('thead th')].find(t => t.textContent.trim() === 'Long')?.click();
});
await frame();
const sortedBefore = await page.evaluate(() =>
  document.querySelector('.gi-player-band .gi-player-module th.is-sorted')?.textContent.trim());
await setScope('season');
const sortedAfter = await page.evaluate(() =>
  document.querySelector('.gi-player-band .gi-player-module th.is-sorted')?.textContent.trim());
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
  { unit: 'special', stType: 'Kick Return', kickOutcome: 'Returned', returnYards: '20', players: { returner: '7' } },
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
  { unit: 'special', stType: 'Punt', result: 'No Gain', yardage: '11', players: { kicker: '27' } },
  { unit: 'special', stType: 'Punt Return', result: 'Gain', yardage: '18', players: { returner: '42' } },
  // One return that DOES carry the dedicated field.
  { unit: 'special', stType: 'Punt Return', result: 'Gain', yardage: '99', returnYards: '5', players: { returner: '42' } },
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
  'punt average is No data when kickDistance is not charted, never derived from generic yardage',
  JSON.stringify(kicking));
ok(!kicking.includes('11.0') && !kicking.includes('2.8'),
  'no punt average is fabricated from tags.yardage', JSON.stringify(kicking));
const returns = (stRows['Return Game'] || [])[0] || [];
ok(returns.includes('5') && !returns.includes('23') && !returns.includes('117'),
  'return yards come from returnYards only — the unmeasured return adds none',
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
  'a punt with no charted kickDistance contributes no measured distance', JSON.stringify(crossSurface));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); console.log(errors.slice(0, 5).join('\n')); }
await browser.close();
process.exit(fail || errors.length ? 1 : 0);

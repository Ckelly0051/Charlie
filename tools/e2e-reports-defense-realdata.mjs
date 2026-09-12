/** Reports > Defense: fixed-schema evidence on the canonical real season. */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const OUT = `artifacts/defense-production-realdata/run-${process.pid}`;
const VIEWPORTS = [[1440, 900], [1280, 900]];
const SECTIONS = [
  { label: 'Defensive performance', modules: ['Game-by-game', 'Opponent drive outcomes', 'By down', 'By quarter'] },
  { label: 'Opponent Offense', modules: ['Production by play type', 'Top 6 formations', 'Personnel faced', 'Backfield faced', 'Attack direction'] },
  { label: 'Scheme', modules: ['Top Calls', 'Worst Calls', 'Blitz vs No Blitz', 'Pressure by situation'] },
  { label: 'Situational results', modules: ['Down & distance', 'Field zone', 'By hash', 'Motion'] },
];
const ROWS = {
  'Game-by-game': 1, 'Opponent drive outcomes': 7, 'By down': 4, 'By quarter': 4,
  'Production by play type': 7, 'Top 6 formations': 6, 'Attack direction': 5,
  'Personnel faced': 5, 'Backfield faced': 5,
  'Top Calls': 4, 'Worst Calls': 4, 'Pressure by situation': 6,
  'Down & distance': 12, 'Field zone': 5, 'By hash': 5, Motion: 5,
};

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!existsSync(SOURCE)) throw new Error(`Canonical Reports season missing: ${SOURCE}`);
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const games = season.games || [];
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(data => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
}, season);

const observations = [];
for (const game of games) {
  await page.evaluate(async gameId => {
    const app = window.app;
    app.storage.seasonStore.data.activeGameId = gameId;
    await app.storage._loadActiveGame();
    app.reportsScreen.defenseScope = 'game';
    app.workspaceShell.show('reports');
    app.reportsScreen.selectTab('defense');
  }, game.id);
  await sleep(500);

  for (const [width, height] of VIEWPORTS) {
    await page.setViewport({ width, height });
    await sleep(250);
    for (const section of SECTIONS) {
      await page.evaluate(label => {
        [...document.querySelectorAll('.gi-def-secnav-item')]
          .find(button => button.textContent.includes(label))?.click();
      }, section.label);
      await sleep(100);
      const result = await page.evaluate(() => {
        const board = document.querySelector('.gi-defense-board');
        const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
        const title = module => text(module.querySelector('header strong'));
        const modules = [...(board?.querySelectorAll('.gi-overview-module') || [])];
        const rowCount = module => title(module) === 'Field zone'
          ? module.querySelectorAll('.gi-def-zonerow').length
          : title(module) === 'Attack direction'
            ? module.querySelectorAll('.gi-def-direction-row').length
          : module.querySelectorAll('tbody tr').length;
        const clipped = [];
        modules.forEach(module => module.querySelectorAll('th,td,strong,small').forEach(cell => {
          if (!cell.closest('.gi-def-pop') && !cell.querySelector('.gi-def-pop')
            && getComputedStyle(cell).visibility !== 'hidden'
            && (cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1)) {
            clipped.push(`${title(module)}:${text(cell).slice(0, 24)}`);
          }
        }));
        return {
          route: document.querySelector('.gi-reports-tab.active')?.dataset.reportTab,
          active: text(board?.querySelector('.gi-def-secnav-item.is-active')).replace(/^\d/, '').trim(),
          titles: modules.map(title),
          rows: Object.fromEntries(modules.map(module => [title(module), rowCount(module)])),
          held: modules.reduce((count, module) => count + module.querySelectorAll('tr.is-absent').length, 0),
          height: Math.round(board?.getBoundingClientRect().height || 0),
          boardWidth: Math.round(board?.getBoundingClientRect().width || 0),
          meta: [...(board?.querySelectorAll('.gi-overview-module>header span') || [])]
            .filter(node => getComputedStyle(node).display !== 'none' && text(node)).map(text),
          sectionProse: board?.querySelectorAll('.gi-def-secrule p').length || 0,
          tabs: [...(board?.querySelectorAll('.gi-def-secnav-item') || [])].map(node => text(node).replace(/^\d/, '').trim()),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          clipped,
          contentOverflow: modules.filter(module => module.scrollHeight > module.clientHeight + 1)
            .map(module => `${title(module)}:${module.scrollHeight - module.clientHeight}px`),
          rowEscape: modules.flatMap(module => {
            const last = module.querySelector('tbody tr:last-child, .gi-def-zonerow:last-child');
            return last && last.getBoundingClientRect().bottom > module.getBoundingClientRect().bottom + 1
              ? [`${title(module)}:${Math.ceil(last.getBoundingClientRect().bottom - module.getBoundingClientRect().bottom)}px`]
              : [];
          }),
          bandOverflow: [...(board?.querySelectorAll('.gi-def-band') || [])].flatMap(band => {
            const bottom = band.getBoundingClientRect().bottom;
            return [...band.children].filter(child => child.getBoundingClientRect().bottom > bottom + 1)
              .map(child => `${child.className}:${Math.round(child.getBoundingClientRect().bottom - bottom)}px`);
          }),
          kpiSubs: [...(board?.querySelectorAll('.gi-def-kpi small') || [])].map(text),
          quarterHeaders: [...(board?.querySelectorAll('.gi-overview-module') || [])]
            .filter(module => title(module) === 'By quarter')
            .flatMap(module => [...module.querySelectorAll('th')].map(text)),
          reportTitle: text(document.querySelector('[data-reports-title]')),
          reportTitleClipped: (() => {
            const node = document.querySelector('[data-reports-title]');
            return !!node && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
              || getComputedStyle(node).textOverflow === 'ellipsis');
          })(),
          titleFonts: modules.map(module => getComputedStyle(module.querySelector('header strong')).fontFamily),
          /* The rendered cohort reconciliation, and the rendered proof that no
             tendency row prints a numeric zero for a look the coach charted. */
          defSample: text(board?.querySelector('[data-def-sample]')),
          /* COMPOSITION, NOT CONTAINMENT. Every check here measured clipping,
             overflow and scrollers, so a band could sit on its own margin and
             pass all of them. Measured at 1280 the right edge stepped six times
             down the column and the left edge four times, and nothing reported
             it because nothing was looking. The scorebug and title band are
             full-bleed by design: their BACKGROUND spans the viewport, their
             CONTENT shares the route frame's inset. */
          edges: Object.fromEntries([
            ['title', '.gi-reports-reporthead .gi-reports-title-block'],
            ['headActions', '.gi-reports-reporthead .gi-reports-actions'],
            ['score', '.gi-scorebug-score'],
            ['ident', '.gi-scorebug-ident'],
            ['pane', '.gi-report-pane'],
          ].map(([key, selector]) => {
            const node = document.querySelector(selector);
            if (!node) return [key, null];
            /* CONTENT edges, not border boxes. A full-bleed band's own box
               starts at 0 by design; where its CONTENT starts is the thing that
               has to line up, so its padding comes off here. */
            const rect = node.getBoundingClientRect();
            const style = getComputedStyle(node);
            return [key, { left: Math.round(rect.left + parseFloat(style.paddingLeft)),
              right: Math.round(rect.right - parseFloat(style.paddingRight)) }];
          })),
          zeroSnapCells: modules.flatMap(module => {
            const name = title(module);
            if (!['Top 6 formations', 'Personnel faced', 'Backfield faced', 'Motion',
              'By hash', 'Production by play type'].includes(name)) return [];
            const head = [...module.querySelectorAll('thead th')].map(text);
            const col = head.findIndex(label => label === 'Snaps');
            if (col < 0) return [];
            return [...module.querySelectorAll('tbody tr')]
              .filter(row => !row.classList.contains('is-absent'))
              .filter(row => text(row.children[col]) === '0')
              .map(row => `${name}:${text(row.children[0])}`);
          }),
          minFontSizes: [...(board?.querySelectorAll('th,td,span,small,strong,b,button,h2') || [])]
            .filter(node => getComputedStyle(node).visibility !== 'hidden'
              && [...node.childNodes].some(child => child.nodeType === 3 && child.nodeValue.trim()))
            .map(node => ({ cls: [String(node.className || node.tagName),
              String(node.parentElement?.className || ''),
              String(node.closest('.gi-overview-module')?.className || '')].join(' ').slice(0, 90),
              size: parseFloat(getComputedStyle(node).fontSize) }))
            .filter(item => item.size < 12.5),
        };
      });
      observations.push({ game: game.name, width, section: section.label, ...result });
    }
  }
}

console.log('\n== Defense fixed-schema real-data gate ==');
ok(games.length === 6 && games.reduce((sum, game) => sum + (game.plays || []).length, 0) > 0,
  'the canonical six-game season is loaded with charted plays');
ok(observations.every(item => item.route === 'defense' && item.boardWidth > 900),
  'Defense is rendered and visible before geometry is measured');
ok(observations.every(item => JSON.stringify(item.tabs) === JSON.stringify(SECTIONS.map(section => section.label))),
  'the four approved useful sections render and the rejected duplicate Self-Scout does not');
const wrongModules = observations.filter(item => {
  const expected = SECTIONS.find(section => section.label === item.section)?.modules || [];
  return JSON.stringify(item.titles) !== JSON.stringify(expected);
});
ok(wrongModules.length === 0, 'every section renders its fixed module inventory', JSON.stringify(wrongModules.slice(0, 3)));
const wrongRows = observations.flatMap(item => Object.entries(ROWS)
  .filter(([name]) => item.titles.includes(name))
  .filter(([name, expected]) => item.rows[name] !== expected)
  .map(([name, expected]) => `${item.game} ${item.width} ${item.section} ${name}:${item.rows[name]}!=${expected}`));
ok(wrongRows.length === 0, 'every table renders exactly its declared allocation', JSON.stringify(wrongRows.slice(0, 6)));
for (const [width] of VIEWPORTS) for (const section of SECTIONS) {
  const rows = observations.filter(item => item.width === width && item.section === section.label);
  const heights = [...new Set(rows.map(item => item.height))];
  ok(heights.length === 1, `${section.label} is one height across all six games at ${width}`,
    JSON.stringify(rows.map(item => ({ game: item.game, height: item.height }))));
}
const expectedMeta = { 'Defensive performance': 1, 'Opponent Offense': 1, Scheme: 0, 'Situational results': 1 };
ok(observations.every(item => item.meta.length === expectedMeta[item.section]
    && item.meta.every(value => /game baseline: .* yds\/play/.test(value))
    && item.sectionProse === 0),
  'Defense omits explainer prose while retaining required data baselines',
  JSON.stringify(observations.filter(item => item.meta.length !== expectedMeta[item.section]).slice(0, 4)));
ok(observations.every(item => item.kpiSubs.every(value => !value.includes('Last 3'))
    && item.quarterHeaders.every(value => value.toLowerCase() !== 'vs season avg')),
  'Current game scope never labels one game as Last 3 or season average');
ok(observations.some(item => item.held > 0), 'sparse real games hold unfilled slots with dashes');
ok(observations.every(item => item.overflowX === 0), 'no page-level horizontal overflow at either release width');
ok(observations.every(item => !item.reportTitleClipped),
  'the complete Reports title remains visible at both release widths',
  JSON.stringify(observations.filter(item => item.reportTitleClipped).slice(0, 4)));
ok(observations.every(item => item.clipped.length === 0), 'no Defense label or value is clipped',
  JSON.stringify(observations.filter(item => item.clipped.length).slice(0, 4)));
/* SHARED CHROME ALIGNMENT. One left edge and one right edge down the column. */
const withEdges = observations.filter(item => item.edges?.pane && item.edges?.score && item.edges?.ident);
ok(withEdges.length === observations.length,
  'every shared Reports band is on screen before its edges are measured',
  JSON.stringify(observations.filter(item => !item.edges?.score).map(item => item.section).slice(0, 3)));
const leftRagged = withEdges.flatMap(item => ['title', 'score']
  .filter(key => Math.abs(item.edges[key].left - item.edges.pane.left) > 1)
  .map(key => `${item.game}/${item.width}:${key}:${item.edges[key].left} vs pane ${item.edges.pane.left}`));
ok(leftRagged.length === 0,
  'the report title and the linescore start on the report frame\'s own left inset',
  JSON.stringify([...new Set(leftRagged)].slice(0, 4)));
const rightRagged = withEdges.flatMap(item => ['headActions', 'ident']
  .filter(key => Math.abs(item.edges[key].right - item.edges.pane.right) > 1)
  .map(key => `${item.game}/${item.width}:${key}:${item.edges[key].right} vs pane ${item.edges.pane.right}`));
ok(rightRagged.length === 0,
  'the title-band commands and the identity strip end on the report frame\'s own right inset',
  JSON.stringify([...new Set(rightRagged)].slice(0, 4)));
/* The linescore must stay ONE row. It wrapped at 1280, dropping the identity
   strip onto its own full-width row where three items were spread across the
   entire bar on no grid, aligned to nothing above them. */
const wrappedBand = withEdges.filter(item => item.edges.ident.left < item.edges.score.right)
  .map(item => `${item.game}/${item.width}`);
ok(wrappedBand.length === 0,
  'the linescore, its story and its identity strip stay on one row at both release widths',
  JSON.stringify([...new Set(wrappedBand)].slice(0, 4)));
/* THE RENDERED COHORT RECONCILIATION. Compact factual data, present on every
   section at both widths, naming both cohorts and mislabelling neither. */
const missingSample = observations.filter(item => !/^\d+ charted · \d+ with play type$/.test(item.defSample || ''));
ok(missingSample.length === 0,
  'every Defense section states its charted sample and its measured subset',
  JSON.stringify(missingSample.map(item => ({ game: item.game, width: item.width, sample: item.defSample })).slice(0, 4)));
ok(observations.some(item => {
  const [, charted, measured] = (item.defSample || '').match(/^(\d+) charted · (\d+) with play type$/) || [];
  return charted && measured && Number(charted) > Number(measured);
}), 'the disclosure really does report two different numbers on this season, so it is not decorative',
  JSON.stringify([...new Set(observations.map(item => item.defSample))]));
/* THE TYPOGRAPHY FLOOR, ENFORCED WHERE IT APPLIES.
   `docs/VISUAL-SYSTEM-RULES.md` sets 12.5px as the floor for coach-facing copy
   and names the categories that may never be exempted. Before this assertion
   the rules file was a claim: the range that codified it shipped 11.5px
   formation-matrix headers, a 9px KPI subline below 1300px, and 11.5px nav
   counts. Everything below the floor on this board must now be one of the
   named exceptions, by class, and the list is short on purpose. */
const FLOOR_EXCEPTIONS = [
  'gi-def-tile', 'gi-def-type-summary', 'gi-def-rank', 'gi-def-secrule',
  'gi-def-kpi', 'gi-def-compare-card', 'gi-def-direction-key', 'gi-def-zonerow',
  'gi-def-answer', 'gi-def-pop', 'gi-scorebug', 'gi-reports-', 'gi-def-secnav',
  'gi-def-toolbar', 'gi-def-scope', 'gi-def-export',
];
const floorViolations = observations.flatMap(item => (item.minFontSizes || [])
  .filter(entry => !FLOOR_EXCEPTIONS.some(allowed => entry.cls.includes(allowed)))
  .map(entry => `${item.width}:${item.section}:${entry.cls}@${entry.size}`));
ok(floorViolations.length === 0,
  'every Defense value outside the named broadcast-display exceptions meets the 12.5px floor',
  JSON.stringify([...new Set(floorViolations)].slice(0, 12)));
/* NO FABRICATED ZERO. A look the coach charted must never read `0` snaps. */
const zeroSnaps = observations.filter(item => item.zeroSnapCells.length);
ok(zeroSnaps.length === 0,
  'no rendered Defense tendency row prints 0 snaps for a charted look',
  JSON.stringify(zeroSnaps.map(item => ({ game: item.game, width: item.width, cells: item.zeroSnapCells })).slice(0, 4)));
ok(observations.every(item => item.contentOverflow.length === 0), 'every module remains inside its fixed panel',
  JSON.stringify(observations.filter(item => item.contentOverflow.length).slice(0, 4)));
ok(observations.every(item => item.rowEscape.length === 0), 'the final allocated row remains visible inside every module',
  JSON.stringify(observations.filter(item => item.rowEscape.length).slice(0, 4)));
ok(observations.every(item => item.bandOverflow.length === 0), 'every module remains inside its allocated band',
  JSON.stringify(observations.filter(item => item.bandOverflow.length).slice(0, 4)));
ok(observations.every(item => item.titleFonts.every(font => /IBM Plex Sans/i.test(font) && !/Condensed/i.test(font))),
  'every Defense module title uses the approved sans face',
  JSON.stringify(observations.filter(item => item.titleFonts.some(font => /Condensed/i.test(font))).slice(0, 4)));
ok(errors.length === 0, 'the real Defense route raises no page or console errors', errors.slice(0, 3).join(' | '));

for (let index = 0; index < 2; index++) {
  await page.setViewport({ width: 1440, height: 900 });
  await page.evaluate(label => {
    [...document.querySelectorAll('.gi-def-secnav-item')]
      .find(button => button.textContent.includes(label))?.click();
    document.querySelector('.gi-reports-scroll')?.scrollTo(0, 0);
  }, SECTIONS[index].label);
  await sleep(100);
  await page.screenshot({ path: `${OUT}/1440-current-section-${index + 1}.png` });
}

/* Review captures use the richer full-season cohort and the canonical active game. */
await page.setViewport({ width: 1440, height: 900 });
await page.evaluate(async gameId => {
  const app = window.app;
  app.storage.seasonStore.data.activeGameId = gameId;
  await app.storage._loadActiveGame();
  app.reportsScreen.defenseScope = 'season';
  app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('defense');
}, season.activeGameId || games[0].id);
await sleep(500);
const canonical = await page.evaluate(() => {
  const app = window.app;
  const { scoped, labels } = app.reportsScreen._defenseCohort();
  const model = app.stats.defenseDashboard(scoped, labels);
  return {
    total: model.total, measured: model.measured,
    summarySnaps: model.summary.n, summaryCharted: model.summary.charted,
    summaryMeasured: model.summary.measured,
    yards: model.summary.yards, rush: model.summary.runYards,
    pass: model.summary.passYards, ypp: model.summary.ypp, turnovers: model.summary.turnovers,
    explosives: model.summary.explosives,
    third: model.thirdDownAllowed, fourth: model.fourthDownAllowed,
    dd: model.downDistance.map(row => row.name),
    emptyDd: model.downDistance.filter(row => !row.n).map(row => row.name),
    calls: model.topCalls.map(row => `${row.name}:${row.n}`),
    worstCalls: model.worstCalls.map(row => `${row.name}:${row.n}`),
    firstLongCallPct: model.downDistance.find(row => row.name === '1st & 7+')?.callPct,
    zones: model.zones.map(row => `${row.name}:${row.n}`),
    formationCalls: model.formationCalls.map(row => ({
      name: row.name, n: row.n,
      playTypes: row.playTypes.map(item => ({ name: item.name, n: item.n, pct: item.pct })),
    })),
    formationPlayTypes: model.formationPlayTypes,
    directions: model.directions.map(row => ({ name: row.name, n: row.n, runs: row.runs,
      passes: row.passes, isRelative: row.isRelative })),
    driveOutcomes: model.driveOutcomes.map(row => ({ name: row.name, n: row.n, pct: row.pct })),
    byGame: model.byGame.map(row => ({ name: row.name, n: row.n, charted: row.charted,
      yards: row.yards, rush: row.runYards, pass: row.passYards, ypp: row.ypp })),
    productionRows: [model.summary, ...model.byGame, ...model.downs, ...model.quarters,
      ...model.playTypes, ...model.personnel, ...model.backfields, ...model.directions,
      model.pressure.blitz, model.pressure.noBlitz, ...model.zones, ...model.hashes,
      ...model.motions, ...model.downDistance].map(row => ({ name: row.name, n: row.n,
        charted: row.charted, measured: row.measured, held: !!row.held,
        yards: row.yards, runYards: row.runYards, passYards: row.passYards,
        ypp: row.ypp, explosives: row.explosives })),
    /* The blitz cohort, from both ends: the two displayed cards and the
       situational rate's own denominator must be one charted population. */
    blitzCohort: {
      blitz: model.pressure.blitz.n, noBlitz: model.pressure.noBlitz.n,
      blitzCharted: model.pressure.blitz.charted, noBlitzCharted: model.pressure.noBlitz.charted,
      situations: model.downDistance.map(row => ({ name: row.name, n: row.n,
        charted: row.charted, callPct: row.callPct, blitzPct: row.blitzPct })),
    },
    /* Every ranked tendency set, to prove frequency ordering is the charted
       count and that a charted-but-unmeasured look keeps its real count. */
    ranked: {
      formationCalls: model.formationCalls.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      personnel: model.personnel.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      backfields: model.backfields.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      motions: model.motions.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      hashes: model.hashes.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      zones: model.zones.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      directions: model.directions.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
    },
  };
});
/* TOTAL YARDS IS THE SUM OF THE TWO COLUMNS BESIDE IT, on every row.
   `yards` used to sum EVERY defensive snap while rush and pass summed the
   classified subsets, so the three columns were never one cohort: OLL printed
   132 above 72 + 55, and Week 6 printed 28 above 43 — components EXCEEDING
   the total, because five unclassified `Penalty + Loss` snaps carried -15
   between them. The season reconciled only by coincidence
   (-5 + 0 + 10 + 5 + 5 - 15 = 0), which is why nothing caught it. */
/* THE FOUR CANONICAL COHORTS, pinned so a future change cannot quietly merge
   them. Matchup measures what a unit LINED UP in and keeps every charted snap;
   every production measure uses the classified subset (`playType || runPass`).
   Neither is wrong and they must not be forced together — but each surface has
   to name which one it is showing. */
const cohorts = await page.evaluate(() => {
  const games = window.app.storage.seasonStore.data.games || [];
  const all = games.flatMap(g => g.plays || []);
  const classified = p => !!(p.tags.playType || p.tags.runPass);
  const off = p => (p.tags.unit || 'offense') === 'offense';
  const def = p => p.tags.unit === 'defense';
  return {
    charted: all.length,
    offenseCharted: all.filter(off).length,
    offenseClassified: all.filter(p => off(p) && classified(p)).length,
    defenseCharted: all.filter(def).length,
    defenseClassified: all.filter(p => def(p) && classified(p)).length,
  };
});
ok(cohorts.charted === 449 && cohorts.offenseCharted === 201 && cohorts.offenseClassified === 173
  && cohorts.defenseCharted === 174 && cohorts.defenseClassified === 154,
  'the canonical season reconciles to its four cohorts: 201/173 offensive, 174/154 defensive',
  JSON.stringify(cohorts));

const unreconciled = canonical.byGame.filter(row => row.yards !== (row.rush || 0) + (row.pass || 0));
ok(unreconciled.length === 0,
  'every Game-by-game row reconciles: Total yds equals Rush yds plus Pass yds',
  JSON.stringify(unreconciled));
const oll = canonical.byGame.find(row => /OL Lakes/.test(row.name));
ok(oll && oll.yards === 127 && oll.rush === 72 && oll.pass === 55,
  'the canonical Week 5 defensive line is 127 = 72 + 55, penalty-only yardage excluded',
  JSON.stringify(oll));
ok(canonical.byGame.reduce((sum, row) => sum + row.yards, 0) === canonical.yards,
  'the six game rows sum to the season total rather than agreeing by coincidence',
  JSON.stringify({ rows: canonical.byGame.map(r => r.yards), season: canonical.yards }));
ok(canonical.total === 174 && canonical.yards === 497 && canonical.rush === 271 && canonical.pass === 226
  && canonical.ypp === 3.2 && canonical.turnovers === 2 && canonical.explosives === 7,
  'the canonical season owns the approved Defense KPI values', JSON.stringify(canonical));
/* A RATE'S TWO HALVES ARE ONE COHORT. Total yards excludes the unclassified
   penalty snaps, so dividing it by every defensive snap counted each of those
   as a zero-yard play and flattered the defense: 497/174 = 2.9 against the
   honest 497/154 = 3.2. */
ok(canonical.ypp === +(canonical.yards / cohorts.defenseClassified).toFixed(1),
  'Yards allowed / play divides the classified yardage by the classified cohort',
  JSON.stringify({ ypp: canonical.ypp, yards: canonical.yards, classified: cohorts.defenseClassified, charted: canonical.total }));
ok(canonical.ypp !== +(canonical.yards / canonical.total).toFixed(1),
  'the two denominators really do differ here, so that assertion can fail',
  JSON.stringify({ classified: cohorts.defenseClassified, charted: canonical.total }));
/* TWO COHORTS, BOTH NAMED. `charted` is the displayed Snaps, the frequency
   ranking key and every call or blitz percentage; `measured` is the run/pass
   subset every yardage and rate divides by. The first repair collapsed the
   displayed count onto `measured`, which is how a Trade motion charted once
   with no play type printed `0 snaps`. */
ok(canonical.summarySnaps === cohorts.defenseCharted
  && canonical.summaryCharted === cohorts.defenseCharted
  && canonical.summaryMeasured === cohorts.defenseClassified
  && canonical.total === cohorts.defenseCharted && canonical.measured === cohorts.defenseClassified,
  'displayed Snaps is the charted cohort and the measured cohort is named separately',
  JSON.stringify({ snaps: canonical.summarySnaps, charted: canonical.summaryCharted,
    measured: canonical.summaryMeasured, total: canonical.total, modelMeasured: canonical.measured, cohorts }));
/* Every production row divides its own yardage by its own measured cohort.
   The `row.n &&` guard the first pass carried skipped exactly the rows where
   the two cohorts diverge to zero — the reviewer's blind spot — so this walks
   every row and splits the two cases explicitly. */
const measuredRows = canonical.productionRows.filter(row => !row.held && row.measured > 0);
const mixedProductionRows = measuredRows.filter(row =>
  row.ypp !== +(row.yards / row.measured).toFixed(1)
  || row.yards !== (row.runYards || 0) + (row.passYards || 0));
ok(measuredRows.length >= 40 && mixedProductionRows.length === 0,
  'every measured defensive row reconciles Total yards, Rush plus Pass, and Yards/play over its own measured cohort',
  JSON.stringify({ rows: measuredRows.length, mixed: mixedProductionRows }));
/* CHARTED BUT UNMEASURED: the case the first repair got wrong. The row keeps
   its real charted count and reports NO production at all. */
const unmeasuredRows = canonical.productionRows.filter(row => !row.held
  && row.charted > 0 && row.measured === 0);
const badUnmeasured = unmeasuredRows.filter(row => row.n !== row.charted
  || row.yards !== null || row.runYards !== null || row.passYards !== null
  || row.ypp !== null || row.explosives !== null);
ok(unmeasuredRows.length > 0 && badUnmeasured.length === 0,
  'a charted-but-unmeasured row keeps its charted Snaps and reports every production value as absent',
  JSON.stringify({ found: unmeasuredRows, bad: badUnmeasured }));
/* No ranked tendency set may print a numeric zero where the coach charted a
   look. Checked on the model here and on the rendered board below. */
const zeroSnapRows = Object.entries(canonical.ranked).flatMap(([set, rows]) =>
  rows.filter(row => row.charted > 0 && row.n === 0).map(row => `${set}:${row.name}`));
ok(zeroSnapRows.length === 0,
  'no defensive tendency row reports 0 snaps for a look the coach charted',
  JSON.stringify(zeroSnapRows));
/* Frequency ranking is the charted count, descending, in every ranked set. */
const misordered = Object.entries(canonical.ranked)
  .filter(([set]) => ['formationCalls', 'personnel', 'backfields', 'motions'].includes(set))
  .flatMap(([set, rows]) => rows.slice(1)
    .filter((row, i) => (row.charted ?? 0) > (rows[i].charted ?? 0)).map(row => `${set}:${row.name}`));
ok(misordered.length === 0, 'every ranked tendency set orders by charted frequency',
  JSON.stringify(misordered));
/* ONE BLITZ COHORT. The two displayed cards and the situational blitz rate's
   own denominator must count the same charted snaps. */
const blitzSituations = canonical.blitzCohort.situations;
const blitzDenomMismatch = blitzSituations.filter(row => row.n !== row.charted);
ok(canonical.blitzCohort.blitz === canonical.blitzCohort.blitzCharted
  && canonical.blitzCohort.noBlitz === canonical.blitzCohort.noBlitzCharted
  && blitzDenomMismatch.length === 0,
  'the displayed Blitz and No Blitz counts and every situational blitz rate use one charted cohort',
  JSON.stringify({ cohort: canonical.blitzCohort.blitz, noBlitz: canonical.blitzCohort.noBlitz,
    mismatch: blitzDenomMismatch }));
ok(canonical.third.made === 8 && canonical.third.attempts === 43 && canonical.third.rate === 18.6
  && canonical.fourth.made === 9 && canonical.fourth.attempts === 17 && canonical.fourth.rate === 52.9,
  'third- and fourth-down allowed use offensive conversion polarity', JSON.stringify(canonical));
ok(JSON.stringify(canonical.dd) === JSON.stringify([
  '1st & 1-3', '1st & 4-6', '1st & 7+', '2nd & 1-3', '2nd & 4-6', '2nd & 7+',
  '3rd & 1-3', '3rd & 4-6', '3rd & 7+', '4th & 1-3', '4th & 4-6', '4th & 7+',
]) && canonical.emptyDd.includes('1st & 4-6'),
  'all 12 down-and-distance rows remain in football order, including the empty cohort', JSON.stringify(canonical.dd));
ok(JSON.stringify(canonical.calls) === JSON.stringify([
  'Maverick + Jumbo Shift | Cover 3 | A-Gap:4',
  'Maverick | Cover 3:109',
  'Maverick + Jumbo Shift | Cover 3:28',
  'Maverick | Cover 3 | A-Gap:7',
]) && canonical.worstCalls.length === 4,
  'Top and Worst Calls fill all four allocated slots when four calls qualify', JSON.stringify(canonical));
ok(canonical.firstLongCallPct > 0 && canonical.firstLongCallPct <= 100,
  'call performance uses classified snaps while situational call share uses every charted call', JSON.stringify(canonical.calls));
ok(JSON.stringify(canonical.zones.map(value => value.split(':')[0])) === JSON.stringify([
  'Backed Up', 'Open Field', 'Opp 40–20', 'Red Zone', 'Goal Line',
]), 'field zones use five display slots backed by canonical field-position buckets', JSON.stringify(canonical.zones));
ok(canonical.formationCalls.length >= 6
  && canonical.formationCalls.every(row => row.name && row.playTypes.length === 7
    && row.playTypes.every(item => item.pct === Math.round(item.n / row.n * 100)))
  && canonical.formationCalls.some(row => row.name === 'I-Form + Twins'
    && row.playTypes.some(item => item.name === 'Run Inside' && item.n > 0)),
  'Top 6 formations preserves combined offensive looks and shows every canonical play-type share',
  JSON.stringify(canonical.formationCalls));
ok(JSON.stringify(canonical.formationPlayTypes) === JSON.stringify([
  'Run Outside', 'Run Inside', 'RPO', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Screen',
]), 'the formation matrix keeps one fixed seven-play-type schema', JSON.stringify(canonical.formationPlayTypes));
ok(canonical.directions.length === 5
  && canonical.directions.filter(row => !row.isRelative).length === 3
  && canonical.directions.filter(row => row.isRelative).length === 2
  && canonical.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.runs, 0) === 112
  && canonical.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.passes, 0) === 36
  && canonical.directions.some(row => row.name === 'Toward Strength' && row.isRelative)
  && canonical.directions.some(row => row.name === 'Away from Strength' && row.isRelative),
  'Attack direction adds strength-relative rows without double-counting its absolute legend',
  JSON.stringify(canonical.directions));
ok(canonical.driveOutcomes.length === 7,
  'Opponent drive outcomes keeps seven fixed aggregate outcome rows', JSON.stringify(canonical.driveOutcomes));

const invariants = await page.evaluate(() => {
  const Stats = window.app.stats.constructor;
  const base = { id: 'x', __gid: 'g', tags: { unit: 'defense', down: '4', distance: '5', yardage: '5',
    playType: 'Run Inside', result: 'No Good', defFront: 'Maverick + Jumbo Shift', coverage: 'Cover 3', blitz: 'A-Gap' } };
  const reversed = { ...base, id: 'y', tags: { ...base.tags, defFront: 'Jumbo Shift + Maverick' } };
  const conversion = window.app.stats.defenseDashboard([base]);
  const rateRows = [
    { ...base, id: 'r1', tags: { ...base.tags, down: '1', distance: '10', blitz: '' } },
    { ...base, id: 'r2', tags: { ...base.tags, down: '1', distance: '10', blitz: '' } },
    { ...base, id: 'r3', tags: { ...base.tags, down: '1', distance: '10', defFront: 'Eagle', blitz: 'A-Gap' } },
    { ...base, id: 'r4', tags: { ...base.tags, down: '1', distance: '10', defFront: '', coverage: '', blitz: '' } },
  ];
  const rates = window.app.stats.defenseDashboard(rateRows).downDistance.find(row => row.name === '1st & 7+');
  const lookRows = Array.from({ length: 10 }, (_, index) => ({
    ...base, id: `look-${index}`,
    tags: { ...base.tags,
      qbAlignment: 'Under Center', backfield: 'I',
      formation: 'Twins',
      playType: index < 7 ? 'Run Inside' : 'Run Outside' },
  }));
  const look = window.app.stats.defenseDashboard(lookRows).formationCalls[0];
  const directionRows = [
    { ...base, id: 'toward', tags: { ...base.tags, playDir: 'Left', strength: 'Left' } },
    { ...base, id: 'away', tags: { ...base.tags, playDir: 'Right', strength: 'Left' } },
    { ...base, id: 'balanced', tags: { ...base.tags, playDir: 'Left', strength: 'Balanced' } },
  ];
  const directions = window.app.stats.defenseDashboard(directionRows).directions;
  return {
    sameCall: Stats._defenseCallKey(base) === Stats._defenseCallKey(reversed),
    conversionMade: conversion.fourthDownAllowed.made,
    callPct: rates.callPct,
    blitzPct: rates.blitzPct,
    look: { name: look?.name, n: look?.n,
      playTypes: look?.playTypes.map(item => ({ name: item.name, n: item.n, pct: item.pct })) },
    directions: directions.map(row => ({ name: row.name, n: row.n, isRelative: row.isRelative })),
  };
});
ok(invariants.sameCall, 'defensive call identity is independent of multi-select order');
ok(invariants.conversionMade === 1, 'down conversions use line-to-gain ownership even when Result says No Good');
ok(invariants.callPct === 67 && invariants.blitzPct === 33,
  'Call% and Blitz% exclude snaps with no charted defensive structure', JSON.stringify(invariants));
ok(invariants.look.name === 'I-Form + Twins' && invariants.look.n === 10
  && invariants.look.playTypes.find(item => item.name === 'Run Inside')?.n === 7
  && invariants.look.playTypes.find(item => item.name === 'Run Inside')?.pct === 70
  && invariants.look.playTypes.find(item => item.name === 'Run Outside')?.n === 3
  && invariants.look.playTypes.find(item => item.name === 'Run Outside')?.pct === 30,
  'combined offensive looks expose every play-call count and charted share', JSON.stringify(invariants.look));
ok(invariants.directions.find(row => row.name === 'Toward Strength')?.n === 1
  && invariants.directions.find(row => row.name === 'Away from Strength')?.n === 1
  && invariants.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.n, 0) === 3,
  'strength-relative attack direction excludes balanced strength and does not alter absolute direction totals',
  JSON.stringify(invariants.directions));

const exportText = await page.evaluate(async () => {
  let saved = null;
  const prior = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => { saved = blob; };
  document.querySelector('.gi-def-export')?.click();
  const html = saved ? await saved.text() : '';
  window.ffaSaveBlob = prior;
  return html;
});
ok(['Defensive Performance', 'Opponent Offense', 'Scheme', 'Situational Results']
  .every(label => exportText.includes(label)) && !exportText.includes('Defensive Tendency Tells')
  && !exportText.includes('Stop Rate') && exportText.includes('Top 6 formations')
  && exportText.includes('Run Outside') && exportText.includes('Run Inside'),
  'Defense export uses the same four-section dashboard model as the screen');
const fullSeasonFits = [];
for (let index = 0; index < SECTIONS.length; index++) {
  await page.evaluate(label => {
    [...document.querySelectorAll('.gi-def-secnav-item')]
      .find(button => button.textContent.includes(label))?.click();
    document.querySelector('.gi-reports-scroll')?.scrollTo(0, 0);
    document.querySelectorAll('.gi-toast-stack .gi-native-toast').forEach(node => node.remove());
  }, SECTIONS[index].label);
  await sleep(150);
  fullSeasonFits.push(await page.evaluate(() => ({ width: window.innerWidth,
    section: document.querySelector('.gi-def-secnav-item.is-active')?.textContent.trim(),
    escape: Math.max(0, Math.ceil((document.querySelector('.gi-defense-board')?.getBoundingClientRect().bottom || 0) - window.innerHeight)) })));
  await page.screenshot({ path: `${OUT}/1440-section-${index + 1}.png` });
  const fullHeight = await page.evaluate(() => {
    const board = document.querySelector('.gi-defense-board');
    return Math.max(900, Math.ceil((board?.getBoundingClientRect().bottom || 880) + 16));
  });
  await page.setViewport({ width: 1440, height: Math.min(fullHeight, 1600) });
  await sleep(100);
  await page.screenshot({ path: `${OUT}/1440-section-${index + 1}-full.png` });
  await page.setViewport({ width: 1440, height: 900 });
}

await page.setViewport({ width: 1280, height: 900 });
for (let index = 0; index < SECTIONS.length; index++) {
  await page.evaluate(label => {
    [...document.querySelectorAll('.gi-def-secnav-item')]
      .find(button => button.textContent.includes(label))?.click();
    document.querySelector('.gi-reports-scroll')?.scrollTo(0, 0);
  }, SECTIONS[index].label);
  await sleep(100);
  fullSeasonFits.push(await page.evaluate(() => ({ width: window.innerWidth,
    section: document.querySelector('.gi-def-secnav-item.is-active')?.textContent.trim(),
    escape: Math.max(0, Math.ceil((document.querySelector('.gi-defense-board')?.getBoundingClientRect().bottom || 0) - window.innerHeight)) })));
  await page.screenshot({ path: `${OUT}/1280-section-${index + 1}.png` });
}
ok(fullSeasonFits.every(item => item.escape === 0), 'the complete full-season Defense board fits the release viewport',
  JSON.stringify(fullSeasonFits.filter(item => item.escape)));

const after = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(after === before, 'the canonical season file remains byte-identical');
await browser.close();

console.log(`\nCaptures: ${OUT}`);
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);

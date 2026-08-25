// REPORTS PRESENTATION INDEPENDENCE — value-parity harness.
//
// For every migrated tab, renders BOTH the legacy HTML-string method (still
// present, un-deleted, until the whole migration is verified) and the new
// Preact component for the SAME `stats` object, then diffs their normalized
// text content. This is the primary defense against exactly the class of
// regression a screenshot-only review can miss: a value silently rounded,
// clamped, or dropped while the surrounding layout looks identical.
//
// This file becomes part of the permanent gate once the migration is final;
// while migration is in progress it is run standalone: node tools/e2e-reports-view-parity.mjs
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import fs from 'fs';

let pass = 0, fail = 0;
function ok(cond, label, evidence) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); if (evidence !== undefined) console.log('        ' + JSON.stringify(evidence)); }
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e?.message || e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

// A realistic synthetic fixture — the same shape e2e-native-reports.mjs uses
// (offense/defense/special-teams, penalties, real down/distance/formation
// spread) rather than a trivial one, so numeric-formatting drift has real
// values to disagree on.
const seed = await page.evaluate(async () => {
  const s = window.app.storage.seasonStore;
  const play = (id, over) => ({ id, timestamp: { start: id, end: id + 5 }, tags: {
    unit: 'offense', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10',
    formation: 'Trips', quarter: 'Q1', hash: 'Middle', ...over,
  } });
  s.data = s._normalize({
    seasonName: 'Parity Fixture', games: [{ id: 'g1', name: 'Week 1', gameInfo: { opponent: 'Fixture Opp', scoreUs: '21', scoreThem: '14' }, plays: [
      play(1, {}),
      play(2, { playType: 'Deep Pass', result: 'Incomplete', yardage: '0', down: '2', distance: '10' }),
      play(3, { playType: 'Short Pass', result: 'Touchdown', yardage: '18', down: '3', distance: '4', formation: 'Ace' }),
      play(4, { unit: 'defense', playType: '', result: 'Loss', yardage: '-3', defFront: 'Nickel', coverage: 'Cover 3' }),
      play(5, { unit: 'defense', playType: '', result: 'Sack', yardage: '-7', defFront: 'Nickel', coverage: 'Cover 1' }),
      play(6, { playType: 'Run Outside', result: 'Fumble', yardage: '-1', down: '1', distance: '10' }),
    ] }],
    activeGameId: 'g1',
  });
  s.currentSeasonId = 'parity';
  await window.app.storage._loadActiveGame({ renderGames: false });
  await window.app.workspaceShell.show('reports');
  return true;
});
ok(seed === true, 'Synthetic parity fixture seeded and Reports opened');

// --- Overview: legacy _overviewHtml(stats) vs the new OverviewTab component ---
const overview = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const engine = window.app.stats;
  const stats = engine.compute();
  // Block-boundary-aware text extraction, applied identically to both HTML
  // sources. The legacy template-literal HTML happens to carry a newline/
  // indent text node between adjacent block elements (an artifact of its own
  // source formatting); Preact's array-mapped JSX renders siblings with NO
  // text node between them at all. Plain .textContent therefore sees zero
  // characters at a legacy-vs-new KPI-tile boundary, and .innerText instead
  // drags in CSS text-transform/layout — neither compares genuine content.
  // Inserting a space after known BLOCK-level closing tags (never inline
  // ones like <strong>/<span>, which legitimately sit glued to a following
  // "%" or unit) before stripping tags makes tag-adjacency equivalent
  // regardless of which renderer happened to leave whitespace in its source.
  // Parsed through a real (unattached) DOM node so entities decode
  // identically for both sides — the raw legacy STRING never went through
  // an innerHTML round-trip (so a literal "&" stays "&"), while the live
  // node's re-serialized innerHTML always encodes it as "&amp;"; comparing
  // the two raw strings directly would flag that encoding difference as a
  // content mismatch when both represent the same real character.
  const htmlToText = html => {
    const spaced = html.replace(/<\/(div|section|header|p|tr|table|thead|tbody|h[1-6]|li|ul|td|th)>/gi, '</$1> ');
    const scratch = document.createElement('div');
    scratch.innerHTML = spaced;
    return scratch.textContent.replace(/\s+/g, ' ').trim();
  };

  const legacyHtml = screen._overviewHtml(stats);
  const legacyText = htmlToText(legacyHtml);

  // The live route is already rendering the NEW component for 'overview' —
  // read its actual on-screen markup directly, no second render needed.
  const liveNode = document.querySelector('[data-native-report-content] [data-pane="overview"]');
  const newText = htmlToText(liveNode?.innerHTML || '');
  return { legacyText, newText, legacyLen: legacyText.length, newLen: newText.length };
});

// Exact equality would be too strict — the new component intentionally
// changes structure/labels nowhere the legacy one did NOT already differ
// visually from itself run-to-run (none, in this synthetic fixture: both are
// deterministic pure functions of the same `stats`). So we require the two
// text blobs to be IDENTICAL. If a future intentional label change makes
// this fail, that is exactly the signal this harness exists to raise.
ok(overview.legacyText === overview.newText,
  'Overview: legacy HTML-string render and the new Preact component produce byte-identical text content',
  { legacyLen: overview.legacyLen, newLen: overview.newLen,
    firstDiffAt: (() => { const a = overview.legacyText, b = overview.newText; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return { i, legacy: a.slice(Math.max(0, i - 20), i + 40), fresh: b.slice(Math.max(0, i - 20), i + 40) }; })() });

// --- Defense: legacy _defenseHtml() vs the new DefenseTab component ------
//
// Defense preserves its established `.gi-def-*` visual language exactly
// (this is a presentation-ownership migration, not a redesign, unlike
// Offense/Players below) -- so it holds to the same byte-identical text
// standard as Overview, not the looser value-coverage standard.
const defense = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  // The shared fixture's two defense plays (ids 4/5) deliberately carry
  // `playType: ''` for Overview's own purposes above -- an untyped defensive
  // snap. That hits a genuine, disclosed DataTable improvement (a zero-row
  // table renders "No data yet." instead of legacy's headers-with-nothing-
  // under-them), which is not a text-parity question. Give this check its
  // own realistic play types -- what a coach's actual charted defense looks
  // like -- so the byte-identical standard is tested against the real,
  // common case rather than an edge case the shared component intentionally
  // improved on. Mutated only after Overview's check above already ran.
  const game = window.app.storage.seasonStore.data.games[0];
  const p4 = game.plays.find(p => p.id === 4); if (p4) p4.tags.playType = 'Run Inside';
  const p5 = game.plays.find(p => p.id === 5); if (p5) p5.tags.playType = 'Short Pass';
  const htmlToText = html => {
    const spaced = html.replace(/<\/(div|section|header|p|tr|table|thead|tbody|h[1-6]|li|ul|td|th)>/gi, '</$1> ');
    const scratch = document.createElement('div');
    scratch.innerHTML = spaced;
    return scratch.textContent.replace(/\s+/g, ' ').trim();
  };
  const legacyText = htmlToText(screen._defenseHtml());
  screen.selectTab('defense');
  const liveNode = document.querySelector('[data-native-report-content] [data-pane="defense"]');
  const newText = htmlToText(liveNode?.innerHTML || '');
  return { legacyText, newText, legacyLen: legacyText.length, newLen: newText.length };
});
ok(defense.legacyText === defense.newText,
  'Defense: legacy HTML-string render and the new Preact component produce byte-identical text content',
  { legacyLen: defense.legacyLen, newLen: defense.newLen,
    firstDiffAt: (() => { const a = defense.legacyText, b = defense.newText; let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return { i, legacy: a.slice(Math.max(0, i - 20), i + 40), fresh: b.slice(Math.max(0, i - 20), i + 40) }; })() });

// --- Offense / Players: value-coverage against the real season -----------
//
// Offense and Players were a deliberate REDESIGN, not a like-for-like port —
// the density comp explicitly forbids "same old report with new colors", and
// the new components genuinely restructure presentation (a formation table
// instead of _renderShape's ramp bars, PairedBand collapsing a lone survivor
// to full width instead of leaving a dead grid gap, etc.). A byte-identical
// text diff would legitimately fail for reasons that are improvements, not
// regressions, so Overview's exact-match standard does not apply here.
//
// What must still hold, and what this checks: every distinct NUMBER the
// legacy render produces also appears somewhere in the new component's
// render, for the SAME real game. A silently dropped, rounded, or clamped
// value changes the number set; a restructured LAYOUT around the same
// numbers does not. Run against the coach's real six-game mirror (not the
// six-play synthetic fixture above) because most Offense sections need a
// realistic snap count to render at all -- against the synthetic fixture
// almost every section legitimately renders nothing, which would make this
// check vacuous. Skips (not fails) when the mirror isn't present, matching
// e2e-realdata.mjs's own GIQ_REALDATA_OPTIONAL convention.
const MIRROR = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons';
const seasonFiles = fs.existsSync(MIRROR)
  ? fs.readdirSync(MIRROR).map(d => `${MIRROR}/${d}/season.json`).filter(f => fs.existsSync(f)) : [];

if (!seasonFiles.length) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log('  SKIP  Offense/Players value coverage (no real season.json at', MIRROR + ')');
  } else {
    fail++;
    console.log('  FAIL  Offense/Players value coverage did not run -- no season.json at', MIRROR);
    console.log('        This is the designated review machine unless GIQ_REALDATA_OPTIONAL=1 is set.');
  }
} else {
  const season = JSON.parse(fs.readFileSync(seasonFiles[0], 'utf-8'));
  const numberSet = text => new Set((text.match(/-?\d+(\.\d+)?/g) || []).map(n => String(Number(n))));

  const offense = await page.evaluate(async (season) => {
    const s = window.app.storage.seasonStore;
    s.data = s._normalize(season);
    s.currentSeasonId = 'reports-view-parity-real';
    // The richest game -- the one most likely to exercise every section
    // (Big Twelve's 8-call minimum, EPA, the full breakdown tables).
    const richest = s.data.games.reduce((a, b) => (b.plays.length > a.plays.length ? b : a));
    s.data.activeGameId = richest.id;
    await window.app.storage._loadActiveGame({ renderGames: false });
    await window.app.workspaceShell.show('reports');
    window.app.reportsScreen.perspective = 'self';
    window.app.reportsScreen.selectTab('offense');

    const screen = window.app.reportsScreen;
    const engine = window.app.stats;
    const stats = engine.compute();
    // A space at EVERY tag boundary (not just block-level closers, unlike
    // the Overview check above) -- safe here because this function only
    // feeds a number-token regex, never an exact-text comparison, so a
    // stray extra space next to a "%" changes nothing extracted. Without it,
    // two genuinely SEPARATE numbers sitting in adjacent inline elements
    // with no source whitespace between them (a table cell "14" immediately
    // followed by "29" in the next cell) fuse into one false "1429" token.
    const htmlToText = html => {
      const spaced = html.replace(/</g, ' <').replace(/>/g, '> ');
      const scratch = document.createElement('div');
      scratch.innerHTML = spaced;
      return scratch.textContent.replace(/\s+/g, ' ').trim();
    };
    const legacyText = htmlToText(screen._offenseHtml(stats));
    const liveNode = document.querySelector('[data-native-report-content] [data-pane="offense"]');
    const newText = htmlToText(liveNode?.innerHTML || '');
    return { legacyText, newText, gameName: richest.name, playCount: richest.plays.length };
  }, season);

  const legacyNums = numberSet(offense.legacyText);
  const newNums = numberSet(offense.newText);
  // A legacy decimal that's absent as an exact token is accepted ONLY when
  // its ROUNDED form is present -- the new Offense KPIs/tables deliberately
  // round to whole numbers everywhere (matching the Hero's own "89%", "24R/
  // 3P" convention), while legacy's Charts.effectivenessRows/tendency-bar
  // sometimes carries one extra decimal (e.g. "65.4% Run" vs the rounded
  // "65% Run" this design already uses consistently elsewhere on the SAME
  // tab). This is a disclosed precision difference, not dropped information;
  // it is NOT accepted for an integer legacy value with no decimal point,
  // which has no rounding excuse.
  const missing = [...legacyNums].filter(n => {
    if (newNums.has(n)) return false;
    if (n.includes('.') && newNums.has(String(Math.round(Number(n))))) return false;
    return true;
  });
  ok(missing.length === 0,
    `Offense (${offense.gameName}, ${offense.playCount} plays): every number the legacy render produces also appears in the new component (exact, or rounded for a disclosed decimal-precision difference)`,
    { legacyCount: legacyNums.size, newCount: newNums.size, missing: missing.slice(0, 30) });

  const players = await page.evaluate(() => {
    const screen = window.app.reportsScreen;
    const engine = window.app.stats;
    const stats = engine.compute();
    // A space at EVERY tag boundary (not just block-level closers, unlike
    // the Overview check above) -- safe here because this function only
    // feeds a number-token regex, never an exact-text comparison, so a
    // stray extra space next to a "%" changes nothing extracted. Without it,
    // two genuinely SEPARATE numbers sitting in adjacent inline elements
    // with no source whitespace between them (a table cell "14" immediately
    // followed by "29" in the next cell) fuse into one false "1429" token.
    const htmlToText = html => {
      const spaced = html.replace(/</g, ' <').replace(/>/g, '> ');
      const scratch = document.createElement('div');
      scratch.innerHTML = spaced;
      return scratch.textContent.replace(/\s+/g, ' ').trim();
    };
    const legacyText = htmlToText(screen._playersHtml(stats));
    screen.selectTab('players');
    const liveNode = document.querySelector('[data-native-report-content] [data-pane="players"]');
    const newText = htmlToText(liveNode?.innerHTML || '');
    return { legacyText, newText };
  });

  const legacyPlayerNums = numberSet(players.legacyText);
  const newPlayerNums = numberSet(players.newText);
  const missingPlayers = [...legacyPlayerNums].filter(n => !newPlayerNums.has(n));
  ok(missingPlayers.length === 0,
    'Players: every number the legacy render produces also appears in the new component',
    { legacyCount: legacyPlayerNums.size, newCount: newPlayerNums.size, missing: missingPlayers.slice(0, 30) });
}

ok(errors.length === 0, 'Zero page errors across the parity check', errors);

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);

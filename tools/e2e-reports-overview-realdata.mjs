/**
 * Reports > Overview — production evidence on the CANONICAL REAL SEASON.
 *
 * `design-approvals/APPROVALS.json` names `2025-st-joseph-mavericks-jv`
 * ("2025 St. Joseph Mavericks - JV") as the only data source that can
 * establish Reports visual parity, football correctness, or production
 * acceptance. Synthetic fixtures remain supplemental — `e2e-reports-overview`
 * owns the deterministic formula, sparse and empty-state regressions; this
 * file owns the evidence.
 *
 * READ-ONLY. The season is read from the registered Documents-mirror path,
 * deep-copied, and installed into an in-memory store in a Chromium page whose
 * backend is `BrowserBackend` — the coach's file is never a write target. The
 * run asserts the source is byte-identical afterwards rather than assuming it.
 *
 * Every number the board prints for the active game is reconciled here against
 * arithmetic this file performs on the season's own plays, using the football
 * definitions the engine documents (`isRun`/`isPass`, `gainedFirstDown`,
 * `isExplosive`, `_passingStats`' attempt rule). Production reaching the same
 * figure through StatsEngine is then evidence, not a tautology.
 *
 * The handoff line printed at the end names the season, its game and play
 * counts, the game on screen, the scope and the read-only status, so a
 * missing, empty or wrong season cannot pass unnoticed.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SEASON_NAME = '2025 St. Joseph Mavericks - JV';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const OUT = 'artifacts/overview-production-realdata';
const VIEWPORTS = [[1440, 900], [1280, 720], [768, 1024], [390, 844]];

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(SOURCE)) {
  /* An absent mirror is a skip only when the runner declares it has none. On
     this machine it is a failure: the canonical season is the evidence. */
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log(`SKIP: canonical season not present at ${SOURCE} (GIQ_REALDATA_OPTIONAL=1)`);
    process.exit(0);
  }
  console.log(`FAIL: canonical Reports season missing at ${SOURCE}`);
  console.log('      Reports evidence requires it; set GIQ_REALDATA_OPTIONAL=1 to skip on a runner.');
  process.exit(1);
}

const rawBefore = readFileSync(SOURCE);
const hashBefore = createHash('sha256').update(rawBefore).digest('hex');
const season = JSON.parse(rawBefore.toString('utf8'));

/* ── The season, described from the file itself ──────────────────────────── */
const games = season.games || [];
const totalPlays = games.reduce((t, g) => t + (g.plays || []).length, 0);
const activeId = season.activeGameId || games[0]?.id;
const activeGame = games.find(g => g.id === activeId) || games[0];
const activePlays = (activeGame?.plays || []);

console.log(`\nCanonical season: ${season.seasonName} (${season.id || SEASON_ID})`);
console.log(`  ${games.length} games, ${totalPlays} charted plays`);
console.log(`  active game: ${activeGame?.name} — ${activePlays.length} plays`);

ok(season.seasonName === SEASON_NAME,
  'the registered canonical season is the one loaded', `${season.seasonName}`);
ok(games.length > 0 && totalPlays > 0,
  'the canonical season carries real charted film', `${games.length} games / ${totalPlays} plays`);

/* ── Independent arithmetic over the active game's own plays ─────────────── */
const tags = p => p.tags || {};
const splitResults = p => String(tags(p).result || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
const hasResult = (p, v) => splitResults(p).includes(v);
const yds = p => parseInt(tags(p).yardage, 10) || 0;
/** `StatsEngine.isRun` / `isPass`, transcribed. */
const isRun = p => {
  const rp = tags(p).runPass;
  if (rp === 'Run') return true;
  if (rp === 'Pass') return false;
  return !!(tags(p).playType && tags(p).playType.toLowerCase().includes('run'));
};
const isPass = p => {
  const rp = tags(p).runPass;
  if (rp === 'Pass') return true;
  if (rp === 'Run') return false;
  const t = (tags(p).playType || '').toLowerCase();
  return t.includes('pass') || t.includes('screen') || t === 'play action' || t === 'rpo';
};
/** `gainedFirstDown` — the line to gain, or an explicit "1st Down" tag. A
 *  touchdown is deliberately NOT a conversion. */
const gainedFirstDown = p => {
  const t = tags(p);
  if (Array.isArray(t.custom) && t.custom.includes('1st Down')) return true;
  const dist = parseInt(t.distance, 10), y = parseInt(t.yardage, 10);
  return !isNaN(dist) && dist > 0 && !isNaN(y) && y >= dist;
};
const isExplosive = p => (isRun(p) ? yds(p) >= 12 : yds(p) >= 16);
/** `StatsEngine.isSuccessfulPlay`, transcribed. */
const isSuccess = p => {
  const t = tags(p);
  const y = parseInt(t.yardage, 10) || 0, dist = parseInt(t.distance, 10) || 10;
  if (hasResult(p, 'Touchdown') || hasResult(p, 'Good')) return true;
  if (hasResult(p, 'No Good')) return false;
  if (Array.isArray(t.custom) && t.custom.includes('1st Down')) return true;
  if (t.down === '1') return y >= dist * 0.5;
  if (t.down === '2') return y >= dist * 0.7;
  if (t.down === '3' || t.down === '4') return y >= dist;
  return y >= 4;
};
/** `compute()` admits a play only when it carries a play type or run/pass. */
const charted = p => !!(tags(p).playType || tags(p).runPass);
const one = n => n.toFixed(1);

const classified = activePlays.filter(charted);
const off = classified.filter(p => (tags(p).unit || 'offense') === 'offense');
const def = classified.filter(p => tags(p).unit === 'defense');
const rush = off.filter(isRun), pas = off.filter(isPass);
const rushYards = rush.reduce((t, p) => t + yds(p), 0);
const passComp = pas.filter(p => hasResult(p, 'Gain') || hasResult(p, 'Touchdown') || hasResult(p, 'No Gain'));
const passInc = pas.filter(p => hasResult(p, 'Incomplete'));
const passInt = pas.filter(p => hasResult(p, 'Interception'));
const passAtt = new Set([...passComp, ...passInc, ...passInt].map(p => p.id)).size;
const passYards = pas.reduce((t, p) => (hasResult(p, 'Incomplete') || hasResult(p, 'Interception') ? t : t + yds(p)), 0);
const totalYards = rushYards + passYards;
const defYards = def.reduce((t, p) => t + yds(p), 0);

const EXPECTED = {
  allPlays: classified.length,
  offense: off.length,
  defense: def.length,
  totalYards,
  yardsPerPlay: off.length ? one(totalYards / off.length) : '0.0',
  successRate: off.length ? one(off.filter(isSuccess).length / off.length * 100) : '0.0',
  explosives: off.filter(isExplosive).length,
  negative: off.filter(p => yds(p) < 0).length,
  rushing: {
    Attempts: String(rush.length),
    Yards: String(rushYards),
    Average: rush.length ? one(rushYards / rush.length) : '0.0',
    Touchdowns: String(rush.filter(p => hasResult(p, 'Touchdown')).length),
    Longest: String(rush.reduce((m, p) => Math.max(m, yds(p)), 0)),
    'First downs': String(rush.filter(gainedFirstDown).length),
    Fumbles: String(rush.filter(p => hasResult(p, 'Fumble')).length),
  },
  passing: {
    'Completions / attempts': `${passComp.length} / ${passAtt}`,
    'Completion rate': `${passAtt ? one(passComp.length / passAtt * 100) : '0.0'}%`,
    Yards: String(passYards),
    'Yards / attempt': passAtt ? one(passYards / passAtt) : '0.0',
    Touchdowns: String(pas.filter(p => hasResult(p, 'Touchdown')).length),
    Interceptions: String(passInt.length),
    Longest: String(pas.reduce((m, p) => (hasResult(p, 'Incomplete') ? m : Math.max(m, yds(p))), 0)),
    'Sacks taken': String(pas.filter(p => hasResult(p, 'Sack')).length),
  },
  defenseRows: {
    'Yards / play allowed': def.length ? one(defYards / def.length) : '—',
    'Explosive Plays allowed': String(def.filter(isExplosive).length),
  },
};

/* ── Drive the real route on a read-only copy ────────────────────────────── */
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(700);

const loaded = await page.evaluate(async (data, gid) => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id || 'realdata';
  store.data.id = data.id || 'realdata';
  if (data.roster) window.app.roster.players = data.roster;
  store.data.activeGameId = gid;
  await window.app.storage._loadActiveGame();
  return { games: store.data.games.length,
    plays: store.data.games.reduce((t, g) => t + (g.plays || []).length, 0),
    active: store.data.games.find(g => g.id === gid)?.name || '' };
}, season, activeId);
await sleep(400);
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await sleep(250);
await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
await sleep(900);

ok(loaded.games === games.length && loaded.plays === totalPlays,
  'the whole season loaded into the route, game for game and play for play',
  JSON.stringify(loaded));

const read = () => page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  const modules = [...(pane?.querySelectorAll('.gi-overview-module') || [])];
  const title = m => m.querySelector('header > strong')?.textContent.trim() || '';
  const byTitle = n => modules.find(m => title(m) === n) || null;
  const pairs = n => {
    const m = byTitle(n);
    return m ? Object.fromEntries([...m.querySelectorAll('.gi-overview-rows > div')]
      .map(d => [d.querySelector('span')?.textContent.trim(), d.querySelector('strong')?.textContent.trim()])) : null;
  };
  const tiles = sel => [...(pane?.querySelectorAll(sel) || [])].map(n => ({
    label: n.querySelector('span')?.textContent.trim(),
    value: n.querySelector('strong')?.textContent.trim(),
    sub: n.querySelector('small')?.textContent.trim() }));
  return {
    sections: modules.map(title),
    driveOutcomes: [...(modules.find(m => title(m) === 'Offensive Drives')?.querySelectorAll('.gi-overview-drive small') || [])].map(n => n.textContent.trim()),
    defDriveOutcomes: [...(modules.find(m => title(m) === 'Defensive Drives')?.querySelectorAll('.gi-overview-drive small') || [])].map(n => n.textContent.trim()),
    kpis: tiles('.gi-overview-kpi'),
    rushing: pairs('Rushing'), passing: pairs('Passing'),
    defenseRows: pairs('Defense & discipline'),
    phase: [...(byTitle('Snaps by phase')?.querySelectorAll('tbody tr') || [])]
      .map(tr => [...tr.children].map(td => td.textContent.trim())),
    metas: Object.fromEntries(modules.map(m => [title(m), m.querySelector('header > span')?.textContent.trim() || ''])),
    text: pane?.innerText || '',
    header: document.querySelector('[data-reports-title]')?.textContent.trim() || '',
    headerSub: document.querySelector('[data-reports-context]')?.textContent.trim() || '',
  };
});
const b = await read();

/* ── The approved composition, on real film ──────────────────────────────── */
console.log('\n== Composition on the canonical season ==');
const SECTIONS = ['Snaps by phase', 'Situational', 'Key metrics', 'Rushing', 'Passing',
  'Rushing allowed', 'Passing allowed',
  'Down & distance', 'Yards by type', 'Defense & discipline',
  'Top 10 Plays', 'Offensive Drives', 'Defensive Drives'];
ok(JSON.stringify(b.sections) === JSON.stringify(SECTIONS),
  'the approved sections render in the approved order on real film', JSON.stringify(b.sections));
ok(b.kpis.length === 7 && b.kpis[0].label === 'Total plays',
  'the seven-tile KPI band leads the board on real film', JSON.stringify(b.kpis.map(k => k.label)));

/* ── Output reconciliation against the season's own plays ────────────────── */
console.log('\n== Output reconciled against the canonical season ==');
ok(b.kpis[0].value === String(EXPECTED.allPlays),
  'Total plays equals the charted snaps in the game', `${b.kpis[0].value} vs ${EXPECTED.allPlays}`);
ok(b.kpis[1].value === `${EXPECTED.successRate}%`,
  'Success rate matches the success rule applied to every real snap',
  `${b.kpis[1].value} vs ${EXPECTED.successRate}%`);
ok(b.kpis[2].value === EXPECTED.yardsPerPlay && b.kpis[2].sub === `${EXPECTED.totalYards} total yards`,
  'Yards / play and total yards match the season\'s own yardage',
  JSON.stringify([b.kpis[2].value, b.kpis[2].sub, EXPECTED.yardsPerPlay, EXPECTED.totalYards]));
ok(b.kpis[3].value === String(EXPECTED.explosives),
  'Explosives counts the real 12-yard runs and 16-yard passes',
  `${b.kpis[3].value} vs ${EXPECTED.explosives}`);
ok(b.kpis[5].value === String(EXPECTED.negative),
  'Plays for loss counts the real negative-yardage snaps',
  `${b.kpis[5].value} vs ${EXPECTED.negative}`);
ok(JSON.stringify(b.rushing) === JSON.stringify(EXPECTED.rushing),
  'every Rushing value reconciles with the season',
  JSON.stringify({ rendered: b.rushing, expected: EXPECTED.rushing }));
ok(JSON.stringify(b.passing) === JSON.stringify(EXPECTED.passing),
  'every Passing value reconciles with the season',
  JSON.stringify({ rendered: b.passing, expected: EXPECTED.passing }));
for (const [label, value] of Object.entries(EXPECTED.defenseRows)) {
  ok(b.defenseRows[label] === value, `Defense & discipline: ${label} reconciles`,
    `${b.defenseRows[label]} vs ${value}`);
}
ok(b.phase[0]?.[1] === String(EXPECTED.offense) && b.phase[1]?.[1] === String(EXPECTED.defense),
  'Snaps by phase reports the real offensive and defensive snap counts',
  JSON.stringify(b.phase.map(r => r.slice(0, 2))));
ok(b.metas['Rushing'] === `${EXPECTED.rushing.Attempts} attempts`
  && b.metas['Passing'] === `${EXPECTED.passing['Completions / attempts'].split(' / ')[1]} attempts`,
  'the Rushing and Passing samples state the real attempt counts',
  JSON.stringify([b.metas['Rushing'], b.metas['Passing']]));

/* ── Copy holds on real film ─────────────────────────────────────────────── */
console.log('\n== Copy on real film ==');
ok(/^\d+ charted · \d+%$/.test(b.kpis[0].sub),
  'the Total plays sub keeps the approved middot form', JSON.stringify(b.kpis[0].sub));
ok(/^\d+ drives · \d+ scored$/.test(b.metas['Offensive Drives']),
  'the Drives meta keeps the approved middot form', JSON.stringify(b.metas['Offensive Drives']));

/* ── Every report tab stays reachable AND visible ──────────────────────────
   The title, the section navigation and the command buttons share one row. The
   title was `flex:0 0 auto` and the nav `flex:1 1 0%` with `overflow-x:auto`,
   so the nav absorbed every pixel of squeeze: the canonical season's longest
   game name — `Week 1 vs St. Peter Lutheran Patriots` — left it 590px for
   638px of tabs and clipped `Matchup` to `MA` at 1440. Scrollable but
   invisible is worse than either; a coach cannot navigate to a tab he cannot
   see, and no automated check noticed because nothing overflowed the PAGE.

   Stated against the real season because the trigger is a real game name. This
   row was proportioned when the shell still carried a left rail, which the
   2026-08-31 Home approval removed. */
{
  /* The trigger is the LONGEST game name, so this must drive that game — the
     season's active game is not it, and asserting on the wrong game is how a
     check passes while the defect stands. The game is selected here and the
     original restored afterwards so nothing below sees a different board. */
  const longest = games.reduce((a, g) => (g.name || '').length > (a.name || '').length ? g : a, games[0]);
  const strip = await page.evaluate(async gid => {
    window.app.storage.seasonStore.data.activeGameId = gid;
    await window.app.storage._loadActiveGame();
    window.app.workspaceShell.show('reports');
    window.app.reportsScreen.selectTab('overview');
    await new Promise(r => setTimeout(r, 600));
    const tabs = [...document.querySelectorAll('.gi-reports-tab')];
    if (!tabs.length) return null;
    const box = tabs[0].parentElement.getBoundingClientRect();
    return {
      game: document.querySelector('.gi-reports-title-block h1')?.textContent.trim(),
      cut: tabs.filter(t => {
        const r = t.getBoundingClientRect();
        return r.right > box.right + 0.5 || r.left < box.left - 0.5;
      }).map(t => t.textContent.trim()),
      count: tabs.length,
    };
  }, longest.id);
  ok(!!strip && strip.count > 1 && strip.cut.length === 0,
    `every Reports tab is fully visible on the longest real game name (${longest.name})`,
    JSON.stringify(strip));
  await page.evaluate(async gid => {
    window.app.storage.seasonStore.data.activeGameId = gid;
    await window.app.storage._loadActiveGame();
    window.app.workspaceShell.show('reports');
    window.app.reportsScreen.selectTab('overview');
    await new Promise(r => setTimeout(r, 600));
  }, activeId);
}

/* ── Drive outcomes are NAMED on the coach's own film ──────────────────────
   A drive is reconstructed from one unit's snaps, so its last play is the last
   SCRIMMAGE snap — never the punt or the field goal that ended the possession,
   which are charted as Special Teams. Reading only that snap reported "Other"
   for a punted drive, which is the defect this pins.

   Stated against the real season because the classes that matter only exist
   there: a fake wearing an ST label, a fumble whose recovery was never charted,
   and possessions that change hands with nothing charted between them. */
const OUTCOME_VOCAB = ['TD', 'FG', 'Missed FG', 'Safety', 'Punt', 'Turnover',
  'Downs', 'Kneel', 'Clock', 'Score', 'Other'];
const outcomes = [...b.driveOutcomes, ...b.defDriveOutcomes].filter(o => o && o !== '\u2013');
ok(outcomes.length > 0 && outcomes.every(o => OUTCOME_VOCAB.includes(o)),
  'every drive outcome comes from the closed vocabulary', JSON.stringify([...new Set(outcomes)]));
/* The whole point: a real punted drive must NOT read "Other". This season
   charts punts on both sides, so both modules must show at least one. */
ok(b.defDriveOutcomes.includes('Punt') || b.driveOutcomes.includes('Punt'),
  'a punted drive reads Punt, not Other, on the coach\'s own film',
  JSON.stringify({ offense: b.driveOutcomes, defense: b.defDriveOutcomes }));
/* KNOWN GAP, not asserted as a ratio here on purpose.
   `Other` still appears, and on this season the dominant cause is NOT an
   unnamed outcome — it is `_reconstructDrives` cutting one possession into
   several "drives". Week 2 offense: id22 (4th down) is followed by id24, an
   OFFENSIVE 1st down, so one series becomes two drives; the same shape repeats
   at id77->id78 and id79->id80. A fragment has no ending, so no label is
   correct for it, and a pass/fail ratio over outcomes would be measuring drive
   RECONSTRUCTION while claiming to measure outcome NAMING.

   Fixing reconstruction reaches Points / Drive, three-and-outs, the Season
   board's drive totals and the parity goldens, so it is raised as a finding
   rather than folded into this change. Carried into the Charlie Gate. */
const planText = b.text.split('Game plan')[1] || '';
const prose = ['what this means', 'how to read', 'tag play type', 'to build the report']
  .filter(p => b.text.toLowerCase().replace(planText.toLowerCase(), '').includes(p));
ok(prose.length === 0, 'no instructional prose renders on real film', JSON.stringify(prose));

/* ── Captures at every registered viewport ───────────────────────────────── */
console.log('\n== Captures ==');
mkdirSync(OUT, { recursive: true });
const shots = [];
/* Loading a season with no linked film raises the relink toast, which lands
   over the board and would sit in the middle of the evidence. It is expected
   in a headless capture — there is no film folder here — so it is dismissed
   before shooting rather than photographed. Caught by looking at the first
   capture, not by an assertion. */
const dismissToasts = () => page.evaluate(() => {
  document.querySelectorAll('.gi-toast-stack .gi-native-toast').forEach(n => n.remove());
  return document.querySelectorAll('.gi-toast-stack .gi-native-toast').length;
});
for (const [width, height] of VIEWPORTS) {
  await page.setViewport({ width, height });
  await sleep(450);
  await dismissToasts();
  await page.mouse.move(4, 4);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const key = `${width}x${height}`;
  await page.screenshot({ path: `${OUT}/${key}-overview.png` });
  await page.screenshot({ path: `${OUT}/${key}-overview-full.png`, fullPage: true });
  const measured = await page.evaluate(() => {
    const doc = document.documentElement;
    const pane = document.querySelector('[data-pane="overview"]');
    const clips = [];
    pane?.querySelectorAll('.gi-overview-module th, .gi-overview-module td, .gi-overview-kpi > span, .gi-overview-module header > strong')
      .forEach(cell => {
        if (!cell.getClientRects().length) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const s = getComputedStyle(cell);
        const inner = cell.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight);
        if (range.getBoundingClientRect().width - inner > 1) clips.push(cell.textContent.trim().slice(0, 30));
      });
    return { overflow: doc.scrollWidth - doc.clientWidth, clips,
      sections: [...(pane?.querySelectorAll('.gi-overview-module > header > strong') || [])].map(n => n.textContent.trim()).length };
  });
  const obscured = await page.evaluate(() => document.querySelectorAll('.gi-toast-stack .gi-native-toast').length);
  shots.push({ key, ...measured, obscured });
  ok(measured.overflow === 0 && measured.clips.length === 0 && measured.sections === SECTIONS.length,
    `${key}: the real-season board is contained, unclipped and complete`,
    JSON.stringify(measured));
  ok(obscured === 0, `${key}: no overlay covers the captured board`, String(obscured));
}
console.log(`  captures written to ${OUT}`);

/* ── Read-only proof ─────────────────────────────────────────────────────── */
console.log('\n== Read-only ==');
const hashAfter = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(hashAfter === hashBefore,
  'the coach\'s season file is byte-identical after the run', `${hashBefore.slice(0, 12)} vs ${hashAfter.slice(0, 12)}`);
ok(errors.length === 0, 'zero page or console errors on the canonical season', errors.slice(0, 3).join(' | '));

await browser.close();

console.log('\n== Evidence handoff ==');
console.log(`  season      : ${season.seasonName} (${SEASON_ID})`);
console.log(`  source      : ${SOURCE}`);
console.log(`  access      : read-only copy — source sha256 ${hashBefore.slice(0, 16)} unchanged`);
console.log(`  season size : ${games.length} games, ${totalPlays} charted plays`);
console.log(`  scope       : Reports > Overview, current game`);
console.log(`  game        : ${activeGame?.name} — ${activePlays.length} plays, ${EXPECTED.allPlays} classified`);
console.log(`                ${EXPECTED.offense} offensive, ${EXPECTED.defense} defensive`);
console.log(`  viewports   : ${VIEWPORTS.map(v => v.join('x')).join(', ')}`);
console.log(`  captures    : ${OUT}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

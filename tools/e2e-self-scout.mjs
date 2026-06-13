/* E2E harness — defensive self-scout in the stats dashboard. Covers the paths
   the other harnesses never open:
     1. The Self-Scout TAB renders the defensive section (the reported "self
        scout doesn't mention defense" bug — it only ever showed in a separate
        overlay before).
     2. Defensive plays tagged with Front/Coverage/Blitz but NO offensive
        playType still count (the _currentPlays() gating bug).
     3. The Defense TAB also shows the scheme-tells section.
     4. generateDefensiveSelfScout runs once per dashboard render, not twice.

   Run after build:  bash build.sh && node tools/e2e-self-scout.mjs */
import puppeteer from 'puppeteer';

const URL = 'file:///home/user/Charlie/football-film-analyzer.html';
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== Setup: team + demo + open a game (full app init) ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);

// Install an in-page play builder + a controlled play set.
await page.evaluate(() => {
  let idc = 1000;
  window.__mk = (over) => ({
    id: idc++, timestamp: { start: 0, end: 5 }, notes: '',
    tags: Object.assign({
      down: '', distance: '', quarter: '', fieldSide: 'own', yardLine: '',
      formation: '', personnel: '', motion: '', runPass: '', playType: '',
      result: '', yardage: '', hash: '', playDir: '', defFront: '', coverage: '',
      blitz: '', unit: 'offense', stType: '', players: {}, grades: {}, custom: []
    }, over)
  });
});

console.log('\n== 1. Gating fix: defensive scheme plays with NO playType still count ==');
let r = await page.evaluate(() => {
  const mk = window.__mk;
  // 6 defensive plays, Front + Coverage tagged, but no offensive playType and
  // no runPass — under the old _currentPlays() gate these were ALL dropped.
  const plays = [];
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'defense', down: '3', distance: '7',
      defFront: i % 2 ? 'Nickel' : '4-3', coverage: 'Cover 3',
      result: i % 3 === 0 ? 'Sack' : 'Incomplete', yardage: i % 3 === 0 ? '-5' : '0' }));
  }
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  const ds = window.app.stats.generateDefensiveSelfScout();
  return { insufficient: !!ds.insufficient, totalPlays: ds.totalPlays, schemePlays: ds.schemePlays };
});
ok(r.insufficient === false, 'no-playType defensive plays are NOT dropped (gating fixed)', JSON.stringify(r));
ok(r.totalPlays === 6, 'all 6 scheme plays counted', JSON.stringify(r));

console.log('\n== 2. Self-Scout TAB renders the defensive section ==');
r = await page.evaluate(() => {
  window.app.stats.showDashboard();
  const pane = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  return {
    hasDefSection: !!pane?.querySelector('.ss-def-section'),
    hasDefScoutHeading: /Defensive Self-Scout/.test(pane?.innerHTML || '')
  };
});
ok(r.hasDefSection, 'Self-Scout pane contains .ss-def-section', JSON.stringify(r));
ok(r.hasDefScoutHeading, 'Self-Scout pane shows the "Defensive Self-Scout" heading', JSON.stringify(r));

console.log('\n== 3. Mixed offense+defense: both tabs show the defensive scheme section ==');
r = await page.evaluate(() => {
  const mk = window.__mk;
  const plays = [];
  // Offensive plays so the offensive self-scout (ssReport) is non-null.
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'offense', down: '1', distance: '10', formation: 'Shotgun',
      playType: i % 2 ? 'Short Pass' : 'Run Inside', runPass: i % 2 ? 'Pass' : 'Run',
      result: 'Gain', yardage: '6' }));
  }
  // Defensive plays WITH runPass so compute()'s defPlays (and hasData) include
  // them — that drives the Defense tab's scheme section.
  for (let i = 0; i < 6; i++) {
    plays.push(mk({ unit: 'defense', down: '2', distance: '8',
      defFront: 'Nickel', coverage: 'Cover 2', blitz: i % 2 ? 'Edge' : '',
      runPass: 'Pass', result: i % 2 ? 'Sack' : 'Incomplete', yardage: i % 2 ? '-6' : '0' }));
  }
  window.app.tagger.plays = plays;
  window.app.stats.showDashboard();
  const ss = document.querySelector('#statsDashboard [data-pane="selfscout"]');
  const def = document.querySelector('#statsDashboard [data-pane="defense"]');
  return {
    selfScoutHasDef: !!ss?.querySelector('.ss-def-section'),
    defenseHasScheme: !!def?.querySelector('.ss-def-section'),
    defenseHasHavoc: /Havoc/.test(def?.innerHTML || '')
  };
});
ok(r.selfScoutHasDef, 'Self-Scout tab shows defensive section with offense present', JSON.stringify(r));
ok(r.defenseHasScheme, 'Defense tab shows the scheme-tells section', JSON.stringify(r));
ok(r.defenseHasHavoc, 'Defense tab still shows the base defensive analytics', JSON.stringify(r));

console.log('\n== 4. generateDefensiveSelfScout computed ONCE per render (dedup) ==');
r = await page.evaluate(() => {
  const eng = window.app.stats;
  const orig = eng.generateDefensiveSelfScout.bind(eng);
  let count = 0;
  eng.generateDefensiveSelfScout = function (...a) { count++; return orig(...a); };
  eng.showDashboard();
  eng.generateDefensiveSelfScout = orig;   // restore
  return { count };
});
ok(r.count === 1, 'one defensive-self-scout computation per dashboard render', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);

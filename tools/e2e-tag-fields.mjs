import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const file = TEST_APP_URL;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(file, { waitUntil: 'domcontentloaded' });
await new Promise(r => setTimeout(r, 1500));

const result = await page.evaluate(() => {
  const app = window.app;
  const tagger = app.tagger;
  const mk = (id, tags) => ({ id, timestamp: { start: id, end: id + 3 }, tags: { custom: [], players: {}, grades: {}, ...tags }, notes: '' });

  // Defensive plays: base front + Jumbo Shift combos
  const plays = [
    mk(1, { unit: 'defense', down: '1', distance: '10', defFront: 'Maverick + Jumbo Shift', coverage: 'Cover 3', playType: 'Run Inside', runPass: 'Run', result: 'Loss', yardage: '-3' }),
    mk(2, { unit: 'defense', down: '2', distance: '13', defFront: 'Maverick', coverage: 'Cover 3', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '5' }),
    mk(3, { unit: 'defense', down: '3', distance: '8', defFront: 'Eagle + Jumbo Shift', coverage: 'Man', playType: 'Deep Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0' }),
    // Offense plays with motion + direction
    mk(4, { unit: 'offense', down: '1', distance: '10', formation: 'Wing-T', motion: 'Jet', playDir: 'Left', playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '7' }),
    mk(5, { unit: 'offense', down: '2', distance: '3', formation: 'Wing-T + Unbalanced', motion: 'Jet', playDir: 'Left', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', custom: ['1st Down'] }),
    mk(6, { unit: 'offense', down: '1', distance: '10', formation: 'Flexbone', motion: '', playDir: 'Right', playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '12' }),
  ];
  tagger.plays = plays;
  const stats = app.stats.compute(plays);

  // Front attribution: Jumbo Shift should be its own row with 2 plays
  const fronts = stats.defensive.fronts;
  const jumbo = fronts.find(f => f.name === 'Jumbo Shift');
  const maverick = fronts.find(f => f.name === 'Maverick');

  // Combos: "Maverick + Cover 3" should count plays 1+2; "Jumbo Shift + Cover 3" play 1
  const combos = stats.frontCoverageCombos.list;

  // Cut filter for Jumbo Shift should find plays 1 and 3
  const filter = app.stats._buildCutFilter('defFront', 'Jumbo Shift');
  const jumboCut = plays.filter(filter).map(p => p.id);

  // Direction/motion stats
  const dm = stats.dirMotion;

  // New chips present in form
  const frontChips = [...document.querySelectorAll('#tagDefFront .pick')].map(b => b.dataset.value);
  const formChips = [...document.querySelectorAll('#tagFormation .pick')].map(b => b.dataset.value);
  const motionChips = [...document.querySelectorAll('#tagMotion .pick')].map(b => b.dataset.value);
  const dirChips = [...document.querySelectorAll('#tagPlayDir .pick')].map(b => b.dataset.value);
  const frontIsMulti = document.getElementById('tagDefFront').classList.contains('multi');

  // Multi-select round trip: load play 1 into the form, check both chips active, save back
  tagger.selectPlay(1);
  const activeFronts = [...document.querySelectorAll('#tagDefFront .pick.active')].map(b => b.dataset.value);
  const fieldValue = tagger.tagFields.defFront.value;

  return {
    jumboCount: jumbo?.count, maverickCount: maverick?.count,
    comboNames: combos.map(c => `${c.name}:${c.count}`),
    jumboCut,
    dirLeft: dm.dirList.find(d => d.name === 'Left')?.count,
    motionJet: dm.motionList.find(m => m.name === 'Jet')?.count,
    noMotion: dm.noMotion.count,
    hasMotionData: dm.hasMotionData,
    frontChips, formChips, motionChips, dirChips, frontIsMulti,
    activeFronts, fieldValue,
    takeawayTexts: [...(stats.takeaways.fix || [])].map(t => t.text),
  };
});

const checks = [
  ['Jumbo Shift is its own front row (2 plays)', result.jumboCount === 2],
  ['Maverick counted on both its plays', result.maverickCount === 2],
  ['Maverick + Cover 3 combo split from multi-front (2 plays)', result.comboNames.includes('Maverick + Cover 3:2')],
  ['Cut filter finds both Jumbo Shift plays', JSON.stringify(result.jumboCut) === '[1,3]'],
  ['Direction: 2 plays went Left', result.dirLeft === 2],
  ['Motion: 2 Jet plays', result.motionJet === 2],
  ['No-motion bucket counts remaining offense plays', result.noMotion === 1],
  ['3-3-5 chip present', result.frontChips.includes('3-3-5')],
  ['Jumbo Shift chip present', result.frontChips.includes('Jumbo Shift')],
  ['Front group is multi-select', result.frontIsMulti],
  // Coach-approved structural looks are standard Formation chips. Legacy plays
  // lacking a backfield property may still use the historical migration seam.
  ['I-Form/Split Back and core structural looks are standard formation chips', ['I-Form','Split Back','Power-I','Ace','Victory','Wing-T','Flexbone','Double Wing','Bunch','Unbalanced'].every(f => result.formChips.includes(f))],
  ['Motion chips Jet/Orbit/Shift/Trade', ['Jet','Orbit','Shift','Trade'].every(m => result.motionChips.includes(m))],
  ['Direction chips L/M/R', ['Left','Middle','Right'].every(d => result.dirChips.includes(d))],
  ['Form shows both front chips active for multi play', JSON.stringify([...result.activeFronts].sort()) === JSON.stringify(['Jumbo Shift','Maverick'])],
  ['ChipField value round-trips the multi string', result.fieldValue === 'Maverick + Jumbo Shift'],
];

let pass = 0, fail = 0;
for (const [label, ok] of checks) {
  console.log(ok ? `  PASS  ${label}` : `  FAIL  ${label}`);
  if (ok) pass++; else fail++;
}
if (fail) console.log('\nDebug:', JSON.stringify(result, null, 1));
if (errors.length) { console.log('\n== JS Errors =='); errors.forEach(e => console.log('  ' + e)); fail++; }
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

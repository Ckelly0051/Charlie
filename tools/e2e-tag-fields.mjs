import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

const file = TEST_APP_URL;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(file, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.tagger);

// Final Engine Independence: a season + native Break Down route replaces the
// old bare-boot fixture. Vocabulary (frontChips/formChips) now comes from
// TagLibrary directly rather than legacy .tag-section markup, and the
// motion/direction fixed-vocabulary check reads the coach-visible native
// chips instead of a retired DOM id, which also proves they're genuinely
// reachable, not just declared somewhere.
const result = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Tag fields', team: 'Mavericks', year: '2026' });
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

  // Vocabulary: Formation/Front are team-library-driven; motion/direction are
  // fixed. Formation/Front read straight from TagLibrary (the same source
  // native-tagging.jsx's snapshot() uses); motion/direction read the actual
  // rendered coach-visible chips in the native form, which also proves they
  // are genuinely reachable.
  const frontChips = app.customChips.library.group('front').values;
  const formChips = app.customChips.library.group('formation').values;
  const frontIsMulti = tagger.tagFields.defFront.multi === true;

  // Native republishing is queued as a microtask (NativeTaggingScreen._queuePublish),
  // so every action below needs an explicit tick before the DOM reflects it.
  const tick = () => new Promise(r => queueMicrotask(r));

  // NOT _loadActiveGame() -- that would reload tagger.plays from the (empty)
  // freshly-created season and wipe this fixture. Just mount the native
  // route over the fixture already installed on the live tagger above.
  await app.workspaceShell.show('breakdown');
  tagger.selectPlay(4); // an offense play, so the offense-only motion/direction group renders
  await tick();
  const chipLabels = (field) => {
    const group = document.querySelector(`[data-native-field="${field}"]`);
    return group ? [...group.querySelectorAll('.gi-tag-chips button')].map(b => b.textContent.trim()) : [];
  };
  const motionChips = chipLabels('motion');
  const dirChips = chipLabels('playDir');

  // Multi-select round trip: load play 1 (defense) into the form, check both
  // chips render active in the native form, and PlayTagger's own field value
  // round-trips the multi string -- both DOM-free (tagFields.defFront.value
  // is a plain property, no DOM read) and coach-visible.
  tagger.selectPlay(1);
  await tick();
  app.nativeTagging.setUnit('defense');
  await tick();
  const activeFronts = [...document.querySelectorAll('[data-native-field="defFront"] .gi-tag-chips button.is-active')].map(b => b.textContent.trim());
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
  ['Native form shows both front chips active for multi play', JSON.stringify([...result.activeFronts].sort()) === JSON.stringify(['Jumbo Shift','Maverick'])],
  ['PlayTagger field value round-trips the multi string', result.fieldValue === 'Maverick + Jumbo Shift'],
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

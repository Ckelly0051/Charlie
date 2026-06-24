/* Unit tests for the PURE core logic — the static helpers that drive every
   stat, split, and classification. The integration harnesses exercise these
   indirectly through full renders; this suite pins them in isolation so an edge
   case (empty input, multi-select split, run/pass fallback, HTML escaping)
   fails loudly and specifically. Loads the built bundle only to reach the
   classes — no app/team/season setup needed.

   Run after build:  bash build.sh && node tools/e2e-core.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 400));

console.log('\n== 1. Multi-select splitters (" + "-joined strings → component arrays) ==');
let r = await page.evaluate(() => {
  const SE = window.app.stats.constructor;
  return {
    form2: SE.splitFormations('Pistol + Spread'),
    formEmpty: SE.splitFormations(''),
    formOne: SE.splitFormations('Shotgun'),
    types: SE.splitPlayTypes('RPO + Short Pass'),
    results: SE.splitResults('Fumble + Touchdown'),
    fronts: SE.splitFronts('Maverick + 5-2'),
    blitzes: SE.splitBlitzes('A-Gap + Edge'),
    players: SE.splitPlayers('55, 22'),
  };
});
ok(JSON.stringify(r.form2) === JSON.stringify(['Pistol', 'Spread']), 'splitFormations splits on " + "', JSON.stringify(r.form2));
ok(JSON.stringify(r.formEmpty) === JSON.stringify(['Unknown']), 'splitFormations("") → ["Unknown"] (untagged plays still bucket into tendency tables)', JSON.stringify(r.formEmpty));
ok(JSON.stringify(r.formOne) === JSON.stringify(['Shotgun']), 'single formation → one-element array', JSON.stringify(r.formOne));
ok(JSON.stringify(r.types) === JSON.stringify(['RPO', 'Short Pass']), 'splitPlayTypes splits', JSON.stringify(r.types));
ok(JSON.stringify(r.results) === JSON.stringify(['Fumble', 'Touchdown']), 'splitResults splits (scoop-and-score)', JSON.stringify(r.results));
ok(JSON.stringify(r.fronts) === JSON.stringify(['Maverick', '5-2']), 'splitFronts splits', JSON.stringify(r.fronts));
ok(JSON.stringify(r.blitzes) === JSON.stringify(['A-Gap', 'Edge']), 'splitBlitzes splits', JSON.stringify(r.blitzes));
ok(JSON.stringify(r.players) === JSON.stringify(['55', '22']), 'splitPlayers splits a shared-tackle list on ","', JSON.stringify(r.players));

console.log('\n== 2. Run/Pass classification (explicit field authoritative; playType fallback) ==');
r = await page.evaluate(() => {
  const SE = window.app.stats.constructor;
  const p = (t) => ({ tags: t });
  return {
    explicitRun: SE.isRun(p({ runPass: 'Run', playType: 'Deep Pass' })),    // explicit wins over playType
    explicitPass: SE.isPass(p({ runPass: 'Pass', playType: 'Run Inside' })),
    fallbackRun: SE.isRun(p({ runPass: '', playType: 'Run Inside' })),       // legacy: infer from playType
    fallbackPass: SE.isPass(p({ runPass: '', playType: 'Screen' })),
    blankNeither: SE.isRun(p({ runPass: '', playType: '' })) || SE.isPass(p({ runPass: '', playType: '' })),
    hasTD: SE.hasResult(p({ result: 'Fumble + Touchdown' }), 'Touchdown'),
    noTD: SE.hasResult(p({ result: 'Gain' }), 'Touchdown'),
  };
});
ok(r.explicitRun, 'isRun honors explicit runPass=Run over a Pass playType', JSON.stringify(r));
ok(r.explicitPass, 'isPass honors explicit runPass=Pass over a Run playType', JSON.stringify(r));
ok(r.fallbackRun, 'isRun falls back to playType inference (legacy data)', JSON.stringify(r));
ok(r.fallbackPass, 'isPass infers Screen as a pass', JSON.stringify(r));
ok(!r.blankNeither, 'a fully blank play is neither run nor pass', JSON.stringify(r));
ok(r.hasTD && !r.noTD, 'hasResult finds a component in a "+"-joined result', JSON.stringify(r));

console.log('\n== 3. playPoints scoring ==');
r = await page.evaluate(() => {
  const SE = window.app.stats.constructor;
  const p = (t) => ({ tags: t });
  return {
    td: SE.playPoints(p({ result: 'Touchdown' })),
    safety: SE.playPoints(p({ result: 'Safety' })),
    gain: SE.playPoints(p({ result: 'Gain' })),
    madeXp: SE.playPoints(p({ stType: 'XP', kickOutcome: 'Good' })),
  };
});
ok(r.td === 6, 'a Touchdown is 6 points', JSON.stringify(r));
ok(r.safety === 2, 'a Safety is 2 points', JSON.stringify(r));
ok(r.gain === 0, 'a plain Gain scores 0', JSON.stringify(r));
ok(r.madeXp === 1, 'a made XP (kickOutcome Good) is 1 point', JSON.stringify(r));

console.log('\n== 4. HTML escaping (Charts._esc) — the XSS boundary ==');
r = await page.evaluate(() => {
  const esc = Charts._esc;
  return {
    img: esc('<img src=x onerror=alert(1)>'),
    amp: esc('A&B'),
    quote: esc('say "hi" it\'s'),
    plain: esc('Smith'),
  };
});
ok(!/[<>]/.test(r.img) && r.img.includes('&lt;img'), 'Charts._esc neutralizes an <img onerror> payload', JSON.stringify(r));
ok(r.amp === 'A&amp;B', 'escapes & (entity-safe)', JSON.stringify(r));
ok(r.quote.includes('&quot;') && r.quote.includes('&#39;'), 'escapes both quote styles', JSON.stringify(r));
ok(r.plain === 'Smith', 'leaves a plain name untouched', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);

/* E2E mark-flow harness — the only test that drives the REAL coach flow
   end-to-end: generate an actual video in-page, load it through
   VideoController.loadFile, click the real Mark Start / Mark End buttons,
   and assert the play is created, auto-selected, the form guard lifts, and
   a chip click saves. (The other harnesses select plays via the API, which
   skips exactly the path a "form stays grayed out" field report exercises.)
   Run after build:  bash build.sh && node tools/e2e-mark-flow.mjs */
import puppeteer from 'puppeteer';
const URL = 'file:///home/user/Charlie/football-film-analyzer.html';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team setup + create a real (non-demo) season + new game, like a coach would
await page.type('#teamSetupName', 'Mavericks');
await page.evaluate(() => document.querySelector('#btnTeamSetupSave')?.click());
await sleep(400);
const seasonSetup = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ year: '2026', team: 'Mavericks', level: 'Varsity' });
  return { hasSeason: app.storage.seasonStore.hasCurrent() };
});
await sleep(500);

// Generate a real 4s video in-page and load it through VideoController
const loaded = await page.evaluate(async () => {
  const canvas = document.createElement('canvas');
  canvas.width = 320; canvas.height = 180;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(15);
  const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
  const chunks = [];
  rec.ondataavailable = e => chunks.push(e.data);
  const done = new Promise(r => { rec.onstop = r; });
  rec.start();
  const t0 = performance.now();
  while (performance.now() - t0 < 4000) {
    ctx.fillStyle = `hsl(${(performance.now() / 20) % 360},60%,50%)`;
    ctx.fillRect(0, 0, 320, 180);
    await new Promise(r => setTimeout(r, 66));
  }
  rec.stop();
  await done;
  const blob = new Blob(chunks, { type: 'video/webm' });
  const file = new File([blob], 'test_film.webm', { type: 'video/webm' });
  window.app.vc.loadFile(file);
  await new Promise(r => setTimeout(r, 800));
  const v = document.getElementById('videoPlayer');
  return { duration: v.duration, ready: v.readyState };
});

// THE USER'S EXACT FLOW: click Mark Start, let video advance, click Mark End
const result = await page.evaluate(async () => {
  const v = document.getElementById('videoPlayer');
  const form = document.getElementById('tagForm');
  const stateBefore = form.classList.contains('form-disabled');

  document.getElementById('btnMarkStart').click();
  v.currentTime = 2.5;            // coach scrubs/plays forward
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btnMarkEnd').click();
  await new Promise(r => setTimeout(r, 400));

  const t = window.app.tagger;
  const stateAfter = form.classList.contains('form-disabled');

  // Try actually clicking a chip (Run Inside) and check it saves
  const chip = document.querySelector('#tagPlayType .pick[data-value="Run Inside"]');
  const chipStyle = getComputedStyle(chip);
  chip.click();
  await new Promise(r => setTimeout(r, 150));
  const play = t.getCurrentPlay();

  return {
    disabledBeforeMark: stateBefore,
    playsCreated: t.plays.length,
    currentPlayId: t.currentPlayId,
    disabledAfterMark: stateAfter,
    chipPointerEvents: chipStyle.pointerEvents,
    chipSavedPlayType: play?.tags.playType,
  };
});

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

ok(seasonSetup.hasSeason, 'season created');
ok(loaded.ready >= 2 && loaded.duration > 3, 'real video loaded and decodable');
ok(result.disabledBeforeMark, 'form starts disabled (guard active)');
ok(result.playsCreated === 1, 'Mark Start -> Mark End creates a play');
ok(result.currentPlayId === 1, 'new play is auto-selected');
ok(!result.disabledAfterMark, 'form enables after marking');
ok(result.chipPointerEvents === 'auto', 'chips are clickable after marking');
ok(result.chipSavedPlayType === 'Run Inside', 'chip click saves to the play');
if (errors.length) { fail++; console.log('ERRORS:\n' + errors.join('\n')); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

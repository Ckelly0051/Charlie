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

// MARKING IS OPTIONAL: loading a video into an empty game auto-creates a
// whole-video play and the form is live immediately. The first manual
// Mark Start/End RE-TIMES that placeholder; later marks add new plays.
const result = await page.evaluate(async () => {
  const v = document.getElementById('videoPlayer');
  const form = document.getElementById('tagForm');
  const t = window.app.tagger;

  // 1. Right after load: placeholder play exists, selected, form live
  const onLoad = {
    plays: t.plays.length,
    selected: t.currentPlayId,
    disabled: form.classList.contains('form-disabled'),
    spansVideo: t.plays[0] && Math.abs(t.plays[0].timestamp.end - v.duration) < 0.5,
    autoFull: !!t.plays[0]?.autoFull,
  };

  // 2. First manual mark re-times the placeholder instead of adding a play
  document.getElementById('btnMarkStart').click();
  v.currentTime = 2.5;
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btnMarkEnd').click();
  await new Promise(r => setTimeout(r, 400));
  const afterMark = {
    plays: t.plays.length,
    start: t.plays[0].timestamp.start,
    end: t.plays[0].timestamp.end,
    autoFull: !!t.plays[0].autoFull,
    disabled: form.classList.contains('form-disabled'),
  };

  // 3. Chip click saves to the (re-timed) play
  const chip = document.querySelector('#tagPlayType .pick[data-value="Run Inside"]');
  chip.click();
  await new Promise(r => setTimeout(r, 150));
  const chipSaved = t.getCurrentPlay()?.tags.playType;

  // 4. A second mark now ADDS a play (placeholder already consumed)
  document.getElementById('btnMarkStart').click();
  v.currentTime = Math.min(v.duration - 0.1, 3.6);
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btnMarkEnd').click();
  await new Promise(r => setTimeout(r, 300));

  return { onLoad, afterMark, chipSaved, finalPlays: t.plays.length };
});

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); }
};

ok(seasonSetup.hasSeason, 'season created');
ok(loaded.ready >= 2 && loaded.duration > 3, 'real video loaded and decodable');
ok(result.onLoad.plays === 1, 'video load auto-creates a whole-video play');
ok(result.onLoad.selected === 1, 'placeholder play is auto-selected');
ok(!result.onLoad.disabled, 'form is live immediately — no marking required');
ok(result.onLoad.spansVideo && result.onLoad.autoFull, 'placeholder spans the whole video');
ok(result.afterMark.plays === 1, 'first manual mark re-times the placeholder (no extra play)');
ok(Math.abs(result.afterMark.start) < 0.3 && Math.abs(result.afterMark.end - 2.5) < 0.3, 'placeholder got the marked start/end');
ok(!result.afterMark.autoFull && !result.afterMark.disabled, 'placeholder becomes a normal play, form stays live');
ok(result.chipSaved === 'Run Inside', 'chip click saves to the play');
ok(result.finalPlays === 2, 'second mark adds a new play');
if (errors.length) { fail++; console.log('ERRORS:\n' + errors.join('\n')); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

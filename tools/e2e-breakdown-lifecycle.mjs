/* Lane A — Break Down presentation lifecycle (mount / restore / remount).
 *
 * WHY THIS EXISTS. BreakdownVideo._mount() moves real production chrome:
 * .playback-controls goes INSIDE #videoContainer, a drag handle is prepended, a
 * play strip is inserted, and #btnCopyPrev is relocated. WorkspaceShell.disable()
 * restored breakdownWorkspace but never breakdownVideo, so the no-reload classic
 * transition left beta chrome behind. Empirically confirmed before this test was
 * written: after useClassic(false), the strip was still mounted and
 * .playback-controls was still parented to #videoContainer.
 *
 * SCOPE / SEVERITY. The user-facing "Use classic layout" button calls
 * useClassic() with its default reload=true, which clears the flag and reloads —
 * so a real coach is NOT stranded in a mutated layout. This is lifecycle debt on
 * the no-reload path, P1, not a P0 escape-hatch failure.
 *
 * WHAT THIS ASSERTS (and why not "byte-identical DOM"): a DOM snapshot compare
 * passes while retained listeners and tagger subscriptions leak. Handler
 * duplication is asserted by COUNTING EMISSIONS, not by reading markup.
 */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));

// ---- 1. Element identity across the cycle -------------------------------
// Decides the implementation: bind-once is only valid if these elements are
// re-parented rather than re-created. If identity ever changes, the fix must
// track bound element references and unbind/rebind when they change.
const identity = await page.evaluate(async () => {
  const vc = document.getElementById('videoContainer');
  const pc = document.querySelector('.playback-controls');
  vc.__laneA = 'vc'; pc.__laneA = 'pc';
  const shell = window.app.workspaceShell;
  shell.useClassic(false);
  await new Promise(r => setTimeout(r, 250));
  await shell.enable();
  await new Promise(r => setTimeout(r, 400));
  return {
    vcSame: document.getElementById('videoContainer')?.__laneA === 'vc',
    pcSame: document.querySelector('.playback-controls')?.__laneA === 'pc',
  };
});
ok(identity.vcSame && identity.pcSame,
  'DOM identity: #videoContainer and .playback-controls survive restore+enable as the SAME objects',
  JSON.stringify(identity));

// ---- 2. restore() actually un-mounts the beta presentation ---------------
await page.evaluate(() => { localStorage.setItem('ffa_workspace_shell_v2', '1'); });
await page.reload({ waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));
const restored = await page.evaluate(async () => {
  const pcOriginalParent = document.querySelector('.playback-controls')?.parentElement?.className || '';
  window.app.workspaceShell.useClassic(false);
  await new Promise(r => setTimeout(r, 300));
  return {
    strips: document.querySelectorAll('.breakdown-play-strip').length,
    handles: document.querySelectorAll('.breakdown-player-drag').length,
    pcInsideVideo: !!document.querySelector('#videoContainer .playback-controls'),
    videoHasBetaClass: document.getElementById('videoContainer')?.classList.contains('breakdown-video-v2'),
    inlineTop: document.querySelector('.playback-controls')?.style.top || '',
    pcOriginalParent,
  };
});
ok(restored.strips === 0, 'restore(): play strip is removed', `strips=${restored.strips}`);
ok(restored.handles === 0, 'restore(): drag handle is removed', `handles=${restored.handles}`);
ok(!restored.pcInsideVideo, 'restore(): .playback-controls leaves #videoContainer');
ok(!restored.videoHasBetaClass, 'restore(): beta presentation class is removed from #videoContainer');
ok(restored.inlineTop === '', 'restore(): inline positioning written by place() is cleared');

// ---- 3. Remount rebuilds exactly once ------------------------------------
const remount = await page.evaluate(async () => {
  await window.app.workspaceShell.enable();
  await new Promise(r => setTimeout(r, 400));
  return {
    strips: document.querySelectorAll('.breakdown-play-strip').length,
    handles: document.querySelectorAll('.breakdown-player-drag').length,
    pcInsideVideo: !!document.querySelector('#videoContainer .playback-controls'),
  };
});
ok(remount.strips === 1 && remount.handles === 1 && remount.pcInsideVideo,
  'remount: enable() rebuilds the presentation exactly once', JSON.stringify(remount));

// ---- 4. Repeated cycles do not duplicate handling ------------------------
// Counted by EMISSION, not markup: a duplicated subscription re-renders N times
// per event while the DOM still looks correct.
const cycles = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  for (let i = 0; i < 3; i++) {
    shell.useClassic(false);
    await new Promise(r => setTimeout(r, 150));
    await shell.enable();
    await new Promise(r => setTimeout(r, 250));
  }
  const bv = window.app.breakdownVideo;
  let renders = 0;
  const realRender = bv.render.bind(bv);
  bv.render = (...a) => { renders++; return realRender(...a); };

  window.app.tagger._emit('plays-loaded', window.app.tagger.plays);
  await new Promise(r => setTimeout(r, 120));
  const rendersPerEvent = renders;

  // Count _renderPlay, NOT _updateCard, and use a synthetic play. An earlier
  // draft did `cardUpdatesPerEvent: play ? cardUpdates : 1` — this harness has
  // no season, so plays[0] was undefined and it returned a hardcoded 1 without
  // ever emitting. It passed on ANY code, including code with the subscribe
  // guard deliberately removed. A mutation run caught it.
  let playHandled = 0;
  const realRenderPlay = bv._renderPlay.bind(bv);
  bv._renderPlay = (...a) => { playHandled++; return realRenderPlay(...a); };
  window.app.tagger._emit('play-updated', { id: 999999, tags: {} });
  await new Promise(r => setTimeout(r, 120));

  return {
    strips: document.querySelectorAll('.breakdown-play-strip').length,
    handles: document.querySelectorAll('.breakdown-player-drag').length,
    copyPrev: document.querySelectorAll('#btnCopyPrev').length,
    rendersPerEvent,
    playHandledPerEvent: playHandled,
  };
});
ok(cycles.strips === 1, 'after 3 cycles: exactly one play strip', `strips=${cycles.strips}`);
ok(cycles.handles === 1, 'after 3 cycles: exactly one drag handle', `handles=${cycles.handles}`);
ok(cycles.copyPrev === 1, 'after 3 cycles: exactly one #btnCopyPrev', `n=${cycles.copyPrev}`);
ok(cycles.rendersPerEvent === 1,
  'after 3 cycles: one plays-loaded event triggers exactly ONE render (no duplicate subscriptions)',
  `renders=${cycles.rendersPerEvent}`);
ok(cycles.playHandledPerEvent === 1,
  'after 3 cycles: one play-updated event is handled exactly ONCE',
  `handled=${cycles.playHandledPerEvent}`);

// ---- 5. State survives the cycle -----------------------------------------
const state = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  const v = document.getElementById('videoPlayer');
  v.src = 'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDE=';
  const before = { src: v.src, time: v.currentTime, play: window.app.tagger.currentPlayId };
  shell.useClassic(false);
  await new Promise(r => setTimeout(r, 200));
  await shell.enable();
  await new Promise(r => setTimeout(r, 350));
  const after = document.getElementById('videoPlayer');
  return {
    srcSame: after.src === before.src,
    timeSame: after.currentTime === before.time,
    playSame: window.app.tagger.currentPlayId === before.play,
    controlsPresent: !!document.getElementById('btnPlayPause'),
    controlsClickable: (() => {
      const b = document.getElementById('btnPlayPause');
      if (!b) return false;
      b.click();               // must not throw; wiring must survive the cycle
      return true;
    })(),
  };
});
ok(state.srcSame, 'cycle: video source survives');
ok(state.timeSame, 'cycle: currentTime survives');
ok(state.playSame, 'cycle: selected play survives');
ok(state.controlsPresent && state.controlsClickable,
  'cycle: playback controls are present and still respond after remount', JSON.stringify(state));

ok(errors.length === 0, 'No page errors', errors.slice(0, 2).join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

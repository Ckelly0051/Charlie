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

// ---- 2. restore() returns chrome to its EXACT original position -----------
// The true original position can only be captured from a CLASSIC boot, before
// _mount() has moved anything. An earlier draft read it after the flag-on boot,
// so it recorded the already-MUTATED parent and then never asserted it — a dead
// variable that looked like coverage.
const page2 = await browser.newPage();
await page2.setViewport({ width: 1280, height: 800 });
const errors2 = [];
page2.on('pageerror', e => errors2.push(e.stack || e.message));
// MUST clear the flag explicitly. localStorage is per-ORIGIN, and page1 already
// set it on this same file:// origin — a new page inherits it. Without this the
// "classic" boot is actually flag-on, the baseline snapshot captures the
// already-MUTATED chrome, and the exact-restoration assertion compares the bug
// against itself. (This is the second time this harness measured a mutated
// baseline; the first was capturing it after _mount() had run.)
await page2.evaluateOnNewDocument(() => localStorage.removeItem('ffa_workspace_shell_v2'));
await page2.goto(URL, { waitUntil: 'networkidle0' });   // genuine classic boot
await new Promise(r => setTimeout(r, 700));

const exact = await page2.evaluate(async () => {
  const pc = document.querySelector('.playback-controls');
  const copy = document.getElementById('btnCopyPrev');
  const snap = el => el && ({
    parent: el.parentElement,
    index: [...el.parentElement.children].indexOf(el),
    text: el.textContent,
    cls: el.className,
  });
  const pcBefore = snap(pc), copyBefore = snap(copy);
  const mountedNow = !!document.querySelector('.breakdown-play-strip');

  await window.app.workspaceShell.enable();
  await new Promise(r => setTimeout(r, 450));
  const mountedAfterEnable = !!document.querySelector('.breakdown-play-strip');

  window.app.workspaceShell.useClassic(false);
  await new Promise(r => setTimeout(r, 350));
  const pcAfter = snap(document.querySelector('.playback-controls'));
  const copyAfter = snap(document.getElementById('btnCopyPrev'));
  const same = (a, b) => !!a && !!b && a.parent === b.parent && a.index === b.index
    && a.text === b.text && a.cls === b.cls;
  return {
    classicBootIsClean: !mountedNow,
    enableMounts: mountedAfterEnable,
    pcExact: same(pcBefore, pcAfter),
    copyExact: same(copyBefore, copyAfter),
    detail: { pcBefore: pcBefore && { i: pcBefore.index, c: pcBefore.cls }, pcAfter: pcAfter && { i: pcAfter.index, c: pcAfter.cls },
              copyBefore: copyBefore && { i: copyBefore.index, t: copyBefore.text }, copyAfter: copyAfter && { i: copyAfter.index, t: copyAfter.text } },
  };
});
ok(exact.classicBootIsClean, 'classic boot (flag off) mounts no beta presentation');
ok(exact.enableMounts, 'enable() from a classic boot mounts the presentation');
ok(exact.pcExact, '.playback-controls returns to its EXACT original parent, sibling index, text and classes',
  JSON.stringify(exact.detail));
ok(exact.copyExact, '#btnCopyPrev returns to its EXACT original parent, sibling index, text and classes',
  JSON.stringify(exact.detail));

// ---- 2b. Deferred callbacks must not outlive their mount ------------------
// render() queues an rAF that re-reads this.track; restore() nulls it.
// _bindPlayer queues place(stored), which writes controls.style.top; restore()
// has just cleared it. Both fire AFTER teardown unless they check ownership.
const races = await page2.evaluate(async () => {
  const thrown = [];
  const onErr = e => thrown.push(String(e.message || e));
  window.addEventListener('error', onErr);

  // Race A: render() then immediate teardown, before the frame runs.
  await window.app.workspaceShell.enable();
  await new Promise(r => setTimeout(r, 400));
  try { localStorage.setItem('ffa_video_controls_y', '0.5'); } catch {}
  window.app.breakdownVideo.render();
  window.app.workspaceShell.useClassic(false);          // same tick — rAF still queued
  await new Promise(r => setTimeout(r, 250));
  const renderRace = thrown.slice();

  // Race B: mount reads the stored ratio and queues place(); tear down first.
  thrown.length = 0;
  await window.app.workspaceShell.enable();
  window.app.workspaceShell.useClassic(false);          // before the queued frame
  await new Promise(r => setTimeout(r, 250));
  const topAfter = document.querySelector('.playback-controls')?.style.top || '';

  window.removeEventListener('error', onErr);
  return { renderRace, placeRaceTop: topAfter, placeThrown: thrown.slice() };
});
ok(races.renderRace.length === 0,
  'race: render() rAF after restore() does not throw on a null track',
  races.renderRace.join(' | '));
ok(races.placeRaceTop === '',
  'race: queued place() does not re-apply beta positioning after restore()',
  `style.top="${races.placeRaceTop}"`);

// ---- 2d. An ACTIVE DRAG must not survive teardown ------------------------
// pointerdown installs move/up on WINDOW and only removes them on pointerup.
// If restore() runs mid-drag that pointerup may never come, so the listeners
// outlive the handle: move -> place() repositions the CLASSIC controls and
// persists a ratio, up -> show() re-arms the auto-hide. None of the assertions
// above exercise this because none of them drag.
const drag = await page2.evaluate(async () => {
  const shell = window.app.workspaceShell;
  await shell.enable();
  await new Promise(r => setTimeout(r, 400));
  try { localStorage.removeItem('ffa_video_controls_y'); } catch {}

  const handle = document.querySelector('.breakdown-player-drag');
  if (!handle) return { error: 'no drag handle' };
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 300, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 320, pointerId: 1 }));

  shell.useClassic(false);                 // teardown mid-drag: no pointerup yet
  await new Promise(r => setTimeout(r, 120));
  // Baseline AFTER teardown: the move above was LIVE and legitimately persisted
  // a ratio. The bug is a dead mount CHANGING it, not the live drag saving it.
  let storedAtTeardown = null;
  try { storedAtTeardown = localStorage.getItem('ffa_video_controls_y'); } catch {}

  // The drag "continues" against a torn-down mount. clientY is far from the
  // pre-teardown position so a leaked handler would write a different ratio.
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 700, pointerId: 1 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 700, pointerId: 1 }));
  await new Promise(r => setTimeout(r, 2000));   // outlast show()'s 1600ms auto-hide

  const pc = document.querySelector('.playback-controls');
  let storedAfter = null;
  try { storedAfter = localStorage.getItem('ffa_video_controls_y'); } catch {}
  return {
    top: pc?.style.top || '',
    bottom: pc?.style.bottom || '',
    hiddenClass: document.getElementById('videoContainer')?.classList.contains('breakdown-controls-hidden'),
    storedAtTeardown,
    storedAfter,
    storedUnchanged: storedAtTeardown === storedAfter,
  };
});
ok(drag.top === '' && drag.bottom === '',
  'active drag + restore(): later pointermove does not reposition the classic controls',
  `top="${drag.top}" bottom="${drag.bottom}"`);
ok(drag.hiddenClass === false,
  'active drag + restore(): later pointerup does not re-arm auto-hide on the classic layout',
  `hiddenClass=${drag.hiddenClass}`);
ok(drag.storedUnchanged,
  'active drag + restore(): a dead mount cannot overwrite the stored ratio',
  `atTeardown=${drag.storedAtTeardown} after=${drag.storedAfter}`);

// ---- 2e. A gesture must end when it is cancelled or replaced -------------
// The teardown fix above only covers restore(). Ordinary drag CANCELLATION is
// separate: pointerdown registers global move/up but nothing listens for
// pointercancel, nothing filters by the owning pointerId, and a replacement
// pointerdown overwrites _endDrag — orphaning the first gesture's listeners
// with no way to remove them. Reachable on touch interruption, browser gesture
// takeover, device cancellation, or a second finger.
const gestures = await page2.evaluate(async () => {
  const shell = window.app.workspaceShell;
  const bv = window.app.breakdownVideo;
  // Measure whether the stale HANDLER RUNS, not whether pixels move. With no
  // film loaded #videoContainer has no layout, so place() clamps every position
  // to 12px and every ratio to 0 — comparing pixel values cannot distinguish
  // "correctly stopped" from "never started". Every drag move writes this key,
  // so counting writes detects a live listener regardless of geometry.
  let writes = 0;
  const realSet = localStorage.setItem.bind(localStorage);
  localStorage.setItem = (k, v) => { if (k === 'ffa_video_controls_y') writes++; return realSet(k, v); };
  const resetWrites = () => { writes = 0; };

  // --- Case 1: pointercancel ---
  await shell.enable();
  // MUST show the breakdown route. enable() lands on Home, leaving #wsBreakdown
  // hidden, so the video's getBoundingClientRect().height is 0 and place()
  // clamps every position to 12px — the drag mechanism cannot be exercised.
  await shell.show('breakdown');
  await new Promise(r => setTimeout(r, 400));
  const handle = document.querySelector('.breakdown-player-drag');
  if (!handle) return { error: 'no handle' };
  // Neutralize pointer capture. Synthetic PointerEvents create no active
  // pointer, so setPointerCapture THROWS and kills the pointerdown handler
  // before it registers move/up — every assertion below would then pass
  // vacuously against a handler that never armed.
  const neutralize = el => { el.setPointerCapture = () => {}; el.releasePointerCapture = () => {}; };
  neutralize(handle);
  handle.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 200, pointerId: 1 }));
  resetWrites();
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 520, pointerId: 1 }));
  // PRECONDITION: the live drag must actually drive the handler. Without this,
  // "no writes after cancel" cannot distinguish "correctly stopped" from
  // "never started" — the trap that made an earlier version of these
  // assertions pass against the unfixed code.
  const liveDragWrites = writes;

  window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, clientY: 520, pointerId: 1 }));
  await new Promise(r => setTimeout(r, 60));
  const endDragArmedAfterCancel = !!bv._endDrag;

  // The gesture is over. A later move must not reach the handler at all.
  resetWrites();
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 60, pointerId: 1 }));
  await new Promise(r => setTimeout(r, 60));
  const cancel = {
    liveDragWrites,
    writesAfterCancel: writes,
    endDragArmedAfterCancel,
  };

  // --- Case 2: overlapping pointers / replacement pointerdown ---
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 760, pointerId: 1 }));
  await new Promise(r => setTimeout(r, 60));
  const h2 = document.querySelector('.breakdown-player-drag');
  neutralize(h2);
  h2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 200, pointerId: 11 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 240, pointerId: 11 }));
  // A second finger starts a new gesture; it replaces _endDrag, orphaning
  // pointer 11's listeners with no reference left to remove them.
  h2.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientY: 300, pointerId: 22 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 310, pointerId: 22 }));
  window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientY: 310, pointerId: 22 }));
  await new Promise(r => setTimeout(r, 60));

  // Pointer 11's gesture was superseded and pointer 22's is finished. Nothing
  // should be listening: a move from EITHER pointer must not reach the handler.
  resetWrites();
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 580, pointerId: 11 }));
  window.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientY: 590, pointerId: 22 }));
  await new Promise(r => setTimeout(r, 60));
  const overlap = { writesAfterBothEnded: writes, endDragArmed: !!bv._endDrag };

  localStorage.setItem = realSet;
  return { cancel, overlap };
});
ok(gestures.cancel?.liveDragWrites > 0,
  'precondition: a live drag drives the handler (guards the assertions below against passing because nothing ran)',
  JSON.stringify(gestures.cancel));
ok(gestures.cancel?.writesAfterCancel === 0,
  'pointercancel: a cancelled drag stops driving the handler',
  JSON.stringify(gestures.cancel));
ok(gestures.cancel?.endDragArmedAfterCancel === false,
  'pointercancel: the gesture cleanup is disarmed, not left pending',
  `armed=${gestures.cancel?.endDragArmedAfterCancel}`);
ok(gestures.overlap?.writesAfterBothEnded === 0 && gestures.overlap?.endDragArmed === false,
  'overlapping pointers: a superseded gesture leaves no stale listener',
  JSON.stringify(gestures.overlap));

await page2.close();

// ---- 2c. restore() un-mounts the beta presentation -----------------------
await page.evaluate(() => { localStorage.setItem('ffa_workspace_shell_v2', '1'); });
await page.reload({ waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));
const restored = await page.evaluate(async () => {
  window.app.workspaceShell.useClassic(false);
  await new Promise(r => setTimeout(r, 300));
  return {
    strips: document.querySelectorAll('.breakdown-play-strip').length,
    handles: document.querySelectorAll('.breakdown-player-drag').length,
    pcInsideVideo: !!document.querySelector('#videoContainer .playback-controls'),
    videoHasBetaClass: document.getElementById('videoContainer')?.classList.contains('breakdown-video-v2'),
    inlineTop: document.querySelector('.playback-controls')?.style.top || '',
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

// Both pages count. The classic-boot page drives the teardown races, so leaving
// it unmonitored would hide exactly the throw this lane is fixing.
const allErrors = [...errors, ...errors2];
ok(allErrors.length === 0, 'No page errors (both flag-on and classic-boot pages)',
  allErrors.slice(0, 2).join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

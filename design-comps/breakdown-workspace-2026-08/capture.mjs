// One-off capture script for the Break Down workspace comp review.
// Not part of the product test suite -- a design-checkpoint tool only.
//
// REVISION (review round 3): the round-2 script scrolled the deck to its
// bottom for the sticky-bar overlap test and then took the REQUIRED
// screenshot without ever restoring scroll position -- every chart-mode
// capture (offense/defense/special at every width) was silently taken
// scrolled to the bottom, so Situation and the primary scheme group were
// missing from every one of them. Fixed by strict ordering per job:
//   1. render the state
//   2. explicitly set scrollTop = 0 and ASSERT it
//   3. settle layout/fonts
//   4. take the required screenshot
//   5. ONLY THEN run the destructive sticky-bottom check
//   6. restore scrollTop = 0 afterward (defense in depth)
// Also added this round: a measured film-rectangle report for the three
// required Offense viewports (finding 2), and a content-containment check
// for the Film Room detail card as a whole box, not just its buttons
// (finding 6).
//
// REVISION (review round 4, finding 2): a closed trigger proves nothing
// about the thing it opens. Two new captures at the end of this file open
// the round-3 transport-overflow menu and the compact Plays browser and
// assert neither open panel physically overlaps the video stage -- this is
// what caught the Plays browser regression (a full-viewport-width fixed
// overlay sitting directly on top of the film) that no earlier capture in
// this file, all of which only ever exercised the CLOSED state, could see.
//
// REVISION (six-lens visual pass, same finding, second half): "does not
// touch the video" is not the same claim as "does not obscure other useful
// content", and the transport-more panel proved it -- an earlier fix that
// passed this exact overlapsVideo:false check still painted an opaque,
// out-of-flow panel directly over the clip's total-duration readout and the
// tail of the scrub track, in the same row. Fixed at the source (the panel
// is now in-flow, so opening it displaces its siblings instead of covering
// them) and now ALSO checked here: every sibling control inside the SAME
// transport row must remain unobstructed while the panel is open, not just
// the video two rows up.
import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'captures');
const URL = 'http://localhost:4174/design-comps/breakdown-workspace-2026-08/breakdown.html';

const jobs = [
  { state: 'chart-offense', w: 1920, h: 1080, name: '1920x1080-offense-chart.png' },
  { state: 'chart-offense', w: 1440, h: 900, name: '1440x900-offense-chart.png' },
  { state: 'chart-offense', w: 1280, h: 720, name: '1280x720-offense-chart.png' },
  { state: 'chart-defense', w: 1920, h: 1080, name: '1920x1080-defense-chart.png' },
  { state: 'chart-defense', w: 1440, h: 900, name: '1440x900-defense-chart.png' },
  { state: 'chart-defense', w: 1280, h: 720, name: '1280x720-defense-chart.png' },
  { state: 'chart-special', w: 1920, h: 1080, name: '1920x1080-special-teams-chart.png' },
  { state: 'chart-special', w: 1440, h: 900, name: '1440x900-special-teams-chart.png' },
  { state: 'chart-special', w: 1280, h: 720, name: '1280x720-special-teams-chart.png' },
  { state: 'film-room', w: 1920, h: 1080, name: '1920x1080-film-room.png' },
  { state: 'film-room', w: 1440, h: 900, name: '1440x900-film-room.png' },
  { state: 'film-room', w: 1280, h: 720, name: '1280x720-film-room.png' },
  { state: 'missing-film', w: 1920, h: 1080, name: '1920x1080-missing-film.png' },
  { state: 'missing-film', w: 1440, h: 900, name: '1440x900-missing-film.png' },
  { state: 'sparse', w: 1920, h: 1080, name: '1920x1080-sparse-new-game.png' },
  { state: 'sparse', w: 1440, h: 900, name: '1440x900-sparse-new-game.png' },
];

// Command selectors: every control a coach can actually press. Containment
// is asserted for all of these on every job, at every viewport.
const COMMAND_SELECTOR = [
  '.gi-icon-command', '.gi-theater-command', '.gi-play-command',
  '.gi-toolbar-tools button', '.gi-tag-nav button', '.gi-segment button',
  '.gi-shell-tools button', '.gi-film-room-actions button',
  '.gi-film-room-head button', '.gi-theater-actions-risk button',
  '.gi-unit-switch button',
].join(',');

function visibleRectFn() {
  return (el) => {
    let r = el.getBoundingClientRect();
    let rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    let node = el.parentElement;
    while (node) {
      const cs = getComputedStyle(node);
      if (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden') {
        const pr = node.getBoundingClientRect();
        rect = {
          left: Math.max(rect.left, pr.left),
          top: Math.max(rect.top, pr.top),
          right: Math.min(rect.right, pr.right),
          bottom: Math.min(rect.bottom, pr.bottom),
        };
      }
      node = node.parentElement;
    }
    return rect;
  };
}

const overflowReport = [];
const clipReport = [];
const stickyReport = [];
const scrollTopReport = [];
const filmRectReport = [];
const filmRoomDetailReport = [];

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE ERROR', m.text()); });

for (const job of jobs) {
  await page.setViewport({ width: job.w, height: job.h });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    render(state);
    document.querySelector('.qa-harness').classList.add('is-hidden');
    const deck = document.querySelector('.gi-breakdown-deck');
    if (deck) deck.scrollTop = 0;
  }, job.state);
  // let layout/fonts settle
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise((r) => setTimeout(r, 120));

  // ── Assert the deck is genuinely at scroll-top before the primary
  //    screenshot -- this is the exact contamination the round-2 script
  //    shipped, made impossible to silently reintroduce. ────────────────
  const scrollTopAtCapture = await page.evaluate(() => {
    const deck = document.querySelector('.gi-breakdown-deck');
    return deck ? deck.scrollTop : null;
  });
  scrollTopReport.push({ job: job.name, scrollTopAtCapture });

  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollW: doc.scrollWidth,
      clientW: doc.clientWidth,
      scrollH: doc.scrollHeight,
      clientH: doc.clientHeight,
    };
  });
  const hOverflow = overflow.scrollW - overflow.clientW;
  overflowReport.push({ job: job.name, ...overflow, hOverflow });

  // ── Command containment ────────────────────────────────────────────
  const clipped = await page.evaluate((sel, visibleRectSrc) => {
    const visibleRect = new Function(`return (${visibleRectSrc})`)();
    const EPS = 0.5;
    const bad = [];
    document.querySelectorAll(sel).forEach((el) => {
      const full = el.getBoundingClientRect();
      if (full.width <= 0 || full.height <= 0) return; // legitimately hidden (display:none ancestor) -- not a clip
      const vis = visibleRect(el);
      const visW = Math.max(0, vis.right - vis.left);
      const visH = Math.max(0, vis.bottom - vis.top);
      const clippedW = full.width - visW > EPS;
      const clippedH = full.height - visH > EPS;
      if (clippedW || clippedH) {
        bad.push({
          label: (el.title || el.textContent || el.className || '').trim().slice(0, 40),
          fullW: Math.round(full.width), fullH: Math.round(full.height),
          visW: Math.round(visW), visH: Math.round(visH),
        });
      }
    });
    return bad;
  }, COMMAND_SELECTOR, visibleRectFn().toString());
  if (clipped.length) clipReport.push({ job: job.name, clipped });

  // ── Film-room detail card: the WHOLE box must be contained, not merely
  //    its interactive buttons (review finding 6). ───────────────────────
  if (job.state === 'film-room') {
    const detail = await page.evaluate((visibleRectSrc) => {
      const visibleRect = new Function(`return (${visibleRectSrc})`)();
      const card = document.querySelector('.gi-filmroom-detail');
      if (!card) return null;
      const full = card.getBoundingClientRect();
      const vis = visibleRect(card);
      const visW = Math.max(0, vis.right - vis.left);
      const visH = Math.max(0, vis.bottom - vis.top);
      const moreOpen = card.querySelector('.fr-more')?.open ?? null;
      return {
        fullW: Math.round(full.width), fullH: Math.round(full.height),
        visW: Math.round(visW), visH: Math.round(visH),
        clipped: (full.width - visW > 0.5) || (full.height - visH > 0.5),
        moreOpen,
      };
    }, visibleRectFn().toString());
    if (detail) filmRoomDetailReport.push({ job: job.name, ...detail });
  }

  // ── Measured film rectangle, required for the three Offense viewports,
  //    captured for every chart job as free supporting evidence. ─────────
  if (job.state.startsWith('chart-')) {
    const film = await page.evaluate(() => {
      const stand = document.querySelector('.gi-video-stand-in');
      const col = document.querySelector('.gi-breakdown-theater-host');
      if (!stand || !col) return null;
      const f = stand.getBoundingClientRect();
      const c = col.getBoundingClientRect();
      return {
        filmW: Math.round(f.width), filmH: Math.round(f.height),
        colW: Math.round(c.width), colH: Math.round(c.height),
        marginLeft: Math.round(f.left - c.left),
        marginRight: Math.round(c.right - f.right),
        widthBound: Math.round(f.width) >= Math.round(c.width) - 2, // within 2px of full column width
      };
    });
    if (film) filmRectReport.push({ job: job.name, ...film });
  }

  await page.screenshot({ path: path.join(OUT, job.name) });
  console.log('captured', job.name, 'hOverflow=', hOverflow, clipped.length ? `CLIPPED:${clipped.length}` : '', 'scrollTop=', scrollTopAtCapture);

  // ── Sticky commit-bar overlap, chart-mode jobs only. Runs AFTER the
  //    required screenshot and deliberately mutates scroll position --
  //    that is why it must never run before the capture above. ──────────
  if (job.state.startsWith('chart-')) {
    const sticky = await page.evaluate(() => {
      const deck = document.querySelector('.gi-breakdown-deck');
      const nav = document.querySelector('.gi-tag-nav');
      // Only OPEN groups render real content -- a closed <details>' body
      // collapses to a zero-height marker at an arbitrary anchor point and
      // is not meaningful evidence of what the coach can actually see.
      const groups = document.querySelectorAll('.gi-tag-group[open] .gi-tag-group-body');
      if (!deck || !nav || !groups.length) return null;
      deck.scrollTop = deck.scrollHeight;
      const navRect = nav.getBoundingClientRect();
      const lastRect = groups[groups.length - 1].getBoundingClientRect();
      const result = {
        navTop: Math.round(navRect.top),
        lastBottom: Math.round(lastRect.bottom),
        overlap: lastRect.bottom > navRect.top + 1,
      };
      deck.scrollTop = 0; // restore -- this job's screenshot is already saved, but leave no mutated state behind
      return result;
    });
    if (sticky) stickyReport.push({ job: job.name, ...sticky });
  }
}

// Extra diagnostic (not a required state) -- visual proof of the sticky-bar
// fix at the exact scenario named in the review: 1440x900 Offense, scrolled
// to the bottom of a form taller than the viewport. This capture is
// DELIBERATELY scrolled -- it is disclosed as a diagnostic, never presented
// as one of the required states.
await page.setViewport({ width: 1440, height: 900 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  render('chart-offense');
  document.querySelector('.qa-harness').classList.add('is-hidden');
  document.querySelectorAll('.gi-tag-group').forEach((g) => g.open = true); // worst case: every group open
  const deck = document.querySelector('.gi-breakdown-deck');
  deck.scrollTop = deck.scrollHeight;
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
await new Promise((r) => setTimeout(r, 120));
const worstCase = await page.evaluate(() => {
  const nav = document.querySelector('.gi-tag-nav');
  const groups = document.querySelectorAll('.gi-tag-group[open] .gi-tag-group-body');
  const navRect = nav.getBoundingClientRect();
  const lastRect = groups[groups.length - 1].getBoundingClientRect();
  return {
    navTop: Math.round(navRect.top),
    lastBottom: Math.round(lastRect.bottom),
    overlap: lastRect.bottom > navRect.top + 1,
  };
});
await page.screenshot({ path: path.join(OUT, 'diagnostic-1440x900-offense-scrolled-bottom.png') });
console.log('captured diagnostic-1440x900-offense-scrolled-bottom.png (not a required state, DELIBERATELY scrolled)');
console.log('worst case (every group open, 1440x900 offense, scrolled to bottom):', worstCase);

// ── Round-4 finding 2: the two new narrow-width interaction states must be
//    captured OPEN, not just proven to exist closed -- a closed trigger
//    proves nothing about whether the thing it opens is composed well. Both
//    are asserted not to physically overlap the video stage, per the
//    binding "film stays unobstructed" rule; a scrim dimming the background
//    behind a coach-invoked, dismissible overlay is expected modal behavior
//    and is not what this check is guarding against -- the PANEL itself
//    must never sit on top of the film.
//
// REVISION (Round 4 repair, finding 3): the transport-more job below always
// rendered `chart-offense` before opening the panel -- so it only ever
// proved Chart mode's overflow menu, never Film Room's. Film Room's theater
// column is always narrower than Chart's at the same viewport (a fixed
// 36%/440px fraction versus Chart's flexible remainder), which is exactly
// what caused the "..." trigger to wrap onto its own empty line there and
// not in Chart -- the task's own instruction that "Chart mode's passing
// layout does not prove Film Room's layout" is taken literally here: a
// SEPARATE, Film-Room-specific open-state job is added rather than assuming
// the Chart-mode job stands in for it.
const interactionJobs = [
  {
    name: '1280x720-transport-more-open.png',
    state: 'chart-offense',
    open: () => document.getElementById('transportMoreBtn').click(),
    panelSel: '#transportMorePanel',
    // The sibling controls this same panel used to paint over -- checked
    // directly rather than trusting "it's in normal flow now" as proof.
    siblingSel: '.gi-theater-time, .gi-theater-scrub',
  },
  {
    name: '1280x720-film-room-transport-more-open.png',
    state: 'film-room',
    open: () => document.getElementById('transportMoreBtn').click(),
    panelSel: '#transportMorePanel',
    siblingSel: '.gi-theater-time, .gi-theater-scrub',
  },
  { name: '1280x720-plays-browser-open.png', state: 'chart-offense', open: () => document.getElementById('playsToggle').click(), panelSel: '#playRail' },
];
const interactionOverlapReport = [];
for (const ij of interactionJobs) {
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate((state) => {
    render(state);
    document.querySelector('.qa-harness').classList.add('is-hidden');
  }, ij.state);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise((r) => setTimeout(r, 80));
  await page.evaluate(ij.open);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise((r) => setTimeout(r, 80));
  const check = await page.evaluate((panelSel, siblingSel) => {
    const panel = document.querySelector(panelSel);
    const stage = document.getElementById('stage');
    if (!panel || !stage) return { found: false };
    const pr = panel.getBoundingClientRect();
    const sr = stage.getBoundingClientRect();
    const overlaps = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const overlapsVideo = overlaps(pr, sr);
    let overlapsSibling = false;
    let overlappedSiblingLabel = null;
    if (siblingSel) {
      for (const el of document.querySelectorAll(siblingSel)) {
        if (panel.contains(el)) continue; // the panel's own controls don't count as "obscured by itself"
        const er = el.getBoundingClientRect();
        if (er.width <= 0 || er.height <= 0) continue; // legitimately not rendered
        if (overlaps(pr, er)) {
          overlapsSibling = true;
          overlappedSiblingLabel = (el.title || el.textContent || el.className || '').trim().slice(0, 40);
          break;
        }
      }
    }
    return {
      found: true,
      panelBox: { left: Math.round(pr.left), top: Math.round(pr.top), right: Math.round(pr.right), bottom: Math.round(pr.bottom) },
      stageBox: { left: Math.round(sr.left), top: Math.round(sr.top), right: Math.round(sr.right), bottom: Math.round(sr.bottom) },
      overlapsVideo,
      overlapsSibling,
      overlappedSiblingLabel,
    };
  }, ij.panelSel, ij.siblingSel || null);
  interactionOverlapReport.push({ job: ij.name, ...check });
  const paintDebug = await page.evaluate((panelSel) => {
    const panel = document.querySelector(panelSel);
    const cs = panel ? getComputedStyle(panel) : null;
    const atPoint = panel ? document.elementFromPoint(
      Math.round(panel.getBoundingClientRect().left + 10),
      Math.round(panel.getBoundingClientRect().top + panel.getBoundingClientRect().height / 2)
    ) : null;
    return cs && {
      display: cs.display, visibility: cs.visibility, opacity: cs.opacity, zIndex: cs.zIndex,
      background: cs.backgroundColor, border: cs.borderColor,
      topmostAtPanelPoint: atPoint ? (atPoint.tagName + '.' + atPoint.className) : null,
    };
  }, ij.panelSel);
  console.log(`captured ${ij.name}`, JSON.stringify(check), 'paint:', JSON.stringify(paintDebug));
  await page.screenshot({ path: path.join(OUT, ij.name) });
}
console.log('\n=== interaction-state overlap report (overlapsVideo and overlapsSibling must be false) ===');
console.table(interactionOverlapReport);
if (interactionOverlapReport.some((r) => r.overlapsVideo || r.overlapsSibling || !r.found)) {
  console.log('FAIL -- an open interaction panel overlaps the video stage, a sibling control, or the panel/stage could not be found.');
} else {
  console.log('CLEAN -- neither open panel overlaps the video stage or a sibling control.');
}

// ── Round-4 repair, finding 5: Players & Grades must be shown with both
//    rosters collapsed, exactly one expanded, and BOTH expanded. The first
//    two are real DEFAULT states of two of the three existing units
//    (Special Teams starts with both collapsed; Offense/Defense each start
//    with one expanded, one collapsed) -- "both expanded" is not a static
//    fixture state, so it is produced here by genuinely clicking the second
//    role's own "Show roster" control, the same interaction a coach would
//    perform. Each capture also asserts the outer-grid stretch bug (Round 4
//    repair, finding 5's root cause) cannot recur: both role cards' labels,
//    inputs, and selects must land at identical heights regardless of which
//    roster(s) are open.
async function capturePlayers(name, state, opts) {
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await page.evaluate((s) => {
    render(s);
    document.querySelector('.qa-harness').classList.add('is-hidden');
  }, state);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  if (opts && opts.expandSecond) {
    await page.evaluate(() => {
      const toggles = [...document.querySelectorAll('.gi-player-roster-toggle')];
      const closed = toggles.find((b) => b.closest('[data-roster]').dataset.roster === 'closed');
      if (closed) closed.click();
    });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  }
  const group = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.gi-tag-group')].find((el) => el.querySelector('summary strong')?.textContent.includes('Players'));
    if (!g) return null;
    g.scrollIntoView({ block: 'start' });
    return true;
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const box = await page.evaluate(() => {
    const g = [...document.querySelectorAll('.gi-tag-group')].find((el) => el.querySelector('summary strong')?.textContent.includes('Players'));
    const r = g.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(Math.min(r.height, 420)) };
  });
  const alignment = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('.gi-tag-players > div')];
    return cards.map((c) => {
      const label = c.querySelector('strong').getBoundingClientRect();
      const input = c.querySelector('input').getBoundingClientRect();
      const select = c.querySelector('select').getBoundingClientRect();
      return { labelTop: Math.round(label.top), labelHeight: Math.round(label.height), inputTop: Math.round(input.top), inputHeight: Math.round(input.height), selectHeight: Math.round(select.height) };
    });
  });
  const labelsAligned = alignment.length === 2 && alignment[0].labelTop === alignment[1].labelTop && alignment[0].labelHeight === alignment[1].labelHeight;
  const inputsAligned = alignment.length === 2
    && alignment[0].inputTop === alignment[1].inputTop
    && alignment[0].inputHeight === alignment[1].inputHeight
    && alignment[0].inputHeight === alignment[0].selectHeight
    && alignment[1].inputHeight === alignment[1].selectHeight;
  console.log(`captured ${name}`, JSON.stringify({ alignment, labelsAligned, inputsAligned }));
  await page.screenshot({ path: path.join(OUT, name), clip: box });
  return { name, alignment, labelsAligned, inputsAligned };
}
const playersReport = [];
playersReport.push(await capturePlayers('players-both-collapsed-1440x900.png', 'chart-special'));
playersReport.push(await capturePlayers('players-one-expanded-1440x900.png', 'chart-offense'));
playersReport.push(await capturePlayers('players-both-expanded-1440x900.png', 'chart-offense', { expandSecond: true }));
console.log('\n=== Players & Grades label/input alignment report (both columns must be true in every row) ===');
console.table(playersReport.map((r) => ({ name: r.name, labelsAligned: r.labelsAligned, inputsAligned: r.inputsAligned })));
if (playersReport.some((r) => !r.labelsAligned || !r.inputsAligned)) {
  console.log('FAIL -- a Players & Grades card is misaligned in at least one state.');
} else {
  console.log('CLEAN -- Passer/Receiver (and Tackler(s)/Takeaway, Kicker/Returner) labels and controls align in every state.');
}

// ── Round-4 repair, finding 2: a compact, close-up crop of the Special
//    Teams "Possession spot" + "Yard line" row specifically, since the main
//    1280/1440 chart-special captures show it at full-deck scale.
await page.setViewport({ width: 1280, height: 720 });
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  render('chart-special');
  document.querySelector('.qa-harness').classList.add('is-hidden');
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
// The row sits below the fold at 1280x720 with the deck scrolled to top --
// without scrolling it into view first, the clip region below would just
// capture whatever the deck's own STICKY commit bar happens to be
// overlapping at that screen position (caught by actually opening this
// capture, not by trusting the computed box alone).
await page.evaluate(() => {
  const label = [...document.querySelectorAll('.gi-tag-field-label span')].find((s) => s.textContent === 'Possession spot');
  label.closest('.gi-tag-situation-row').scrollIntoView({ block: 'center' });
});
await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
const stBox = await page.evaluate(() => {
  const label = [...document.querySelectorAll('.gi-tag-field-label span')].find((s) => s.textContent === 'Possession spot');
  const row = label.closest('.gi-tag-situation-row');
  const r = row.getBoundingClientRect();
  return { x: Math.round(r.left) - 8, y: Math.round(r.top) - 8, width: Math.round(r.width) + 16, height: Math.round(r.height) + 16 };
});
await page.screenshot({ path: path.join(OUT, 'special-teams-possession-row-1280x720.png'), clip: stBox });
console.log('captured special-teams-possession-row-1280x720.png', JSON.stringify(stBox));

await browser.close();

console.log('\n=== scroll-top-at-capture report (every value must be 0) ===');
console.table(scrollTopReport);
const anyNonZeroScroll = scrollTopReport.some((r) => r.scrollTopAtCapture !== 0 && r.scrollTopAtCapture !== null);
console.log(anyNonZeroScroll ? 'FAIL -- a required screenshot was taken with the deck NOT at scroll-top.' : 'CLEAN -- every required screenshot was taken at scroll-top.');

console.log('\n=== overflow report ===');
console.table(overflowReport);

console.log('\n=== measured film rectangle (chart-mode jobs) ===');
console.table(filmRectReport);

console.log('\n=== film room detail-card containment ===');
console.table(filmRoomDetailReport);
const anyDetailClip = filmRoomDetailReport.some((r) => r.clipped);
console.log(anyDetailClip ? 'FAIL -- the film room detail card is clipped in at least one job.' : 'CLEAN -- the film room detail card is fully contained in every job.');

console.log('\n=== command containment report ===');
if (clipReport.length === 0) {
  console.log('CLEAN -- zero commands clipped across all jobs.');
} else {
  for (const r of clipReport) {
    console.log(`\n${r.job}:`);
    console.table(r.clipped);
  }
}

console.log('\n=== sticky commit-bar overlap report (scrolled to bottom, AFTER the required screenshot) ===');
console.table(stickyReport);
const anyOverlap = stickyReport.some((r) => r.overlap);
console.log(anyOverlap ? 'FAIL -- sticky bar overlaps content in at least one job.' : 'CLEAN -- no overlap in any chart-mode job.');

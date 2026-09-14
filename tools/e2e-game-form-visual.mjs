/**
 * Add / Edit Game — the visual contract, and the captures behind it.
 *
 * The installed form was the last surface painting from the legacy accent
 * family (`--gi-9` / `--gi-10` / `--gi-los`), so it read blue in an app whose
 * chrome is graphite and whose primary action is gold, with 12px labels and
 * 11.5px helper text under the 12.5px floor. This asserts the rebuilt contract
 * on all four variants at all five release widths AND writes the screenshots,
 * because a computed-geometry pass is not a visual review.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { mkdirSync } from 'node:fs';

const OUT = 'artifacts/game-form-visual';
const VIEWPORTS = [[1920, 1080], [1440, 900], [1280, 800], [768, 1024], [390, 844]];
const LABEL_FLOOR = 12.5;

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage && window.app?.gameScreen);

/* The legacy blue family, by COMPUTED value: a token rename would otherwise
   let the same colors back in under a new name. */
const LEGACY_BLUES = ['rgb(43, 111, 255)', 'rgb(90, 146, 255)'];

const openForm = async mode => {
  await page.evaluate(m => { window.app.gameScreen.open({ mode: m }); }, mode);
  await page.waitForSelector('[data-native-game-form]', { timeout: 8000 });
};
const closeForm = async () => {
  await page.evaluate(() => {
    const form = document.querySelector('[data-native-game-form]');
    const cancel = [...(form?.querySelectorAll('button') || [])].find(b => /^cancel$/i.test(b.textContent.trim()));
    if (cancel) cancel.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-native-game-form]'), { timeout: 8000 }).catch(() => {});
};

const measure = () => page.evaluate(blues => {
  const form = document.querySelector('[data-native-game-form]');
  if (!form) return { present: false };
  const dialog = form.closest('[data-overlay-id]') || form.parentElement;
  const rect = form.getBoundingClientRect();
  const dialogRect = dialog.getBoundingClientRect();
  const px = v => Math.round(parseFloat(v) * 100) / 100;

  const labels = [...form.querySelectorAll('label > span, .gi-game-group > h3, .gi-game-field > small, .gi-game-tracked, .gi-game-intro')];
  const belowFloor = labels.map(el => ({ t: (el.textContent || '').trim().slice(0, 18), size: px(getComputedStyle(el).fontSize) }))
    .filter(e => e.size < 12.5 - 0.01);

  const colored = [...form.querySelectorAll('*')].flatMap(el => {
    const cs = getComputedStyle(el);
    return [cs.color, cs.backgroundColor, cs.borderTopColor, cs.borderLeftColor];
  });
  const legacy = [...new Set(colored.filter(c => blues.includes(c)))];

  const primary = form.querySelector('.gi-game-actions .is-primary');
  const primaryBg = primary ? getComputedStyle(primary).backgroundColor : '';

  // Every control's own content box must hold its content.
  const clipped = [...form.querySelectorAll('input, select, label > span, .gi-game-group > h3, button')]
    .filter(el => el.scrollWidth > el.clientWidth + 1)
    .map(el => `${el.tagName}.${el.className || el.name || ''}`.slice(0, 28));

  const actions = [...form.querySelectorAll('.gi-game-actions button')].map(b => {
    const r = b.getBoundingClientRect();
    return { label: b.textContent.trim(), bottom: Math.round(r.bottom), right: Math.round(r.right), h: Math.round(r.height), visible: r.width > 0 && r.height > 0 };
  });

  // Tab order: DOM order of focusable controls must run top to bottom and end
  // on the primary action.
  const focusables = [...form.querySelectorAll('input:not([disabled]), select, button:not([disabled])')];
  const tops = focusables.map(el => Math.round(el.getBoundingClientRect().top));
  const monotonic = tops.every((v, i) => i === 0 || v >= tops[i - 1] - 2);
  const lastIsPrimary = focusables.length > 0 && focusables[focusables.length - 1].classList.contains('is-primary');

  return {
    present: true,
    pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    formOverflowX: form.scrollWidth - form.clientWidth,
    withinViewport: Math.round(dialogRect.right) <= innerWidth + 1 && Math.round(dialogRect.left) >= -1,
    // "Reachable" means reachable, not "visible without scrolling": a tall form
    // on a phone legitimately scrolls inside `.gi-overlay-body`, the panel's own
    // scroll owner. Proven by SCROLLING to the primary and re-measuring, rather
    // than by comparing against a scrollHeight on whichever ancestor happened to
    // be picked -- the layer is not the scroller, and reading it as one made
    // this look like a containment failure at 390 when it was a bad probe.
    actionsInsideDialog: (() => {
      const primary = form.querySelector('.gi-game-actions .is-primary');
      if (!primary) return false;
      primary.scrollIntoView({ block: 'nearest' });
      const after = primary.getBoundingClientRect();
      return after.top >= -1 && after.bottom <= innerHeight + 1 && after.width > 0;
    })(),
    dialogScrolls: (() => {
      const body = form.closest('.gi-overlay-body');
      return !!body && body.scrollHeight > body.clientHeight + 1;
    })(),
    belowFloor, legacy, primaryBg, clipped, actions, monotonic, lastIsPrimary,
    /* The score fields must be the SAME control as every other field, and must
       sit together. Both were caught by looking at the capture, not by any
       assertion: a global number-input rule outranked the form's own element
       selector and painted them as unbordered filled bars, and an `auto`
       separator track threw them to opposite ends of the dialog. */
    score: (() => {
      const us = form.querySelector('[name="scoreUs"]');
      const them = form.querySelector('[name="scoreThem"]');
      // The reference must be UNFOCUSED: the dialog's initialFocus lands on a
      // grid input in edit mode, and comparing a resting border against a focus
      // border reports a difference that is not there.
      const ref = [...form.querySelectorAll('.gi-game-grid input:not([disabled])')]
        .find(el => el !== document.activeElement && el.type !== 'date');
      if (!us || !them || !ref) return null;
      const cs = getComputedStyle(us), rs = getComputedStyle(ref);
      const u = us.getBoundingClientRect(), t = them.getBoundingClientRect();
      return {
        sameBorder: cs.borderTopColor === rs.borderTopColor && cs.borderTopWidth === rs.borderTopWidth,
        sameBackground: cs.backgroundColor === rs.backgroundColor,
        sameHeight: Math.round(u.height) === Math.round(ref.getBoundingClientRect().height),
        gap: Math.round(t.left - u.right),
        aligned: Math.round(u.top) === Math.round(t.top),
      };
    })(),
    groups: form.querySelectorAll('.gi-game-group').length,
    fieldsets: form.querySelectorAll('fieldset').length,
    formWidth: Math.round(rect.width),
  };
}, LEGACY_BLUES);

const GOLD = 'rgb(217, 162, 26)';

for (const [variant, setup, mode] of [
  ['program-create', async () => { await page.evaluate(async () => { await window.app.storage.createSeason({ name: 'Prog V', team: 'VT', year: '2026', level: 'Varsity' }); }); }, 'create'],
  ['program-edit', async () => {}, 'edit'],
  ['scout-create', async () => {
    await page.evaluate(async () => {
      await window.app.storage.createSeason({ name: 'Scout V', team: 'VT', year: '2026', level: 'Varsity', kind: 'scout' });
      window.app.storage.seasonStore.data.kind = 'scout';
      window.app.storage.seasonStore.data.scout = { opponent: 'Rival High' };
    });
  }, 'create'],
  ['scout-edit', async () => {}, 'edit'],
]) {
  console.log(`\n== ${variant} ==`);
  await setup();
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    await openForm(mode);
    await new Promise(r => setTimeout(r, 260));
    const m = await measure();
    await page.screenshot({ path: `${OUT}/${variant}-${w}x${h}.png` });
    const at = `${variant} @ ${w}x${h}`;
    ok(m.present, `${at}: the form renders`);
    ok(m.pageOverflowX <= 1 && m.formOverflowX <= 1, `${at}: no horizontal overflow`, JSON.stringify({ page: m.pageOverflowX, form: m.formOverflowX }));
    ok(m.withinViewport, `${at}: the dialog stays inside the viewport`);
    ok(m.belowFloor.length === 0, `${at}: every label and helper line meets the 12.5px floor`, JSON.stringify(m.belowFloor));
    ok(m.legacy.length === 0, `${at}: no legacy blue token family is painted`, JSON.stringify(m.legacy));
    ok(m.primaryBg === GOLD, `${at}: the primary action is gold`, m.primaryBg);
    ok(m.clipped.length === 0, `${at}: no label or control clips its own content`, JSON.stringify(m.clipped));
    ok(m.actionsInsideDialog, `${at}: every action stays reachable inside the dialog`, JSON.stringify(m.actions));
    ok(m.monotonic && m.lastIsPrimary, `${at}: tab order runs top to bottom and ends on the primary`, JSON.stringify({ monotonic: m.monotonic, lastIsPrimary: m.lastIsPrimary }));
    ok(m.fieldsets === 0 && m.groups >= 3, `${at}: grouped by hairline sections, no nested card`, JSON.stringify({ groups: m.groups, fieldsets: m.fieldsets }));
    ok(m.score && m.score.sameBorder && m.score.sameBackground && m.score.sameHeight,
      `${at}: score inputs carry the same treatment as every other input`, JSON.stringify(m.score));
    ok(m.score && m.score.aligned && m.score.gap <= (w <= 700 ? 160 : 80),
      `${at}: the two score fields read as one pair, not opposite ends of the dialog`, JSON.stringify(m.score));
    await closeForm();
  }
}

console.log('\n== Focus is visible on every control ==');
await page.setViewport({ width: 1440, height: 900 });
await openForm('create');
const focusRing = await page.evaluate(() => {
  const form = document.querySelector('[data-native-game-form]');
  const out = [];
  for (const el of form.querySelectorAll('input:not([disabled]), select, button:not([disabled])')) {
    el.focus();
    const cs = getComputedStyle(el);
    out.push({ tag: el.tagName, shadow: cs.boxShadow !== 'none', outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 });
  }
  return out;
});
ok(focusRing.length > 0 && focusRing.every(f => f.shadow || f.outline),
  'every focusable control shows a visible focus state', JSON.stringify(focusRing.filter(f => !f.shadow && !f.outline)));
await closeForm();

ok(errors.length === 0, 'zero page errors across every variant and width', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\ncaptures: ${OUT} (${4 * VIEWPORTS.length} images)`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);

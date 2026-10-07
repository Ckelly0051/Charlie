// Missed tackles comp: the real built app with the canonical season, the
// proposed charting controls added in the page, captured as still screens.
// Isolated browser data only; no coach file or film is written.
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { APP_URL } from 'file:///C:/Users/charl/Charlie/tools/app-entry.mjs';
import { CANONICAL_SEASON } from 'file:///C:/Users/charl/Charlie/tools/canonical-season.mjs';

const OUT = process.argv[2];
const season = JSON.parse(fs.readFileSync(CANONICAL_SEASON, 'utf8'));
const film = fs.readFileSync('D:/Football/Film/Holy Family/20251011_135753.mp4');
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setRequestInterception(true);
page.on('request', r => r.url().endsWith('/__fixture-film.mp4') ? r.respond({ status: 200, contentType: 'video/mp4', body: film }) : r.continue());
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_hint_shown', '1'));

const setup = async (width, height, unit) => {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell);
  const picked = await page.evaluate(async (data, unit) => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data));
    store.currentSeasonId = store.data.id;
    const game = store.data.games.find(g => /holy family/i.test(g.gameInfo?.opponent || ''));
    store.data.activeGameId = game.id;
    app.storage._loadActiveGame();
    app.roster.players = data.roster || [];
    await app.workspaceShell.show('breakdown');
    app.breakdownWorkspace._setFilmFocus(false);
    const ST = { kickoff: 20, puntReturn: 24 };
    if (ST[unit]) { const p = app.tagger.plays.find(p => p.id === ST[unit]); p.specialTeams = { unit, status: 'returned' }; p.tags.players = unit === 'puntReturn' ? { returner: '2' } : { kicker: '99' }; }
    const play = ST[unit] ? app.tagger.plays.find(p => p.id === ST[unit]) : unit === 'defense'
      ? app.tagger.plays.find(p => p.tags?.unit === 'defense' && p.tags?.players?.tackler)
      : app.tagger.plays.find(p => (p.tags?.unit || 'offense') === 'offense' && p.tags?.players?.ballCarrier && Number(p.tags?.yardage) >= 6);
    app.tagger.selectPlay(play.id);
    app.vc.loadUrl(new URL('/__fixture-film.mp4', location.href).href, 'Holy Family');
    await document.fonts.ready;
    return { id: play.id, tackler: play.tags.players?.tackler, carrier: play.tags.players?.ballCarrier };
  }, season, unit);
  await page.waitForFunction(() => document.getElementById('videoPlayer').readyState >= 2);
  await page.evaluate(() => { document.getElementById('videoPlayer').currentTime = 2; });
  await new Promise(r => setTimeout(r, 3500));
  return picked;
};

// The proposal: Missed Tackles is one more player row in Players & Grades,
// directly after Tackler(s) and built like it: label, jersey-number box,
// roster picker, and a Count select (blank = not charted, 0 = checked, none)
// where the other rows have Grade. Offense has the same row after Receiver,
// count only, because opponents are not on our roster.
// mode 'ours': our players missed (roster row); 'theirs': the opponent missed on our carrier (count only).
const apply = async (mode, anchorText, label, count, missedBy) => {
  await page.addStyleTag({ content: '.gi-toast-stack{display:none!important}' });
  await page.evaluate((mode, anchorText, label, count, missedBy) => {
    const group = [...document.querySelectorAll('details.gi-tag-group')].find(d => /Players/.test(d.querySelector('summary')?.textContent || ''));
    group.open = true;
    const players = group.querySelector('.gi-tag-players');
    const rowOf = re => [...players.children].find(el => re.test(el.querySelector('strong')?.textContent || ''));
    const anchor = rowOf(new RegExp(anchorText));
    // Our players come from the roster: build the row from one of our own rows.
    const source = mode === 'ours' && !anchor.querySelector('.gi-player-roster-toggle') ? [...players.children].find(el => el.querySelector('.gi-player-roster-toggle')) : anchor;
    const missed = source.cloneNode(true);
    missed.querySelector('strong').textContent = label;
    const select = missed.querySelector('select');
    select.innerHTML = ['', '0', '1', '2', '3+'].map(v => `<option value="${v}">${v || 'Count'}</option>`).join('');
    select.value = count;
    select.setAttribute('aria-label', 'missed tackles count');
    if (mode === 'ours') {
      missed.querySelector('input').value = missedBy;
      for (const row of players.children) {
        row.classList.remove('is-active');
        row.querySelector('.gi-player-quick')?.remove();
        const toggle = row.querySelector('.gi-player-roster-toggle');
        if (toggle) toggle.innerHTML = '<span aria-hidden="true">▸</span>Show roster';
      }
      missed.classList.add('is-active');
      for (const b of missed.querySelectorAll('.gi-player-quick button')) b.classList.toggle('is-active', missedBy.split(' + ').includes(b.textContent.trim()));
    } else {
      // No jersey box or roster: the defenders who missed are not ours. The
      // Count select takes the box's place so the row keeps the grid's columns.
      missed.querySelector('input').replaceWith(select);
      missed.querySelector('.gi-player-roster-toggle')?.remove();
      missed.querySelector('.gi-player-quick')?.remove();
      missed.classList.remove('is-active');
    }
    anchor.after(missed);
    group.scrollIntoView({ block: 'start' });
  }, mode, anchorText, label, count, missedBy);
  await new Promise(r => setTimeout(r, 300));
};
for (const [w, h] of [[1440, 900], [1280, 800]]) {
  const d = await setup(w, h, 'defense');
  const nums = (season.roster || []).filter(p => p.side !== 'O').map(p => String(p.num));
  const missedBy = nums.filter(n => !String(d.tackler).split(/\s*\+\s*|,\s*/).includes(n)).slice(0, 2).join(' + ');
  await apply('ours', 'Tackler', 'Missed Tackles', '2', missedBy);
  await page.screenshot({ path: `${OUT}/defense-${w}x${h}.png` });
  console.log('defense play', d.id, 'tackler', d.tackler, 'missed', missedBy);
  const o = await setup(w, h, 'offense');
  await apply('theirs', 'Receiver', 'Missed Tackles', '1', '');
  await page.screenshot({ path: `${OUT}/offense-${w}x${h}.png` });
  console.log('offense play', o.id, 'carrier', o.carrier);
  await setup(w, h, 'kickoff');
  await apply('ours', 'Returner', 'Missed Tackles', '1', missedBy.split(' + ')[0]);
  await page.screenshot({ path: `${OUT}/kickoff-${w}x${h}.png` });
  await setup(w, h, 'puntReturn');
  await apply('theirs', 'Returner', 'Missed Tackles', '2', '');
  await page.screenshot({ path: `${OUT}/punt-return-${w}x${h}.png` });
}
// Variant: every roster picker collapsed.
{
  const d = await setup(1440, 900, 'defense');
  const nums = (season.roster || []).filter(p => p.side !== 'O').map(p => String(p.num));
  await apply('ours', 'Tackler', 'Missed Tackles', '2', nums.filter(n => !String(d.tackler).split(/\s*\+\s*|,\s*/).includes(n)).slice(0, 2).join(' + '));
  // Tight spacing for collapsed rows: 6px row padding, a 20px Show roster
  // link and a 2px gap between rows. Coarse pointers keep their 44px targets.
  await page.addStyleTag({ content: '@media (pointer:fine){.gi-tag-players{row-gap:2px}.gi-tag-players>div{padding:6px 8px}.gi-player-roster-toggle{min-height:20px}}' });
  await page.evaluate(() => {
    for (const row of document.querySelectorAll('.gi-tag-players > div')) {
      row.querySelector('.gi-player-quick')?.remove();
      const toggle = row.querySelector('.gi-player-roster-toggle');
      if (toggle) toggle.innerHTML = '<span aria-hidden="true">▸</span>Show roster';
    }
  });
  await new Promise(r => setTimeout(r, 200));
  await page.screenshot({ path: `${OUT}/defense-collapsed-1440x900.png` });
}
await browser.close();
console.log('ok');

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
    const play = unit === 'defense'
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

// The proposal: a count row (blank = not charted, 0 = checked, none) at the
// top of Players & Grades; on defense a Missed Tackle(s) roster row after
// Tackler(s), no grade. Offense charts the count only.
const apply = async (unit, count, missedBy) => {
  await page.addStyleTag({ content: '.gi-toast-stack{display:none!important}' });
  await page.evaluate((unit, count, missedBy) => {
    const group = [...document.querySelectorAll('details.gi-tag-group')].find(d => /Players/.test(d.querySelector('summary')?.textContent || ''));
    group.open = true;
    const body = group.querySelector('.gi-tag-group-body'), players = body.querySelector('.gi-tag-players');
    const row = document.createElement('div');
    row.className = 'gi-tag-field';
    row.innerHTML = `<div class="gi-tag-field-label"><span>${unit === 'defense' ? 'Missed Tackles' : 'Opponent Missed Tackles'}</span></div>
      <div class="gi-tag-chips">${['0', '1', '2', '3+'].map(v => `<button type="button" class="${v === count ? 'is-active' : ''}">${v}</button>`).join('')}</div>`;
    body.insertBefore(row, players);
    if (unit === 'defense') {
      const tackler = [...players.children].find(el => /Tackler/.test(el.querySelector('strong')?.textContent || ''));
      const missed = tackler.cloneNode(true);
      missed.classList.add('is-active'); tackler.classList.remove('is-active');
      missed.querySelector('strong').textContent = 'Missed Tackle(s)';
      missed.querySelector('input').value = missedBy;
      missed.querySelector('select')?.remove();
      tackler.querySelector('.gi-player-quick')?.remove();
      const toggle = tackler.querySelector('.gi-player-roster-toggle');
      if (toggle) toggle.innerHTML = '<span aria-hidden="true">▸</span>Show roster';
      for (const b of missed.querySelectorAll('.gi-player-quick button')) b.classList.toggle('is-active', missedBy.split(' + ').includes(b.textContent.trim()));
      tackler.after(missed);
    }
    group.scrollIntoView({ block: 'start' });
  }, unit, count, missedBy);
  await new Promise(r => setTimeout(r, 300));
};

for (const [w, h] of [[1440, 900], [1280, 800]]) {
  const d = await setup(w, h, 'defense');
  const nums = (season.roster || []).filter(p => p.side !== 'O').map(p => String(p.num));
  const missedBy = nums.filter(n => !String(d.tackler).split(/\s*\+\s*|,\s*/).includes(n)).slice(0, 2).join(' + ');
  await apply('defense', '2', missedBy);
  await page.screenshot({ path: `${OUT}/defense-${w}x${h}.png` });
  console.log('defense play', d.id, 'tackler', d.tackler, 'missed', missedBy);
  const o = await setup(w, h, 'offense');
  await apply('offense', '1', '');
  await page.screenshot({ path: `${OUT}/offense-${w}x${h}.png` });
  console.log('offense play', o.id, 'carrier', o.carrier);
}
await browser.close();
console.log('ok');

import { APP_URL } from './tools/app-entry.mjs';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = []; page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => {
  localStorage.setItem('ffa_team_profile', JSON.stringify({ teamName: 'P', jerseyColor: '#123' }));
  localStorage.setItem('ffa_teams', JSON.stringify([{ id: 't1', teamName: 'P', jerseyColor: '#123' }]));
  localStorage.setItem('ffa_active_team_id', 't1');
});
await page.reload({ waitUntil: 'networkidle0' });

const out = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'S6 Home', teamId: 't1' });
  const store = app.storage.seasonStore, game = store.activeGame();
  const mk = (id, unit, tagged) => ({ id, timestamp: { start: id, end: id + 3 },
    tags: { unit, playType: tagged ? 'Run Inside' : '', result: tagged ? 'Gain' : '', yardage: tagged ? '5' : '',
      runPass: tagged ? 'Run' : '', formation: '', players: {}, grades: {}, custom: [] }, notes: '' });
  // offense 4 plays / 3 charted, defense 3 / 1, special 2 / 0
  game.plays = [ mk(1,'offense',true), mk(2,'offense',true), mk(3,'offense',true), mk(4,'offense',false),
                 mk(5,'defense',true), mk(6,'defense',false), mk(7,'defense',false),
                 mk(8,'special',false), mk(9,'special',false) ];
  await store.persist();
  await app.storage._loadActiveGame({ renderGames: false });
  await app.workspaceShell.show('home');
  await new Promise(r => setTimeout(r, 900));

  // CANONICAL truth, computed here independently of the renderer
  const canon = { offense: [0,0], defense: [0,0], special: [0,0] };
  game.plays.forEach(p => { const u = p.tags.unit; canon[u][1]++; if (p.tags.playType && p.tags.result) canon[u][0]++; });

  const rows = [...document.querySelectorAll('#wsUnitProgress .ws-unit-row')].map(r => ({
    key: r.querySelector('.ws-unit-key')?.textContent,
    label: r.querySelector('.ws-unit-label')?.textContent,
    value: r.querySelector('strong')?.textContent,
    barWidth: r.querySelector('.ws-unit-bar i')?.style.width,
    empty: r.classList.contains('is-empty'),
  }));
  return {
    canon, rows,
    headline: document.getElementById('wsProgressText')?.textContent,
    filmSource: [...document.querySelectorAll('[data-film-source]')].map(e => ({ text: e.textContent, hidden: e.hidden })),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
console.log(JSON.stringify(out, null, 1));
console.log('pageErrors', errors.length, errors.slice(0, 3).join(' | '));
await browser.close();

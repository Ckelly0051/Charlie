import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

// Isolated browser data only. Neither the source season nor its film is written.
const seasonPath = process.env.GIQ_COMP_SEASON || 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json';
const filmPath = process.env.GIQ_COMP_FILM || 'D:/Football/Film/Holy Family/20251011_135753.mp4';
const season = JSON.parse(fs.readFileSync(seasonPath, 'utf8'));
const originalHash = createHash('sha256').update(fs.readFileSync(seasonPath)).digest('hex');
const film = fs.readFileSync(filmPath);
const output = path.resolve('artifacts/breakdown-comp-live');
fs.mkdirSync(output, { recursive: true });
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => request.url().endsWith('/__fixture-film.mp4')
    ? request.respond({ status: 200, contentType: 'video/mp4', body: film }) : request.continue());
  const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_hint_shown', '1'));
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.workspaceShell);
  await page.evaluate(async data => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(structuredClone(data));
    store.currentSeasonId = store.data.id;
    const game = store.data.games.find(item => /holy family/i.test(item.gameInfo?.opponent || '')) || store.data.games.at(-1);
    store.data.activeGameId = game.id;
    app.storage._loadActiveGame();
    app.roster.players = data.roster || [];
    await app.workspaceShell.show('breakdown');
    app.breakdownWorkspace._setFilmFocus(false);
    app.tagger.selectPlay(game.plays.find(play => play.tags?.unit === 'offense')?.id || game.plays[0].id);
    app.vc.loadUrl(new URL('/__fixture-film.mp4', location.href).href, 'Holy Family - verification copy');
    await document.fonts.ready;
  }, season);
  await page.waitForFunction(() => document.getElementById('videoPlayer').readyState >= 2);
  await page.evaluate(() => { document.getElementById('videoPlayer').currentTime = 2; });
  await new Promise(resolve => setTimeout(resolve, 5500));
  await settle();
  const snapshots = [];
  for (const [width, height] of [[1920,1080],[1440,900],[1280,720],[768,900],[390,844]]) {
    await page.setViewport({ width, height });
    for (const mode of ['chart','film-room']) {
      await page.evaluate(mode => window.app.breakdownWorkspace._setView(mode), mode);
      await settle();
      const geometry = await page.evaluate(() => {
        const box = selector => { const r=document.querySelector(selector).getBoundingClientRect(); return { x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom }; };
        return { overflow:document.documentElement.scrollWidth > innerWidth, theater:box('.gi-theater-stage'), deck:box('.gi-breakdown-deck'), footer:box('.gi-tag-nav'), media:box('#videoPlayer') };
      });
      snapshots.push({ width, height, mode, ...geometry });
      assert.equal(geometry.overflow, false, `${width} ${mode}: no page overflow`);
      if (width > 1000 && mode === 'chart') assert.ok(geometry.footer.bottom <= height + 1, `${width}: save footer visible`);
      if (mode === 'film-room') {
        assert.ok(geometry.media.width >= geometry.theater.width - 26, `${width}: Film Room picture uses the column`);
        assert.ok(Math.abs(geometry.media.width / geometry.media.height - 16/9) < .02, `${width}: Film Room keeps video aspect ratio`);
      }
      await page.screenshot({ path:path.join(output,`${width}-${mode}.png`) });
    }
  }
  for (const width of [1920,1440,1280]) {
    await page.setViewport({width,height:width===1920?1080:width===1440?900:720});
    await page.evaluate(() => window.app.breakdownWorkspace._setView('chart'));
    for (const unit of ['defense','special']) {
      await page.evaluate(unit => {
        const play=window.app.tagger.plays.find(p=>p.tags?.unit===unit);
        if (!play) throw new Error(`Missing real ${unit} fixture`);
        window.app.tagger.selectPlay(play.id);
        document.querySelector('.gi-native-form').scrollTop=0;
      },unit);
      await settle();
      await page.screenshot({path:path.join(output,`${width}-${unit}.png`)});
    }
  }
  await page.setViewport({width:1280,height:720});
  await page.evaluate(() => {
    window.app.tagger.selectPlay(window.app.tagger.plays.find(p=>p.tags?.unit==='offense').id);
  });
  await settle();
  await page.click('[aria-label="Show play strip"]');
  await settle();
  assert.equal(await page.evaluate(() => {
    const panel=document.querySelector('.gi-drive-strip'), film=document.querySelector('.gi-theater-stage');
    return panel.getAttribute('role')==='dialog' && panel.getBoundingClientRect().left >= film.getBoundingClientRect().right;
  }),true,'Open plays panel does not cover the film');
  await page.screenshot({path:path.join(output,'1280-plays-open.png')});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-label')),'Show play strip');
  await page.click('[aria-label="Show play strip"]');
  await settle();
  const selected=await page.evaluate(()=>window.app.tagger.plays.find(p=>p.id!==window.app.tagger.currentPlayId).id);
  await page.click(`[data-native-play-id="${selected}"]`);
  await settle();
  assert.equal(await page.evaluate(()=>window.app.tagger.currentPlayId),selected);
  assert.equal(await page.$('.gi-drive-strip.is-open'),null,'Selecting a play closes the browser');
  await page.click('[aria-label="More playback tools"]');
  await settle();
  assert.equal(await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.gi-theater-transport :is(button,input,select)')].filter(n=>n.getClientRects().length);
    return nodes.every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.right<=document.querySelector('.gi-theater-transport').getBoundingClientRect().right+1;});
  }),true,'Open playback tools and scrub remain contained');
  await page.screenshot({path:path.join(output,'1280-playback-tools.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.app.tagger.selectPlay(window.app.tagger.plays.find(p=>p.tags?.unit==='offense').id));
  await settle();
  const roleInputs=await page.$$('.gi-tag-players input');
  assert.ok(roleInputs.length>=2,'Real player attribution roles exist');
  await roleInputs[0].focus();
  await settle();
  await roleInputs[1].focus();
  await settle();
  const roles=await page.evaluate(()=>[...document.querySelectorAll('.gi-tag-players>div')].slice(0,2).map(n=>({
    open:!!n.querySelector('.gi-player-quick'),grade:n.querySelector('select').getBoundingClientRect().width,
    input:n.querySelector('input').getBoundingClientRect().width,
  })));
  assert.ok(roles.every(r=>r.open),'Opening a role does not close its neighbor');
  assert.ok(roles.every(r=>r.grade===92 && r.input>35),'Grades have a fixed readable width and jersey inputs remain usable');
  await page.screenshot({path:path.join(output,'1280-players-grades.png')});
  await page.evaluate(async()=>{
    const app=window.app;
    await app.workspaceShell.show('home');
    await app.workspaceShell.show('breakdown');
  });
  await settle();
  assert.equal(await page.$$eval('[data-drive-scroll]',nodes=>nodes.length),1,'Remount creates only one rail');
  await page.evaluate(()=>{
    window.app.vc.unloadVideo();
    document.querySelector('.gi-native-form').scrollTop=0;
  });
  await settle();
  await page.screenshot({path:path.join(output,'1280-missing-film.png')});
  assert.ok(await page.$('.gi-theater-media-slot .dropzone-actions'),'Missing film retains relink/import actions');
  await page.evaluate(()=>{
    const app=window.app;
    app.tagger.plays=[];
    app.tagger.currentPlayId=null;
    app.tagger._emit('plays-loaded');
  });
  await settle();
  assert.equal(await page.$('[data-native-chyron]'),null,'Empty game has no stale play chyron');
  assert.equal(await page.$$eval('[data-native-play-id]',nodes=>nodes.length),0,'Empty game has no stale rail plays');
  await page.screenshot({path:path.join(output,'1280-empty-game.png')});
  assert.equal(createHash('sha256').update(fs.readFileSync(seasonPath)).digest('hex'),originalHash,'Source season untouched');
  fs.writeFileSync(path.join(output,'geometry.json'),JSON.stringify(snapshots,null,2));
  assert.deepEqual(errors, []);
  console.log('21 production captures; real-data Chart/Film Room, all units, responsive rail, playback tools, independent rosters, remount, missing/empty film, aspect ratio and source integrity checks passed. Zero page errors.');
} finally { await browser.close(); }

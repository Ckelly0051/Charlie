import puppeteer from '../../tools/test-browser.mjs';
import { APP_URL, gotoApp } from '../../tools/app-entry.mjs';
import { CANONICAL_SEASON } from '../../tools/canonical-season.mjs';
import { SqlCatalog } from '../../js/sql-catalog.js';
import { fictionalRoster, redactRosterNames } from '../../tools/fictional-player-names.mjs';
import initSqlJs from 'sql.js';
import { readFile, writeFile, copyFile, mkdir, mkdtemp } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = dirname(fileURLToPath(import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonicalBytes = await readFile(CANONICAL_SEASON);
const canonical = JSON.parse(canonicalBytes);
const livePath = resolve(process.env.APPDATA, 'com.gridironiq.app/seasons/library.db');
const before = hash(await readFile(livePath));
const scratch = await mkdtemp(resolve(tmpdir(), 'gi-chart-comp-'));
await copyFile(livePath, resolve(scratch, 'library.db'));
const cat = await new SqlCatalog(await initSqlJs()).open(await readFile(resolve(scratch, 'library.db')));
const live = cat.loadSeason('2026-varsity-demo'); cat.close();
const rows = season => season.games.flatMap(game => game.plays.map(play => ({game, play, season})));
const real = rows(live), fixture = rows(canonical);
const find = (list, fn) => { const row=list.find(({play}) => fn(play)); if(!row) throw Error('Required state missing'); return row; };
const pass = find(fixture, p => p.tags.unit === 'offense' && p.tags.runPass === 'Pass' && p.tags.players?.receiver);
const variants = {
  offense: pass,
  defense: find(fixture, p => p.tags.unit === 'defense' && p.tags.players?.tackler),
  special: find(real, p => p.specialTeams?.unit === 'kickoff'),
  try: find(real, p => p.specialTeams?.unit === 'try'),
  penalty: find(real, p => p.penalties?.length),
  uncharted: find(real, p => p.tags.unit === 'offense' && !p.tags.playType && !p.tags.result),
  full: pass, multiple: pass, stress: pass,
  rpo: [...fixture,...real].find(({play})=>play.tags.playType?.includes('RPO')) || pass,
  qb: [...real,...fixture].find(({play})=>play.tags.playType?.includes('QB Run')) || find(fixture,p=>p.tags.unit==='offense'&&p.tags.runPass==='Run'),
};
const browser = await puppeteer.launch({args:['--no-sandbox']});
const states = {}, provenance = {};
try {
  const page = await browser.newPage(); await page.setViewport({width:1440,height:900});
  await gotoApp(page, APP_URL);
  await page.evaluate(async () => { await app.storage.createSeason({name:'Comp scratch',team:'Mavericks',year:'2025'}); });
  for(const [key,row] of Object.entries(variants)) {
    const data = JSON.parse(redactRosterNames(JSON.stringify(row.season), canonical.roster));
    data.roster=fictionalRoster(data.roster);
    const game = data.games.find(g => g.id === row.game.id), play = game.plays.find(p => p.id === row.play.id);
    const additions = {};
    if (['full','multiple','stress'].includes(key)) {
      if(key !== 'multiple') {
        additions.tags = {playCall:'Slant / Flat',personnel:'21',formationFamily:play.tags.formationFamily || 'Trips',receiverSet:'3x1',motion:'Jet',motionStart:'Left',motionEnd:'Right',strength:'Right',coverage:'Cover 3',coverageFamily:'Zone',blitz:'Edge'};
        Object.assign(play.tags, additions.tags);
        play.receiverDetail = additions.receiverDetail = {receiverNumber:play.tags.players.receiver,route:'Slant',releaseDirection:'Inside'};
      } else { additions.receiver='22, 7'; play.tags.players.receiver='22, 7'; }
    }
    if(key==='rpo'&&!play.tags.playType.includes('RPO')) {additions.tags={playType:'Short Pass + RPO',runPass:'Pass'};Object.assign(play.tags,additions.tags);}
    if(key==='qb'&&!play.tags.playType.includes('QB Run')) {additions.tags={playType:'QB Run',runPass:'Run'};Object.assign(play.tags,additions.tags);}
    if(key === 'stress') {
      const number=play.tags.players.receiver;
      const player=data.roster.find(p => String(p.num) === number);
      if(player) player.name='Christopher Alexander Montgomery-Worthington';
      additions.name='Christopher Alexander Montgomery-Worthington';
    }
    provenance[key] = {source:row.season === canonical ? 'canonical fixture' : 'scratch copy of live catalog',seasonId:data.id,gameId:game.id,game:game.name,playId:play.id,previewOnly:additions};
    await page.evaluate(async ({data,gameId,playId,stress}) => {
      const store=app.storage.seasonStore;
      app.tagger.discardDraft();
      store.data=store._normalize(data); store.currentSeasonId=data.id; store.data.activeGameId=gameId;
      app.storage._loadedGameId=gameId;
      app.roster.players=data.roster;
      app.tagger.plays=store.activeGame().plays; app.tagger.currentPlayId=null;
      app.nativeTagging.collapsedFields.clear();
      await app.workspaceShell.show('breakdown');
      app.tagger.plays=store.activeGame().plays; app.tagger.currentPlayId=null; app.tagger.selectPlay(playId);
      app.nativeTagging._publish(); app.breakdownTheater._publish();
      if(stress) {
        for(const field of ['formationFamily','backfield','receiverRoute']) app.customChips.library.add(field,'Boundary condensed switch-release double-move combination');
        app.customChips.reload(); app.nativeTagging._publish();
      }
    },{data,gameId:game.id,playId:play.id,stress:key==='stress'});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const receiver = await page.$('.gi-receiver-toggle'); if(receiver) await receiver.click();
    states[key] = await page.evaluate(() => {
      const root=document.body.cloneNode(true);
      const source=document.body;
      const originalInputs=source.querySelectorAll('input,select,textarea'), copiedInputs=root.querySelectorAll('input,select,textarea');
      copiedInputs.forEach((el,index) => { const live=originalInputs[index];
        if(el.tagName === 'SELECT') [...el.options].forEach((option,i) => option.toggleAttribute('selected',live.selectedIndex===i));
        else if(el.tagName === 'TEXTAREA') el.textContent=live.value;
        else {el.setAttribute('value',live.value); el.toggleAttribute('checked',live.checked);}
      });
      root.querySelectorAll('script').forEach(el => el.remove());
      root.querySelectorAll('img').forEach(el => {if(!el.src.startsWith('data:')) el.removeAttribute('src');});
      const video=root.querySelector('#videoPlayer');
      if(video) {video.removeAttribute('src');video.setAttribute('poster','film-frame.png');video.style.display='block';}
      root.querySelectorAll('#videoPlaceholder,#videoLoadState,.gi-film-health,.gi-toast-stack').forEach(el => el.remove());
      root.querySelectorAll('svg use').forEach(el => el.setAttribute('href','#'+el.getAttribute('href').split('#').pop()));
      const groups=[...root.querySelectorAll('.gi-tag-group')];
      return {html:root.innerHTML,sections:groups.map(el => el.querySelector('summary strong').textContent),controls:[...root.querySelectorAll('[data-native-tagging] button,[data-native-tagging] input,[data-native-tagging] select,[data-native-tagging] textarea,.gi-theater-transport button,.gi-theater-transport select,.gi-theater-actions button,.gi-breakdown-toolbar button,.ws-global-tools button')].map(el => ({tag:el.tagName,label:el.getAttribute('aria-label') || el.textContent.trim(),field:el.closest('[data-native-field]')?.dataset.nativeField || ''}))};
    });
  }
  const cssUrl=await page.$eval('link[rel=stylesheet]',el => el.href);
  const css=await (await fetch(cssUrl)).text();
  const localCss=css.replace(/url\(([^)]+)\)/g,(whole,path) => {const clean=path.replace(/["']/g,'');return clean.startsWith('data:') ? whole : `url(${new URL(clean,cssUrl).href})`;});
  // Fonts and icons are copied into this artifact; no app server is needed to review it.
  const fontPaths=[...new Set([...localCss.matchAll(/url\((https?:[^)]+\.woff2?)\)/g)].map(m=>m[1]))];
  let selfContainedCss=localCss;
  await mkdir(resolve(root,'fonts'),{recursive:true});
  for(const [i,url] of fontPaths.entries()) {const name=`font-${i}.woff2`;await writeFile(resolve(root,'fonts',name),Buffer.from(await (await fetch(url)).arrayBuffer()));selfContainedCss=selfContainedCss.replaceAll(url,`fonts/${name}`);}
  await writeFile(resolve(root,'production.css'),selfContainedCss);
  const iconURL=await page.$eval('svg use',el => new URL(el.getAttribute('href').split('#')[0],location.href).href);
  const icons=await (await fetch(iconURL)).text();
  await writeFile(resolve(root,'icons.svg'),icons);
  await copyFile(resolve(root,'../receiver-charting-2026-10-13/film-frame.png'),resolve(root,'film-frame.png'));
  await writeFile(resolve(root,'states.js'),`window.COMP_NAMES=${JSON.stringify(Object.fromEntries(fictionalRoster(canonical.roster).map(p=>[String(p.num),p.name])))};\nwindow.COMP_STATES=${JSON.stringify(states).replaceAll('<','\\u003c')};\n`);
  await writeFile(resolve(root,'index.html'),'<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GridIron IQ - Chart deck polish comp</title><link rel="stylesheet" href="production.css"><link rel="stylesheet" href="comp.css"></head><body>'+icons.replace('<svg','<svg style="display:none"')+'<div id="comp-root"></div><script src="states.js"></script><script src="comp.js"></script></body></html>');
  const after=hash(await readFile(livePath));
  if(after !== before) throw Error('Live catalog changed during read-only capture; investigate before handoff');
  if(hash(await readFile(CANONICAL_SEASON)) !== hash(canonicalBytes)) throw Error('Canonical fixture changed');
  await writeFile(resolve(root,'PROVENANCE.json'),JSON.stringify({sourceCommit:'cadf3333',canonicalHash:hash(canonicalBytes),liveHashBefore:before,liveHashAfter:after,states:provenance},null,2));
  console.log(Object.fromEntries(Object.entries(states).map(([key,s]) => [key,s.sections])));
} finally {await browser.close();}

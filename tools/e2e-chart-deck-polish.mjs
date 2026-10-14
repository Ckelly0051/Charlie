import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
import { CANONICAL_SEASON } from './canonical-season.mjs';
import { fictionalRoster, redactRosterNames } from './fictional-player-names.mjs';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

let pass=0, fail=0;
const ok=(value,label,detail)=>{console.log(`  ${value?'PASS':'FAIL'} ${label}${!value&&detail?' '+JSON.stringify(detail):''}`);value?pass++:fail++;};
// Immutable pre-polish build 3fbb8492, identical fixture and view settings.
const FILM_BASELINE={1440:[11,138,1018,542.28125],1280:[11,138,858,497.78125],768:[11,146,746,385.78125],390:[11,157,368.59375,180.78125]};
const raw=JSON.parse(readFileSync(CANONICAL_SEASON,'utf8'));
const season=JSON.parse(redactRosterNames(JSON.stringify(raw),raw.roster));
season.roster=fictionalRoster(season.roster);
const game=season.games[0], chosen=game.plays.find(p=>p.tags.unit==='offense'&&p.tags.runPass==='Pass'&&p.tags.players?.receiver);
Object.assign(chosen.tags,{playCall:'Slant / Flat',personnel:'21',formationFamily:'Trips',receiverSet:'3x1',motion:'Jet',motionStart:'Left',motionEnd:'Right',strength:'Right',coverage:'Cover 3',coverageFamily:'Zone',blitz:'Edge'});
chosen.receiverDetail={receiverNumber:chosen.tags.players.receiver,route:'Slant',releaseDirection:'Inside'};
const browser=await puppeteer.launch({args:['--no-sandbox']});
try {
  const page=await browser.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.bringToFront();await page.setViewport({width:1440,height:900}); await gotoApp(page,APP_URL);
  await page.evaluate(async({season,gameId,playId})=>{
    await app.storage.createSeason({name:'Deck polish scratch',team:'Mavericks',year:'2025'});
    app.tagger.saveDraft();
    const store=app.storage.seasonStore;
    store.data=store._normalize(season);store.currentSeasonId=season.id;store.data.activeGameId=gameId;
    app.storage._loadedGameId=gameId;app.roster.players=season.roster;app.tagger.discardDraft();
    app.tagger.plays=store.activeGame().plays;app.tagger.currentPlayId=null;
    await app.workspaceShell.show('breakdown');app.tagger.selectPlay(playId);
    app.nativeTagging._publish();app.breakdownTheater._publish();
    window.__deckFilmNode=document.getElementById('videoPlayer');window.__deckBefore=JSON.stringify(app.tagger.getCurrentPlay());
  },{season,gameId:game.id,playId:chosen.id});
  const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const opened=()=>page.$$eval('.gi-tag-group[open]',groups=>groups.map(g=>g.dataset.section));
  await settle();
  ok(JSON.stringify(await opened())==='["situation"]','initial deck has one open section');
  const hasOwner=await page.evaluate(()=>typeof app.nativeTagging.toggleSection==='function');
  ok(hasOwner,'screen owns section state');
  if(!hasOwner){console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);await browser.close();process.exit(1);}
  const summaries=await page.evaluate(()=>({call:document.querySelector('[data-section=formation-and-call] .gi-tag-summary').textContent,
    empty:['more-tools','play-diagram'].every(id=>document.querySelector(`[data-section=${id}] .gi-tag-summary`).textContent===''),
    aligned:[...document.querySelectorAll('.gi-tag-summary')].every(e=>getComputedStyle(e).textAlign==='right')}));
  ok(summaries.call.startsWith('Slant / Flat · Trips · 21 ·')&&summaries.empty&&summaries.aligned,'call-first middot summaries, literal call punctuation and blank tool/diagram summaries',summaries);
  await page.click('[data-section=formation-and-call]>summary'); await settle();
  ok((await opened()).includes('situation')&&(await opened()).includes('formation-and-call'),'opening another section never auto-closes the working section');
  await page.focus('[data-section=formation-and-call]>summary');await page.keyboard.press('Enter');await settle();
  ok(JSON.stringify(await opened())==='["situation"]'&&await page.evaluate(()=>JSON.stringify(app.tagger.getCurrentPlay())===window.__deckBefore),'keyboard disclosure closes only its module and never advances or changes the play');
  await page.click('[data-section=formation-and-call]>summary');await settle();
  await page.evaluate(()=>{app.nativeTagging.setField('hash','Left');app.nativeTagging._publish();});await settle();
  ok((await opened()).includes('formation-and-call'),'edit and refresh retain the open module');
  await page.click('[data-native-save]');await settle();
  ok((await opened()).includes('formation-and-call'),'Save retains the open module');
  await page.evaluate(()=>{const t=app.tagger;const p=t.plays.find(p=>p.id!==t.currentPlayId&&p.tags.unit==='offense'&&p.tags.playType);window.__otherPlay=p.id;t.selectPlay(p.id);});await settle();
  ok((await opened()).includes('formation-and-call'),'existing-play navigation retains the working module');
  await page.evaluate(()=>{const t=app.tagger;t.saveDraft();t.plays.push({id:9999,timestamp:{start:0,end:1},notes:'',tags:{unit:'offense',players:{},grades:{}}});t.selectPlay(9999);});await settle();
  ok(JSON.stringify(await opened())==='["situation"]','blank play opens Situation only');
  await page.evaluate(()=>{app.tagger.saveDraft();app.tagger.selectPlay(window.__otherPlay);});await settle();
  await page.click('[data-section=formation-and-call]>summary');await settle();
  await page.evaluate(()=>{app.tagger.saveDraft();app.tagger.plays.push({id:9998,timestamp:{start:0,end:1},specialTeams:{unit:'kickoff'},tags:{unit:'special',players:{},grades:{}}});app.tagger.selectPlay(9998);});await settle();
  ok(!(await opened()).includes('formation-and-call')&&(await opened()).includes('situation'),'unavailable working module falls back to Situation');
  await page.evaluate(id=>{app.tagger.saveDraft();app.tagger.selectPlay(id);},chosen.id);await settle();
  for(const id of await opened()) await page.click(`[data-section=${id}]>summary`);
  await settle();await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.down('Shift');await page.keyboard.press('Digit3');await page.keyboard.up('Shift');await settle();
  const shortcut=await page.evaluate(()=>({open:[...document.querySelectorAll('.gi-tag-group[open]')].map(g=>g.dataset.section),summary:document.querySelector('[data-section=situation] .gi-tag-summary').textContent,feedback:document.querySelector('.gi-tag-key-feedback').textContent,live:document.querySelector('.gi-tag-key-feedback').getAttribute('aria-live'),down:app.tagger.getCurrentPlay().tags.down}));
  ok(shortcut.open.length===0&&shortcut.down==='3'&&shortcut.summary.includes('3rd'),'closed-section shortcut updates real draft and summary without changing disclosures',shortcut);
  ok(shortcut.feedback==='Down: 3'&&shortcut.live==='polite','shortcut is announced in the header and live region',shortcut);
  await page.click('[data-section=formation-and-call]>summary');await settle();await page.evaluate(()=>document.activeElement?.blur());
  await page.keyboard.press('y');await settle();
  ok((await opened()).includes('formation-and-call')&&(await opened()).includes('play-and-result')&&await page.$eval('[data-native-field=yardage] input',e=>document.activeElement===e),'Y opens and focuses real Yards without closing the working module');
  await page.evaluate(()=>document.activeElement?.blur());
  await page.waitForFunction(()=>!document.querySelector('.gi-tag-key-feedback').textContent);
  const captureDir=process.env.GIQ_DECK_CAPTURE_DIR;
  if(captureDir){
    mkdirSync(captureDir,{recursive:true});
    const still='data:image/png;base64,'+readFileSync(resolve('design-comps/receiver-charting-2026-10-13/film-frame.png')).toString('base64');
    await page.evaluate(still=>{const video=document.getElementById('videoPlayer');video.poster=still;video.style.display='block';document.querySelectorAll('#videoPlaceholder,#videoLoadState,.gi-film-health').forEach(e=>e.hidden=true);},still);
  }
  const controlLabels=['Same as Last','Delete play','Save','Previous','Skip','Save & Next','Clear','Draw','Set OCR Region','Read Scoreboard','Auto-detect plays','Edit custom fields'];
  const retained=await page.evaluate(labels=>labels.every(label=>[...document.querySelectorAll('[data-native-tagging] button')].some(b=>b.textContent.trim()===label)),controlLabels);
  ok(retained,'all deck command controls remain');
  ok(await page.$eval('.gi-tag-nav',e=>e.parentElement.matches('[data-native-tagging]')&&e.firstElementChild.matches('[data-native-save]')),'Save is far left in the footer outside the form scroller');
  ok(await page.evaluate(()=>!document.querySelector('.gi-tag-field-toggle,.gi-tag-chips.is-library,input[placeholder="e.g. 26 Blast"]')),'replaced field folds, library grid and example placeholder are absent');
  for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewport(viewport);await page.evaluate(()=>document.fonts.ready);
    const baseline=FILM_BASELINE[viewport.width];
    const ids=await page.$$eval('.gi-tag-group',groups=>groups.map(g=>g.dataset.section));
    for(const id of ids) {
      await page.evaluate(id=>{const screen=app.nativeTagging;screen.openSections=new Set([id]);screen._publish();},id);await settle();
      await page.evaluate(()=>{document.querySelectorAll('*').forEach(e=>{if(e.scrollTop)e.scrollTop=0;});scrollTo(0,0);});
      const geometry=await page.evaluate(()=>{
        const g=document.querySelector('.gi-tag-group[open]'),r=document.getElementById('videoContainer').getBoundingClientRect(),deck=document.querySelector('[data-native-tagging]').getBoundingClientRect();
        const controls=[...g.querySelectorAll('button,input,select,textarea')].filter(e=>e.getClientRects().length);
        const chips=[...g.querySelectorAll('.gi-tag-chips button,.gi-player-quick button,.gi-receiver-chips button')].filter(e=>e.getClientRects().length);
        const heading=g.querySelector('summary strong'),range=document.createRange();range.selectNodeContents(heading);
        const firstChip=g.querySelector('.gi-tag-chips button');
        return{film:[r.x,r.y,r.width,r.height],sameNode:document.getElementById('videoPlayer')===window.__deckFilmNode,
          overflow:document.documentElement.scrollWidth>innerWidth,contained:controls.every(e=>{const b=e.getBoundingClientRect();return b.left>=deck.left-.5&&b.right<=deck.right+.5;}),
          chips:chips.map(e=>({height:e.getBoundingClientRect().height,font:getComputedStyle(e).fontSize})),
          gap:firstChip?firstChip.getBoundingClientRect().top-range.getBoundingClientRect().bottom:null,
          scrolls:[...document.querySelectorAll('.gi-native-form,.gi-player-quick,.gi-tag-group-body')].filter(e=>e.getClientRects().length&&/auto|scroll/.test(getComputedStyle(e).overflowY)&&e.scrollHeight>e.clientHeight+1).length};
      });
      ok(geometry.film.every((v,i)=>Math.abs(v-baseline[i])<.5)&&geometry.sameNode,`${viewport.width}/${id} unchanged film rectangle and video node`,{actual:geometry.film,expected:baseline});
      ok(!geometry.overflow&&geometry.contained,`${viewport.width}/${id} no page overflow or escaping control`,geometry);
      ok(geometry.chips.every(c=>c.height>=27&&c.font===(id==='players-and-grades'&&c.font==='12px'?'12px':'12.5px')),`${viewport.width}/${id} retained type and 27px fine targets`,geometry.chips);
      ok(geometry.scrolls<=1,`${viewport.width}/${id} one deck scroll owner`,geometry.scrolls);
      ok(await page.$$eval('.gi-tag-group[open] .gi-tag-field-label .gi-tag-library',buttons=>buttons.every(b=>{const rect=b.getBoundingClientRect(),label=b.parentElement.getBoundingClientRect(),text=b.previousElementSibling.getBoundingClientRect();return Math.abs(rect.right-label.right)<.5&&rect.left>=text.right+4;})),`${viewport.width}/${id} Edit library aligns at right without overlapping its label`);
      if(id==='situation'){
        ok(geometry.gap<=41.75/2,`${viewport.width} compact title-to-chip gap`,geometry.gap);
        ok(await page.$$eval('[data-native-field=quarter] .gi-tag-chips button',bs=>new Set(bs.map(b=>b.getBoundingClientRect().top)).size===1),`${viewport.width} Quarter including OT on one row`);
        ok(await page.$$eval('.gi-tag-situation-row',rows=>rows.every(row=>{const peers=new Map();for(const f of row.children){const label=f.querySelector('.gi-tag-field-label,span').getBoundingClientRect(),control=f.querySelector('button,input').getBoundingClientRect();const key=Math.round(label.top);if(!peers.has(key))peers.set(key,[]);peers.get(key).push(control.top);}return[...peers.values()].every(tops=>Math.max(...tops)-Math.min(...tops)<.5);})),`${viewport.width} Situation peer baselines aligned`);
      }
      if(captureDir&&[1440,390].includes(viewport.width)&&['situation','formation-and-call','players-and-grades'].includes(id)){
        if(viewport.width===390)await page.$eval('.gi-tag-group[open]',e=>e.scrollIntoView({block:'start'}));
        await page.screenshot({path:resolve(captureDir,`built-${id}-${viewport.width}x${viewport.height}.png`),fullPage:viewport.width===390});
      }
    }
    const cdp=await page.createCDPSession();await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    await page.evaluate(()=>{app.nativeTagging.openSections=new Set(['situation','formation-and-call','players-and-grades']);app.nativeTagging._publish();});await settle();
    ok(await page.$$eval('.gi-tag-group[open] .gi-tag-chips button,.gi-tag-group[open] .gi-player-quick button',bs=>bs.filter(b=>b.getClientRects().length).every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})),`${viewport.width} coarse targets 44px in both dimensions`);
    ok(await page.$$eval('.gi-tag-group[open] input:not([type=checkbox]),.gi-tag-group[open] select,.gi-tag-group[open] button',controls=>controls.filter(e=>e.getClientRects().length).every(e=>e.getBoundingClientRect().height>=44)),`${viewport.width} coarse entry and action targets retain 44px height`);
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
  }
  ok(!errors.length,'no page errors',errors);
}finally{await browser.close();}
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);if(fail)process.exitCode=1;

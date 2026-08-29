import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass=0,fail=0;
const ok=(value,label,detail='')=>value?(pass++,console.log('  PASS  '+label)):(fail++,console.log('  FAIL  '+label+(detail?' -- '+detail:'')));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
await page.setViewport({width:1440,height:900});
await page.goto(APP_URL,{waitUntil:'networkidle0'});

const fixture=await page.evaluate(async()=>{
  const app=window.app;
  await app.storage.createSeason({name:'S5d Native Breakdown',team:'Mavericks',year:'2026'});
  const game=app.storage.seasonStore.activeGame();
  game.plays=Array.from({length:12},(_,index)=>({id:index+1,timestamp:{start:index*7,end:index*7+5},notes:'',tags:{unit:'offense',down:String(index%4+1),distance:'10',formation:index%2?'Trips':'I-Form',backfield:index%2?'Single':'I',runPass:index%2?'Pass':'Run',playType:index%2?'Short Pass':'Run Inside',result:'Gain',yardage:String(index+1),players:{},grades:{},custom:[]}}));
  app.tagger.plays=game.plays;app.tagger.nextId=13;app.tagger._updateFormEnabled();app.tagger._emit('plays-loaded');app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  return {gameId:game.id};
});

console.log('\n== 1. Native theater and play strip ==');
let state=await page.evaluate(()=>{
  const video=document.getElementById('videoContainer'),slot=document.querySelector('.gi-theater-media-slot');
  const vr=video.getBoundingClientRect(),sr=slot.getBoundingClientRect();
  return {controls:!!document.querySelector('.gi-theater-transport'),contained:vr.left>=sr.left-1&&vr.right<=sr.right+1&&vr.top>=sr.top-1&&vr.bottom<=sr.bottom+1,cards:document.querySelectorAll('.gi-play-card').length,autoplay:document.querySelector('.gi-autoplay-toggle input')?.checked,legacy:document.querySelectorAll('.breakdown-player-controls,.breakdown-play-strip').length};
});
ok(state.controls&&state.contained&&!state.legacy,'Real playback controls are contained inside the video surface',JSON.stringify(state));
ok(state.cards===12,'Native play strip renders one card per canonical play',JSON.stringify(state));
ok(state.autoplay,'Video action bar exposes Autoplay next with the backward-compatible ON default');

await page.click('[data-native-play-id="5"]');
state=await page.evaluate(()=>({selected:window.app.tagger.currentPlayId,current:document.querySelector('.gi-play-card.is-current')?.dataset.nativePlayId}));
ok(state.selected===5&&state.current==='5','Selecting a play card drives the real PlayTagger and active state',JSON.stringify(state));
const beforeNode=await page.$('[data-native-play-id="5"]');
await page.evaluate(()=>{const play=window.app.tagger.getCurrentPlay();play.tags.result='Interception + Touchdown';play.tags.yardage='5';window.app.tagger._emit('play-updated',play);});
await page.waitForFunction(()=>document.querySelector('[data-native-play-id="5"]')?.textContent.includes('Interception + Touchdown: +5'));
const afterNode=await page.$('[data-native-play-id="5"]');
ok((await beforeNode.evaluate((node,other)=>node===other,afterNode)),'Ordinary tag edits update one stable play card instead of rebuilding the strip');
ok(await afterNode.evaluate(node=>node.textContent.includes('Interception + Touchdown: +5')&&!node.textContent.includes('Touchdown · +5')),'Long result copy remains complete and uses the approved colon separator');

console.log('\n== 2. Canvas, Film Room, and quick chart ==');
state=await page.evaluate(()=>{
  const canvas=window.app.canvas,ctx=canvas.ctx,clear=ctx.clearRect.bind(ctx);let clears=0;ctx.clearRect=(...args)=>{clears++;return clear(...args);};
  canvas.annotations=[];canvas._hasVisiblePlaybackAnnotations=false;const empty=canvas.renderPlaybackFrame();
  canvas.annotations=[{timestamp:window.app.vc.currentTime,tool:'line',color:'#fff',lineWidth:2,start:{x:0,y:0},end:{x:.1,y:.1}}];const visible=canvas.renderPlaybackFrame();
  canvas.annotations[0].timestamp=window.app.vc.currentTime+10;const exit=canvas.renderPlaybackFrame(),settled=canvas.renderPlaybackFrame();ctx.clearRect=clear;canvas.annotations=[];
  return {empty,visible,exit,settled,clears};
});
ok(!state.empty&&state.visible&&state.exit&&!state.settled&&state.clears===2,'Playback canvas paints only when entering or leaving an annotated frame',JSON.stringify(state));
const media=await page.$('#videoContainer');
await page.click('[data-bd-view="film-room"]');
await page.waitForFunction(()=>!document.querySelector('[data-breakdown-film-room-host]').hidden);
state=await page.evaluate(()=>({rows:window.app.nativeFilmRoom.snapshot().rows.length,play:window.app.tagger.currentPlayId}));
ok(state.rows===12&&state.play===5&&await media.evaluate(node=>node===document.getElementById('videoContainer')),'Film Room swaps the deck without remounting film or losing the selected play',JSON.stringify(state));
await page.click('[data-bd-view="chart"]');
await page.click('[data-bd-context="quick"]');
await page.waitForSelector('[data-native-quick-chart]');
state=await page.evaluate(()=>({active:window.app.quickChart.isActive,native:!!document.querySelector('[data-native-quick-chart]'),legacy:!!document.getElementById('quickChartPanel')}));
ok(state.active&&state.native&&!state.legacy,'Quick Chart selector opens one native owner with no legacy panel',JSON.stringify(state));
await page.click('[data-bd-context="self"]');

console.log('\n== 3. Route state and responsive composition ==');
await page.evaluate(()=>window.app._renderSaveState('pending'));
state=await page.evaluate(()=>({text:document.getElementById('bdSaveState')?.textContent,pending:document.getElementById('bdSaveState')?.classList.contains('is-pending')}));
ok(state.text==='Saving...'&&state.pending,'Native Break Down projects canonical autosave state',JSON.stringify(state));
for(const [width,height] of [[1280,720],[768,1024],[390,844]]){
  await page.setViewport({width,height});
  await new Promise(resolve=>setTimeout(resolve,50));
  state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth,route:!!document.querySelector('[data-native-breakdown-route]'),min:Math.min(...[...document.querySelectorAll('.gi-breakdown-toolbar button')].filter(button=>button.getClientRects().length).map(button=>button.getBoundingClientRect().height))}));
  ok(!state.overflow&&state.route&&(width>620||state.min>=44),`${width}x${height} keeps the native route contained and usable`,JSON.stringify(state));
}
console.log('\n== 4. Missing/failed film shows a real, visible recovery message ==');
await page.setViewport({width:1440,height:900});
// V2-H: _setPlaceholderText() used to write into a <p> that UIPolish's
// empty-state rebuild (ui-polish.js _initEmptyStateCTA) detaches from the
// document moments after VideoController's constructor caches it -- so a
// failed/missing clip silently fell back to the generic "Add game film"
// card with no explanation at all, on every single session. Drives the
// real error path (an invalid src, the genuine `error` event) rather than
// calling the private method directly, so this can't pass on a broken wire.
state=await page.evaluate(()=>new Promise(resolve=>{
  const vc=window.app.vc;
  vc.video.addEventListener('error',()=>requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const status=vc.placeholder.querySelector('#videoPlaceholderStatus');
    resolve({
      placeholderVisible:!vc.placeholder.classList.contains('hidden'),
      statusHidden:status?.hidden,
      statusText:status?.textContent||'',
      isError:status?.classList.contains('is-error'),
      title:vc.placeholder.querySelector('#dropzoneTitle')?.textContent,
      dropzoneStillThere:!!vc.placeholder.querySelector('[data-action="file"]'),
    });
  })),{once:true});
  vc.corsBlocked=true; // skip the CORS-retry branch -- go straight to the real failure path
  vc.video.src='data:video/mp4;base64,AAAA';
  vc.video.load();
}));
ok(state.placeholderVisible&&!state.statusHidden&&state.isError,'A genuine media error shows a visible, styled recovery message',JSON.stringify(state));
ok(state.statusText.startsWith("Couldn't play")&&state.statusText.includes('Re-link the film'),'The message names the failure and the fix, not a generic empty state',JSON.stringify(state));
ok(state.title==='Film unavailable','A real failure swaps the title instead of reading like a fresh empty state',JSON.stringify(state));
ok(state.dropzoneStillThere,'Add Video / Add Folder stay reachable as the actual recovery actions',JSON.stringify(state));
state=await page.evaluate(()=>{
  window.app.vc.unloadVideo();
  const status=window.app.vc.placeholder.querySelector('#videoPlaceholderStatus');
  return {statusHidden:status?.hidden,statusText:status?.textContent||'',title:window.app.vc.placeholder.querySelector('#dropzoneTitle')?.textContent};
});
ok(state.statusHidden&&state.statusText===''&&state.title==='Add game film','Unloading clears the failure message and title back to the neutral empty state',JSON.stringify(state));
ok(errors.length===0,'Native Breakdown journey has zero page errors',errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail?1:0);
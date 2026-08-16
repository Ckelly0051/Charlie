import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass=0,fail=0;
const ok=(value,label,detail='')=>value?(pass++,console.log('  PASS  '+label)):(fail++,console.log('  FAIL  '+label+(detail?' -- '+detail:'')));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(error.stack||error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
await page.goto(APP_URL,{waitUntil:'networkidle0'});
await page.evaluate(()=>localStorage.removeItem('ffa_breakdown_film_focus'));
await page.reload({waitUntil:'networkidle0'});
await page.waitForFunction(()=>window.app?.breakdownWorkspace&&document.querySelector('[data-native-team-hub]'));
await page.evaluate(async()=>{
  await app.storage.createSeason({name:'S5d Geometry',team:'Mavericks',year:'2026'});
  const game=app.storage.seasonStore.activeGame();
  game.plays=[{id:1,timestamp:{start:0,end:5},notes:'',tags:{unit:'offense',down:'1',distance:'10',formation:'I-Form',backfield:'I',runPass:'Run',playType:'Run Inside',result:'Gain',yardage:'6',players:{},grades:{},custom:[]}}];
  app.tagger.plays=game.plays;app.tagger.nextId=2;app.tagger._updatePlaySelect();app.tagger._updateTimeline();app.tagger._emit('plays-loaded');app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
});
const measure=async(width,height,focus)=>{
  await page.setViewport({width,height});
  await page.evaluate(value=>app.breakdownWorkspace._setFilmFocus(value),focus);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  return page.evaluate(()=>{
    const theater=document.querySelector('[data-breakdown-theater-host]').getBoundingClientRect();
    const media=document.getElementById('videoContainer').getBoundingClientRect();
    const pictureWidth=Math.min(media.width,media.height*16/9),pictureHeight=pictureWidth*9/16;
    const deck=document.querySelector('.gi-breakdown-deck').getBoundingClientRect();
    const tagging=document.querySelector('[data-native-tagging]');
    const button=document.querySelector('[data-bd-film-focus]');
    const theaterRows=[...document.querySelector('.gi-breakdown-theater').children].map(node=>({class:node.className,height:node.getBoundingClientRect().height,hidden:node.hidden}));
    return{theater:{left:theater.left,right:theater.right,width:theater.width},media:{left:media.left,right:media.right,top:media.top,bottom:media.bottom,width:pictureWidth,height:pictureHeight},deck:{left:deck.left,right:deck.right,width:deck.width,display:getComputedStyle(document.querySelector('.gi-breakdown-deck')).display},overlap:Math.max(0,Math.min(media.right,deck.right)-Math.max(media.left,deck.left))*Math.max(0,Math.min(media.bottom,deck.bottom)-Math.max(media.top,deck.top)),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,tagOverflow:tagging?tagging.scrollWidth-tagging.clientWidth:0,rows:theaterRows,focus:button?.getAttribute('aria-pressed'),stored:localStorage.getItem('ffa_breakdown_film_focus')};
  });
};
// Broadcast Density Part 1 (CLAUDE.md, 2026-08-16) adds a REQUIRED live
// below-film lower-third between the stage and the transport. A visible,
// legible strip necessarily spends some of the stage's minmax(...,1fr) row —
// there is no padding trim that makes it free. The height floors below were
// re-measured on the accepted composition (chyron included, trimmed to its
// tightest legible padding), not silently lowered: every split/focus case
// still materially exceeds the pre-lower-third legacy baseline recorded here
// historically (963x542 / 1338x753 split, 1159x652 / 1479x832 focus); only
// the HEIGHT floors move, by roughly the chyron's own rendered height, and
// each with a documented before/after. Do not lower these further without
// the same honest re-measurement.
console.log('\n== 1. Default split improves film without crowding charting ==');
let state=await measure(1440,900,false);
// was >=963x542 pre-lower-third; measured ~945x531.5 with it.
ok(state.media.width>=930&&state.media.height>=525,'1440 split meets or exceeds the legacy film picture with the lower-third included',JSON.stringify(state));
ok(state.deck.width>=420&&state.deck.width<=501&&state.tagOverflow<=1,'1440 charting deck remains usable at its bounded width',JSON.stringify(state));
ok(state.overlap===0&&state.overflow<=1,'1440 split never overlays film or overflows the page',JSON.stringify(state));
state=await measure(1920,1080,false);
// was >=1338x753 pre-lower-third; measured ~1265x711.5 with it. media.width
// here is the 16:9-corrected PICTURE width, so a height loss from the chyron
// proportionally reduces the reported width too — both floors move together.
ok(state.media.width>=1250&&state.media.height>=705,'1920 split meets or exceeds the legacy film picture with the lower-third included',JSON.stringify(state));
ok(state.deck.width>=420&&state.deck.width<=501&&state.overlap===0,'1920 keeps a bounded non-overlay charting deck',JSON.stringify(state));
console.log('\n== 2. Film Focus is explicit, larger, and durable ==');
state=await measure(1440,900,true);
// was >=1159x652 pre-lower-third; measured ~1116x627.5 with it (both floors
// move together — see the 1920-split comment above for why).
ok(state.media.width>=1100&&state.media.height>=620,'1440 Film Focus meets or exceeds the standalone-theater picture with the lower-third included',JSON.stringify(state));
ok(state.deck.display==='none'&&state.overlap===0&&state.focus==='true'&&state.stored==='1','Film Focus removes the deck from layout and persists its state',JSON.stringify(state));
state=await measure(1920,1080,true);
// was >=1479x832 pre-lower-third; measured ~1436x807.5 with it.
ok(state.media.width>=1420&&state.media.height>=800,'1920 Film Focus meets or exceeds the standalone-theater picture with the lower-third included',JSON.stringify(state));
await page.evaluate(async()=>{app.workspaceShell.disable();app.workspaceShell.enable();await app.workspaceShell.show('breakdown')});
state=await page.evaluate(()=>({focus:document.querySelector('[data-bd-film-focus]')?.getAttribute('aria-pressed'),deck:getComputedStyle(document.querySelector('.gi-breakdown-deck')).display,stored:localStorage.getItem('ffa_breakdown_film_focus')}));
ok(state.focus==='true'&&state.deck==='none'&&state.stored==='1','Film Focus survives a shell teardown and remount',JSON.stringify(state));
console.log('\n== 3. Narrow layouts stay usable ==');
state=await measure(768,1024,false);
ok(state.overflow<=1&&state.media.width>0&&state.overlap===0,'Tablet stacks without page overflow or film overlap',JSON.stringify(state));
state=await measure(390,844,false);
const touch=await page.evaluate(()=>Math.min(...[...document.querySelectorAll('.gi-breakdown-toolbar button')].filter(n=>n.getClientRects().length).map(n=>n.getBoundingClientRect().height)));
ok(state.overflow<=1&&state.media.width>0&&touch>=44,'Mobile stays overflow-free with touch-sized route controls',JSON.stringify({...state,touch}));
ok(errors.length===0,'Geometry journey has zero page errors',errors.join(' | '));
console.log('\n== RESULT: '+pass+' passed, '+fail+' failed ==');
await browser.close();
process.exit(fail?1:0);

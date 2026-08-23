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
// there is no padding trim that makes it free.
//
// CORRECTED (Codex review 2026-08-16, commit 2d4a5df): the first version of
// this comment claimed every case "still materially exceeds" the
// pre-lower-third legacy baseline. That is false and the review named the
// exact contradiction — 945x531.5 does not exceed 963x542. The accepted
// lower-third costs a modest, real amount of picture; that is a disclosed
// cost of the accepted composition, not a regression, but it must be
// recorded as what it is. Also note (per the same review): media.width
// below is the 16:9-CORRECTED PICTURE width
// (Math.min(media.width, media.height*16/9)), so a height loss from the
// chyron proportionally reduces the reported width too in every case below —
// it is not only the height that moved.
//
// Measured before (pre-lower-third, S5a) -> after (accepted composition):
//   1440 split:       963x542   -> ~945x531.5
//   1920 split:      1338x753   -> ~1265x711.5
//   1440 Film Focus:  1159x652  -> ~1116x627.5
//   1920 Film Focus:  1479x832  -> ~1436x807.5
// RE-MEASURED for V2-A (2026-08-23): the persistent Program/Season/Game
// context bar (req 1 of the V2-A build contract) is coach-approved and
// reachable on every route including Break Down, and even in its most
// compact route-scoped form (22px, no label row, 11px value type -- shrunk
// as far as it can go without becoming illegible) it costs a further real,
// disclosed slice of the picture budget on top of the lower-third's own
// disclosed cost above. Measured again, chyron-composition -> V2-A:
//   1440 split:       ~945x531.5 -> ~906x509.5
//   1920 split:      ~1265x711.5 -> ~1226x689.5
//   1440 Film Focus:  ~1116x627.5 -> ~1076x605.5
//   1920 Film Focus:  ~1436x807.5 -> ~1396x785.5
// The floors below assert the ACCEPTED post-V2A picture budget (a small
// margin under the measured values so normal rendering variance can't flake
// this), not "still beats legacy" or "still beats the chyron composition" —
// do not lower them further without the same kind of honest re-measurement,
// and do not re-inflate the wording to claim they exceed either prior
// baseline again.
console.log('\n== 1. Default split improves film without crowding charting ==');
let state=await measure(1440,900,false);
ok(state.media.width>=895&&state.media.height>=500,'1440 split meets the accepted post-V2A picture budget (a small, disclosed reduction from the post-chyron 945x531.5)',JSON.stringify(state));
ok(state.deck.width>=420&&state.deck.width<=501&&state.tagOverflow<=1,'1440 charting deck remains usable at its bounded width',JSON.stringify(state));
ok(state.overlap===0&&state.overflow<=1,'1440 split never overlays film or overflows the page',JSON.stringify(state));
state=await measure(1920,1080,false);
ok(state.media.width>=1215&&state.media.height>=680,'1920 split meets the accepted post-V2A picture budget (a small, disclosed reduction from the post-chyron 1265x711.5)',JSON.stringify(state));
ok(state.deck.width>=420&&state.deck.width<=501&&state.overlap===0,'1920 keeps a bounded non-overlay charting deck',JSON.stringify(state));
console.log('\n== 2. Film Focus is explicit, larger, and durable ==');
state=await measure(1440,900,true);
ok(state.media.width>=1065&&state.media.height>=595,'1440 Film Focus meets the accepted post-V2A picture budget (a small, disclosed reduction from the post-chyron 1116x627.5)',JSON.stringify(state));
ok(state.deck.display==='none'&&state.overlap===0&&state.focus==='true'&&state.stored==='1','Film Focus removes the deck from layout and persists its state',JSON.stringify(state));
state=await measure(1920,1080,true);
ok(state.media.width>=1385&&state.media.height>=775,'1920 Film Focus meets the accepted post-V2A picture budget (a small, disclosed reduction from the post-chyron 1436x807.5)',JSON.stringify(state));
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

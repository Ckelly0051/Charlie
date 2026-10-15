import puppeteer from './test-browser.mjs';
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
await page.waitForFunction(()=>window.app?.breakdownWorkspace&&document.querySelector('[data-native-home]'));
await page.evaluate(async()=>{
  await app.storage.createSeason({name:'S5d Geometry',team:'Mavericks',year:'2026'});
  const game=app.storage.seasonStore.activeGame();
  game.plays=[{id:1,timestamp:{start:0,end:5},notes:'',tags:{unit:'offense',down:'1',distance:'10',formationFamily:'I-Form',backfield:'I',runPass:'Run',playType:'Run Inside',result:'Gain',yardage:'6',players:{},grades:{},custom:[]}}];
  app.tagger.plays=game.plays;app.tagger.nextId=2;app.tagger._emit('plays-loaded');app.tagger.selectPlay(1);
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
    const taggingBounds=tagging?.getBoundingClientRect();
    const tagOffenders=taggingBounds?[...tagging.querySelectorAll('*')].filter(node=>{
      const rect=node.getBoundingClientRect();
      return rect.width>0&&(rect.right>taggingBounds.right+1||node.scrollWidth>node.clientWidth+1);
    }).map(node=>({tag:node.tagName,class:String(node.className).slice(0,80),width:node.getBoundingClientRect().width,client:node.clientWidth,scroll:node.scrollWidth,right:node.getBoundingClientRect().right-taggingBounds.right})).slice(0,8):[];
    const button=document.querySelector('[data-bd-film-focus]');
    const theaterRows=[...document.querySelector('.gi-breakdown-theater').children].map(node=>({class:node.className,height:node.getBoundingClientRect().height,hidden:node.hidden}));
    const styleOf=selector=>{const node=document.querySelector(selector),style=node&&getComputedStyle(node);return node&&style?{font:parseFloat(style.fontSize),height:node.getBoundingClientRect().height,clipped:node.scrollWidth>node.clientWidth+1}:null};
    const libraryAlignment=[...document.querySelectorAll('.gi-native-form button')]
      .filter(node=>/^edit library$/i.test(node.textContent.trim())&&node.getClientRects().length)
      .map(node=>{const r=node.getBoundingClientRect(),body=node.closest('.gi-tag-group-body')?.getBoundingClientRect(),prev=node.previousElementSibling?.getBoundingClientRect();return{field:node.closest('[data-native-field]')?.dataset.nativeField||'playCall',beside:!!node.closest('[data-library-align]'),right:r.right,bodyRight:body?.right,delta:body?Math.abs(body.right-r.right):null,gap:prev?r.left-prev.right:null}});
    return{composition:{left:theater.left,right:innerWidth-deck.right},theater:{left:theater.left,right:theater.right,width:theater.width},media:{left:media.left,right:media.right,top:media.top,bottom:media.bottom,width:pictureWidth,height:pictureHeight},deck:{left:deck.left,right:deck.right,width:deck.width,display:getComputedStyle(document.querySelector('.gi-breakdown-deck')).display},type:{route:styleOf('.gi-breakdown-toolbar button'),eyebrow:styleOf('.gi-breakdown-deck .gi-tag-title .gi-eyebrow'),title:styleOf('.gi-breakdown-deck .gi-tag-title h2'),unit:styleOf('.gi-breakdown-deck .gi-unit-switch button'),action:styleOf('.gi-breakdown-deck .gi-native-tagging>.gi-tag-actions button'),chip:styleOf('.gi-breakdown-deck .gi-tag-chips button')},libraryAlignment,overlap:Math.max(0,Math.min(media.right,deck.right)-Math.max(media.left,deck.left))*Math.max(0,Math.min(media.bottom,deck.bottom)-Math.max(media.top,deck.top)),overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,tagOverflow:tagging?tagging.scrollWidth-tagging.clientWidth:0,tagOffenders,rows:theaterRows,focus:button?.getAttribute('aria-pressed'),stored:localStorage.getItem('ffa_breakdown_film_focus')};
  });
};
// Picture floors reserve space for the accepted context bar, lower-third and
// navigation rail. Measure the actual 16:9 picture, not only its stage box.
// Geometry thresholds change only with coach-approved composition changes.
console.log('\n== 1. Default split improves film without crowding charting ==');
let state=await measure(1440,900,false);
ok(state.media.width>=895&&state.media.height>=500,'1440 split meets the accepted post-V2A picture budget (a small, disclosed reduction from the post-chyron 945x531.5)',JSON.stringify(state));
// August 30's reviewed comp replaces the wide deck/Charting eyebrow with a
// 400px deck, compact 18px play identity, and 12px/30px selection controls.
ok(state.deck.width===400&&state.tagOverflow<=1,'1440 charting deck matches the approved bounded width',JSON.stringify(state));
ok(state.composition.left===6&&state.composition.right===6,'1440 composition owns equal 6px outer gutters',JSON.stringify(state.composition));
// Library actions share the content right edge without overlapping labels.
ok(state.libraryAlignment.length>=3&&state.libraryAlignment.every(item=>item.gap>=4&&item.delta<=.5),
  'Every Edit library is at the section content right edge without overlapping its label',JSON.stringify(state.libraryAlignment));
// The Chart chip is 27px by the registered charting comp (CLAUDE.md Density, VISUAL-SYSTEM-RULES); its type stays >=12px.
ok(state.type.route.font>=12&&state.type.eyebrow===null&&state.type.title.font>=18&&state.type.unit.font>=12&&state.type.action.font>=12&&state.type.action.height>=30&&state.type.chip.font>=12&&state.type.chip.height===27&&!state.type.title.clipped,'1440 charting matches the compact comp without redundant Charting copy or clipped controls',JSON.stringify(state.type));
ok(state.overlap===0&&state.overflow<=1,'1440 split never overlays film or overflows the page',JSON.stringify(state));
state=await measure(1920,1080,false);
// The new vertical rail deliberately spends horizontal room on navigation:
// picture ~1162x654 vs ~1226x690 in the old two-column composition.
ok(state.media.width>=1150&&state.media.height>=645,'1920 three-column layout matches the approved comp picture budget',JSON.stringify(state));
ok(state.deck.width>=420&&state.deck.width<=501&&state.overlap===0,'1920 keeps a bounded non-overlay charting deck',JSON.stringify(state));
ok(state.composition.left===6&&state.composition.right===6,'1920 composition owns equal 6px outer gutters',JSON.stringify(state.composition));
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
console.log('\n== 4. Expanded charting groups fit inside the form ==');
for (const unit of ['offense','defense','kickoffReturn','punt']) {
  await page.evaluate(unit => {
    const play = app.tagger.plays[0];
    play.tags.unit = ['offense','defense'].includes(unit) ? unit : 'special';
    if (play.tags.unit === 'special') play.specialTeams = {unit,outcome:{status:'returned'}};
    else delete play.specialTeams;
    // Chart opens the stored play fresh: the open draft predates this write.
    app.tagger.discardDraft();
    app.tagger.selectPlay(play.id);
  }, unit);
  for (const width of [1920,1440,1280,768,390]) {
    await measure(width,900,false);
    await page.evaluate(() => document.querySelectorAll('.gi-tag-group').forEach(node => {node.open=true}));
    const fit = await page.evaluate(() => {
      const form = document.querySelector('.gi-native-form'), bounds = form.getBoundingClientRect();
      const outside = [...form.querySelectorAll('button,input,select,textarea')].filter(node => {
        const r=node.getBoundingClientRect();
        return r.width>0 && (r.right>bounds.right+1 || r.left<bounds.left-1);
      }).map(node => node.textContent || node.getAttribute('aria-label') || node.tagName);
      const labels = [...form.querySelectorAll('.gi-tag-special-metrics .gi-tag-field-label>span,.gi-tag-special-metrics label>span')];
      const textRects = labels.map(node => {
        const range=document.createRange();range.selectNodeContents(node);
        return {text:node.textContent,rect:range.getBoundingClientRect()};
      }).filter(item=>item.rect.width>0);
      const collisions = textRects.flatMap((a,index)=>textRects.slice(index+1).filter(b=>
        Math.min(a.rect.right,b.rect.right)>Math.max(a.rect.left,b.rect.left) &&
        Math.min(a.rect.bottom,b.rect.bottom)>Math.max(a.rect.top,b.rect.top)
      ).map(b=>`${a.text} / ${b.text}`));
      return {width:form.clientWidth,scroll:form.scrollWidth,outside,collisions,labelCount:textRects.length};
    });
    ok(fit.scroll<=fit.width+1 && fit.outside.length===0,`${unit} at ${width}: expanded fields and tools fit without internal sideways scrolling`,JSON.stringify(fit));
    if (['kickoffReturn','punt'].includes(unit)) ok(fit.labelCount>=6 && fit.collisions.length===0,`${unit} at ${width}: field-position labels never overlap adjacent metric labels`,JSON.stringify(fit));
  }
}
ok(errors.length===0,'Geometry journey has zero page errors',errors.join(' | '));
console.log('\n== RESULT: '+pass+' passed, '+fail+' failed ==');
await browser.close();
process.exit(fail?1:0);

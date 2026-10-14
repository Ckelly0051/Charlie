import puppeteer from '../../tools/test-browser.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root=dirname(fileURLToPath(import.meta.url)), captures=resolve(root,'captures');
await mkdir(captures,{recursive:true});
const browser=await puppeteer.launch({args:['--no-sandbox']});
const results=[], failures=[], errors=[];
const check=(name,ok,data) => {results.push({name,ok,...(data?{data}:{})});if(!ok){failures.push(name);console.log('FAIL '+name,JSON.stringify(data||''));}};
try {
  const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  const base=pathToFileURL(resolve(root,'index.html')).href;
  for(const viewport of [{width:1440,height:900},{width:1280,height:800},{width:768,height:1024},{width:390,height:844}]) {
    await page.setViewport(viewport);
    for(const state of ['offense','full','defense','special','try','penalty','uncharted','multiple','stress','rpo','qb']) {
      await page.goto(`${base}#${state}/closed`,{waitUntil:'load'});await page.evaluate(()=>document.fonts.ready);
      const sections=await page.evaluate(()=>window.COMP_CURRENT.sections);
      const inventory=await page.evaluate(()=>{
        const selectors='[data-native-tagging] button,[data-native-tagging] input,[data-native-tagging] select,[data-native-tagging] textarea,.gi-theater-transport button,.gi-theater-transport select,.gi-theater-actions button,.gi-breakdown-toolbar button,.ws-global-tools button';
        const normalize=text=>text.replace(/^←\s*/,'').trim();
        const expected=window.COMP_STATES[window.COMP_CURRENT.state].controls.filter(c=>!/^▾(?:Play Call|Opponent Play|Play Type)$/.test(c.label)).map(c=>c.tag+':'+normalize(c.label)).sort();
        const actual=[...document.querySelectorAll(selectors)].map(el=>el.tagName+':'+normalize(el.getAttribute('aria-label')||el.textContent.trim())).sort();
        return{expected,actual};
      });
      check(`${viewport.width} ${state} every real control retained`,JSON.stringify(inventory.expected)===JSON.stringify(inventory.actual));
      const views=['closed',...(['full','defense','special','try'].includes(state) ? sections : state==='penalty'?['penalties']:state==='uncharted'?['situation']:state==='multiple'?['players-and-grades']:['rpo','qb'].includes(state)?['play-and-result']:state==='offense'?['formation-and-call']:['formation-and-call','players-and-grades'])];
      const baseline=await page.evaluate(()=>{
        document.querySelector('link[href="comp.css"]').disabled=true;window.COMP_RAW();
        const r=document.getElementById('videoContainer').getBoundingClientRect();
        const style=getComputedStyle(document.querySelector('.gi-tag-chips button'));
        const result={film:[r.x+scrollX,r.y+scrollY,r.width,r.height],chipType:[style.fontFamily,style.fontSize]};
        document.querySelector('link[href="comp.css"]').disabled=false;window.COMP_REFRESH();return result;
      });
      for(const section of views) {
        await page.evaluate(section=>{window.COMP_OPEN(section);document.querySelector('.gi-native-form').scrollTop=0;scrollTo(0,0);},section);
        await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        await page.evaluate(()=>{document.querySelectorAll('*').forEach(el=>{if(el.scrollTop)el.scrollTop=0;});scrollTo(0,0);});
        const geometry=await page.evaluate(()=>{
          const film=document.getElementById('videoContainer').getBoundingClientRect(),deck=document.querySelector('.gi-native-tagging').getBoundingClientRect();
          const chips=[...document.querySelectorAll('.gi-tag-group[open] .gi-tag-chips button')].filter(el=>el.getClientRects().length);
          const offenders=[...document.querySelectorAll('.gi-tag-group[open] button,.gi-tag-group[open] input,.gi-tag-group[open] select,.gi-tag-group[open] textarea')].filter(el=>{const r=el.getBoundingClientRect();return r.width>0&&(r.left<deck.left-1||r.right>deck.right+1);}).map(el=>({text:el.textContent.slice(0,60),label:el.getAttribute('aria-label'),rect:el.getBoundingClientRect().toJSON()}));
          const chip=document.querySelector('.gi-tag-chips button'),type=getComputedStyle(chip);
          return{film:[film.x+scrollX,film.y+scrollY,film.width,film.height],chipType:[type.fontFamily,type.fontSize],overflow:document.documentElement.scrollWidth>innerWidth,offenders,chipHeights:chips.map(el=>el.getBoundingClientRect().height),open:document.querySelectorAll('.gi-tag-group[open]').length,media:document.getElementById('videoPlayer').getAttribute('poster'),scrollOwners:[...document.querySelectorAll('.gi-native-tagging,.gi-native-form,.gi-breakdown-deck,.gi-tag-group-body,.gi-player-quick')].filter(el=>el.getClientRects().length&&/auto|scroll/.test(getComputedStyle(el).overflowY)&&el.scrollHeight>el.clientHeight+1).map(el=>el.className)};
        });
        const label=`${viewport.width} ${state}/${section}`;
        check(label+' no horizontal page overflow',!geometry.overflow);
        check(label+' controls contained',!geometry.offenders.length,geometry.offenders);
        check(label+' film rectangle matches production',geometry.film.every((v,i)=>Math.abs(v-baseline.film[i])<.5),{actual:geometry.film,production:baseline.film});
        check(label+' production chip type unchanged',JSON.stringify(geometry.chipType)===JSON.stringify(baseline.chipType));
        check(label+' fine chips 27px or expanded for long text',geometry.chipHeights.every(h=>h>=27));
        check(label+' exactly requested section open',geometry.open===(section==='closed'?0:1));
        check(label+' at most one deck scroller',geometry.scrollOwners.length<=1,geometry.scrollOwners);
        if(section==='situation') check(label+' situation row baselines aligned',await page.$$eval('.gi-tag-situation-row',rows=>rows.every(row=>{const tops=[...row.children].map(el=>el.querySelector('button,input').getBoundingClientRect().top);return Math.max(...tops)-Math.min(...tops)<.5;})));
        check(label+' text stays inside chips',await page.$$eval('.gi-tag-group[open] .gi-tag-chips button,.gi-tag-group[open] .gi-receiver-chips button',buttons=>buttons.every(b=>{if(!b.getClientRects().length)return true;const r=b.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(b);const t=range.getBoundingClientRect();return t.left>=r.left&&t.right<=r.right+.5&&t.top>=r.top&&t.bottom<=r.bottom+.5;})));
        await page.screenshot({path:resolve(captures,`${state}-${section}-${viewport.width}x${viewport.height}.jpg`),type:'jpeg',quality:82,fullPage:viewport.width<=1000});
        if(viewport.width<=1000&&section!=='closed') {
          await page.evaluate(()=>document.querySelector('.gi-tag-group[open]').scrollIntoView({block:'start'}));
          await page.screenshot({path:resolve(captures,`${state}-${section}-${viewport.width}x${viewport.height}-deck.jpg`),type:'jpeg',quality:82});
        }
      }
    }
    // Coarse-pointer pass changes only hit targets, not font size or film.
    await page.goto(`${base}#full/formation-and-call`);await page.evaluate(()=>document.fonts.ready);
    const cdp=await page.createCDPSession();await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
    check(`${viewport.width} coarse pointer active`,await page.evaluate(()=>matchMedia('(pointer:coarse)').matches));
    check(`${viewport.width} coarse chip targets 44px`,await page.$$eval('.gi-tag-group[open] .gi-tag-chips button',buttons=>buttons.every(b=>{const r=b.getBoundingClientRect();return r.width>=44&&r.height>=44;})));
    check(`${viewport.width} coarse no page overflow`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:resolve(captures,`coarse-formation-${viewport.width}x${viewport.height}.jpg`),type:'jpeg',quality:82,fullPage:viewport.width<=1000});
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:false});await cdp.detach();
  }
  await page.setViewport({width:1440,height:900});await page.goto(`${base}#full/closed`);
  const keyboardBefore=await page.evaluate(()=>window.COMP_CURRENT.sections.filter(id=>document.querySelector(`[data-section="${id}"]`).open));
  await page.keyboard.down('Shift');await page.keyboard.press('Digit3');await page.keyboard.up('Shift');
  check('closed section keyboard changes summary',await page.$eval('[data-section=situation] .gi-comp-summary',el=>el.textContent.includes('3')));
  check('keyboard does not force section open',await page.evaluate(()=>document.querySelectorAll('.gi-tag-group[open]').length===0));
  check('keyboard announces changed field',await page.$eval('.gi-comp-key-feedback',el=>el.textContent.includes('Down: 3')));
  check('no page errors',errors.length===0,errors);
  await writeFile(resolve(root,'CHECKS.json'),JSON.stringify({passed:results.filter(r=>r.ok).length,failed:failures.length,errors,results},null,2));
  console.log(`${results.length} comp checks; ${failures.length} failed`);
  if(failures.length) process.exitCode=1;
} finally {await browser.close();}

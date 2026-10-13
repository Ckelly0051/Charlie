import puppeteer from 'puppeteer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const root=dirname(fileURLToPath(import.meta.url));
const browser=await puppeteer.launch({args:['--no-sandbox']});
const page=await browser.newPage();
const errors=[]; page.on('pageerror',error => errors.push(error.message));
const results=[];
const check=(name,condition) => { assert.ok(condition,name); results.push(name); };
try {
  await mkdir(resolve(root,'captures'),{recursive:true});
  // Reuse only the media pixels in an existing reviewed comp screenshot.
  // No live database, app profile, season file or film is opened.
  await page.setViewport({width:1440,height:900});
  const source=pathToFileURL(resolve(root,'../breakdown-cleanup-2026-10-05/proposed-1440x900.png')).href;
  await page.goto(source);
  await page.evaluate(() => { document.body.style.margin='0'; document.querySelector('img').style.cssText='display:block;position:absolute;left:0;top:0;width:1440px;height:900px;'; });
  await page.waitForFunction(() => document.querySelector('img').complete && document.querySelector('img').naturalWidth > 0);
  await page.screenshot({path:resolve(root,'film-frame.png'),clip:{x:38,y:138,width:964,height:541}});
  for(const viewport of [{width:1440,height:900,mobile:false},{width:390,height:844,mobile:true}]) {
    await page.setViewport({...viewport,isMobile:viewport.mobile,hasTouch:viewport.mobile,deviceScaleFactor:1});
    const bounds=[];
    for(const mode of ['closed','route','target','catch','multiple','incomplete','stress']) {
      await page.goto(`${pathToFileURL(resolve(root,'index.html')).href}#${mode}`,{waitUntil:'load'});
      await page.evaluate(() => document.fonts.ready);
      await page.evaluate(() => { scrollTo(0,0); document.getElementById('deck-scroll').scrollTop=0; });
      const geometry=await page.evaluate(() => {
        const rect=document.getElementById('film-rectangle').getBoundingClientRect();
        return {film:[rect.x+scrollX,rect.y+scrollY,rect.width,rect.height],overflow:document.documentElement.scrollWidth > innerWidth,coarse:matchMedia('(pointer:coarse)').matches,image:document.querySelector('.media img').naturalWidth};
      });
      bounds.push(geometry.film); check(`${viewport.width} ${mode}: no page overflow`,!geometry.overflow);
      check(`${viewport.width} ${mode}: film loaded`,geometry.image > 0);
      if(mode !== 'closed' && mode !== 'multiple') {
        const heights=await page.$$eval('#routes button',buttons => buttons.map(button => button.getBoundingClientRect().height));
        check(`${viewport.width} ${mode}: chip target heights`,heights.every(height => viewport.mobile ? height >= 44 : height === 27));
        if(viewport.mobile) check(`${viewport.width} ${mode}: coarse hit widths`,await page.$$eval('#routes button, #release button, #zones button',buttons => buttons.filter(button => button.getClientRects().length).every(button => button.getBoundingClientRect().width >= 44)));
      }
      if(!viewport.mobile && ['target','catch','incomplete','stress'].includes(mode)) {
        await page.evaluate(() => { const row=document.querySelector('.receiver-row'), scroller=document.getElementById('deck-scroll'); scroller.scrollTop+=row.getBoundingClientRect().top-scroller.getBoundingClientRect().top-8; });
      }
      await page.screenshot({path:resolve(root,`captures/${mode}-${viewport.width}x${viewport.height}.png`),fullPage:viewport.mobile});
      if(viewport.mobile) {
        await page.evaluate(() => document.querySelector('.receiver-row').scrollIntoView({block:'start'}));
        await page.screenshot({path:resolve(root,`captures/${mode}-${viewport.width}x${viewport.height}-editor.png`)});
      }
      if(mode === 'stress') {
        const routes=await page.$$eval('#routes button',buttons => buttons.map(button => button.dataset.route));
        for(const route of routes) {
          await page.evaluate(value => document.querySelector(`[data-route="${value}"]`).click(),route);
          check(`${viewport.width}: ${route} selection fits`,await page.evaluate(() => {
            const selected=document.querySelector('#routes [aria-pressed=true]');
            if(!selected) return false;
            const rect=selected.getBoundingClientRect(), range=document.createRange(); range.selectNodeContents(selected); const text=range.getBoundingClientRect();
            return text.left >= rect.left && text.right <= rect.right && text.top >= rect.top && text.bottom <= rect.bottom && document.documentElement.scrollWidth <= innerWidth;
          }));
        }
      }
      if(mode === 'target') {
        const gain=await page.$eval('#gain',element => element.textContent);
        await page.evaluate(() => document.querySelector('[data-zone="Deep-Right"]').click());
        await page.click('#catch-tab');
        check(`${viewport.width}: independent target and catch`,await page.$eval('#catch-summary',element => element.textContent === 'Middle / Short'));
        check(`${viewport.width}: gain unchanged`,await page.$eval('#gain',(element,value) => element.textContent === value,gain));
      }
      if(mode === 'multiple') {
        check(`${viewport.width}: unresolved target blocks detail`,await page.$eval('#receiver-detail',element => element.hidden));
        check(`${viewport.width}: unresolved target blocks save`,await page.$eval('#save',element => element.disabled));
      }
      if(mode === 'incomplete') check(`${viewport.width}: catch locked on incomplete`,await page.$eval('#catch-tab',element => element.disabled));
    }
    check(`${viewport.width}: film rectangle unchanged in every state`,bounds.every(value => JSON.stringify(value) === JSON.stringify(bounds[0])));
    await page.goto(`${pathToFileURL(resolve(root,'index.html')).href}#stress`);
    const filmBefore=await page.$eval('#film-rectangle',element => { const rect=element.getBoundingClientRect(); return [rect.x+scrollX,rect.y+scrollY,rect.width,rect.height]; });
    await page.click('#library-open');
    const filmDuring=await page.$eval('#film-rectangle',element => { const rect=element.getBoundingClientRect(); return [rect.x+scrollX,rect.y+scrollY,rect.width,rect.height]; });
    check(`${viewport.width}: inline library leaves film unchanged`,JSON.stringify(filmBefore) === JSON.stringify(filmDuring));
    check(`${viewport.width}: library stays inside deck`,await page.$eval('#library',element => { const rect=element.getBoundingClientRect(),deck=document.querySelector('.deck').getBoundingClientRect(); return rect.left >= deck.left && rect.right <= deck.right; }));
    await page.type('#new-route','Extended Double Move Return to the Boundary');
    await page.click('#add-route'); await page.click('.library-done');
    await page.evaluate(() => [...document.querySelectorAll('#routes button')].at(-1).click());
    check(`${viewport.width}: long custom route does not overflow`,await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    check(`${viewport.width}: long custom route text fits`,await page.$eval('#routes [aria-pressed=true]',element => { const rect=element.getBoundingClientRect(),range=document.createRange(); range.selectNodeContents(element); const text=range.getBoundingClientRect(); return text.left >= rect.left && text.right <= rect.right && text.top >= rect.top && text.bottom <= rect.bottom; }));
    await page.screenshot({path:resolve(root,`captures/custom-route-${viewport.width}x${viewport.height}.png`),fullPage:viewport.mobile});
  }
  check('No script errors',errors.length === 0);
  await writeFile(resolve(root,'CHECKS.json'),JSON.stringify({checks:results.length,passed:results,errors,note:'Comp-only browser rendering; no gate or product acceptance.'},null,2));
  console.log(`${results.length}/${results.length} comp checks passed`);
} finally { await browser.close(); }

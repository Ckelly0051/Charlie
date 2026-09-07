import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import puppeteer from 'puppeteer';

// Local reference thumbnails only. Originals are read, never changed or uploaded.
const output=path.resolve('design-comps/home-workspace-2026-08-31/assets');
const sources=[['holy-family','Holy Family'],['st-peter','St Peter 41-0'],['refuge','Refuge 7-13'],['sorrows','Sorrows 18-6'],['lakes','OLL 13-13']];
const clips=sources.map(([id,folder])=>{const dir=path.join('D:/Football/Film',folder);const file=fs.readdirSync(dir).filter(name=>/\.(mp4|mov)$/i.test(name)).sort()[0];if(!file)throw new Error(`No clip in ${dir}`);return{id,file:path.join(dir,file)};});
const server=http.createServer((req,res)=>{
  const clip=clips.find(item=>req.url===`/${item.id}.mp4`);
  if(clip){const body=fs.readFileSync(clip.file);res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':body.length});res.end(body);return;}
  res.setHeader('Content-Type','text/html');res.end('<body style="margin:0;background:#000"><video muted style="width:640px;height:360px;object-fit:contain"></video></body>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await puppeteer.launch({args:['--no-sandbox']});const page=await browser.newPage();await page.setViewport({width:640,height:360});
  for(const clip of clips){await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(id=>{document.querySelector('video').src=`/${id}.mp4`;},clip.id);await page.waitForFunction(()=>document.querySelector('video').readyState>=2);await page.evaluate(()=>{const v=document.querySelector('video');v.currentTime=Math.min(2,v.duration/2);});await page.waitForFunction(()=>!document.querySelector('video').seeking);await page.screenshot({path:path.join(output,`${clip.id}.jpg`),type:'jpeg',quality:86});console.log(`${clip.id}: ${clip.file}`);}
}finally{if(browser)await browser.close();server.close();}

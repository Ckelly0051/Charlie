const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', async d => { await d.accept(); });
  const URL = 'file:///C:/Users/charl/Charlie/football-film-analyzer.html';
  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1500));
  
  console.log('JOURNEY 1: COLD START');
  const cs = await page.evaluate(() => {
    const lib = document.querySelector('.library-overlay');
    const v = el => el && el.offsetParent !== null;
    return {
      library_visible: v(lib),
      placeholder_text: document.getElementById('videoPlaceholder')?.textContent?.trim().substring(0, 50),
      game_header: document.getElementById('gameHeaderSummary')?.textContent,
    };
  });
  console.log(JSON.stringify(cs, null, 2));
  
  await browser.close();
})();

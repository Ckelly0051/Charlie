import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const audits = [];

for (const [width, height] of [[1440, 900], [1280, 720]]) {
  await page.setViewport({ width, height });
  await page.goto('http://127.0.0.1:4179/design-comps/reports-matchup-2026-09-06/matchup.html',
    { waitUntil: 'networkidle0' });
  await page.mouse.move(2, 2);

  for (const [tab, name] of [
    ['our-offense', 'offense-vs-defense'],
    ['our-defense', 'defense-vs-offense'],
  ]) {
    await page.evaluate(id => document.querySelector(`[data-tab="${id}"]`)?.click(), tab);
    await page.screenshot({
      path: `design-comps/reports-matchup-2026-09-06/captures/${width}-${name}.png`,
    });
    if (width === 1440) {
      await page.screenshot({
        path: `design-comps/reports-matchup-2026-09-06/captures/${width}-${name}-full.png`,
        fullPage: true,
      });
    }
    const audit = await page.evaluate(() => ({
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      clipped: [...document.querySelectorAll('th,td:not(.film),.film button,.unit strong')]
        .filter(el => el.scrollWidth > el.clientWidth + 1)
        .map(el => el.textContent.trim()),
      escapedFilmButtons: [...document.querySelectorAll('td.film')].flatMap(cell => {
        const box = cell.getBoundingClientRect();
        return [...cell.querySelectorAll('button')]
          .filter(button => button.getBoundingClientRect().right > box.right + 1)
          .map(button => button.textContent.trim());
      }),
    }));
    audits.push({ width, tab, ...audit });
  }
}

await page.setViewport({ width: 1440, height: 900 });
for (const state of ['partial', 'empty']) {
  await page.goto('http://127.0.0.1:4179/design-comps/reports-matchup-2026-09-06/matchup.html',
    { waitUntil: 'networkidle0' });
  await page.click(`[data-state="${state}"]`);
  await page.screenshot({
    path: `design-comps/reports-matchup-2026-09-06/captures/1440-${state}.png`,
  });
  audits.push({ width: 1440, state,
    pageOverflow: await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth),
    clipped: [],
  });
}

console.log(JSON.stringify(audits, null, 2));
await browser.close();

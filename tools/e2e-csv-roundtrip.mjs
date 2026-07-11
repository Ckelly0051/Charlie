/* REGRESSION: exportCsv must quote-escape EVERY cell (not just notes), guard
   against CSV formula injection without mangling real numbers, and its own
   importPlaysFromText parser must round-trip doubled "" back to a literal quote.
   Pre-fix, only the notes cell escaped, so a formation/custom value containing a
   " produced a malformed row (broke Excel/Hudl import).

   Run after build:  node tools/e2e-csv-roundtrip.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const res = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore;
  store.data = store._normalize({
    version: 5, type: 'season', id: 'csv', seasonName: 'CSV', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: { opponent: 'X' }, status: 'active', plays: [], annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false }],
  });
  store.currentSeasonId = 'csv';
  sm._loadActiveGame();
  // Plays with adversarial cell values.
  sm.tagger.plays = [
    { id: 1, timestamp: { start: 0, end: 5 }, notes: 'said "hi", ok', annotations: [], tags: { formation: 'A"B', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '-5', down: '1', distance: '10', custom: [], players: {}, grades: {} } },
    { id: 2, timestamp: { start: 0, end: 5 }, notes: '', annotations: [], tags: { formation: '=EVIL', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '7', down: '2', distance: '4', custom: [], players: {}, grades: {} } },
  ];
  let blob = null;
  sm._download = (b) => { blob = b; };
  sm.exportCsv();
  const csv = await blob.text();
  const parsed = sm.importPlaysFromText(csv);
  const roundtrippedQuote = (parsed.lines || []).some(row => row.some(c => c === 'A"B'));
  const roundtrippedNotes = (parsed.lines || []).some(row => row.some(c => c === 'said "hi", ok'));
  return { csv, roundtrippedQuote, roundtrippedNotes };
});

ok(res.csv.includes('"A""B"'), 'embedded quote in formation is escaped ("→"") on export', JSON.stringify(res.csv.split('\n')[1]?.slice(0, 60)));
ok(res.csv.includes('"said ""hi"", ok"'), 'notes with quote AND comma exported as one escaped cell');
ok(res.csv.includes(`"'=EVIL"`), 'formula-injection cell (=EVIL) is neutralized with a leading apostrophe');
ok(res.csv.includes('"-5"') && !res.csv.includes(`"'-5"`), 'signed number -5 stays numeric (NOT formula-guarded)');
ok(res.roundtrippedQuote, 'export→import round-trips a doubled "" back to a literal quote (A"B)');
ok(res.roundtrippedNotes, 'export→import round-trips notes containing a quote and a comma');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

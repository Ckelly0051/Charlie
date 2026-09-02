import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* E3b — PROJECTED CSV EXPORT/IMPORT (GRIDIRON-IQ-TAG-MODEL.md §20, coach contract).
   Exported data must agree with Film Room, Study, and analytics: Formation carries
   STRUCTURE only, QB Alignment is its own column, Backfield/Strength/Coverage Call
   are projected, Coverage Family is its own column. There is NO fallback that puts
   Shotgun/Pistol/Under Center in Formation, and a blank optional stays blank (never
   "Unknown" — that reads as a real analytics category).

   Failing-first: pre-fix the export has no QB Alignment / Backfield / Strength /
   Coverage Family column at all and writes raw `p.tags.formation`, so a legacy
   "Shotgun + Trips" play exports Shotgun UNDER FORMATION — the exact classification
   mistake E1-E3 corrected.

   Run after build:  node tools/e2e-csv-projection.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = TEST_APP_URL;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const res = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore;
  // The StatsEngine class, reached through the live public service that owns it.
  const SE = window.app.stats.constructor;
  const blank = () => ({ custom: [], players: {}, grades: {} });
  store.data = store._normalize({
    version: 5, type: 'season', id: 'csvproj', seasonName: 'CSVProj', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: { opponent: 'X' }, status: 'active', plays: [], annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false }],
  });
  store.currentSeasonId = 'csvproj';
  sm._loadActiveGame();

  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, notes: '', annotations: [], tags: { ...blank(), ...tags } });
  sm.tagger.plays = [
    // 1. LEGACY mixed formation: alignment token lives in `formation`.
    mk(1, { unit: 'offense', formation: 'Shotgun + Trips', backfield: '', strength: 'Right',
            playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '7', down: '1', distance: '10' }),
    // 2. LEGACY coverage family charted as the whole coverage value.
    mk(2, { unit: 'defense', coverage: 'Man', defFront: '4-3',
            playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '4', down: '2', distance: '6' }),
    // 3. A real coverage CALL that merely CONTAINS a family word — must survive whole.
    mk(3, { unit: 'defense', coverage: 'Cover 3 Match', defFront: '3-3-5',
            playType: 'Deep Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', down: '3', distance: '8' }),
    // 4. Legacy `Empty` backfield token stored in formation + Pistol in backfield.
    mk(4, { unit: 'offense', formation: 'Trips + Empty', backfield: 'Pistol', strength: 'Left',
            playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3', down: '1', distance: '10' }),
    // 5. Modern SPLIT play: explicit fields already correct, nothing to move.
    mk(5, { unit: 'offense', formation: 'Ace', qbAlignment: 'Under Center', backfield: 'I', strength: 'Balanced',
            coverage: 'Cover 2', coverageFamily: 'Zone',
            playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '9', down: '2', distance: '9' }),
    // 6. Sparse play: every optional look field blank — must stay blank.
    mk(6, { unit: 'offense', playType: 'Screen', runPass: 'Pass', result: 'No Gain', yardage: '0', down: '3', distance: '3' }),
    // 7-8. MINIMALLY charted: the coach charted ONLY a look. No playType, result,
    //      yardage, down, or penalty. Charting only the fields you want is an
    //      explicit product rule — these rows must survive a round trip, not vanish.
    mk(7, { unit: 'offense', formation: 'Shotgun + Trips' }),
    mk(8, { unit: 'defense', coverage: 'Match', defFront: '3-3-5' }),
    // 9. Special Teams: unit must survive. StatsEngine reads a unit-less play as
    //    OFFENSE, so a dropped unit silently corrupts every unit-partitioned metric.
    mk(9, { unit: 'special', stType: 'Punt', result: 'Punt' }),
  ];
  const exportedUnits = sm.tagger.plays.map(p => p.tags.unit);

  // Capture the export synchronously. Blob.text() inside page.evaluate is subject
  // to a Chromium "Promise was collected" intermittent that tests the browser's
  // Blob reader rather than GridIron IQ's CSV contract.
  const NativeBlob = window.Blob;
  let blob = null;
  window.Blob = class TestBlob {
    constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; }
  };
  try {
    sm._download = (b) => { blob = b; };
    sm.exportCsv();
  } finally {
    window.Blob = NativeBlob;
  }
  const csv = blob.parts.map(part => String(part)).join('');

  // Parse the CSV back through the app's own parser so the assertions read cells,
  // not substrings (a substring match would pass on a value in the WRONG column).
  const parsed = sm.importPlaysFromText(csv);
  const headers = parsed.headers.map(h => String(h).trim());
  const cell = (rowIdx, header) => {
    const i = headers.indexOf(header);
    return i < 0 ? null : (parsed.lines[rowIdx][i] ?? '');
  };

  const COLS = ['Formation', 'QB Alignment', 'Backfield', 'Strength', 'Coverage Call', 'Coverage Family'];
  const KEYS = ['formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily'];

  // Per-row projected equality: every exported look cell equals StatsEngine.proj().
  const mismatches = [];
  sm.tagger.plays.forEach((p, r) => {
    const proj = SE.proj(p);
    COLS.forEach((col, k) => {
      const got = cell(r, col);
      const want = proj[KEYS[k]] ?? '';
      if (got !== want) mismatches.push({ play: p.id, col, got, want });
    });
  });

  // No alignment token may appear in ANY Formation cell, on any row.
  const align = ['Under Center', 'Shotgun', 'Pistol'];
  const formationLeak = parsed.lines
    .map((_, r) => cell(r, 'Formation'))
    .filter(v => align.some(a => String(v).split(' + ').map(s => s.trim()).includes(a)));

  // Round trip: import the exported CSV into a clean play list, then re-project.
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(parsed);
  const imported = sm.tagger.plays.map(p => ({
    raw: { formation: p.tags.formation, qbAlignment: p.tags.qbAlignment, backfield: p.tags.backfield, strength: p.tags.strength, coverage: p.tags.coverage, coverageFamily: p.tags.coverageFamily },
    proj: (({ formation, qbAlignment, backfield, strength, coverage, coverageFamily }) =>
      ({ formation, qbAlignment, backfield, strength, coverage, coverageFamily }))(SE.proj(p)),
  }));

  const importedUnits = sm.tagger.plays.map(p => p.tags.unit);
  const importedLooks = sm.tagger.plays.map(p => {
    const q = SE.proj(p);
    return { formation: q.formation, qbAlignment: q.qbAlignment, coverage: q.coverage, coverageFamily: q.coverageFamily };
  });

  // A row with genuinely nothing charted must STILL be skipped — the fix for the
  // minimal-play drop must not widen into "import every blank line".
  const emptyRowCsv = 'Play #,Unit,Formation,Coverage Call,Play Type,Result\n7,offense,,,,\n8,offense,Trips,,,';
  const emptyParsed = sm.importPlaysFromText(emptyRowCsv);
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(emptyParsed);
  const emptyRowResult = { count: sm.tagger.plays.length, formations: sm.tagger.plays.map(p => p.tags.formation) };

  // LEGACY header compatibility: a pre-E3b export used plain `Coverage`.
  const legacyCsv = 'Down,Distance,Formation,Coverage,Play Type,Result,Yardage\n1,10,Trips,Cover 3,Short Pass,Gain,6';
  const legacyParsed = sm.importPlaysFromText(legacyCsv);
  sm.tagger.plays = [];
  sm.tagger.nextId = 1;
  sm.applyPlayImport(legacyParsed);
  const legacyPlay = sm.tagger.plays[0];

  return {
    headers, mismatches, formationLeak, imported,
    exportedUnits, importedUnits, importedLooks, emptyRowResult,
    row1: { formation: cell(0, 'Formation'), qb: cell(0, 'QB Alignment'), strength: cell(0, 'Strength') },
    row2: { call: cell(1, 'Coverage Call'), family: cell(1, 'Coverage Family') },
    row3: { call: cell(2, 'Coverage Call'), family: cell(2, 'Coverage Family') },
    row4: { formation: cell(3, 'Formation'), qb: cell(3, 'QB Alignment'), backfield: cell(3, 'Backfield') },
    row6: COLS.map(c => cell(5, c)),
    legacy: { coverage: legacyPlay?.tags?.coverage, formation: legacyPlay?.tags?.formation },
  };
});

// --- Column contract ---
for (const col of ['Formation', 'QB Alignment', 'Backfield', 'Strength', 'Coverage Call', 'Coverage Family']) {
  ok(res.headers.includes(col), `CSV header carries the "${col}" column`, JSON.stringify(res.headers));
}

// --- Projection, per column semantic ---
ok(res.row1.formation === 'Trips' && res.row1.qb === 'Shotgun',
  'legacy "Shotgun + Trips" exports Formation=Trips with QB Alignment=Shotgun (no raw fallback)',
  JSON.stringify(res.row1));
ok(res.row1.strength === 'Right', 'Strength exports the coach\'s stored value');
ok(res.row2.call === '' && res.row2.family === 'Man',
  'legacy coverage "Man" exports Coverage Call blank + Coverage Family=Man', JSON.stringify(res.row2));
ok(res.row3.call === 'Cover 3 Match' && res.row3.family === '',
  'a real call containing a family word ("Cover 3 Match") survives whole in Coverage Call',
  JSON.stringify(res.row3));
ok(res.row4.formation === 'Trips' && res.row4.qb === 'Pistol' && res.row4.backfield === 'Empty',
  'legacy Empty-in-formation + Pistol-in-backfield split into Backfield=Empty, QB Alignment=Pistol',
  JSON.stringify(res.row4));
ok(res.row6.every(v => v === ''),
  'a play with no look charted exports SIX blank cells (never "Unknown"/"None")', JSON.stringify(res.row6));

// --- The whole-export invariants ---
ok(res.mismatches.length === 0,
  'EVERY exported look cell equals StatsEngine.proj() for its play (per-row projected equality)',
  JSON.stringify(res.mismatches));
ok(res.formationLeak.length === 0,
  'NO Formation cell in the export contains an alignment token', JSON.stringify(res.formationLeak));

// --- Round trip ---
ok(res.imported.length === 9, 'export→import produces one play per exported row — INCLUDING minimally charted ones',
  `${res.imported.length} of 9; formations back: ${JSON.stringify(res.importedLooks?.map(l => l.formation))}`);
ok(JSON.stringify(res.importedUnits) === JSON.stringify(res.exportedUnits),
  'every play\'s UNIT survives the round trip (a lost unit reads as offense and corrupts unit-partitioned analytics)',
  `exported ${JSON.stringify(res.exportedUnits)} -> imported ${JSON.stringify(res.importedUnits)}`);
ok(res.importedLooks?.[6]?.formation === 'Trips' && res.importedLooks?.[6]?.qbAlignment === 'Shotgun',
  'a play charted with ONLY a formation survives import and lands split', JSON.stringify(res.importedLooks?.[6]));
ok(res.importedLooks?.[7]?.coverageFamily === 'Match' && res.importedLooks?.[7]?.coverage === '',
  'a play charted with ONLY a coverage family survives import', JSON.stringify(res.importedLooks?.[7]));
ok(res.emptyRowResult?.count === 1 && res.emptyRowResult?.formations?.[0] === 'Trips',
  'a row with NOTHING charted is still skipped — the fix does not widen into importing blank lines',
  JSON.stringify(res.emptyRowResult));
const rt = res.imported.every(p => JSON.stringify(p.raw) === JSON.stringify(p.proj));
ok(rt, 'imported plays are ALREADY canonical — re-projecting changes nothing (no re-mixing)',
  JSON.stringify(res.imported.find(p => JSON.stringify(p.raw) !== JSON.stringify(p.proj))));
ok(res.imported[0]?.raw.formation === 'Trips' && res.imported[0]?.raw.qbAlignment === 'Shotgun',
  'the legacy mixed play lands in storage SPLIT after a CSV round trip', JSON.stringify(res.imported[0]?.raw));

// --- Backward compatibility ---
ok(res.legacy.coverage === 'Cover 3' && res.legacy.formation === 'Trips',
  'the importer still accepts a pre-E3b CSV with the plain "Coverage" header', JSON.stringify(res.legacy));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);

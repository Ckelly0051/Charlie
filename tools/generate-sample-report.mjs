/**
 * generate-sample-report.mjs
 *
 * Generates a deck of realistic dummy plays (offense + defense tagged) and runs
 * them through the REAL StatsEngine to produce a standalone HTML analytics
 * report — both offensive and defensive sections — that mirrors the in-app
 * dashboard. Output: sample-analytics-report.html (open in a browser).
 *
 *   node tools/generate-sample-report.mjs
 */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

// --- Minimal DOM stub so StatsEngine's constructor/render methods run headless ---
const stubEl = () => ({
  value: '', innerHTML: '', classList: { add() {}, remove() {} },
  addEventListener() {}, querySelector: () => stubEl(), querySelectorAll: () => [],
  appendChild() {}, removeChild() {},
});
globalThis.document = { getElementById: () => stubEl(), createElement: stubEl, body: stubEl() };
globalThis.window = {};

const { StatsEngine } = await import(join(ROOT, 'js/stats-engine.js'));
const { buildGameHtmlReport } = await import(join(ROOT, 'js/html-report.js'));

// --- Dummy data generation -------------------------------------------------
const FORMATIONS = ['Shotgun', 'Shotgun + Trips', 'Singleback', 'I-Form', 'Pistol + Spread', 'Empty', 'Under Center'];
const PERSONNEL = ['11', '12', '21', '10', '22'];
const FRONTS = ['4-3', '3-4', 'Nickel', '4-2-5', 'Dime', '4-6'];
const COVERAGES = ['Cover 1', 'Cover 2', 'Cover 3', 'Cover 4', 'Cover 0', 'Man', 'Zone'];
const BLITZ_TYPES = ['A-Gap', 'B-Gap', 'Edge', 'DB Blitz', 'Zone Blitz'];
const HASHES = ['Left', 'Middle', 'Right'];

const RB = ['22', '28', '34'];
const QB = ['7', '12'];
const WR = ['80', '11', '84', '3', '17'];
const DEF = ['55', '9', '24', '40', '52', '31', '90'];

// Simple seeded RNG for reproducible output.
let seed = 20260604;
const rng = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const pick = arr => arr[Math.floor(rng() * arr.length)];
const chance = p => rng() < p;
const randInt = (a, b) => a + Math.floor(rng() * (b - a + 1));

let playId = 0;
const plays = [];

// Build drives so down/distance/drive-level stats are coherent.
const NUM_DRIVES = 20;
for (let drive = 1; drive <= NUM_DRIVES; drive++) {
  const quarter = `Q${Math.min(4, Math.ceil((drive / NUM_DRIVES) * 4))}`;
  let down = 1, distance = 10;
  // Mix of field positions: some short fields (after takeaways), most own territory.
  let yardLine, fieldSide;
  if (chance(0.25)) { fieldSide = 'opp'; yardLine = randInt(15, 40); }      // good field position
  else { fieldSide = 'own'; yardLine = randInt(15, 45); }
  const driveLen = randInt(3, 9);

  for (let i = 0; i < driveLen; i++) {
    const isRun = chance(0.54);
    const blitz = chance(0.32) ? pick(BLITZ_TYPES) : '';
    const coverage = pick(COVERAGES);
    const defFront = pick(FRONTS);

    // Outcome
    let result = 'Gain';
    let yardage;
    let playType;
    const players = {};
    const grades = {};

    if (isRun) {
      playType = chance(0.5) ? 'Run Inside' : 'Run Outside';
      // ~16% stuffed for a loss (TFL), ~16% explosive, rest moderate gains.
      yardage = chance(0.16) ? randInt(-5, -1) : (chance(0.16) ? randInt(12, 55) : randInt(2, 9));
      players.ballCarrier = pick(RB);
      grades.ballCarrier = randInt(-1, 2);
      if (yardage < 0) { result = 'Loss'; players.tackler = pick(DEF); grades.tackler = 2; }
      else if (yardage === 0) result = 'No Gain';
      else if (chance(0.6)) { players.tackler = pick(DEF); grades.tackler = randInt(-1, 1); }
    } else {
      const r = rng();
      playType = r < 0.25 ? 'Screen' : r < 0.55 ? 'Short Pass' : r < 0.8 ? 'Medium Pass' : 'Deep Pass';
      players.passer = pick(QB);
      grades.passer = randInt(-1, 2);
      const sackP = blitz ? 0.18 : 0.06;
      const intP = blitz ? 0.07 : 0.04;
      if (chance(sackP)) {
        result = 'Sack'; yardage = randInt(-9, -3);
        players.tackler = pick(DEF); grades.tackler = 2;
      } else if (chance(intP)) {
        result = 'Interception'; yardage = 0;
        players.tackler = pick(DEF); grades.tackler = 2;
      } else if (chance(blitz ? 0.40 : 0.32)) {
        result = 'Incomplete'; yardage = 0;
      } else {
        result = 'Gain';
        yardage = playType === 'Deep Pass' ? randInt(15, 48)
          : playType === 'Medium Pass' ? randInt(8, 22)
          : randInt(1, 12);
        players.receiver = pick(WR);
        grades.receiver = randInt(0, 2);
      }
    }

    // Touchdown if it reaches the end zone.
    const absYL = fieldSide === 'opp' ? 100 - yardLine : yardLine;
    if (result === 'Gain' && absYL + yardage >= 100) { result = 'Touchdown'; }
    if (chance(0.02) && (result === 'Gain' || result === 'Loss')) { result = 'Fumble'; players.tackler = pick(DEF); }

    const gained1st = (result === 'Touchdown') || (yardage >= distance && result !== 'Interception' && result !== 'Fumble' && result !== 'Sack');

    plays.push({
      id: ++playId,
      timestamp: { start: playId * 30, end: playId * 30 + 7 },
      clipId: null,
      tags: {
        down: String(down), distance: String(distance),
        quarter, fieldSide, yardLine: String(yardLine),
        formation: pick(FORMATIONS), personnel: pick(PERSONNEL),
        runPass: isRun ? 'Run' : 'Pass',
        playType, result, yardage: String(yardage),
        hash: pick(HASHES),
        defFront, coverage, blitz,
        driveNumber: String(drive),
        unit: 'offense',
        stType: '',
        players, grades,
        custom: gained1st ? ['1st Down'] : [],
      },
      notes: '', analysis: null,
    });

    // Advance situation
    if (result === 'Touchdown' || result === 'Interception' || result === 'Fumble') break;
    if (gained1st) { down = 1; distance = 10; }
    else { down++; distance = Math.max(1, distance - Math.max(0, yardage)); }
    if (down > 4) break;
    // Move ball
    let newAbs = Math.max(1, Math.min(99, absYL + yardage));
    fieldSide = newAbs >= 50 ? 'opp' : 'own';
    yardLine = newAbs >= 50 ? 100 - newAbs : newAbs;
  }
}

// --- Compute via the real engine ------------------------------------------
const engine = new StatsEngine({ plays }, null);
const stats = engine.compute(plays);

// --- Assemble HTML through the same structured renderer the app exports. ---
const html = buildGameHtmlReport({ title: 'Sample Analytics Report', stats, engine });

const outPath = join(ROOT, 'sample-analytics-report.html');
writeFileSync(outPath, html);

// --- Markdown dump (for terminal / chat) -----------------------------------
const d = stats.defensive;
const r = stats.rushing, pa = stats.passing, e = stats.efficiency, a = stats.advanced;
const fmt = v => (v > 0 ? '+' : '') + (typeof v === 'number' ? v.toFixed(2) : v);
const md = [];
md.push(`# Sample Analytics Report`);
md.push(`*${stats.totalPlays} plays · ${NUM_DRIVES} drives · ${stats.rushing.yards + stats.passing.yards} total yards · reproducible dummy data*`);

md.push(`\n## 🏈 Offensive Analytics`);
md.push(`\n**Team:** ${stats.totalPlays} plays · ${r.yards + pa.yards} yds · ${stats.scoring.touchdowns} TD · ${stats.turnovers.total} TO`);
md.push(`**Efficiency:** ${e.successRate}% success · ${e.explosivePlays} explosive (${e.explosivePct}%) · ${e.negativePlays} negative (${e.negativePct}%)`);
md.push(`**EPA:** ${fmt(a.total)} total · ${fmt(a.perPlay)}/play`);
md.push(`**Run/Pass:** ${stats.tendencies.runPassRatio} (${stats.tendencies.runPct}% / ${stats.tendencies.passPct}%)`);

md.push(`\n**Rushing**\n`);
md.push(`| Att | Yds | Avg | Long | TD | Fum |`);
md.push(`|---|---|---|---|---|---|`);
md.push(`| ${r.attempts} | ${r.yards} | ${r.average} | ${r.longest} | ${r.touchdowns} | ${r.fumbles} |`);
md.push(`\n**Passing**\n`);
md.push(`| C/A | Pct | Yds | YPA | TD | INT | Sck |`);
md.push(`|---|---|---|---|---|---|---|`);
md.push(`| ${pa.completions}/${pa.attempts} | ${pa.completionPct}% | ${pa.yards} | ${pa.average} | ${pa.touchdowns} | ${pa.interceptions} | ${pa.sacks} |`);

md.push(`\n**Down & Distance**\n`);
md.push(`| Down | Plays | Run/Pass | Avg | Conv% |`);
md.push(`|---|---|---|---|---|`);
const dl = { '1':'1st','2':'2nd','3':'3rd','4':'4th' };
for (const [dn, s] of Object.entries(stats.downs.byDown)) { if (!s.total) continue; md.push(`| ${dl[dn]} | ${s.total} | ${s.runPct}%/${s.passPct}% | ${s.avgYards} | ${s.conversionPct}% |`); }
md.push(`\n3rd down: ${stats.downs.thirdDownConv} (${stats.downs.thirdDownPct}%) · 4th down: ${stats.downs.fourthDownConv} (${stats.downs.fourthDownPct}%)`);

md.push(`\n**Formation Tendencies**\n`);
md.push(`| Formation | # | % |`);
md.push(`|---|---|---|`);
Object.entries(stats.tendencies.formations).sort((x,y)=>y[1]-x[1]).forEach(([n,c])=>md.push(`| ${n} | ${c} | ${((c/stats.totalPlays)*100).toFixed(1)}% |`));

md.push(`\n**Top EPA Plays**\n`);
md.push(`| # | Situation | Yds | EPA |`);
md.push(`|---|---|---|---|`);
a.top.slice(0,5).forEach(x=>{const t=x.play.tags;md.push(`| #${x.play.id} | ${t.down}&${t.distance} ${t.playType} | ${t.yardage} | ${fmt(x.epa)} |`);});

md.push(`\n## 🛡️ Defensive Analytics`);
md.push(`\n**Havoc:** ${d.havocRate}% (${d.havocPlays} plays) · **Sacks:** ${d.sacks} (${d.sackYards} yds) · **TFL:** ${d.tfl} · **Turnovers:** ${d.interceptions + d.fumbles} (${d.interceptions} INT / ${d.fumbles} Fum)`);
md.push(`**Blitz:** ${d.blitzRate}% rate (${d.blitzTotal} plays) · ${d.blitzHavocRate}% havoc · **Forced incompletions:** ${d.incompletions} · **3-and-outs:** ${d.threeAndOuts}`);

md.push(`\n**Defensive Front Breakdown**\n`);
md.push(`| Front | # | Run/Pass | Yds | Avg | Stop% | Havoc% |`);
md.push(`|---|---|---|---|---|---|---|`);
d.fronts.forEach(f=>md.push(`| ${f.name} | ${f.count} | ${f.runs}/${f.passes} | ${f.yards} | ${(f.yards/f.count).toFixed(1)} | ${Math.round(f.successes/f.count*100)}% | ${Math.round(f.havoc/f.count*100)}% |`));

md.push(`\n**Coverage Breakdown**\n`);
md.push(`| Coverage | # | Comp | Inc | INT | Sack | Yds | Avg | Stop% |`);
md.push(`|---|---|---|---|---|---|---|---|---|`);
d.coverages.forEach(c=>md.push(`| ${c.name} | ${c.count} | ${c.comps} | ${c.incs} | ${c.ints} | ${c.sacks} | ${c.yards} | ${(c.yards/c.count).toFixed(1)} | ${Math.round(c.successes/c.count*100)}% |`));

md.push(`\n**Blitz Analysis**\n`);
md.push(`| Blitz | # | Sacks | Havoc% | Avg Yds | Stop% |`);
md.push(`|---|---|---|---|---|---|`);
d.blitzes.forEach(b=>md.push(`| ${b.name} | ${b.count} | ${b.sacks} | ${Math.round(b.havoc/b.count*100)}% | ${(b.yards/b.count).toFixed(1)} | ${Math.round(b.successes/b.count*100)}% |`));

md.push(`\n**Front Usage by Situation**\n`);
[d.earlyDownFronts, d.passingDownFronts].forEach(sit=>{
  md.push(`\n*${sit.label} (${sit.total})*: ` + sit.fronts.map(([n,c])=>`${n} ${Math.round(c/sit.total*100)}%`).join(' · '));
});

const mdText = md.join('\n');
writeFileSync(join(ROOT, 'sample-analytics-report.md'), mdText);
console.log(mdText);
console.log(`\n---\nWrote ${outPath} and sample-analytics-report.md`);

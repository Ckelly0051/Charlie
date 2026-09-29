/**
 * Reports Presentation Independence — structured view models.
 *
 * Pure functions only. Every function here takes an already-computed `stats`
 * object (StatsEngine.compute()'s output, or an equivalent report object
 * from generateSelfScout()/generateDefensiveSelfScout()/defensivePerformance()
 * /_playCallAnalysis()) and returns a PLAIN JS OBJECT shaped for a Reports
 * component — never HTML, never a DOM node.
 *
 * No formula, denominator, cohort, or classification is computed here that
 * isn't already present on the `stats`/report object StatsEngine produced.
 * Where a value needs an instance method (e.g. StatsEngine's own
 * `_isSuccessfulPlay`), the StatsEngine instance is passed in explicitly as
 * `engine` — this module never re-derives or duplicates a formula.
 *
 * `SpecialTeamsModel` is imported for its coach-facing UNIT NAMES only, which
 * it owns; no football value comes from here.
 */
import { SpecialTeamsModel } from './special-teams.js';

export function overviewKpis(stats) {
  const totalYards = stats.rushing.yards + stats.passing.yards;
  const yardsPerPlay = stats.offPlays.length ? (totalYards / stats.offPlays.length).toFixed(1) : '—';
  const penalty = stats.penalties || {};
  const giveaways = stats.turnovers?.giveaways ?? stats.offenseTurnovers ?? 0;
  // The CHARTED cohort is the headline; the CLASSIFIED cohort is its qualifier.
  // `stats.allPlays` is the classified count every measure below is computed
  // over — it is not the number of plays charted, and printing it as
  // "N charted · 100%" claimed 64 of 64 on a game with 83 charted snaps.
  const charted = stats.chartedPlays ?? stats.allPlays;
  const classifiedPct = charted ? Math.round(stats.allPlays / charted * 100) : 0;
  return [
    // The approved Overview separates a count from its qualifier with a middot,
    // not a comma (design-approvals/reports/overview: "63 charted · 100%").
    { label: 'Total plays', value: charted, sub: `${stats.allPlays} of ${charted} classified · ${classifiedPct}%` },
    // `successes` is the field `_efficiencyStats` actually returns. The old
    // `successfulPlays` never existed, so this sub printed a constant 0 beneath
    // a nonzero success rate on every game and every season.
    { label: 'Success rate', value: `${stats.efficiency.successRate}%`, sub: `${stats.efficiency.successes || 0} successful snaps`, cls: 'is-good' },
    { label: 'Yards / play', value: yardsPerPlay, sub: `${totalYards} total yards`, cls: 'is-gold' },
    { label: 'Explosive Plays', value: stats.efficiency.explosivePlays, sub: `${stats.efficiency.explosivePct}% of snaps` },
    // The tile already says Turnovers; the sub said the same thing in the
    // legacy word. It names the side instead, which is the fact it can add.
    { label: 'Turnovers', value: giveaways, sub: 'lost by our offense' },
    { label: 'Plays for loss', value: stats.efficiency.negativePlays, sub: `${stats.efficiency.negativePct}% of snaps` },
    { label: 'Penalties', value: penalty.hasData ? penalty.accepted : 0, sub: penalty.hasData ? `${penalty.subjectYards} yards accepted` : 'none charted' },
  ];
}

export function snapsByPhase(stats) {
  /* A phase is a property of the snap, so it is COUNTED from the snap over the
   * complete charted cohort. Special Teams used to be derived by subtraction
   * (allPlays - offense - defense) from the CLASSIFIED cohort, which reported 1
   * for a game holding 13 special-teams snaps: only the lone XP carrying a play
   * type survived that cohort. Yards per play stays on the classified
   * production cohort, because a yards-per-play over an unclassified snap
   * states nothing. */
  const counts = stats.phaseCounts;
  const off = counts ? counts.offense : stats.offPlays.length;
  const def = counts ? counts.defense : stats.defPlays.length;
  const special = counts ? counts.special : Math.max(0, stats.allPlays - stats.offPlays.length - stats.defPlays.length);
  const total = Math.max(1, off + def + special);
  const offYards = stats.rushing.yards + stats.passing.yards;
  const defYards = stats.defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage, 10) || 0), 0);
  const offClassified = stats.offPlays.length, defClassified = stats.defPlays.length;
  const row = (label, count, ypp, cls) => ({ label, count, share: Math.round(count / total * 100), ypp: count ? ypp : '—', cls });
  return {
    total: off + def + special, off, def, special,
    rows: [
      row('Offense', off, offClassified ? (offYards / offClassified).toFixed(1) : '—', 'is-offense'),
      row('Defense', def, defClassified ? `${(defYards / defClassified).toFixed(1)} allowed` : '—', 'is-defense'),
      row('Special Teams', special, '—', 'is-special'),
    ],
  };
}

export function situationalTiles(stats) {
  const s = stats.situational;
  const third = stats.downs.byDown?.['3'] || { total: 0, conversionPct: 0 };
  const tile = (title, item, cutType, cutVal, sub) => ({
    title, value: item.total ? `${item.successPct}%` : '—',
    sub: item.total ? sub(item) : 'No data',
    refs: null, cutType, cutVal, plays: item.total,
    cutLabel: item.total ? `${title} — ${item.total} plays` : null,
  });
  return [
    tile('Red zone', s.redZone, 'situation', 'redZone', item => `${item.tds} TD, ${item.total} snaps`),
    tile('Goal line', s.goalLine, 'situation', 'goalLine', item => `${item.tds} TD, ${item.total} snaps`),
    { title: 'Third down', value: third.total ? `${third.conversionPct}%` : '—', sub: third.total ? stats.downs.thirdDownConv : 'No data', cutType: 'down', cutVal: '3', plays: third.total, cutLabel: third.total ? `Third down — ${third.total} plays` : null },
    // Same thresholds as `_distBucket`'s Long and Short, so the same wording.
    tile('3rd & 7+', s.thirdLong, 'situation', 'thirdLong', item => `${item.successes} of ${item.total}`),
    tile('3rd & 1-3', s.thirdShort, 'situation', 'thirdShort', item => `${item.successes} of ${item.total}`),
    tile('Backed up', s.backedUp, 'situation', 'backedUp', item => `${item.successes} of ${item.total}`),
  ];
}

export function keyMetrics(stats) {
  const topFormation = stats.tendencies.formationList?.[0];
  const redZone = stats.situational.redZone;
  return [
    ['Efficiency', `${stats.efficiency.successRate}%`, 'Success rate'],
    ['Explosive Plays', stats.efficiency.explosivePlays, `${stats.efficiency.explosivePct}% of snaps`],
    ['Situational', redZone.total ? `${redZone.successPct}%` : '—', redZone.total ? 'Red-zone success' : 'No red-zone snaps'],
    ['Tendencies', topFormation ? `${Math.round(topFormation.runs / topFormation.count * 100)}%` : '—', topFormation ? `${topFormation.name} run rate` : 'No formation sample'],
    ['Negative', stats.efficiency.negativePlays, `${stats.efficiency.negativePct}% of snaps`],
    ['Points / drive', stats.drives.pointsPerDrive, `${stats.drives.scoringDrives} of ${stats.drives.total} scored`],
  ];
}

export function rushingRows(stats) {
  const r = stats.rushing;
  return { meta: `${r.attempts} attempts`, rows: [
    ['Attempts', r.attempts], ['Yards', r.yards], ['Average', r.average], ['Touchdowns', r.touchdowns, 'is-good'], ['Longest', r.longest], ['First downs', r.firstDowns], ['Fumbles', r.fumbles],
  ] };
}

export function passingRows(stats) {
  const p = stats.passing;
  return { meta: `${p.attempts} attempts`, rows: [
    ['Completions / attempts', `${p.completions} / ${p.attempts}`], ['Completion rate', `${p.completionPct}%`], ['Yards', p.yards], ['Yards / attempt', p.average], ['Touchdowns', p.touchdowns, 'is-good'], ['Interceptions', p.interceptions], ['Longest', p.longest], ['Sacks taken', p.sacks],
  ] };
}

/** The approved Overview composition renders a FIXED row count per module, so
 *  a ranked list that cannot supply its count keeps the slot and states the
 *  absence rather than shortening the board. `No data` is the app's one
 *  absence label, at copy weight, and an absence row is never interactive —
 *  there is no film behind a row that names nothing. A MEASURED zero keeps its
 *  number and its denominator, exactly as everywhere else; this fills only the
 *  slots for entries that do not exist. */
export function padRows(rows, limit, key) {
  const out = [...rows];
  while (out.length < limit) out.push({ absent: true, class: 'is-absent', [key]: ABSENT_SLOT });
  return out;
}

/** A slot for a row that DOES NOT EXIST — a ninth drive in a game that had
 *  five. Distinct from `No data`, which is this app's one label for a value
 *  that could not be MEASURED. The difference is real and worth keeping: a
 *  defense that faced five possessions did not fail to measure the sixth, and
 *  printing `No data` there says the charting fell short when it did not.
 *  It renders in every column of the row, so the slot reads as a held place
 *  rather than as a row that failed to load. */
export const ABSENT_SLOT = '–';
/** Rushing and Passing for the OPPONENT's offense, measured on our defensive
 *  snaps. Same rows, same order, same labels as our own two modules, so the
 *  four read as one comparison — with `allowed` in the meta so a number can
 *  never be mistaken for our own production. */
export function opponentRushingRows(stats, statsEngine) {
  const r = statsEngine.opponentProduction(stats.defPlays, stats.orderedPlays).rushing;
  return { meta: `${r.attempts} attempts allowed`, rows: [
    ['Attempts', r.attempts], ['Yards', r.yards], ['Average', r.average], ['Touchdowns', r.touchdowns],
    ['Longest', r.longest], ['First downs', r.firstDowns], ['Fumbles', r.fumbles, 'is-good'],
  ] };
}

export function opponentPassingRows(stats, statsEngine) {
  const p = statsEngine.opponentProduction(stats.defPlays, stats.orderedPlays).passing;
  return { meta: `${p.attempts} attempts allowed`, rows: [
    ['Completions / attempts', `${p.completions} / ${p.attempts}`], ['Completion rate', `${p.completionPct}%`],
    ['Yards', p.yards], ['Yards / attempt', p.average], ['Touchdowns', p.touchdowns],
    ['Interceptions', p.interceptions, 'is-good'], ['Longest', p.longest], ['Sacks', p.sacks, 'is-good'],
  ] };
}

/** The FIXED play-type list — exactly the six `StatsEngine` enumerates, every
 *  game. A type the game never called reads `0`, which is a real fact about the
 *  call sheet and not an absence, so it keeps its number rather than dropping
 *  to `No data`. The module is therefore the same six rows on every game.
 *
 *  `other` counts snaps charted as a type outside the six, so the module can
 *  state that they exist without a variable row growing the board. Offense
 *  remains the report for the full type vocabulary. */
export function yardsByType(stats, statsEngine) {
  const total = stats.rushing.yards + stats.passing.yards;
  const charted = new Map((stats.tendencies.playTypeList || []).map(row => [row.name, row]));
  const canonical = statsEngine.constructor.OVERVIEW_PLAY_TYPES;
  const other = [...charted.entries()]
    .filter(([name]) => !canonical.includes(name))
    .reduce((sum, [, row]) => sum + row.count, 0);
  const playTypes = canonical.map(name => charted.get(name)
    || { name, count: 0, avg: '0.0', successPct: 0 });
  return {
    other,
    total,
    // The split bar's width can never be negative; the legend text shows the
    // real (possibly negative) yardage — same distinction the original
    // template drew between its `--n` CSS var and its displayed number.
    rushWidth: Math.max(0, stats.rushing.yards), passWidth: Math.max(0, stats.passing.yards),
    rush: stats.rushing.yards, pass: stats.passing.yards,
    rows: playTypes.map(row => ({ name: row.name, snaps: row.count, ypp: row.avg, success: `${row.successPct}%`,
      plays: row.count,
      cutType: 'playType', cutVal: row.name, cutLabel: `${row.name} — ${row.count} plays` })),
  };
}

/** `limit` renders the approved Overview composition's fixed row count; the
 *  printed report passes none and keeps every charted situation. */
export function downDistanceRows(stats, statsEngine = null, limit = 0) {
  const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
  const buckets = limit
    ? statsEngine.constructor.rankDownDistance(stats.downs.ddBuckets, limit)
    : (stats.downs.ddBuckets || []);
  const rows = buckets.map(row => ({
    situation: `${labels[row.down]} & ${row.bucket}`, snaps: row.count, runPct: row.runPct, passPct: row.passPct,
    ypp: row.avgYards, success: `${row.succPct}%`, conv: `${row.convPct}%`,
    cutType: 'dd', cutVal: `${row.down}|${row.bucket}`, cutLabel: `${labels[row.down]} & ${row.bucket} — ${row.count} plays`,
  }));
  return limit ? padRows(rows, limit, 'situation') : rows;
}

/** The longest gains on the FIELD, both directions. Our offensive snaps are
 *  ours; our defensive snaps are the opponent's offense, so a long run we gave
 *  up belongs on this list beside a long run we broke. `side` carries which,
 *  and drives the row's colour — the two are never merged into one number. */
export function bigPlaysRows(stats, statsEngine, gameLabels = null, limit = 10) {
  const byRef = new Map([...(stats.offPlays || []), ...(stats.defPlays || [])]
    .map(play => [statsEngine.constructor._compositeRef(play) || String(play.id), play]));
  const ranked = statsEngine.constructor.topPlaysBothSides(stats.offPlays, stats.defPlays, limit).map(play => {
    const source = byRef.get(play.ref || String(play.id));
    const gameId = play.ref?.split('::')[0] || '';
    return { id: play.id, ref: play.ref || null, side: play.side, game: gameLabels?.[gameId] || '',
      situation: statsEngine.constructor.situationLabel(source) || '—', call: play.type || '—', yards: play.yards };
  });
  return padRows(ranked, limit, 'situation');
}

/** The opponent's own drives, reconstructed from our defensive snaps by the
 *  same `_driveStats` the offensive module uses. Read as drives ALLOWED: a
 *  scoring drive here is one we surrendered. */
export function opponentDrivesRows(stats, statsEngine, gameLabels = null, limit = 8) {
  const allowed = statsEngine.opponentProduction(stats.defPlays, stats.orderedPlays).drives;
  return drivesRows({ drives: allowed }, gameLabels, limit);
}

export function drivesRows(stats, gameLabels = null, limit = 8) {
  const drives = stats.drives?.list || [];
  const max = Math.max(1, ...drives.map(d => Math.abs(d.yards)));
  return { total: drives.length, scoring: stats.drives.scoringDrives, rows: padRows(drives.slice(0, limit).map(drive => ({
    number: drive.number, game: gameLabels?.[drive.refs?.[0]?.split('::')[0]] || '', widthPct: Math.max(6, Math.round(Math.abs(drive.yards) / max * 100)), outcome: drive.outcome, playIds: drive.playIds || [], refs: drive.refs || [],
  })), limit, 'outcome') };
}

/** The shared "group plays by X, show count/run-pass/yards/success" shape —
 *  Tendencies (formation, play type), Backfield & Strength, Personnel,
 *  Direction, Motion, Hash all reduce to this. One formula, several callers,
 *  same as the StatsEngine methods they replace already did per-section. */
function groupBreakdown(rows, cutType) {
  return rows.map(row => ({
    name: row.name, count: row.count, runs: row.runs, passes: row.passes,
    ypp: row.avg, success: `${row.successPct}%`,
    cutType, cutVal: row.name, cutLabel: `${row.name} — ${row.count} plays`,
  }));
}

/**
 * The approved Offense KPI band (design-comps/reports-offense-2026-09-03).
 * SIX equal columns, and deliberately NO Yards/play: the shared scorebug above
 * this band already leads with yards per play as its story metric, and showing
 * it twice on one screen is the duplication the comp review removed. Nothing
 * replaced it — the band is six, not seven.
 *
 * Every value is read off the already-computed `stats` object. Points/drive is
 * `stats.drives.pointsPerDrive` and 3rd down is `stats.downs.thirdDownPct` /
 * `thirdDownConv`; neither is re-derived here.
 */
export function offenseKpis(stats) {
  if (!stats || !stats.totalPlays) return [];
  const e = stats.efficiency || {};
  const tend = stats.tendencies || {};
  const drives = stats.drives || {};
  const downs = stats.downs || {};
  const num = v => (v == null ? null : parseFloat(v));
  const tone = (v, good, ok, invert) => {
    if (v == null || isNaN(v)) return '';
    return invert ? (v <= good ? 'is-good' : v <= ok ? 'is-warn' : 'is-bad')
                  : (v >= good ? 'is-good' : v >= ok ? 'is-warn' : 'is-bad');
  };
  const succ = num(e.successRate), expl = num(e.explosivePct), neg = num(e.negativePct);
  // `thirdDownConv` is a "made/attempted" STRING and `thirdDownPct` falls back
  // to '0.0' when no third down was charted, so neither can be read as a
  // number or as a truth test: a game of first downs only would otherwise
  // report a real 0% conversion rate on 0/0. The attempt count is the gate.
  const thirdAtt = parseInt(String(downs.thirdDownConv || '').split('/')[1], 10) || 0;
  const third = thirdAtt ? num(downs.thirdDownPct) : null;
  const kpis = [];
  // StatsEngine's efficiency block names this `successes`. It has no
  // `successfulPlays` key, so reading that name reported every game as
  // "0 of N snaps" regardless of how many actually succeeded.
  kpis.push({ label: 'Success rate', value: succ != null ? `${Math.round(succ)}%` : '—',
    sub: `${e.successes || 0} of ${stats.totalPlays} snaps`, cls: 'is-gold', tone: tone(succ, 45, 33) });
  kpis.push({ label: 'Explosive Plays Rate', value: expl != null ? `${Math.round(expl)}%` : '—',
    sub: `${e.explosivePlays || 0} plays`, tone: tone(expl, 12, 7) });
  kpis.push({ label: 'Negative', value: neg != null ? `${Math.round(neg)}%` : '—',
    sub: `${e.negativePlays || 0} plays`, tone: tone(neg, 8, 15, true) });
  kpis.push({ label: 'Run / pass',
    value: `${Math.round(parseFloat(tend.runPct) || 0)}% / ${Math.round(parseFloat(tend.passPct) || 0)}%`,
    sub: `${tend.runs || 0}R, ${tend.passes || 0}P` });
  kpis.push({ label: 'Points / drive', value: drives.pointsPerDrive != null ? drives.pointsPerDrive : '—',
    sub: drives.total ? `${drives.scoringDrives || 0} of ${drives.total} scored` : 'no drives charted' });
  kpis.push({ label: '3rd down', value: third != null ? `${Math.round(third)}%` : '—',
    sub: thirdAtt ? `${downs.thirdDownConv} converted` : 'none charted' });
  return kpis;
}

/**
 * Zone 1's Identity strip: the offense's signature, drawn entirely from
 * breakdowns this report already computes and surfaces further down the page
 * (personnel groupings, formation frequency, QB alignment, play calls). It
 * calculates nothing new — it answers "who are we" in the first viewport
 * instead of making the coach scroll for four separate tables.
 *
 * `calls` is `StatsEngine._playCallAnalysis(stats.offPlays)`, passed in so this
 * module never invokes an engine internal itself.
 */
export function offenseIdentity(stats, engine, calls = null) {
  const plays = stats?.offPlays || [];
  if (!plays.length) return [];
  const total = plays.length;
  const share = n => (total ? `${Math.round((n / total) * 100)}%` : '—');
  const items = [];

  const personnel = (personnelGroups(stats) || [])[0];
  items.push(personnel
    ? { label: 'Base personnel', value: personnel.name, sub: `${personnel.count} snaps, ${share(personnel.count)}`,
        cutType: 'personnel', cutVal: personnel.name, cutLabel: `Personnel ${personnel.name} — ${personnel.count} plays` }
    : { label: 'Base personnel', value: '—', sub: 'none charted' });

  const formation = (stats.tendencies?.formationList || [])[0];
  items.push(formation
    ? { label: 'Primary formation', value: formation.name, sub: `${formation.count} snaps, ${share(formation.count)}`,
        cutType: 'formationFamily', cutVal: formation.name, cutLabel: `${formation.name} — ${formation.count} plays` }
    : { label: 'Primary formation', value: '—', sub: 'none charted' });

  // QB alignment has a registered dimension and its own film cut type, but no
  // pre-grouped list on `stats`; group it the same way backfieldStrength does,
  // using StatsEngine's own read-time projection.
  const alignments = {};
  plays.forEach(p => {
    const v = (engine.constructor.proj(p).qbAlignment || '').trim();
    if (v) alignments[v] = (alignments[v] || 0) + 1;
  });
  const topAlignment = Object.entries(alignments).sort((a, b) => b[1] - a[1])[0];
  items.push(topAlignment
    ? { label: 'QB alignment', value: topAlignment[0], sub: `${topAlignment[1]} snaps, ${share(topAlignment[1])}`,
        cutType: 'qbAlignment', cutVal: topAlignment[0], cutLabel: `${topAlignment[0]} — ${topAlignment[1]} plays` }
    : { label: 'QB alignment', value: '—', sub: 'none charted' });

  // Run/pass and the primary play type complete the strip. Two tiles short,
  // the module ran ~60px under its neighbour in the band and left the balance
  // as empty panel. `runPass` has no registered cut type -- it is a ratio, not
  // a cohort -- so that tile carries no film action rather than a dead click.
  const tend = stats.tendencies || {};
  const runs = tend.runs || 0, passes = tend.passes || 0;
  items.push(runs || passes
    ? { label: 'Run / pass', value: `${Math.round(parseFloat(tend.runPct) || 0)}% / ${Math.round(parseFloat(tend.passPct) || 0)}%`,
        sub: `${runs} run, ${passes} pass` }
    : { label: 'Run / pass', value: '—', sub: 'none charted' });

  const playType = (tend.playTypeList || [])[0];
  items.push(playType
    ? { label: 'Primary play type', value: playType.name, sub: `${playType.count} snaps, ${share(playType.count)}`,
        cutType: 'playType', cutVal: playType.name, cutLabel: `${playType.name} — ${playType.count} plays` }
    : { label: 'Primary play type', value: '—', sub: 'none charted' });

  const topCall = calls?.eligible ? (calls.calls || [])[0] : null;
  items.push(topCall
    ? { label: 'Top call', value: topCall.name, sub: `${topCall.n} snaps, ${Math.round(topCall.successRate)}% success`,
        refs: topCall.refs || null, playIds: topCall.playIds || null, cutLabel: `Play Call: ${topCall.name}` }
    : { label: 'Top call', value: '—', sub: 'no exact calls charted' });
  return items;
}

/** Zone 1's run/pass balance by down. Grouped from offPlays with StatsEngine's
 *  own run/pass classifiers — the identical pattern backfieldStrength uses. */
export function runPassByDown(stats, engine) {
  const labels = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  const plays = stats?.offPlays || [];
  return [1, 2, 3, 4].map(down => {
    const ps = plays.filter(p => String(p.tags?.down) === String(down));
    const runs = ps.filter(p => engine.constructor.isRun(p)).length;
    const passes = ps.filter(p => engine.constructor.isPass(p)).length;
    const classified = runs + passes;
    const yards = ps.reduce((s, p) => s + (parseInt(p.tags.yardage, 10) || 0), 0);
    return {
      down: labels[down], snaps: ps.length,
      runPct: classified ? Math.round((runs / classified) * 100) : 0,
      passPct: classified ? 100 - Math.round((runs / classified) * 100) : 0,
      ypp: ps.length ? (yards / ps.length).toFixed(1) : '—',
      cutType: 'down', cutVal: String(down), cutLabel: `${labels[down]} down — ${ps.length} plays`,
    };
  }).filter(row => row.snaps > 0);
}

export function tendencyBreakdown(stats) {
  return {
    formations: groupBreakdown(stats.tendencies.formationList || [], 'formationFamily'),
    playTypes: groupBreakdown(stats.tendencies.playTypeList || [], 'playType'),
    runPct: stats.tendencies.runPct, passPct: stats.tendencies.passPct,
  };
}

export function backfieldStrength(stats, engine) {
  const plays = stats.offPlays || [];
  const build = (cutType, get) => {
    const groups = {};
    plays.forEach(p => { const v = get(p); if (v) (groups[v] = groups[v] || []).push(p); });
    return Object.entries(groups).map(([name, ps]) => {
      const runs = ps.filter(p => engine.constructor.isRun(p)).length;
      const passes = ps.filter(p => engine.constructor.isPass(p)).length;
      const yards = ps.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const succ = ps.filter(p => engine._isSuccessfulPlay(p)).length;
      return { name, count: ps.length, runs, passes,
        successPct: ps.length ? Math.round(succ / ps.length * 100) : 0,
        avg: ps.length ? (yards / ps.length).toFixed(1) : '0.0' };
    }).sort((a, b) => b.count - a.count);
  };
  return {
    backfield: groupBreakdown(build('backfield', p => engine.constructor.proj(p).backfield), 'backfield'),
    strength: groupBreakdown(build('strength', p => engine.constructor.proj(p).strength), 'strength'),
  };
}

export function personnelGroups(stats) {
  const filtered = stats.personnel.filter(g => !(g.name === 'Unknown' && stats.personnel.length > 1));
  return groupBreakdown(filtered, 'personnel');
}

export function directionMotion(stats) {
  const dm = stats.dirMotion;
  if (!dm || (!dm.hasDirData && !dm.hasMotionData)) return null;
  // _directionMotionStats' finish() names its rate field `succPct`, unlike
  // every other StatsEngine group (_tendencyStats, _personnelStats) which
  // name theirs `successPct` — groupBreakdown() reads `successPct`, so alias
  // it here rather than widen the shared helper for one caller's field name.
  const aliasSucc = row => ({ ...row, successPct: row.successPct ?? row.succPct });
  const motionRows = dm.hasMotionData ? [
    ...groupBreakdown((dm.motionList || []).map(aliasSucc), 'motion'),
    ...(dm.noMotion?.count ? groupBreakdown([aliasSucc({ ...dm.noMotion, name: 'No Motion' })], 'motion') : []),
  ] : [];
  return {
    direction: dm.hasDirData ? groupBreakdown((dm.dirList || []).map(aliasSucc), 'playDir') : [],
    motion: motionRows,
  };
}

/**
 * Direction vs Strength rows for the Offense board, in the shared
 * `breakdownColumns` shape its sibling modules use.
 *
 * A HELD bucket keeps its label and carries `-` in every measured cell, the
 * same treatment Self-Scout's twelve fixed down-and-distance rows use: an
 * unfaced situation is an absence, not a measured zero. It also carries no
 * `refs`, so it offers no film affordance for a cohort that does not exist.
 */
export function dirStrengthTendencies(engine, offPlays) {
  const model = engine._dirStrengthStats(offPlays || []);
  return model.list.map(row => (row.held
    ? { name: row.name, count: '-', runs: '-', passes: '-', ypp: '-', success: '-', held: true }
    : {
      name: row.name, count: row.count,
      runs: `${row.runs} (${row.runPct}%)`, passes: `${row.passes} (${row.passPct}%)`,
      ypp: row.avg, success: `${row.successPct}%`, refs: row.refs,
      cutType: 'directionStrength', cutVal: row.name,
      cutLabel: `Direction vs Strength: ${row.name} — ${row.count} plays`,
    }));
}

export function hashTendencies(stats) {
  if (!stats.hash || !stats.hash.hasData) return [];
  return groupBreakdown(stats.hash.list || [], 'hash');
}

export function personnelSituation(stats) {
  if (!stats.personnelSituation || !stats.personnelSituation.hasData) return [];
  return stats.personnelSituation.list.map(c => ({
    personnel: c.personnel, situation: c.situation, count: c.count, runPct: c.runPct, avg: c.avg, success: `${c.successPct}%`,
  }));
}

export function situationalBreakdown(stats) {
  const s = stats.situational;
  const row = (name, b, key) => b.total === 0 ? null : { name, key, total: b.total, yards: b.yards, avg: b.avg, success: `${b.successPct}%`, tds: b.tds };
  const rows = [row('Red Zone', s.redZone, 'redZone'), row('Goal Line', s.goalLine, 'goalLine'), row('Backed Up', s.backedUp, 'backedUp'), row('3rd & 7+', s.thirdLong, 'thirdLong'), row('3rd & 1-3', s.thirdShort, 'thirdShort')].filter(Boolean);
  const byQuarter = Object.entries(s.byQuarter || {}).filter(([, qs]) => qs.plays > 0).map(([q, qs]) => ({ q, plays: qs.plays, yards: qs.yards, tds: qs.tds }));
  return { rows, byQuarter, redZonePct: s.redZone.total ? Math.round(s.redZone.tds / s.redZone.total * 100) : null, backedUpPct: parseFloat(s.backedUp.successPct) || null };
}

export function bigTwelve(engine, plays, label, opts = {}) {
  const d = engine._bigTwelveData(plays);
  if (d.total < 8) return null;
  const cut = opts.cut !== false;
  return { to90: d.to90, label, total: d.total, rows: d.calls.map((c, i) => {
    const runPct = c.n ? Math.round(c.runs / c.n * 100) : 0;
    const avg = c.n ? (c.yards / c.n).toFixed(1) : '0.0';
    const succ = c.n ? Math.round(c.succ / c.n * 100) : 0;
    const named = [c.form, c.qb].filter(Boolean).join(' ') || '—';
    return {
      id: i, form: c.form || '—', qb: c.qb || '—', bf: c.bf || '—', str: c.str || '—', mot: c.mot || '—', pt: c.pt || '—',
      n: c.n, succ: `${succ}%`, avg, runPct: `${runPct}%`, inTo90: i < d.to90,
      cutType: cut ? 'bigCall' : null, cutVal: c.key, cutLabel: `${named} ${c.pt || ''} — ${c.n} plays`,
    };
  }) };
}

/** The interactive pivot's data: same _computeMatrix engine call, unchanged. */
export function matrixData(engine, plays, rowId, colId) {
  return engine._computeMatrix(plays, rowId, colId);
}

export function playAction(stats) {
  if (!stats.playAction || !stats.playAction.hasData) return null;
  const pa = stats.playAction;
  return {
    paRate: pa.paRate, paCompPct: pa.paCompPct, paYPA: pa.paYPA, straightYPA: pa.straightYPA, paPlays: pa.paPlays,
    formations: (pa.formationList || []).map(f => ({ name: f.name, count: f.count, avg: f.avg, success: `${f.successPct}%` })),
  };
}

/** Compact possession summary for the Offense board. Drive reconstruction and
 * outcome ownership remain in StatsEngine; this only groups the published
 * drive rows into the fixed labels the board renders. */
export function driveOutcomeStrip(stats) {
  const drives = stats.drives || {};
  const list = drives.list || [];
  const count = outcome => list.filter(drive => drive.outcome === outcome).length;
  const item = (label, value, detail, matching = list) => ({
    label, value, detail,
    refs: matching.flatMap(drive => drive.refs || []),
  });
  const pct = value => list.length ? `${Math.round((value / list.length) * 100)}% of drives` : 'No drives charted';
  const td = count('TD');
  const fg = count('FG');
  const punts = count('Punt');
  const turnovers = count('Turnover');
  const downs = count('Downs');
  return [
    item('Drives', list.length || '–', list.length ? `${drives.avgPlaysPerDrive} plays / drive` : 'No drives charted'),
    item('Touchdowns', list.length ? td : '–', pct(td), list.filter(d => d.outcome === 'TD')),
    item('Field goals', list.length ? fg : '–', pct(fg), list.filter(d => d.outcome === 'FG')),
    item('Punts', list.length ? punts : '–', pct(punts), list.filter(d => d.outcome === 'Punt')),
    item('Turnovers', list.length ? turnovers : '–', pct(turnovers), list.filter(d => d.outcome === 'Turnover')),
    item('Downs', list.length ? downs : '–', pct(downs), list.filter(d => d.outcome === 'Downs')),
    item('Points / drive', list.length ? drives.pointsPerDrive : '–', list.length ? `${drives.totalPoints} points` : 'No drives charted'),
  ];
}

/** Same EPA fields `_renderAdvanced` already computes on `stats.advanced` —
 *  read directly, nothing recomputed. The cumulative-EPA curve's SVG path is
 *  coordinate geometry, not a football formula; it is ported here unchanged
 *  rather than re-derived, exactly like the Charts.* embeds elsewhere. */
export function advancedData(stats, engine) {
  const a = stats.advanced;
  if (!a || !a.count) return null;
  const W = 600, H = 160, P = 30;
  const n = a.curve.length;
  const vals = a.curve.map(c => c.cum);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const xs = i => P + (n <= 1 ? 0 : (i * (W - 2 * P)) / (n - 1));
  const ys = v => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
  const path = a.curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(c.cum).toFixed(1)}`).join(' ');
  const fmt = v => (v > 0 ? '+' : '') + v.toFixed(2);
  const epaClass = v => v > 0 ? 'epa-pos' : v < 0 ? 'epa-neg' : '';
  const playRow = x => {
    const t = x.play.tags || {};
    const label = `${t.down || '?'}&${t.distance || '?'} ${engine.constructor.proj(x.play).formationFamily || ''} ${t.playType || ''}`.trim();
    return { id: x.play.id, label, yards: t.yardage || 0, epa: x.epa, epaText: fmt(x.epa), epaClass: epaClass(x.epa) };
  };
  const groupRows = rows => (rows || []).slice(0, 8).map(r => ({
    name: r.name, count: r.count,
    total: fmt(r.total), totalValue: r.total, totalClass: epaClass(r.total),
    perPlay: fmt(r.perPlay), perPlayValue: r.perPlay, perPlayClass: epaClass(r.perPlay),
  }));
  return {
    total: a.total, totalText: fmt(a.total), totalClass: epaClass(a.total),
    perPlay: a.perPlay, perPlayText: fmt(a.perPlay), perPlayClass: epaClass(a.perPlay),
    count: a.count, path, W, H, P, zeroY: ys(0).toFixed(1), n, hi, lo,
    byType: groupRows(a.byType), byFormation: groupRows(a.byFormation), byPersonnel: groupRows(a.byPersonnel),
    byDown: ['1', '2', '3', '4'].map(d => a.byDown[d]?.count ? { down: d, count: a.byDown[d].count, total: fmt(a.byDown[d].total), totalClass: epaClass(a.byDown[d].total), perPlay: fmt(a.byDown[d].perPlay), perPlayClass: epaClass(a.byDown[d].perPlay) } : null).filter(Boolean),
    top: (a.top || []).map(playRow), worst: (a.worst || []).map(playRow),
  };
}

/** Same `stats.individuals.*` fields `_renderIndividualStats` already reads
 *  — a pure sibling for the Players tab, StatsEngine's HTML-returning method
 *  is untouched (Season, Special Teams, exports, and the opponent tab all
 *  still call it directly). `group` matches its exact scoping contract. */
/** The one absence label the Players board already uses for an unmeasured
 *  value (`Grade`). Special Teams distance and return yardage now share it,
 *  because on this data they are genuinely uncharted rather than zero. */
const PLAYER_NO_DATA = 'No data';

/** Revision 2: which credit bucket each DISPLAYED column opens. A derived cell
 *  (Avg, Pct) opens the cohort it is derived from; `Long` opens the measured
 *  plays behind it. Keyed by role so one column name cannot mean two cohorts. */
export const PLAYER_STAT_BUCKETS = Object.freeze({
  rushing: { att: 'att', yds: 'yds', avg: 'att', long: 'yds:long', tds: 'td', fum: 'fum' },
  passing: { ca: 'att', pct: 'att', yds: 'yds', tds: 'td', ints: 'int', sacks: 'sck' },
  receiving: { rec: 'rec', yds: 'yds', long: 'yds:long', tds: 'td' },
  tackles: { tkl: 'tkl', solo: 'solo', ast: 'ast', sacks: 'sack', tfl: 'tfl', ints: 'int', fr: 'fr' },
  returns: { ret: 'yds', yds: 'yds', avg: 'yds', long: 'yds:long', tds: 'td' },
  kicking: { fg: 'fgAtt', punts: 'punts', puntAvg: 'puntYds' },
});

export function individualStats(stats, group, playerLabel, board = null) {
  const ind = stats.individuals || {};
  const showOff = group === 'all' || group === 'offense';
  const showDef = group === 'all' || group === 'defense';
  const showST = group === 'all' || group === 'special';
  const grade = r => {
    if (!r.gradeCount) return { grade: 'No data', gradeClass: '', gradeSort: null };
    const avg = r.gradeSum / r.gradeCount;
    return { grade: `${avg > 0 ? '+' : ''}${avg.toFixed(1)}`, gradeClass: avg > 0 ? 'grade-pos' : avg < 0 ? 'grade-neg' : '', gradeSort: avg };
  };
  const player = num => ({ num, label: playerLabel(num) });
  // Special Teams Presentation Independence: `_individualStats` now carries a
  // deduped, sorted `refs` array on every row (the exact plays that produced
  // that row's own counts). Propagated here unconditionally -- PlayersTab
  // and PlayersTab both need it for an honest role-specific cross-game click.
  const refs = row => Array.isArray(row.refs) ? row.refs : [];
  const tables = [];
  /* THE PER-STAT FILM COHORTS. `playersBoard` holds the exact play list behind
     every bucket, so a clicked value opens those plays and nothing else. Built
     from the board, never reconstructed from a displayed string. */
  const byNum = new Map((board?.players || []).map(item => [String(item.num), item]));
  const statRefs = (roleKey, num) => {
    const role = byNum.get(String(num))?.roles.find(item => item.key === roleKey);
    if (!role) return {};
    const map = PLAYER_STAT_BUCKETS[roleKey] || {};
    /* A `bucket:long` mapping opens the play (or the few that tie) that PRODUCED
       the long, not every measured play in the bucket — the displayed value and
       its film are the same fact. */
    return Object.fromEntries(Object.entries(map)
      .map(([column, spec]) => {
        const [bucket, reading] = String(spec).split(':');
        const fact = role.stats[bucket];
        return [column, (reading === 'long' ? fact?.longRefs : fact?.refs) || []];
      })
      .filter(([, list]) => list.length));
  };
  const withStats = (roleKey, rows) => rows.map(row => ({ ...row, statRefs: statRefs(roleKey, row.num) }));
  if (showOff && ind.rushers?.length) tables.push({ title: 'Rushing', key: 'rushing',
    columns: [['player', 'Player'], ['att', 'Att', true], ['yds', 'Yds', true], ['avg', 'Avg', true], ['long', 'Long', true], ['tds', 'TD', true], ['fum', 'Fum', true], ['grade', 'Grade', true, 'gradeSort']],
    rows: withStats('rushing', ind.rushers.map(r => ({ ...player(r.num), att: r.attempts, yds: r.yards, avg: r.attempts ? (r.yards / r.attempts).toFixed(1) : '0.0', long: r.long, tds: r.tds, fum: r.fumbles, ...grade(r), refs: refs(r) }))) });
  if (showOff && ind.passers?.length) tables.push({ title: 'Passing', key: 'passing',
    columns: [['player', 'Player'], ['ca', 'C/A', true, 'caSort'], ['pct', 'Pct', true, 'pctSort'], ['yds', 'Yds', true], ['tds', 'TD', true], ['ints', 'INT', true], ['sacks', 'Sck', true], ['grade', 'Grade', true, 'gradeSort']],
    rows: withStats('passing', ind.passers.map(p => ({ ...player(p.num), ca: `${p.completions}/${p.attempts}`, caSort: p.completions, pct: `${p.attempts ? ((p.completions / p.attempts) * 100).toFixed(1) : '0.0'}%`, pctSort: p.attempts ? p.completions / p.attempts : 0, yds: p.yards, tds: p.tds, ints: p.ints, sacks: p.sacks, ...grade(p), refs: refs(p) }))) });
  if (showOff && ind.receivers?.length) tables.push({ title: 'Receiving', key: 'receiving',
    columns: [['player', 'Player'], ['rec', 'Rec', true], ['yds', 'Yds', true], ['long', 'Long', true], ['tds', 'TD', true], ['grade', 'Grade', true, 'gradeSort']],
    rows: withStats('receiving', ind.receivers.map(r => ({ ...player(r.num), rec: r.receptions, yds: r.yards, long: r.long, tds: r.tds, ...grade(r), refs: refs(r) }))) });
  if (showDef && ind.tacklers?.length) tables.push({ title: 'Tackles', key: 'tackles',
    columns: [['player', 'Player'], ['tkl', 'Tkl', true], ['solo', 'Solo', true], ['ast', 'Ast', true], ['sacks', 'Sack', true], ['tfl', 'TFL', true], ['ints', 'INT', true], ['fr', 'FR', true], ['grade', 'Grade', true, 'gradeSort']],
    rows: withStats('tackles', ind.tacklers.map(t => ({ ...player(t.num), tkl: t.tackles, solo: t.solo || 0, ast: t.assists || 0, sacks: t.sacks, tfl: t.tfl, ints: t.ints || 0, fr: t.fumblesRec || 0, ...grade(t), refs: refs(t) }))) });
  if (showST && ind.returners?.length) tables.push({ title: 'Return Game', key: 'returns',
    columns: [['player', 'Player'], ['ret', 'Ret', true], ['yds', 'Yds', true], ['avg', 'Avg', true], ['long', 'Long', true], ['tds', 'TD', true]],
    /* ONE RETURN COHORT ACROSS BOTH SURFACES. Return production is measured
       over the returns carrying a charted `returnYards`, the same dedicated
       field the team Return Production reads — and `Ret` is that same measured
       count, not the return EVENTS. Counting every event here reported 11
       returns beside 5 yards and a 5.0 average, three numbers from two
       different cohorts, above a team report stating 1 return for 5 yards.
       An unmeasured return is still a special-teams snap and stays in the
       unit's snap count; it is not production. Coach ruling 2026-09-10. */
    rows: withStats('returns', ind.returners.map(r => ({ ...player(r.num), ret: r.measured,
      yds: r.measured ? r.yards : PLAYER_NO_DATA,
      avg: r.measured ? (r.yards / r.measured).toFixed(1) : PLAYER_NO_DATA,
      long: r.measured ? r.long : PLAYER_NO_DATA, tds: r.tds, refs: refs(r) }))) });
  if (showST && ind.kickers?.length) tables.push({ title: 'Kicking / Punting', key: 'kicking',
    columns: [['player', 'Player'], ['fg', 'FG (M/A)', true, 'fgSort'], ['punts', 'Punts', true, 'puntsSort'], ['puntAvg', 'Punt Avg', true, 'puntAvgSort']],
    /* Punt average is measured over the punts carrying a charted
       `kickDistance`. Dividing by every punt turned a season charting no punt
       distance at all into averages of 2.8 and 0.0 — from the generic
       `tags.yardage` — beside a team report correctly reporting none. */
    rows: withStats('kicking', ind.kickers.map(k => ({ ...player(k.num), fg: `${k.fgMade || 0}/${k.fgAtt || 0}`, fgSort: k.fgMade || 0,
      punts: k.punts || 0, puntsSort: k.punts || 0,
      puntAvg: k.puntsMeasured ? (k.puntYds / k.puntsMeasured).toFixed(1) : PLAYER_NO_DATA,
      puntAvgSort: k.puntsMeasured ? k.puntYds / k.puntsMeasured : null, refs: refs(k) }))) });
  return tables;
}

export function defenseDisciplineRows(stats, statsEngine) {
  const def = stats.defPlays.length;
  const yards = stats.defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage, 10) || 0), 0);
  const stops = stats.defPlays.filter(play => !statsEngine._isSuccessfulPlay(play)).length;
  const explosives = stats.defPlays.filter(play => {
    const y = parseInt(play.tags.yardage, 10) || 0;
    return statsEngine.constructor.isRun(play) ? y >= 12 : y >= 16;
  }).length;
  const penalties = stats.penalties || {};
  /* Yards / play allowed leads. Stop rate sat directly beneath it, which made
     it read as the second primary defensive comparison — the position the
     coach rejected. It keeps its row as supporting context at the foot of the
     module; the approved six-row module is unchanged in count. */
  return { meta: `${def} defensive snaps`, rows: [
    ['Yards / play allowed', def ? (yards / def).toFixed(1) : '—'],
    ['Explosive Plays Allowed', explosives, explosives ? '' : 'is-good'],
    ['Takeaways', stats.defensive.turnovers],
    // Middot, per the approved Overview ("1 · 10 yds").
    ['Penalties accepted', penalties.hasData ? `${penalties.accepted} · ${penalties.subjectYards} yds` : '0'],
    ['Penalties declined', penalties.hasData ? penalties.declined : '0'],
    ['Stop rate', def ? `${Math.round(stops / def * 100)}%` : '—', 'is-good'],
  ] };
}

/**
 * ONE absence label for the whole Special Teams report. Coach decision,
 * 2026-09-04: wherever there is no data the board says exactly this, in every
 * position, rather than distinguishing "not charted" from "not derivable" --
 * a distinction the reader does not make and the board should not narrate.
 *
 * A measured zero is NOT an absence and never wears it: 0% touchbacks on 21
 * kickoffs, 0 returns attempted, 0 return touchdowns and a scoreless unit all
 * keep their number and their denominator.
 */
export const ST_NO_DATA = 'No data';
const stNum = value => (value === null || value === undefined ? null : value);
const stPlural = (n, word, plural) => `${n} ${word}${n === 1 ? '' : (plural || 's')}`;

/**
 * Special Teams Presentation Independence -- the performance band, six tiles
 * on the board's own six-column rhythm (six units, six KPIs, six ledger
 * cards). Every value is read straight off `stats.specialTeams`/
 * `stats.conversions` plus the aggregates `_specialTeamsSummary` composed. No
 * formula lives here.
 *
 * Impact Plays was a seventh tile whose whole content was a count and a joined
 * label list. It is not removed: it keeps its own module, which carries the
 * same counts plus a film action per row, so the tile was the weaker of two
 * presentations of one measure.
 *
 * A tile with no value carries `blank`, renders the label above and drops its
 * sub entirely -- otherwise the tile prints the same two words twice.
 */
export function specialTeamsKpis(stats, summary) {
  const st = stats.specialTeams || {};
  const conv = stats.conversions || {};
  const fg = st.fg || { att: 0, made: 0, pct: 0, long: 0 };
  const xp = conv.xp || { att: 0, made: 0 };
  const two = conv.two || { att: 0, made: 0 };
  const convAtt = xp.att + two.att, convMade = xp.made + two.made;
  const kickRet = st.returns?.kick || { attempts: 0, yards: 0, long: 0 };
  const puntRet = st.returns?.punt || { attempts: 0, yards: 0, long: 0 };
  const retAtt = (kickRet.attempts || 0) + (puntRet.attempts || 0);
  const retYards = (kickRet.attempts ? kickRet.yards : 0) + (puntRet.attempts ? puntRet.yards : 0);
  const retLong = Math.max(kickRet.attempts ? kickRet.long : 0, puntRet.attempts ? puntRet.long : 0);
  const covRefs = [...new Set([...(st.punts?.refs?.retAllowedAvg || []),
    ...(st.kickoffs?.refs?.retAllowedAvg || [])])].sort();
  const covYards = (st.punts?.retAllowedYards || 0) + (st.kickoffs?.retAllowedYards || 0);
  const covN = covRefs.length;
  const snaps = summary.snaps.n;
  // `long` is the longest MADE kick, so attempts with no make leave it
  // genuinely unavailable. It must never render 0 -- that reads as a measured
  // zero-yard field goal, the exact inversion this report exists to prevent.
  // Coach (2026-09-04): every tile uses ONE format -- named values on a line,
  // pipe-separated -- because a sub line is just as much a real data point as
  // the headline and burying it under the number hides it. Nothing is a bare
  // figure with an unlabelled annotation beneath it any more.
  const margin = summary.points.us - summary.points.them;
  const tiles = [
    { label: 'Special Teams Snaps',
      stats: snaps
        ? [[['Snaps', snaps], ['Plays charted', summary.cohort ?? snaps]]]
        : null,
      refs: summary.snaps.refs },
    // Three values on ONE line (coach, 2026-09-04), now in words. `PF` and `PA`
    // were scoreboard abbreviations a coach had to decode; `For` and `Against`
    // are the same two facts in the vocabulary the Touchdowns tile below already
    // uses (`For` / `Allowed`), and they still fit the line at the 12.5px floor,
    // which the spelled-out pair did not.
    { label: 'Points',
      stats: [[
        ['For', summary.points.us],
        ['Against', summary.points.them],
        ['Margin', margin > 0 ? `+${margin}` : String(margin)],
      ]],
      cls: summary.points.us > summary.points.them ? 'is-good'
        : summary.points.us < summary.points.them ? 'is-bad' : '',
      refs: summary.points.refsUs },
    // `long` is the longest MADE kick, so attempts with no make leave it
    // genuinely unavailable -- it must never render 0, which would read as a
    // measured zero-yard field goal.
    { label: 'Field Goals',
      // ONE row like every other tile. Two rows here made the whole KPI band
      // two lines tall again, which is the row the band had just lost. `Rate`
      // rather than `Make rate` is what buys the third stat its space.
      stats: fg.att
        ? [[['Made', `${fg.made}/${fg.att}`], ['Rate', `${fg.pct}%`],
            ['Long', fg.long ? `${fg.long} yds` : ST_NO_DATA]]]
        : null,
      refs: fg.refs?.all },
    { label: 'Conversions',
      stats: convAtt
        ? [[['Made', `${convMade}/${convAtt}`],
            ['Conversion rate', `${Math.round(convMade / convAtt * 100)}%`]]]
        : null,
      refs: [...new Set([...(xp.refs?.att || []), ...(two.refs?.att || [])])].sort() },
    // Returns, then yards, then long -- the count before what it produced
    // (coach, 2026-09-04). One line, same reason as Points.
    { label: 'Return Production',
      stats: retAtt
        ? [[['Returns', retAtt], ['Yards', retYards], ['Long', `${retLong} yds`]]]
        : null,
      refs: [...new Set([...(kickRet.refs?.attempts || []), ...(puntRet.refs?.attempts || [])])].sort() },
    // "Coverage Allowed" was an invented name for punt and kickoff coverage
    // averaged TOGETHER -- one yards-per-return over two different units'
    // denominators, which is the blend this report is not allowed to make, and
    // duplicating a number each unit already reports correctly on its own.
    // Counts of the SAME event do combine, so the slot states the outcome a
    // coordinator actually tracks: a return that went the distance, whichever
    // coverage unit gave it up. Coach, 2026-09-04.
    // Coach (2026-09-04): listing only touchdowns ALLOWED in a general Special
    // Teams grouping is wrong -- both directions belong. For = our return
    // units reaching the end zone; Allowed = a return that went the distance
    // against our coverage. Counts of the same event, so they combine.
    { label: 'Touchdowns',
      stats: [[
        ['For', (st.returns?.kick?.td ?? 0) + (st.returns?.punt?.td ?? 0)],
        ['Allowed', (st.kickoffs?.tdAllowed ?? 0) + (st.punts?.tdAllowed ?? 0)],
      ]],
      refs: [...new Set([...(st.returns?.kick?.refs?.td || []), ...(st.returns?.punt?.refs?.td || []),
        ...(st.kickoffs?.refs?.tdAllowed || []), ...(st.punts?.refs?.tdAllowed || [])])].sort() },
  ];
  // A tile with no rows is absent, and says so once.
  return tiles.map(tile => tile.stats
    ? { ...tile, blank: false }
    : { ...tile, value: ST_NO_DATA, sub: '', stats: null, blank: true });
}

/**
 * The unit ledger -- all six units of SPECIAL-TEAMS-MODEL §1, always all six,
 * in the model's own order. This is the one place every unit is visible at
 * once, INCLUDING the units with nothing in them, which is the point: the
 * old report omitted a phase card entirely at zero, so a coach could not tell
 * "we never charted punt returns" from "punt returns aren't in this report".
 *
 * A unit with no snaps, and a unit the season's charting model cannot express
 * at all (legacy has no field-goal block unit), both read `No data`. The
 * cause of an absence is a documentation concern, not something the board
 * narrates.
 */
export function specialTeamsUnits(stats) {
  const st = stats.specialTeams || {};
  const num = v => (Number.isFinite(v) ? v : null);
  // Each unit counts its OWN event, so the card names it: 21 kickoffs, not 21
  // snaps (coach, 2026-09-04). And a percentage is a rate, so it is labelled
  // as one -- "0% touchback rate", never a bare "0% touchback".
  const defs = [
    { key: 'kickoff', name: 'Kickoff', noun: 'kickoff', n: num(st.kickoffs?.n), refs: st.kickoffs?.refs?.all,
      headline: () => (st.kickoffs?.avg != null ? `${st.kickoffs.avg} yd average` : `${st.kickoffs.tbPct}% touchback rate`) },
    // Coach (2026-09-04): the card's second value is a touchdown RATE, not a
    // "N returns charted" status line -- a rate is a real number, that was
    // just a restatement of the count beside it. Over return ATTEMPTS, which
    // is the only denominator a return touchdown can come from; with no
    // attempt charted there is no rate to state.
    { key: 'kickReturn', name: 'Kick Return', noun: 'return', n: num(st.returns?.kick?.n), refs: st.returns?.kick?.refs?.all,
      headline: () => (st.returns.kick.attempts
        ? `${Math.round(st.returns.kick.td / st.returns.kick.attempts * 100)}% touchdown rate`
        : ST_NO_DATA) },
    { key: 'punt', name: 'Punt', noun: 'punt', n: num(st.punts?.n), refs: st.punts?.refs?.all,
      headline: () => (st.punts.netAvg != null ? `${st.punts.netAvg} yd net` : `${stPlural(st.punts.blocked, 'block')} allowed`) },
    { key: 'puntReturn', name: SpecialTeamsModel.UNIT_LABELS.puntReturn, noun: 'return', n: num(st.returns?.punt?.n), refs: st.returns?.punt?.refs?.all,
      // Same measure as Kick Return -- the two return units read alike.
      headline: () => (st.returns.punt.attempts
        ? `${Math.round(st.returns.punt.td / st.returns.punt.attempts * 100)}% touchdown rate`
        : ST_NO_DATA) },
    { key: 'fieldGoal', name: 'Field Goal', noun: 'attempt', n: num(st.fg?.att), refs: st.fg?.refs?.all,
      headline: () => `${st.fg.made}/${st.fg.att} made, ${st.fg.pct}% rate` },
    { key: 'fieldGoalBlock', name: SpecialTeamsModel.UNIT_LABELS.fieldGoalBlock, noun: 'snap', n: num(st.blocks?.n), refs: st.blocks?.refs?.all,
      headline: () => `${stPlural(st.blocks.blocked, 'kick')} blocked` },
  ];
  return defs.map(def => def.n
    ? { key: def.key, name: def.name, n: def.n, noun: `${def.noun}${def.n === 1 ? '' : 's'}`,
        headline: def.headline(), refs: def.refs || [], blank: false }
    : { key: def.key, name: def.name, n: null, noun: '', headline: '', refs: [], blank: true });
}

/**
 * One unit's stat rows. Every row is a field StatsEngine already computed;
 * a `null` value becomes `No data` at the sink, never a zero, and never a
 * sentence explaining which kind of absence it is.
 *
 * Kick distance, return yards and net stay three separate measurements with
 * three separate labels (SPECIAL-TEAMS-MODEL §4/§7). They are never summed and
 * never share a row.
 */
export function specialTeamsUnitRows(stats, key) {
  const st = stats.specialTeams || {};
  const row = (label, value, opts) => ({ label, value: stNum(value), ...(opts || {}) });
  const yds = v => (v == null ? null : `${v} yds`);
  if (key === 'kickoff') {
    const k = st.kickoffs || {};
    if (!k.n) return [];
    return [
      row('Kickoffs', k.n),
      row('Kick distance, average', yds(k.avg)),
      row('Touchback rate', `${k.tbPct}%`),
      row('Fair catch rate', `${k.fairCatchPct}%`),
      row('Return yards allowed', k.retAllowedAvg == null ? null : `${k.retAllowedAvg} avg, ${k.retAllowedYards} total`, { sub: true }),
      row('Touchdowns allowed', k.tdAllowed, { cls: k.tdAllowed ? 'is-bad' : '' }),
      // An onside kick with nothing charted is an honest absence, not a zero.
      row('Onside recovery', k.onside?.n == null ? null : `${k.onside.recovered}/${k.onside.n}`),
    ];
  }
  if (key === 'punt') {
    const p = st.punts || {};
    if (!p.n) return [];
    return [
      row('Punts', p.n),
      row('Gross average', yds(p.grossAvg)),
      row('Net average', yds(p.netAvg)),
      row('Hang time', p.hangAvg == null ? null : `${p.hangAvg}s`),
      row('Touchback rate', `${p.tbPct}%`),
      row('Fair catch rate', `${p.fairCatchPct}%`),
      row('Return yards allowed', p.retAllowedAvg == null ? null : `${p.retAllowedAvg} avg, ${p.retAllowedYards} total`, { sub: true }),
      row('Touchdowns allowed', p.tdAllowed, { cls: p.tdAllowed ? 'is-bad' : '' }),
      row('Blocked', p.blocked, { cls: p.blocked ? 'is-bad' : '' }),
    ];
  }
  if (key === 'kickReturn' || key === 'puntReturn') {
    const r = (key === 'kickReturn' ? st.returns?.kick : st.returns?.punt) || {};
    if (!r.n) return [];
    return [
      row(key === 'kickReturn' ? 'Kick return snaps' : 'Punt return snaps', r.n),
      // `attempts` is a different denominator from `n`: a fair catch, touchback
      // or muff is a snap for this unit but not a return.
      row('Returns attempted', r.attempts),
      row('Return yards', r.attempts ? `${r.yards} total` : null, { sub: true }),
      row('Average return', yds(r.avg)),
      row('Longest', r.attempts ? `${r.long} yds` : null),
      row('Touchdowns', r.td, { cls: r.td ? 'is-good' : '' }),
      ...(key === 'puntReturn' ? [row('Punts blocked', r.blocked || 0, { cls: r.blocked ? 'is-good' : '' })] : []),
      row('Muffed', r.muffed, { cls: r.muffed ? 'is-bad' : '' }),
    ];
  }
  if (key === 'fieldGoal') {
    const f = st.fg || {};
    if (!f.att) return [];
    return [
      row('Attempts', f.att),
      row('Made', f.made),
      row('Make rate', `${f.pct}%`, { cls: f.pct >= 60 ? 'is-good' : '' }),
      row('Longest made', f.long ? `${f.long} yds` : null),
    ];
  }
  if (key === 'fieldGoalBlock') {
    const b = st.blocks || {};
    if (!b.n) return [];
    return [
      row('Snaps vs a kick', b.n),
      row('Kicks blocked', b.blocked, { cls: b.blocked ? 'is-good' : '' }),
      row('Block rate', `${Math.round(b.blocked / b.n * 100)}%`),
    ];
  }
  if (key === 'tries') {
    const conv = stats.conversions || {};
    const xp = conv.xp || { att: 0, made: 0 }, two = conv.two || { att: 0, made: 0 };
    const att = xp.att + two.att;
    if (!att) return [];
    const charted = st.tries?.n;
    const rows = [
      row('Extra point kicks', xp.att ? `${xp.made}/${xp.att}` : null),
      row('Two-point tries', two.att ? `${two.made}/${two.att}` : null),
      row('All tries', `${xp.made + two.made}/${att}`),
    ];
    // Coach decision, 2026-09-04: the classified attempts stay the calculation
    // denominator, the unclassified are stated, and they are NEVER counted as
    // misses or folded into a conversion percentage.
    //
    // The remainder is NAMED rather than assumed. `_conversionStats` counts only
    // tries the subject attempted, so a charted `Defending a Try` is outside its
    // denominator by construction — calling it "no scoring team tagged" was
    // wrong, because the opponent is exactly who scored it. Each part is stated
    // from its own count, and a part with nothing in it is not rendered.
    if (charted != null && charted > att) {
      const defending = st.tries?.defending || 0;
      const untagged = charted - att - defending;
      rows.push(row('Tries charted', `${charted}`, { sub: true }));
      if (defending) rows.push(row('Opponent tries', `${defending}`, { sub: true }));
      if (untagged > 0) rows.push(row('No scoring team tagged', `${untagged}`, { sub: true }));
    }
    return rows;
  }
  return [];
}

/** The outcome distribution for a unit, straight off the engine. */
export function specialTeamsOutcomes(stats, key) {
  const st = stats.specialTeams || {};
  const src = key === 'kickoff' ? st.kickoffs
    : key === 'punt' ? st.punts
    : key === 'kickReturn' ? st.returns?.kick
    : key === 'puntReturn' ? st.returns?.punt
    : key === 'fieldGoal' ? st.fg : null;
  const list = src?.outcomes || [];
  const total = key === 'fieldGoal' ? (src?.att || 0) : (src?.n || 0);
  return list.filter(o => o.n > 0).map(o => ({ ...o, pct: total ? Math.round(o.n / total * 100) : 0 }));
}

/**
 * Snaps this report could not assign to any unit. The full "74 snaps = 21
 * kickoff + ..." reconciliation restated the ledger directly above it and was
 * removed; what survives is the one fact no ledger card can show: a Special
 * Teams snap with no unit charted would otherwise vanish from every module
 * while still counting in ST Snaps.
 * Returns 0 when everything reconciles, and the caller renders nothing.
 */
export function specialTeamsUnassigned(stats, summary) {
  const st = stats.specialTeams || {};
  const conv = stats.conversions || {};
  /* COUNTED FROM FILM REFERENCES, NOT ARITHMETIC. Summing each module's count
     and subtracting was wrong in both directions on a MIXED cohort — one with
     structured events beside legacy-only snaps, which is what the coach's own
     screen showed. Two snaps the board reports were still called unit-less: an
     extra point stored on the field-goal unit (`_conversionStats` owns it,
     `isFieldGoalAttempt` excludes it) and a legacy `stType:'XP'` snap the
     structured branch skips but conversions still counts. Both appear under
     Tries.
     Every module already publishes the exact `gameId::playId` set it renders,
     so the question "did any module claim this snap" is answered per snap
     instead of estimated from totals. Overlapping cohorts cannot double count,
     a conversion attempt charted outside the special-teams unit cannot reduce
     the count (it is not in `snaps.refs`), and nothing is inferred about a
     legacy snap: it is simply not claimed, which is exactly what the line
     says. */
  const snaps = summary.snaps?.refs || [];
  const claimed = new Set([
    ...(st.kickoffs?.refs?.all || []), ...(st.returns?.kick?.refs?.all || []),
    ...(st.punts?.refs?.all || []), ...(st.returns?.punt?.refs?.all || []),
    ...(st.fg?.refs?.all || []), ...(st.blocks?.refs?.all || []),
    ...(st.tries?.refs?.all || []),
    ...(conv.xp?.refs?.att || []), ...(conv.two?.refs?.att || []),
  ]);
  if (snaps.length) return snaps.filter(ref => !claimed.has(ref)).length;
  // No resolvable film reference on the cohort (a fixture without game ids):
  // fall back to the count difference rather than reporting a false zero.
  const assigned = (st.kickoffs?.n || 0) + (st.returns?.kick?.n || 0) + (st.punts?.n || 0)
    + (st.returns?.punt?.n || 0) + (st.fg?.att || 0) + (st.blocks?.n || 0)
    + (st.tries?.n != null ? st.tries.n : ((conv.xp?.att || 0) + (conv.two?.att || 0)));
  return Math.max(0, (summary.snaps?.n || 0) - assigned);
}

/**
 * The compact per-phase modules (kickoff / kick return / punt / punt return /
 * field goal / conversions). A phase is omitted entirely when nothing was
 * charted -- an honest absence, never a blank card. Every phase's own
 * `refs.all` (already deduped/sorted by StatsEngine) is the exact film that
 * module's "watch this phase" affordance opens.
 */
export function specialTeamsPhases(stats) {
  const st = stats.specialTeams || {};
  const conv = stats.conversions || {};
  const phases = [];
  if (st.kickoffs?.n) {
    const rows = [
      ['Kickoffs', st.kickoffs.n],
      ['Avg distance', st.kickoffs.avg != null ? st.kickoffs.avg : ST_NO_DATA],
      ['Touchback %', `${st.kickoffs.tbPct}%`],
      ['Return allowed', st.kickoffs.retAllowedAvg != null ? st.kickoffs.retAllowedAvg : ST_NO_DATA],
    ];
    if (st.kickoffs.onside?.n != null) rows.push(['Onside', `${st.kickoffs.onside.recovered}/${st.kickoffs.onside.n}`]);
    phases.push({ key: 'kickoffs', title: 'Kickoffs', refs: st.kickoffs.refs?.all || [], label: `Kickoffs — ${st.kickoffs.n} snaps`, rows });
  }
  if (st.returns?.kick?.n) phases.push({ key: 'kickReturns', title: 'Kick Returns', refs: st.returns.kick.refs?.all || [],
    label: `Kick Returns — ${st.returns.kick.n} snaps`, rows: [
      ['Returns', st.returns.kick.attempts],
      ['Avg', st.returns.kick.avg != null ? st.returns.kick.avg : ST_NO_DATA],
      ['Long', st.returns.kick.long],
      ['TD', st.returns.kick.td, st.returns.kick.td ? 'is-good' : ''],
    ] });
  if (st.punts?.n) phases.push({ key: 'punts', title: 'Punts', refs: st.punts.refs?.all || [],
    label: `Punts — ${st.punts.n} snaps`, rows: [
      ['Punts', st.punts.n],
      ['Gross / Net', `${st.punts.grossAvg ?? ST_NO_DATA} / ${st.punts.netAvg ?? ST_NO_DATA}`],
      ['Hang time', st.punts.hangAvg != null ? `${st.punts.hangAvg}s` : ST_NO_DATA],
      ['Touchback %', `${st.punts.tbPct}%`],
      ['Return allowed', st.punts.retAllowedAvg != null ? st.punts.retAllowedAvg : ST_NO_DATA],
    ] });
  if (st.returns?.punt?.n) phases.push({ key: 'puntReturns', title: 'Punt Returns', refs: st.returns.punt.refs?.all || [],
    label: `Punt Returns — ${st.returns.punt.n} snaps`, rows: [
      ['Returns', st.returns.punt.attempts],
      ['Avg', st.returns.punt.avg != null ? st.returns.punt.avg : ST_NO_DATA],
      ['Long', st.returns.punt.long],
      ['TD', st.returns.punt.td, st.returns.punt.td ? 'is-good' : ''],
    ] });
  if (st.fg?.att) phases.push({ key: 'fieldGoals', title: 'Field Goals', refs: st.fg.refs?.all || [],
    label: `Field Goals — ${st.fg.att} attempts`, rows: [
      ['Made / Att', `${st.fg.made}/${st.fg.att}`],
      ['Pct', `${st.fg.pct}%`, st.fg.pct >= 60 ? 'is-good' : ''],
      ['Long', st.fg.long],
    ] });
  const convAtt = (conv.xp?.att || 0) + (conv.two?.att || 0);
  if (convAtt) phases.push({ key: 'conversions', title: 'Conversions',
    refs: [...new Set([...(conv.xp?.refs?.att || []), ...(conv.two?.refs?.att || [])])].sort(),
    label: `Conversions — ${convAtt} attempts`, rows: [
      ['PAT (XP)', conv.xp?.att ? `${conv.xp.made}/${conv.xp.att}` : ST_NO_DATA],
      ['2-Point', conv.two?.att ? `${conv.two.made}/${conv.two.att}` : ST_NO_DATA],
    ] });
  return phases;
}

/* ══ Reports > Matchup — the approved 2026-09-06 composition ═══════════════
   design-comps/reports-matchup-2026-09-06 (`matchup.html`, `RATIONALE.md`).

   Every number reaching these functions was already measured by
   `StatsEngine.matchupReport()`. Nothing here computes a cohort, a
   denominator, a ranking or a classification — these functions choose a
   label, format a value, and name the two film cohorts a row carries.

   Polarity travels in `kind`: an OFFENSE lane reports Success Rate over our
   own production, a DEFENSE lane Stop Rate over what we allowed. The two
   labels are never interchanged.
   ─────────────────────────────────────────────────────────────────────── */
export const MATCHUP_NO_MATCH = 'No matching snaps';
export const MATCHUP_NO_DATA = 'No data';

const muRate = value => `${Math.round(value)}%`;
const muAvg = value => value.toFixed(1);
const muGames = count => `${count} game${count === 1 ? '' : 's'}`;

/** Situational Calls: one row per fixed situation. An absent season join
 *  reads `No matching snaps` at copy weight and prints no measurement at
 *  all — never a fabricated zero. */
export function matchupSituationRows(lane, kind) {
  return (lane?.situations || []).map(row => ({
    id: row.key,
    situation: row.label,
    look: row.opponent ? row.opponent.label : MATCHUP_NO_DATA,
    rate: row.opponent ? muRate(row.opponent.rate) : MATCHUP_NO_DATA,
    sample: row.opponent ? row.opponent.n : MATCHUP_NO_DATA,
    answer: row.season ? row.season.label : MATCHUP_NO_MATCH,
    count: row.season ? row.season.n : '',
    avg: row.season ? muAvg(row.season.yardsPerPlay) : '',
    result: row.season ? muRate(kind === 'offense' ? row.season.successRate : row.season.stopRate) : '',
    oppRefs: row.opponent?.refs || [],
    seasonRefs: row.season?.refs || [],
    blank: !row.season,
  }));
}

/** Production by Play Type — one cohort's own rows, its own denominator. */
export function matchupPlayTypeRows(rows, kind) {
  return (rows || []).map(row => ({
    id: row.label, name: row.label, count: row.n, avg: muAvg(row.yardsPerPlay),
    result: muRate(kind === 'offense' ? row.successRate : row.stopRate), refs: row.refs,
  }));
}

/** Coverages — driven by the coverages the opponent defense charted,
 *  answered by our own season call inside that exact coverage. */
export function matchupCoverageRows(rows) {
  return (rows || []).map(row => ({
    id: row.coverage, coverage: row.coverage,
    answer: row.season ? row.season.label : MATCHUP_NO_MATCH,
    count: row.season ? row.season.n : '',
    avg: row.season ? muAvg(row.season.yardsPerPlay) : '',
    success: row.season ? muRate(row.season.successRate) : '',
    explosive: row.season ? muRate(row.season.explosiveRate) : '',
    refs: row.season?.refs || [],
    blank: !row.season,
  }));
}

/** Personnel and Formation — their production from their own film, our stop
 *  rate against the exact same combination, and two separate ref sets. */
export function matchupPersonnelRows(rows) {
  return (rows || []).map(row => ({
    id: `${row.personnel} | ${row.formation}`,
    personnel: row.personnel, formation: row.formation,
    count: row.opponent.n, runRate: muRate(row.opponent.runRate), avg: muAvg(row.opponent.yardsPerPlay),
    stop: row.season ? muRate(row.season.stopRate) : MATCHUP_NO_MATCH,
    oppRefs: row.opponent.refs, seasonRefs: row.season?.refs || [],
    blank: !row.season,
  }));
}

/** The two samples, counted independently. The opponent's charted film and
 *  our own season are different cohorts of different sizes; they share no
 *  denominator and are never summed into one figure. */
export function matchupSample(model) {
  const opponent = model.opponent, season = model.season;
  /* Each of the four unit headers states the games that contributed to THAT
     cohort. A game charted on offense only must not inflate the defensive
     sample beside it, so no header may borrow another's count. The summary
     line above them is the opponent's film as a whole, which is the one place
     a combined game count is the honest number. */
  return {
    opponent: `${muGames(opponent.games)} | ${opponent.defense} defense | ${opponent.offense} offense`,
    /* Every count names its cohort. Matchup measures what a unit LINED UP in,
       so it keeps every charted snap — formation and personnel exist on snaps
       with no play type, and excluding them would discard real looks. That is
       a different cohort from the classified one every production measure uses
       (201 vs 173 offensive, 174 vs 154 defensive on the canonical season),
       and printed as a bare number the two read as a contradiction. Neither is
       wrong; only the silence was. */
    units: {
      offense: {
        season: `${muGames(season.offenseGames)} | ${season.offense} charted snaps`,
        opponent: `${muGames(opponent.defenseGames)} | ${opponent.defense} charted snaps`,
      },
      defense: {
        season: `${muGames(season.defenseGames)} | ${season.defense} charted snaps`,
        opponent: `${muGames(opponent.offenseGames)} | ${opponent.offense} charted snaps`,
      },
    },
  };
}

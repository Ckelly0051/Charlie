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
 */

export function overviewKpis(stats) {
  const totalYards = stats.rushing.yards + stats.passing.yards;
  const yardsPerPlay = stats.offPlays.length ? (totalYards / stats.offPlays.length).toFixed(1) : '—';
  const penalty = stats.penalties || {};
  const giveaways = stats.turnovers?.giveaways ?? stats.offenseTurnovers ?? 0;
  return [
    { label: 'Total plays', value: stats.allPlays, sub: `${stats.allPlays} charted · 100%` },
    { label: 'Success rate', value: `${stats.efficiency.successRate}%`, sub: `${stats.efficiency.successfulPlays || 0} successful snaps`, cls: 'is-good' },
    { label: 'Yards / play', value: yardsPerPlay, sub: `${totalYards} total yards`, cls: 'is-gold' },
    { label: 'Explosives', value: stats.efficiency.explosivePlays, sub: `${stats.efficiency.explosivePct}% of snaps` },
    { label: 'Turnovers', value: giveaways, sub: 'giveaways' },
    { label: 'Plays for loss', value: stats.efficiency.negativePlays, sub: `${stats.efficiency.negativePct}% of snaps` },
    { label: 'Penalties', value: penalty.hasData ? penalty.accepted : 0, sub: penalty.hasData ? `${penalty.subjectYards} yards accepted` : 'none charted' },
  ];
}

export function snapsByPhase(stats) {
  const off = stats.offPlays.length, def = stats.defPlays.length;
  const special = Math.max(0, stats.allPlays - off - def);
  const total = Math.max(1, off + def + special);
  const offYards = stats.rushing.yards + stats.passing.yards;
  const defYards = stats.defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage, 10) || 0), 0);
  const row = (label, count, ypp, cls) => ({ label, count, share: Math.round(count / total * 100), ypp: count ? ypp : '—', cls });
  return {
    total: off + def + special, off, def, special,
    rows: [
      row('Offense', off, off ? (offYards / off).toFixed(1) : '—', 'is-offense'),
      row('Defense', def, def ? `${(defYards / def).toFixed(1)} allowed` : '—', 'is-defense'),
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
    tile('Red zone', s.redZone, 'situation', 'redZone', item => `${item.tds} TD · ${item.total} snaps`),
    tile('Goal line', s.goalLine, 'situation', 'goalLine', item => `${item.tds} TD · ${item.total} snaps`),
    { title: 'Third down', value: third.total ? `${third.conversionPct}%` : '—', sub: third.total ? stats.downs.thirdDownConv : 'No data', cutType: 'down', cutVal: '3', plays: third.total, cutLabel: third.total ? `Third down — ${third.total} plays` : null },
    tile('3rd & long', s.thirdLong, 'situation', 'thirdLong', item => `${item.successes} of ${item.total}`),
    tile('3rd & short', s.thirdShort, 'situation', 'thirdShort', item => `${item.successes} of ${item.total}`),
    tile('Backed up', s.backedUp, 'situation', 'backedUp', item => `${item.successes} of ${item.total}`),
  ];
}

export function keyMetrics(stats) {
  const topFormation = stats.tendencies.formationList?.[0];
  const redZone = stats.situational.redZone;
  return [
    ['Efficiency', `${stats.efficiency.successRate}%`, 'Success rate'],
    ['Explosive', stats.efficiency.explosivePlays, `${stats.efficiency.explosivePct}% of snaps`],
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

export function yardsByType(stats) {
  const total = stats.rushing.yards + stats.passing.yards;
  const playTypes = (stats.tendencies.playTypeList || []).slice(0, 5);
  return {
    total,
    // The split bar's width can never be negative; the legend text shows the
    // real (possibly negative) yardage — same distinction the original
    // template drew between its `--n` CSS var and its displayed number.
    rushWidth: Math.max(0, stats.rushing.yards), passWidth: Math.max(0, stats.passing.yards),
    rush: stats.rushing.yards, pass: stats.passing.yards,
    rows: playTypes.map(row => ({ name: row.name, snaps: row.count, ypp: row.avg, success: `${row.successPct}%`,
      cutType: 'playType', cutVal: row.name, cutLabel: `${row.name} — ${row.count} plays` })),
  };
}

export function downDistanceRows(stats) {
  const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
  return (stats.downs.ddBuckets || []).map(row => ({
    situation: `${labels[row.down]} & ${row.bucket}`, snaps: row.count, runPct: row.runPct, passPct: row.passPct,
    ypp: row.avgYards, success: `${row.succPct}%`, conv: `${row.convPct}%`,
    cutType: 'dd', cutVal: `${row.down}|${row.bucket}`, cutLabel: `${labels[row.down]} & ${row.bucket} — ${row.count} plays`,
  }));
}

export function gamePlan(stats) {
  const t = stats.takeaways || {};
  const plainText = value => String(value || '').replace(/<[^>]+>/g, '');
  const list = items => (items || []).slice(0, 3).map(item => ({ text: plainText(item.text), cut: item.cut || null }));
  return { working: list(t.working), fix: list(t.fix) };
}

export function bigPlaysRows(stats, statsEngine, gameLabels = null) {
  const playsById = new Map((stats.offPlays || []).map(play => [statsEngine.constructor._compositeRef(play) || String(play.id), play]));
  return (stats.bigPlays || []).slice(0, 8).map(play => {
    const source = playsById.get(play.ref || String(play.id));
    const gameId = play.ref?.split('::')[0] || '';
    return { id: play.id, ref: play.ref || null, game: gameLabels?.[gameId] || '', situation: statsEngine.constructor.situationLabel(source) || '—', call: play.type || '—', yards: play.yards };
  });
}

export function drivesRows(stats, gameLabels = null) {
  const drives = stats.drives?.list || [];
  const max = Math.max(1, ...drives.map(d => Math.abs(d.yards)));
  return { total: drives.length, scoring: stats.drives.scoringDrives, rows: drives.slice(0, 8).map(drive => ({
    number: drive.number, game: gameLabels?.[drive.refs?.[0]?.split('::')[0]] || '', widthPct: Math.max(6, Math.round(Math.abs(drive.yards) / max * 100)), outcome: drive.outcome, playIds: drive.playIds || [], refs: drive.refs || [],
  })) };
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

export function offenseHero(stats, engine) {
  if (!stats || !stats.totalPlays) return [];
  const ypp = engine.constructor.yardsPerPlay(stats);
  const e = stats.efficiency || {};
  const tend = stats.tendencies || {};
  const num = v => (v == null ? null : parseFloat(v));
  const tone = (v, good, ok, invert) => {
    if (v == null || isNaN(v)) return '';
    return invert ? (v <= good ? 'is-good' : v <= ok ? 'is-warn' : 'is-bad')
                  : (v >= good ? 'is-good' : v >= ok ? 'is-warn' : 'is-bad');
  };
  const succ = num(e.successRate), expl = num(e.explosivePct), neg = num(e.negativePct);
  const kpis = [];
  if (succ != null) kpis.push({ label: 'Success rate', value: Math.round(succ) + '%', tone: tone(succ, 45, 33) });
  if (expl != null) kpis.push({ label: 'Explosive', value: Math.round(expl) + '%', sub: `${e.explosivePlays || 0} plays`, tone: tone(expl, 12, 7) });
  if (neg != null) kpis.push({ label: 'Plays for Loss', value: Math.round(neg) + '%', sub: `${e.negativePlays || 0} plays`, tone: tone(neg, 8, 15, true) });
  kpis.push({ label: 'Yds / play', value: ypp, sub: `${stats.totalPlays} plays` });
  kpis.push({ label: 'Run rate', value: Math.round(parseFloat(tend.runPct) || 0) + '%', sub: `${tend.runs || 0}R / ${tend.passes || 0}P` });
  return kpis;
}

export function tendencyBreakdown(stats) {
  return {
    formations: groupBreakdown(stats.tendencies.formationList || [], 'formation'),
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
  const rows = [row('Red Zone', s.redZone, 'redZone'), row('Goal Line', s.goalLine, 'goalLine'), row('Backed Up', s.backedUp, 'backedUp'), row('3rd & Long', s.thirdLong, 'thirdLong'), row('3rd & Short', s.thirdShort, 'thirdShort')].filter(Boolean);
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
    const label = `${t.down || '?'}&${t.distance || '?'} ${engine.constructor.proj(x.play).formation || ''} ${t.playType || ''}`.trim();
    return { id: x.play.id, label, yards: t.yardage || 0, epa: x.epa, epaText: fmt(x.epa), epaClass: epaClass(x.epa) };
  };
  const groupRows = rows => (rows || []).slice(0, 8).map(r => ({ name: r.name, count: r.count, total: fmt(r.total), totalClass: epaClass(r.total), perPlay: fmt(r.perPlay), perPlayClass: epaClass(r.perPlay) }));
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
export function individualStats(stats, group, playerLabel) {
  const ind = stats.individuals || {};
  const showOff = group === 'all' || group === 'offense';
  const showDef = group === 'all' || group === 'defense';
  const showST = group === 'all' || group === 'special';
  const grade = r => {
    if (!r.gradeCount) return { text: '—', cls: '' };
    const avg = r.gradeSum / r.gradeCount;
    return { text: `${avg > 0 ? '+' : ''}${avg.toFixed(1)}`, cls: avg > 0 ? 'grade-pos' : avg < 0 ? 'grade-neg' : '' };
  };
  const player = num => ({ num, label: playerLabel(num) });
  // Special Teams Presentation Independence: `_individualStats` now carries a
  // deduped, sorted `refs` array on every row (the exact plays that produced
  // that row's own counts). Propagated here unconditionally -- PlayersTab
  // (game-scoped, still uses `engine._watchPlayer`) simply ignores the field;
  // SpecialTeamsTab (season-capable) needs it for an honest cross-game click.
  const refs = row => Array.isArray(row.refs) ? row.refs : [];
  const tables = [];
  if (showOff && ind.rushers?.length) tables.push({ title: 'Individual Rushing', key: 'rushing',
    columns: [['player', 'Player'], ['att', 'Att', true], ['yds', 'Yds', true], ['avg', 'Avg', true], ['long', 'Long', true], ['tds', 'TD', true], ['fum', 'Fum', true], ['grade', 'Grade']],
    rows: ind.rushers.map(r => ({ ...player(r.num), att: r.attempts, yds: r.yards, avg: r.attempts ? (r.yards / r.attempts).toFixed(1) : '0.0', long: r.long, tds: r.tds, fum: r.fumbles, ...grade(r), refs: refs(r) })) });
  if (showOff && ind.passers?.length) tables.push({ title: 'Individual Passing', key: 'passing',
    columns: [['player', 'Player'], ['ca', 'C/A'], ['pct', 'Pct'], ['yds', 'Yds', true], ['tds', 'TD', true], ['ints', 'INT', true], ['sacks', 'Sck', true], ['grade', 'Grade']],
    rows: ind.passers.map(p => ({ ...player(p.num), ca: `${p.completions}/${p.attempts}`, pct: `${p.attempts ? ((p.completions / p.attempts) * 100).toFixed(1) : '0.0'}%`, yds: p.yards, tds: p.tds, ints: p.ints, sacks: p.sacks, ...grade(p), refs: refs(p) })) });
  if (showOff && ind.receivers?.length) tables.push({ title: 'Individual Receiving', key: 'receiving',
    columns: [['player', 'Player'], ['rec', 'Rec', true], ['yds', 'Yds', true], ['long', 'Long', true], ['tds', 'TD', true], ['grade', 'Grade']],
    rows: ind.receivers.map(r => ({ ...player(r.num), rec: r.receptions, yds: r.yards, long: r.long, tds: r.tds, ...grade(r), refs: refs(r) })) });
  if (showDef && ind.tacklers?.length) tables.push({ title: 'Individual Tackles', key: 'tackles',
    columns: [['player', 'Player'], ['tkl', 'Tkl', true], ['solo', 'Solo', true], ['ast', 'Ast', true], ['sacks', 'Sack', true], ['tfl', 'TFL', true], ['ints', 'INT', true], ['fr', 'FR', true], ['grade', 'Grade']],
    rows: ind.tacklers.map(t => ({ ...player(t.num), tkl: t.tackles, solo: t.solo || 0, ast: t.assists || 0, sacks: t.sacks, tfl: t.tfl, ints: t.ints || 0, fr: t.fumblesRec || 0, ...grade(t), refs: refs(t) })) });
  if (showST && ind.returners?.length) tables.push({ title: 'Return Game', key: 'returns',
    columns: [['player', 'Player'], ['ret', 'Ret', true], ['yds', 'Yds', true], ['avg', 'Avg', true], ['long', 'Long', true], ['tds', 'TD', true]],
    rows: ind.returners.map(r => ({ ...player(r.num), ret: r.returns, yds: r.yards, avg: r.returns ? (r.yards / r.returns).toFixed(1) : '0.0', long: r.long, tds: r.tds, refs: refs(r) })) });
  if (showST && ind.kickers?.length) tables.push({ title: 'Kicking / Punting', key: 'kicking',
    columns: [['player', 'Player'], ['fg', 'FG (M/A)'], ['punts', 'Punts'], ['puntAvg', 'Punt Avg']],
    rows: ind.kickers.map(k => ({ ...player(k.num), fg: k.fgAtt ? `${k.fgMade}/${k.fgAtt}` : '—', punts: k.punts || '—', puntAvg: k.punts ? (k.puntYds / k.punts).toFixed(1) : '—', refs: refs(k) })) });
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
  return { meta: `${def} defensive snaps`, rows: [
    ['Yards / play allowed', def ? (yards / def).toFixed(1) : '—'],
    ['Stop rate', def ? `${Math.round(stops / def * 100)}%` : '—', 'is-good'],
    ['Explosives allowed', explosives, explosives ? '' : 'is-good'],
    ['Takeaways', stats.defensive.turnovers],
    ['Penalties accepted', penalties.hasData ? `${penalties.accepted} · ${penalties.subjectYards} yds` : '0'],
    ['Penalties declined', penalties.hasData ? penalties.declined : '0'],
  ] };
}

/**
 * Special Teams Presentation Independence -- the performance-band KPI tiles.
 * Every value is read straight off `stats.specialTeams`/`stats.conversions`
 * (both already fully computed, refs-carrying) plus the two new aggregates
 * StatsEngine's `_specialTeamsSummary` composed (snaps/points). No formula
 * lives here -- this only decides which already-computed numbers lead the
 * band and how to phrase them.
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
  const retAtt = kickRet.attempts + puntRet.attempts;
  const retYards = (kickRet.yards || 0) + (puntRet.yards || 0);
  const retLong = Math.max(kickRet.long || 0, puntRet.long || 0);
  const covYards = (st.punts?.retAllowedYards || 0) + (st.kickoffs?.retAllowedYards || 0);
  const covN = (st.punts?.refs?.returned?.length || 0) + (st.kickoffs?.refs?.returned?.length || 0);
  const impact = summary.impact || [];
  const impactN = impact.reduce((sum, item) => sum + item.n, 0);
  return [
    { label: 'ST Snaps', value: summary.snaps.n, sub: summary.snaps.n ? 'kick · return · punt · FG · try' : 'none charted' },
    { label: 'Points', value: summary.points.us,
      sub: summary.points.them ? `${summary.points.them} allowed` : (summary.points.us ? 'none allowed' : '—'),
      cls: summary.points.us > summary.points.them ? 'is-good' : '' },
    { label: 'Field Goals', value: fg.att ? `${fg.made}/${fg.att}` : '—', sub: fg.att ? `${fg.pct}% · long ${fg.long}` : 'none attempted' },
    { label: 'Conversions', value: convAtt ? `${convMade}/${convAtt}` : '—', sub: convAtt ? `${Math.round(convMade / convAtt * 100)}% · XP + 2pt` : 'none attempted' },
    { label: 'Return Production', value: retAtt ? `${retYards} yds` : '—', sub: retAtt ? `${retAtt} returns · long ${retLong}` : 'none charted' },
    { label: 'Coverage Allowed', value: covN ? `${(covYards / covN).toFixed(1)} yds/ret` : '—', sub: covN ? `${covN} return${covN === 1 ? '' : 's'} allowed` : 'none charted' },
    { label: 'Impact Plays', value: impactN, sub: impactN ? impact.map(item => item.label).join(' · ') : 'none charted', cls: impactN ? '' : 'is-good' },
  ];
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
      ['Avg distance', st.kickoffs.avg != null ? st.kickoffs.avg : '—'],
      ['Touchback %', `${st.kickoffs.tbPct}%`],
      ['Return allowed', st.kickoffs.retAllowedAvg != null ? st.kickoffs.retAllowedAvg : '—'],
    ];
    if (st.kickoffs.onside?.n != null) rows.push(['Onside', `${st.kickoffs.onside.recovered}/${st.kickoffs.onside.n}`]);
    phases.push({ key: 'kickoffs', title: 'Kickoffs', refs: st.kickoffs.refs?.all || [], label: `Kickoffs — ${st.kickoffs.n} snaps`, rows });
  }
  if (st.returns?.kick?.n) phases.push({ key: 'kickReturns', title: 'Kick Returns', refs: st.returns.kick.refs?.all || [],
    label: `Kick Returns — ${st.returns.kick.n} snaps`, rows: [
      ['Returns', st.returns.kick.attempts],
      ['Avg', st.returns.kick.avg != null ? st.returns.kick.avg : '—'],
      ['Long', st.returns.kick.long],
      ['TD', st.returns.kick.td, st.returns.kick.td ? 'is-good' : ''],
    ] });
  if (st.punts?.n) phases.push({ key: 'punts', title: 'Punts', refs: st.punts.refs?.all || [],
    label: `Punts — ${st.punts.n} snaps`, rows: [
      ['Punts', st.punts.n],
      ['Gross / Net', `${st.punts.grossAvg ?? '—'} / ${st.punts.netAvg ?? '—'}`],
      ['Hang time', st.punts.hangAvg != null ? `${st.punts.hangAvg}s` : '—'],
      ['Touchback %', `${st.punts.tbPct}%`],
      ['Return allowed', st.punts.retAllowedAvg != null ? st.punts.retAllowedAvg : '—'],
    ] });
  if (st.returns?.punt?.n) phases.push({ key: 'puntReturns', title: 'Punt Returns', refs: st.returns.punt.refs?.all || [],
    label: `Punt Returns — ${st.returns.punt.n} snaps`, rows: [
      ['Returns', st.returns.punt.attempts],
      ['Avg', st.returns.punt.avg != null ? st.returns.punt.avg : '—'],
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
      ['PAT (XP)', conv.xp?.att ? `${conv.xp.made}/${conv.xp.att}` : '—'],
      ['2-Point', conv.two?.att ? `${conv.two.made}/${conv.two.att}` : '—'],
    ] });
  return phases;
}

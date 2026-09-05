import * as view from './reports-view.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

const cell = value => `<td>${esc(value)}</td>`;
const table = (title, columns, rows) => rows?.length ? `
  <section class="report-section">
    <h2>${esc(title)}</h2>
    <div class="table-wrap"><table><thead><tr>${columns.map(column => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(row => `<tr>${columns.map(column => cell(typeof column.value === 'function' ? column.value(row) : row[column.key])).join('')}</tr>`).join('')}</tbody></table></div>
  </section>` : '';

const metrics = items => `<div class="metric-band">${items.map(item => `<div class="metric"><span>${esc(item.label)}</span><strong>${esc(item.value)}</strong><small>${esc(item.sub || '')}</small></div>`).join('')}</div>`;

const compactRows = (title, data) => data?.rows?.length ? table(title,
  [{ key: 0, label: 'Metric', value: row => row[0] }, { key: 1, label: 'Value', value: row => row[1] }], data.rows) : '';

const tendencyTable = stats => table('Formation Tendencies', [
  { key: 'name', label: 'Formation' }, { key: 'count', label: 'Snaps' },
  { key: 'run', label: 'Run / Pass', value: row => `${row.runs} / ${row.passes}` },
  { key: 'avg', label: 'Yards / Play' }, { key: 'successPct', label: 'Success', value: row => `${row.successPct}%` },
], (stats.tendencies?.formationList || []).slice(0, 12));

const situationalTable = stats => table('Situational Offense', [
  { key: 'name', label: 'Situation' }, { key: 'total', label: 'Snaps' },
  { key: 'avg', label: 'Yards / Play' }, { key: 'success', label: 'Success' }, { key: 'tds', label: 'TD' },
], view.situationalBreakdown(stats).rows);

const defenseTables = report => {
  if (!report?.total) return '';
  const columns = [
    { key: 'name', label: 'Play Type' }, { key: 'n', label: 'Snaps' },
    { key: 'yardsPerPlay', label: 'Yards / Play', value: row => Number(row.yardsPerPlay).toFixed(1) },
    { key: 'stopRate', label: 'Stop Rate', value: row => `${row.stopRate}%` },
    { key: 'explosiveRate', label: 'Explosive', value: row => `${row.explosiveRate}%` },
    { key: 'havocRate', label: 'Havoc', value: row => `${row.havocRate}%` },
  ];
  const summary = metrics([
    { label: 'Defensive snaps', value: report.total, sub: 'charted' },
    { label: 'Yards / play allowed', value: Number(report.summary.yardsPerPlay).toFixed(1), sub: 'all defensive snaps' },
    { label: 'Stop rate', value: `${report.summary.stopRate}%`, sub: `${report.summary.stops} stops` },
    { label: 'Explosives allowed', value: report.summary.explosives, sub: `${report.summary.explosiveRate}%` },
    { label: 'Takeaways', value: report.takeaways, sub: 'defensive turnovers' },
    { label: 'Third-down stop', value: report.thirdDownStopRate == null ? '—' : `${report.thirdDownStopRate}%`, sub: 'charted third downs' },
  ]);
  return `<section class="chapter"><div class="chapter-title"><span>Defense</span><h1>Defensive Performance</h1></div>${summary}${table('Opponent Offense by Play Type', columns, report.playTypes)}${table('Situational Defense', columns.map(c => ({ ...c, label: c.key === 'name' ? 'Situation' : c.label })), report.situations)}</section>`;
};

/**
 * Special Teams KPI tiles for the printed report. The screen's tiles carry
 * NAMED values on a line (`stats`), not a `value`/`sub` pair, so the generic
 * `metrics()` band renders them blank -- it reads fields these tiles no longer
 * have. Each named value gets its own label/value row: joining them into the
 * band's 25px display `<strong>` wrapped one tile over three lines and printed
 * the stat's label at headline size beside its own number.
 */
const stMetrics = items => `<div class="metric-band">${items.map(item => {
  const rows = item.stats
    ? item.stats.flat().map(([label, value]) =>
      `<p><span>${esc(label)}</span><strong>${esc(value)}</strong></p>`).join('')
    : `<p><strong>${esc(item.value ?? '')}</strong></p>`;
  return `<div class="metric"><span>${esc(item.label)}</span><div class="metric-stats">${rows}</div></div>`;
}).join('')}</div>`;

const specialTeams = (stats, summary) => {
  const phases = view.specialTeamsPhases(stats);
  const players = view.individualStats(stats, 'special', num => `#${num}`);
  if (!phases.length && !players.length) return '';
  return `<section class="chapter"><div class="chapter-title"><span>Special Teams</span><h1>Special Teams Performance</h1></div>
    ${stMetrics(view.specialTeamsKpis(stats, summary))}
    <div class="phase-grid">${phases.map(phase => `<div class="phase"><h3>${esc(phase.title)}</h3>${phase.rows.map(row => `<p><span>${esc(row[0])}</span><strong>${esc(row[1])}</strong></p>`).join('')}</div>`).join('')}</div>
    ${players.map(playerTable).join('')}</section>`;
};

function playerTable(item) {
  return table(item.title, item.columns.map(([key, label]) => ({ key, label })), item.rows.map(row => ({ ...row, player: row.label })));
}

const playerTables = (stats, labeler) => view.individualStats(stats, 'all', labeler).map(playerTable).join('');

const sharedBody = ({ stats, engine, gameLabels = null, rosterLabels = null, defensiveReport = null, specialSummary = null }) => {
  const totalYards = stats.rushing.yards + stats.passing.yards;
  const overview = metrics([
    ...view.overviewKpis(stats).slice(0, 5),
    { label: 'Offensive yards', value: totalYards, sub: `${stats.rushing.yards} rush, ${stats.passing.yards} pass` },
  ]);
  const dd = table('Down & Distance', [
    { key: 'situation', label: 'Situation' }, { key: 'snaps', label: 'Snaps' },
    { key: 'mix', label: 'Run / Pass', value: row => `${row.runPct}% / ${row.passPct}%` },
    { key: 'ypp', label: 'Yards / Play' }, { key: 'success', label: 'Success' }, { key: 'conv', label: 'Conversion' },
  ], view.downDistanceRows(stats));
  const drives = view.drivesRows(stats, gameLabels);
  const driveTable = table('Drives', [
    { key: 'game', label: 'Game' }, { key: 'number', label: 'Drive' },
    { key: 'outcome', label: 'Outcome' }, { key: 'plays', label: 'Plays', value: row => row.refs?.length || row.playIds?.length || 0 },
  ], drives.rows);
  const labeler = num => rosterLabels?.[String(num)] ? `#${num} ${rosterLabels[String(num)]}` : engine._playerLabel(num);
  const cohort = [...(stats.offPlays || []), ...(stats.defPlays || []), ...(stats.stPlays || [])];
  const def = defensiveReport || engine.defensivePerformance(cohort);
  const stSummary = specialSummary || engine._specialTeamsSummary(cohort, stats);
  return `${overview}
    <section class="chapter"><div class="chapter-title"><span>Offense</span><h1>Offensive Performance</h1></div>
      <div class="two-up">${compactRows('Rushing', view.rushingRows(stats))}${compactRows('Passing', view.passingRows(stats))}</div>
      ${tendencyTable(stats)}${dd}${situationalTable(stats)}${driveTable}
    </section>
    ${defenseTables(def)}${specialTeams(stats, stSummary)}
    <section class="chapter"><div class="chapter-title"><span>Players</span><h1>Individual Performance</h1></div>${playerTables(stats, labeler) || '<p class="empty">No player attribution charted.</p>'}</section>`;
};

const stylesheet = `
  :root{color-scheme:light;--ink:#172033;--muted:#667085;--line:#d8dee8;--soft:#f4f6f9;--blue:#1d66d1;--gold:#d99a00;--green:#16875b}
  *{box-sizing:border-box}body{margin:0;background:#eef1f5;color:var(--ink);font:14px/1.45 Inter,"Segoe UI",Arial,sans-serif}.page{max-width:1180px;margin:28px auto;background:#fff;padding:42px 48px;box-shadow:0 12px 40px #17203318}.masthead{display:flex;justify-content:space-between;gap:28px;align-items:flex-end;border-bottom:4px solid var(--ink);padding-bottom:22px}.brand{color:var(--blue);font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.12em}.masthead h1,.chapter-title h1{margin:5px 0 0;font-size:30px;line-height:1.08}.meta{color:var(--muted);text-align:right}.metric-band{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));border:1px solid var(--line);margin:22px 0}.metric{min-height:96px;padding:15px 16px;border-right:1px solid var(--line)}.metric:last-child{border-right:0}.metric span,.metric small{display:block;color:var(--muted)}.metric span{font-size:10px;text-transform:uppercase;font-weight:800}.metric strong{display:block;font-size:25px;line-height:1.1;margin:7px 0}.metric small{font-size:11px}.metric-stats{margin-top:7px}.metric-stats p{display:flex;justify-content:space-between;gap:10px;align-items:baseline;margin:0;padding:3px 0;font-size:12px}.metric-stats p+p{border-top:1px solid var(--soft)}.metric-stats span{display:block;color:var(--muted);font-size:11px;text-transform:none;font-weight:600}.metric-stats strong{font-size:15px;margin:0}.chapter{border-top:7px solid var(--soft);padding-top:28px;margin-top:34px}.chapter-title span{color:var(--blue);font-size:11px;text-transform:uppercase;font-weight:800}.chapter-title h1{font-size:24px}.report-section{margin:22px 0}.report-section h2{font-size:14px;text-transform:uppercase;border-bottom:2px solid var(--ink);padding:0 0 8px;margin:0}.two-up{display:grid;grid-template-columns:1fr 1fr;gap:24px}.table-wrap{overflow:hidden}table{border-collapse:collapse;width:100%;font-size:12px}th{color:var(--muted);font-size:10px;text-align:left;text-transform:uppercase;letter-spacing:.04em;background:var(--soft)}th,td{border-bottom:1px solid var(--line);padding:8px 10px}td:not(:first-child),th:not(:first-child){text-align:right}.phase-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:20px 0}.phase{border:1px solid var(--line);padding:14px}.phase h3{margin:0 0 8px;font-size:13px}.phase p{display:flex;justify-content:space-between;margin:0;padding:5px 0;border-top:1px solid var(--soft);font-size:12px}.empty{color:var(--muted)}
  @media(max-width:760px){.page{margin:0;padding:24px}.masthead{display:block}.meta{text-align:left;margin-top:12px}.two-up{grid-template-columns:1fr}.metric-band{grid-template-columns:repeat(2,1fr)}.metric{border-bottom:1px solid var(--line)}}
  @media print{body{background:#fff}.page{box-shadow:none;margin:0;max-width:none;padding:20px}.chapter{break-before:auto}.report-section,.phase{break-inside:avoid}}
`;

const documentShell = ({ title, subtitle, meta, body }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${stylesheet}</style></head><body><main class="page"><header class="masthead"><div><div class="brand">Gridiron IQ Report</div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><div class="meta">${esc(meta)}</div></header>${body}</main></body></html>`;

export function buildGameHtmlReport({ title, stats, engine, generatedAt = new Date() }) {
  return documentShell({ title, subtitle: `${stats.allPlays} charted plays`, meta: `Generated ${generatedAt.toLocaleString()}`,
    body: sharedBody({ stats, engine }) });
}

export function buildSeasonHtmlReport({ title, model, engine, generatedAt = new Date() }) {
  const { stats, summary, perGame, progression } = model;
  const seasonLead = `${metrics([
    { label: 'Record', value: summary.record, sub: `${summary.games} games` },
    { label: 'Points', value: `${summary.pointsFor}–${summary.pointsAgainst}`, sub: 'for, against' },
    { label: 'Plays charted', value: stats.allPlays, sub: 'season total' },
    { label: 'Success rate', value: `${stats.efficiency.successRate}%`, sub: 'offensive snaps' },
  ])}${table('Game Log', [
    { key: 'name', label: 'Game' }, { key: 'plays', label: 'Plays' }, { key: 'yards', label: 'Off. Yards' },
    { key: 'successRate', label: 'Success', value: row => `${row.successRate}%` }, { key: 'turnoverMargin', label: 'TO Margin' },
  ], perGame)}${table('Season Progression', [
    { key: 'label', label: 'Metric' }, { key: 'from', label: 'Early' }, { key: 'to', label: 'Recent' }, { key: 'verdict', label: 'Trend' },
  ], progression)}`;
  return documentShell({ title, subtitle: `${summary.games} games, ${stats.allPlays} charted plays`, meta: `Generated ${generatedAt.toLocaleString()}`,
    body: seasonLead + sharedBody({ stats, engine, gameLabels: model.gameLabels, rosterLabels: model.rosterLabels, defensiveReport: model.defenseReport, specialSummary: model.specialSummary }) });
}

export function buildDefenseHtmlReport({ title, report, stats, defScout, scopeLabel, generatedAt = new Date() }) {
  const defensive = stats?.defensive || {};
  const schemeColumns = [
    { key: 'name', label: 'Scheme' }, { key: 'count', label: 'Snaps' },
    { key: 'average', label: 'Yards / Play', value: row => row.count ? (row.yards / row.count).toFixed(1) : '0.0' },
    { key: 'stop', label: 'Stop Rate', value: row => `${row.count ? Math.round(row.successes / row.count * 100) : 0}%` },
    { key: 'havoc', label: 'Havoc', value: row => `${row.count ? Math.round(row.havoc / row.count * 100) : 0}%` },
  ];
  const scoutRows = defScout?.insufficient ? [] : (defScout?.tells || []).map(item => ({
    situation: item.label, type: item.tellType, lean: `${item.tellVal} ${item.tellPct}%`,
    stop: `${item.stopRate}%`, havoc: `${item.havocRate}%`, assessment: item.verdict,
  }));
  const body = `${defenseTables(report)}
    ${table('Defensive Fronts', schemeColumns, defensive.fronts)}
    ${table('Coverages', schemeColumns, defensive.coverages)}
    ${table('Pressures', schemeColumns, defensive.blitzes)}
    ${table('Defensive Tendency Tells', [
      { key: 'situation', label: 'Situation' }, { key: 'type', label: 'Type' },
      { key: 'lean', label: 'Lean' }, { key: 'stop', label: 'Stop Rate' },
      { key: 'havoc', label: 'Havoc' }, { key: 'assessment', label: 'Assessment' },
    ], scoutRows)}`;
  return documentShell({ title, subtitle: `${scopeLabel} - ${report.total} defensive snaps`,
    meta: `Generated ${generatedAt.toLocaleString()}`, body });
}

/**
 * Special Teams export. Coach decision, 2026-09-04: reuse the existing Reports
 * export mechanism rather than build a Special-Teams-only exporter. So this
 * composes the SAME `specialTeams()` section the game and season reports
 * already emit, through the same `documentShell`, and adds only the unit
 * ledger and the unassigned-snap line the board itself carries. The absence
 * label is the report's own -- an em dash here would say something different
 * from what the screen says about the same number.
 */
export function buildSpecialTeamsHtmlReport({ title, stats, summary, scopeLabel, generatedAt = new Date() }) {
  const units = view.specialTeamsUnits(stats);
  const unassigned = view.specialTeamsUnassigned(stats, summary);
  const ledger = table('Units', [
    { key: 'name', label: 'Unit' }, { key: 'snaps', label: 'Snaps' }, { key: 'head', label: '' },
  ], units.map(unit => ({
    name: unit.name,
    snaps: unit.blank ? view.ST_NO_DATA : unit.n,
    head: unit.blank ? '' : unit.headline,
  })));
  const note = unassigned > 0
    ? `<p class="note">${unassigned} ${unassigned === 1 ? 'snap is' : 'snaps are'} not assigned to a unit.</p>`
    : '';
  return documentShell({ title, subtitle: `${scopeLabel} - ${summary.snaps.n} special teams snaps`,
    meta: `Generated ${generatedAt.toLocaleString()}`,
    body: `${ledger}${note}${specialTeams(stats, summary)}` });
}

export function buildSelfScoutHtmlReport({ title, report, defScout, performance, callRows,
  summary, defSummary, generatedAt = new Date() }) {
  const outcomeColumns = [
    { key: 'key', label: 'Group' }, { key: 'n', label: 'Plays' },
    { key: 'avg', label: 'Yards / Play' },
    { key: 'success', label: 'Success', value: row => `${row.succRate}%` },
    { key: 'explosives', label: 'Explosive' }, { key: 'tds', label: 'TD' },
    { key: 'turnovers', label: 'Giveaways' },
    { key: 'run', label: 'Run / Pass', value: row => `${row.runPct}% / ${row.passPct}%` },
  ];
  const callColumns = outcomeColumns.slice(0, 4);
  const countRows = items => items.map(([label, value]) => ({ label, value }));
  const counts = (heading, items) => table(heading,
    [{ key: 'label', label: 'Metric' }, { key: 'value', label: 'Value' }], countRows(items));
  const tellRows = (report?.tells || []).map(item => ({
    situation: item.label, type: item.dim, tendency: `${item.lean} ${item.leanPct}%`,
    average: item.leanAvg, success: `${item.leanSuccRate}%`, n: item.n,
  }));
  const defensiveRows = defScout?.insufficient ? [] : (defScout?.tells || []).map(item => ({
    situation: item.label, type: item.tellType, lean: `${item.tellVal} ${item.tellPct}%`,
    stop: `${item.stopRate}%`, havoc: `${item.havocRate}%`,
  }));
  const offense = report && summary ? `<section class="chapter"><div class="chapter-title"><span>Self-Scout</span><h1>Offensive Summary</h1></div>${metrics([
    { label: 'Success Rate', value: `${summary.kpis.successRate}%` },
    { label: 'Yards / Play', value: summary.kpis.yardsPerPlay },
    { label: 'Explosive Rate', value: `${summary.kpis.explosiveRate}%` },
    { label: 'Negative Play Rate', value: `${summary.kpis.negativePlayRate}%` },
    { label: 'Third Down', value: `${summary.kpis.thirdDownRate}%` },
    { label: 'Red Zone TD', value: summary.kpis.redZoneTdRate == null
      ? 'No data' : `${summary.kpis.redZoneTdRate}%` },
  ])}
    <div class="two-up">${counts('Positive Plays', [
      ['Successful plays', summary.positive.successful], ['Explosive plays', summary.positive.explosive],
      ['Touchdowns', summary.positive.touchdowns], ['Third-down conversions', summary.positive.thirdDownConversions],
      ['Red-zone touchdowns', summary.positive.redZoneTouchdowns],
    ])}${counts('Negative Plays', [
      ['Negative plays', summary.negative.negative], ['Turnovers', summary.negative.turnovers],
      ['Sacks', summary.negative.sacks], ['Plays for loss', summary.negative.playsForLoss],
      ['Penalties', summary.negative.penalties],
    ])}</div>
    <div class="two-up">${table('Top Calls', callColumns, summary.topCalls)}${table('Worst Calls', callColumns, summary.worstCalls)}</div>
    <div class="two-up">${counts('Run Offense', [
      ['Attempts', summary.run.attempts], ['Rushing yards', summary.run.yards],
      ['Yards per carry', summary.run.avg], ['Success rate', `${summary.run.succRate}%`],
      ['Explosive runs', summary.run.explosives],
    ])}${counts('Pass Offense', [
      ['Attempts', summary.pass.attempts], ['Passing yards', summary.pass.yards],
      ['Yards per attempt', summary.pass.avg], ['Success rate', `${summary.pass.succRate}%`],
      ['Explosive passes', summary.pass.explosives], ['Sacks', summary.pass.sacks],
    ])}</div>
    ${table('Calls and Concepts', outcomeColumns, callRows)}
    ${table('Down and Distance', outcomeColumns, report.downDistRows)}
    ${table('Formation', outcomeColumns, report.formationRows)}
    ${table('Personnel', outcomeColumns, report.personnelRows)}</section>` : '';
  const defense = defSummary?.totalPlays ? `<section class="chapter"><div class="chapter-title"><span>Self-Scout</span><h1>Defense</h1></div>${metrics([
    { label: 'Stop Rate', value: defSummary.kpis.stopRate == null ? 'No data' : `${defSummary.kpis.stopRate}%` },
    { label: 'Yards Allowed / Play', value: defSummary.kpis.yardsAllowedPerPlay ?? 'No data' },
    { label: 'Havoc Rate', value: `${defSummary.kpis.havocRate || '0.0'}%` },
    { label: 'Sacks', value: defSummary.kpis.sacks }, { label: 'TFL', value: defSummary.kpis.tfl },
    { label: 'Takeaways', value: defSummary.kpis.takeaways },
  ])}
    <div class="two-up">${counts('Positive Plays', [
      ['Stops', defSummary.positive.stops], ['Sacks', defSummary.positive.sacks],
      ['Tackles for loss', defSummary.positive.tfl], ['Takeaways', defSummary.positive.takeaways],
    ])}${counts('Negative Plays', [
      ['Successful plays allowed', defSummary.negative.successfulAllowed],
      ['Explosive plays allowed', defSummary.negative.explosiveAllowed],
      ['Touchdowns allowed', defSummary.negative.touchdownsAllowed],
    ])}</div>
    ${table('Defensive Calls', [
      { key: 'key', label: 'Call' }, { key: 'n', label: 'Plays' },
      { key: 'stop', label: 'Stop', value: row => `${row.stopRate}%` },
      { key: 'avgYds', label: 'Yards / Play' },
    ], defSummary.calls)}</section>` : '';
  const tendencies = report ? `<section class="chapter"><div class="chapter-title"><span>Self-Scout</span><h1>Tendencies</h1></div>${table('Offensive Tendencies', [
      { key: 'situation', label: 'Situation' }, { key: 'type', label: 'Type' },
      { key: 'tendency', label: 'Tendency' }, { key: 'average', label: 'Avg Yards' },
      { key: 'success', label: 'Success' }, { key: 'n', label: 'Plays' },
    ], tellRows)}
    ${table('Defensive Tendencies', [
      { key: 'situation', label: 'Situation' }, { key: 'type', label: 'Type' },
      { key: 'lean', label: 'Lean' }, { key: 'stop', label: 'Stop Rate' },
      { key: 'havoc', label: 'Havoc' },
    ], defensiveRows)}</section>` : '';
  const body = `${offense}${defense}${tendencies}`;
  return documentShell({ title, subtitle: `${report?.totalPlays || 0} classified offensive plays - ${defSummary?.totalPlays || 0} defensive plays`,
    meta: `Generated ${generatedAt.toLocaleString()}`, body });
}

export { esc as escapeReportHtml };

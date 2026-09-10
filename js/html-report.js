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
    { label: 'Explosive Plays allowed', value: report.summary.explosives, sub: `${report.summary.explosiveRate}%` },
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

/* `stats.allPlays` is the CLASSIFIED cohort, not the charted one. Printed as
 * "N charted plays" the export made the same false claim Overview did. */
const chartedLine = stats => `${stats.allPlays} of ${stats.chartedPlays ?? stats.allPlays} plays classified`;

export function buildGameHtmlReport({ title, stats, engine, generatedAt = new Date() }) {
  return documentShell({ title, subtitle: chartedLine(stats), meta: `Generated ${generatedAt.toLocaleString()}`,
    body: sharedBody({ stats, engine }) });
}

/**
 * The Season export need not look like the Season board, but it must report
 * the SAME scope and the same structure: the same six aggregate KPIs, the same
 * Game Log over the same rows -- including a scheduled game with nothing
 * charted, which the old `perGame` source dropped, so the report could print
 * "3 games" above two rows -- and both Trends comparisons, with the deltas
 * still carrying their units. `No data` is the one absence literal, here as on
 * the board.
 */
export function buildSeasonHtmlReport({ title, model, engine, generatedAt = new Date() }) {
  const { stats, summary, gameLog, progression, winLoss, trends } = model;
  const absent = value => (value === null || value === undefined || value === '' ? 'No data' : value);
  const signed = value => (value === null || value === undefined ? 'No data' : value > 0 ? `+${value}` : String(value));
  const window = trends?.windowSize || 0;
  const seasonLead = `${metrics([
    { label: 'Games', value: summary.games, sub: `${summary.charted} charted` },
    { label: 'Record', value: summary.played ? summary.record : 'No data', sub: 'won, lost' },
    { label: 'Points For / Against', value: summary.played ? `${summary.pointsFor}-${summary.pointsAgainst}` : 'No data', sub: 'for, against' },
    { label: 'Turnover Margin', value: signed(summary.turnoverMargin), sub: 'season total' },
    { label: 'Yards / Game', value: summary.yardsPerGame == null ? 'No data' : summary.yardsPerGame.toFixed(1), sub: `${summary.offensiveGames} games charted on offense` },
    { label: 'Success Rate', value: `${Number(summary.successRate).toFixed(1)}%`, sub: 'offensive snaps' },
  ])}${table('Game Log', [
    { key: 'week', label: 'Week', value: row => absent(row.week) },
    { key: 'dateLabel', label: 'Date', value: row => absent(row.dateLabel) },
    { key: 'opponent', label: 'Opponent', value: row => absent(row.opponent) },
    { key: 'result', label: 'Result', value: row => absent(row.result) },
    { key: 'score', label: 'Score', value: row => absent(row.score) },
    { key: 'plays', label: 'Plays', value: row => absent(row.plays) },
    { key: 'rushYards', label: 'Rush', value: row => absent(row.rushYards) },
    { key: 'passYards', label: 'Pass', value: row => absent(row.passYards) },
    { key: 'totalYards', label: 'Total', value: row => absent(row.totalYards) },
    { key: 'successRate', label: 'Success Rate', value: row => (row.successRate == null ? 'No data' : `${row.successRate}%`) },
    { key: 'turnoverMargin', label: 'TO +/-', value: row => signed(row.turnoverMargin) },
  ], gameLog)}${table('Early vs Recent', [
    { key: 'label', label: 'Metric' },
    { key: 'from', label: window ? `First ${window}` : 'Early' },
    { key: 'to', label: window ? `Last ${window}` : 'Recent' },
    { key: 'deltaText', label: 'Delta' }, { key: 'status', label: 'Status' },
  ], progression)}${table('Wins vs Losses', [
    { key: 'metric', label: 'Metric' },
    { key: 'wins', label: `Wins (${winLoss?.winCount ?? 0})` },
    { key: 'losses', label: `Losses (${winLoss?.lossCount ?? 0})` },
  ], winLoss?.rows)}`;
  return documentShell({ title, subtitle: `${summary.games} games, ${chartedLine(stats)}`, meta: `Generated ${generatedAt.toLocaleString()}`,
    body: seasonLead + sharedBody({ stats, engine, gameLabels: model.gameLabels, rosterLabels: model.rosterLabels, defensiveReport: model.defenseReport, specialSummary: model.specialSummary }) });
}

export function buildDefenseHtmlReport({ title, dashboard, scopeLabel, generatedAt = new Date() }) {
  if (!dashboard?.total) return '';
  const shown = value => value === null || value === undefined || value === '' ? '-' : value;
  const fixed = (rows, count) => [...(rows || []).slice(0, count),
    ...Array.from({ length: Math.max(0, count - (rows || []).length) }, () => ({}))];
  const decimal = value => value == null ? '-' : Number(value).toFixed(1);
  const signed = value => value == null ? '-' : `${value > 0 ? '+' : ''}${Number(value).toFixed(1)}`;
  const mix = row => row.n ? `${row.runs} / ${row.passes}` : '-';
  const games = Math.max(1, dashboard.byGame.length);
  const recentGames = Math.max(1, Math.min(3, dashboard.byGame.length));
  const seasonScope = scopeLabel === 'Full season';
  const trend = (total, recent) => seasonScope
    ? `${(total / games).toFixed(1)}/game | Last 3: ${(recent / recentGames).toFixed(1)}`
    : 'Current game';
  const chapter = (number, name, content) => `<section class="chapter"><div class="chapter-title"><span>Defense ${number}</span><h1>${esc(name)}</h1></div>${content}</section>`;
  const resultColumns = [
    { key: 'name', label: 'Name', value: row => shown(row.name) },
    { key: 'n', label: 'Snaps', value: row => shown(row.n) },
    { key: 'yards', label: 'Total Yards', value: row => shown(row.yards) },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) },
    { key: 'vsAverage', label: 'Vs Avg', value: row => signed(row.vsAverage) },
    { key: 'explosives', label: 'Explosive', value: row => shown(row.explosives) },
  ];
  const tendencyColumns = [
    { key: 'name', label: 'Name', value: row => shown(row.name) },
    { key: 'n', label: 'Snaps', value: row => shown(row.n) },
    { key: 'mix', label: 'Run / Pass', value: mix },
    { key: 'yards', label: 'Total Yards', value: row => shown(row.yards) },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) },
  ];
  const performance = metrics([
    { label: 'Total yards allowed', value: dashboard.summary.yards, sub: trend(dashboard.summary.yards, dashboard.recent.yards) },
    { label: 'Rush yards allowed', value: dashboard.summary.runYards, sub: trend(dashboard.summary.runYards, dashboard.recent.runYards) },
    { label: 'Pass yards allowed', value: dashboard.summary.passYards, sub: trend(dashboard.summary.passYards, dashboard.recent.passYards) },
    { label: 'Yards / play', value: decimal(dashboard.summary.ypp), sub: seasonScope ? `Last 3: ${decimal(dashboard.recent.ypp)}` : 'Current game' },
    { label: 'Turnovers', value: dashboard.summary.turnovers, sub: trend(dashboard.summary.turnovers, dashboard.recent.turnovers) },
    { label: 'Explosives allowed', value: dashboard.summary.explosives, sub: trend(dashboard.summary.explosives, dashboard.recent.explosives) },
    { label: '3rd down allowed', value: dashboard.thirdDownAllowed.rate == null ? '-' : `${dashboard.thirdDownAllowed.rate}%`, sub: `${dashboard.thirdDownAllowed.made} of ${dashboard.thirdDownAllowed.attempts}` },
    { label: '4th down allowed', value: dashboard.fourthDownAllowed.rate == null ? '-' : `${dashboard.fourthDownAllowed.rate}%`, sub: `${dashboard.fourthDownAllowed.made} of ${dashboard.fourthDownAllowed.attempts}` },
  ]) + table('Game-by-game', [
    { key: 'name', label: 'Game' }, { key: 'yards', label: 'Total Yards' },
    { key: 'runYards', label: 'Rush Yards', value: row => row.runs ? row.runYards : '-' },
    { key: 'passYards', label: 'Pass Yards', value: row => row.passes ? row.passYards : '-' },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) },
    { key: 'explosives', label: 'Explosive' }, { key: 'turnovers', label: 'Turnovers' }, { key: 'touchdowns', label: 'TD' },
  ], fixed(dashboard.byGame, seasonScope ? 6 : 1)) + (!seasonScope ? table('Opponent drive outcomes', [
    { key: 'name', label: 'Outcome' }, { key: 'n', label: 'Drives' },
    { key: 'pct', label: 'Share', value: row => row.pct == null ? '-' : `${row.pct}%` },
    { key: 'avgPlays', label: 'Avg Plays', value: row => decimal(row.avgPlays) },
    { key: 'avgYards', label: 'Avg Yards', value: row => decimal(row.avgYards) },
  ], fixed(dashboard.driveOutcomes, 7)) : '') + `<div class="two-up">${table('By down', [
    { key: 'name', label: 'Down' }, { key: 'yards', label: 'Total Yards' },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) }, { key: 'explosives', label: 'Explosive' },
  ], dashboard.downs)}${table('By quarter', [
    { key: 'name', label: 'Quarter' }, { key: 'yards', label: 'Total Yards' },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) },
    { key: 'vsAverage', label: seasonScope ? 'Vs Season Avg' : 'Vs Game Avg', value: row => signed(row.vsAverage) },
    { key: 'touchdowns', label: 'TD' },
  ], dashboard.quarters)}</div>`;
  const formationColumns = [
    { key: 'name', label: 'Offensive Look', value: row => shown(row.name) },
    { key: 'n', label: 'Snaps', value: row => shown(row.n) },
    ...dashboard.formationPlayTypes.map((name, index) => ({ key: `playType${index}`, label: name,
      value: row => { const item = row.playTypes?.[index]; return item?.n ? `${item.n} / ${item.pct}%` : '-'; } })),
  ];
  const opponent = `<div class="two-up">${table('Production by play type', [...resultColumns,
    { key: 'touchdowns', label: 'TD', value: row => shown(row.touchdowns) }], fixed(dashboard.playTypes, 7))}${table('Top 6 formations', formationColumns,
    fixed(dashboard.formationCalls, 6))}</div><div class="two-up">${table('Personnel faced', tendencyColumns,
    fixed(dashboard.personnel, 5))}${table('Backfield faced', tendencyColumns, fixed(dashboard.backfields, 5))}</div>${table('Attack direction', tendencyColumns,
    dashboard.directions)}`;
  const calls = columns => [
    { key: 'name', label: 'Call', value: row => shown(row.name) }, ...columns.slice(1),
  ];
  const scheme = `<div class="two-up">${table('Top Calls', calls(resultColumns), fixed(dashboard.topCalls, 4))}${table('Worst Calls', calls(resultColumns), fixed(dashboard.worstCalls, 4))}</div>`
    + table('Blitz vs No Blitz', resultColumns, [dashboard.pressure.blitz, dashboard.pressure.noBlitz])
    + table('Pressure by situation', [
      { key: 'name', label: 'Situation' }, { key: 'n', label: 'Snaps' },
      { key: 'blitzPct', label: 'Blitz %', value: row => row.blitzPct == null ? '-' : `${row.blitzPct}%` },
      { key: 'blitzYpp', label: 'Blitz Y/P', value: row => decimal(row.blitzYpp) },
      { key: 'baseYpp', label: 'Base Y/P', value: row => decimal(row.baseYpp) },
    ], fixed(dashboard.pressureSituations, 6));
  const situations = table('Down & distance', [
    { key: 'name', label: 'Situation' }, { key: 'n', label: 'Snaps' },
    { key: 'mix', label: 'Run / Pass', value: mix }, { key: 'yards', label: 'Total Yards' },
    { key: 'ypp', label: 'Yards / Play', value: row => decimal(row.ypp) },
    { key: 'topCall', label: 'Top Call', value: row => shown(row.topCall) },
    { key: 'callPct', label: 'Call %', value: row => row.callPct == null ? '-' : `${row.callPct}%` },
    { key: 'blitzPct', label: 'Blitz %', value: row => row.blitzPct == null ? '-' : `${row.blitzPct}%` },
  ], dashboard.downDistance) + `<div class="two-up">${table('Field zone', tendencyColumns.slice(0, 2).concat(tendencyColumns.slice(3)), fixed(dashboard.zones, 5))}${table('By hash', resultColumns.slice(0, 5), fixed(dashboard.hashes, 5))}</div>`
    + table('Motion', tendencyColumns, fixed(dashboard.motions, 5));
  const body = `${chapter(1, 'Defensive Performance', performance)}${chapter(2, 'Opponent Offense', opponent)}${chapter(3, 'Scheme', scheme)}${chapter(4, 'Situational Results', situations)}`;
  return documentShell({ title, subtitle: `${scopeLabel} - ${dashboard.total} defensive snaps`,
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
    <div class="two-up">${counts('Run Defense', [
      ['Attempts', defSummary.run.attempts], ['Rushing yards allowed', defSummary.run.yardsAllowed],
      ['Yards allowed per play', defSummary.run.yardsPerPlay], ['Stop rate', `${defSummary.run.stopRate}%`],
      ['Explosive runs allowed', defSummary.run.explosivesAllowed], ['Tackles for loss', defSummary.run.tfl],
    ])}${counts('Pass Defense', [
      ['Attempts', defSummary.pass.attempts], ['Passing yards allowed', defSummary.pass.yardsAllowed],
      ['Yards allowed per play', defSummary.pass.yardsPerPlay], ['Stop rate', `${defSummary.pass.stopRate}%`],
      ['Explosive passes allowed', defSummary.pass.explosivesAllowed], ['Sacks', defSummary.pass.sacks],
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

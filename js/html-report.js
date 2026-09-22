import * as view from './reports-view.js';
import { StatsEngine } from './stats-engine.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

// `_gameTitle()` predates the structured exporter and returns escaped display
// text. Decode that narrow legacy vocabulary once; `documentShell()` escapes
// it again at the actual HTML sink.
const legacyTitleText = value => String(value ?? '')
  .replace(/&mdash;/g, '\u2014')
  .replace(/&quot;/g, '"')
  .replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&amp;/g, '&');

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
  :root{color-scheme:light;--ink:#111820;--muted:#536170;--line:#c8ced5;--line-dark:#75808b;--soft:#eef1f3;--cyan:#00a6c7;--gold:#e0a800;--green:#16875b;--white:#fff}
  *{box-sizing:border-box}
  html,body{margin:0;background:var(--white);color:var(--ink)}
  body{font:13px/1.35 "Segoe UI",Arial,sans-serif}
  .page{width:min(100%,1320px);margin:0 auto;background:var(--white);padding:30px 36px 42px}
  .masthead{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:28px;align-items:end;border-top:6px solid var(--ink);border-bottom:1px solid var(--line-dark);padding:18px 0 16px}
  .brand{display:inline-block;border-left:5px solid var(--gold);padding:3px 0 3px 10px;color:var(--ink);font-size:11px;font-weight:800;text-transform:uppercase}
  .masthead h1,.chapter-title h1{margin:5px 0 0;font-family:"Arial Narrow","Segoe UI",Arial,sans-serif;font-weight:800;line-height:1.05}
  .masthead h1{font-size:29px}.masthead p{margin:6px 0 0;color:var(--muted);font-weight:600}.meta{color:var(--muted);text-align:right;font-size:11px;white-space:nowrap}
  .metric-band{display:grid;grid-template-columns:repeat(auto-fit,minmax(132px,1fr));border:1px solid var(--line-dark);border-top:3px solid var(--gold);margin:18px 0 22px;background:var(--white)}
  .metric{min-height:86px;padding:11px 12px;border-right:1px solid var(--line);overflow:hidden}.metric:last-child{border-right:0}
  .metric>span,.metric small{display:block;color:var(--muted)}.metric>span{min-height:27px;font-size:10px;line-height:1.2;text-transform:uppercase;font-weight:800}
  .metric>strong{display:block;font-family:"Arial Narrow","Segoe UI",Arial,sans-serif;font-size:24px;line-height:1;margin:5px 0;font-weight:800}.metric small{font-size:10px}
  .metric-stats{margin-top:3px}.metric-stats p{display:flex;justify-content:space-between;gap:8px;align-items:baseline;margin:0;padding:3px 0;font-size:11px}.metric-stats p+p{border-top:1px solid var(--soft)}.metric-stats span{display:block;color:var(--muted);font-size:10px;font-weight:600}.metric-stats strong{font-size:13px;margin:0}
  .chapter{border-top:3px solid var(--cyan);padding-top:0;margin-top:28px}.chapter-title{display:flex;align-items:baseline;gap:12px;border:1px solid var(--line);border-top:0;padding:10px 13px;background:var(--white)}
  .chapter-title span{color:var(--cyan);font-size:10px;text-transform:uppercase;font-weight:800;white-space:nowrap}.chapter-title h1{font-size:19px}.chapter>.chapter-title+.metric-band{margin-top:12px}
  .report-section{margin:16px 0;border:1px solid var(--line);border-top:3px solid var(--cyan);background:var(--white);break-inside:auto}
  .report-section h2{font-size:12px;line-height:1.2;text-transform:uppercase;padding:9px 11px;margin:0;border-bottom:1px solid var(--line);background:var(--white);font-weight:800}
  .report-section>p{margin:0;padding:8px 11px;color:var(--muted);border-bottom:1px solid var(--line)}
  .two-up{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}.two-up>.report-section{margin:16px 0 0}
  .table-wrap{width:100%;overflow:hidden}table{border-collapse:collapse;width:100%;font-size:11px;table-layout:auto}thead{display:table-header-group}tr{break-inside:avoid}
  th{height:32px;color:#34404c;font-size:9px;line-height:1.15;text-align:left;text-transform:uppercase;background:var(--soft);font-weight:800}th,td{border-bottom:1px solid #dce0e4;padding:7px 9px;vertical-align:middle}tbody tr:last-child td{border-bottom:0}tbody tr:nth-child(even){background:#fafbfc}td:first-child{font-weight:600}td:not(:first-child),th:not(:first-child){text-align:right;font-variant-numeric:tabular-nums}
  .phase-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:16px 0}.phase{border:1px solid var(--line);border-top:3px solid var(--gold);padding:0;background:var(--white);break-inside:avoid}.phase h3{margin:0;padding:9px 11px;border-bottom:1px solid var(--line);font-size:12px;text-transform:uppercase}.phase p{display:flex;justify-content:space-between;gap:12px;margin:0;padding:6px 11px;border-bottom:1px solid #dce0e4;font-size:11px}.phase p:last-child{border-bottom:0}.phase strong{font-variant-numeric:tabular-nums}.note,.empty{color:var(--muted)}.note{border-left:3px solid var(--gold);padding:7px 10px;background:#fff9e8}
  @media(max-width:760px){.page{padding:18px}.masthead{grid-template-columns:1fr}.meta{text-align:left}.two-up{grid-template-columns:1fr}.metric-band{grid-template-columns:repeat(2,minmax(0,1fr))}.metric:nth-child(2n){border-right:0}.metric{border-bottom:1px solid var(--line)}.chapter-title{display:block}.chapter-title h1{margin-top:4px}}
  @page{size:landscape;margin:0.42in}
  @media print{html,body{width:100%;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:100%;max-width:none;margin:0;padding:0}.masthead{margin-bottom:16px}.chapter{break-before:page;margin-top:0}.chapter:first-of-type{break-before:auto}.chapter-title,.metric-band,.phase,.report-section h2{break-after:avoid}.metric-band,.phase-grid,.two-up>.report-section{break-inside:avoid}.report-section{break-inside:auto}.table-wrap{overflow:visible}table{font-size:9.5px}th,td{padding:5px 7px}.report-section h2{padding:7px 9px}.phase-grid{grid-template-columns:repeat(3,1fr)}}
`;

const documentShell = ({ title, subtitle, meta, body }) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${stylesheet}</style></head><body><main class="page"><header class="masthead"><div><div class="brand">Gridiron IQ Report</div><h1>${esc(title)}</h1>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div><div class="meta">${esc(meta)}</div></header>${body}</main></body></html>`;

/* `stats.allPlays` is the CLASSIFIED cohort, not the charted one. Printed as
 * "N charted plays" the export made the same false claim Overview did. */
const chartedLine = stats => `${stats.allPlays} of ${stats.chartedPlays ?? stats.allPlays} plays classified`;

/* The stat rows each role prints, and which of them are TOTALS rather than
   counts — the same split the detail view renders, so the printed report and the
   screen state the same figures. */
const PLAYER_EXPORT_STATS = {
  rushing: [['att', 'Attempts'], ['yds', 'Yards', true], ['td', 'Touchdowns'], ['fum', 'Fumbles']],
  passing: [['att', 'Attempts'], ['cmp', 'Completions'], ['yds', 'Yards', true], ['td', 'Touchdowns'], ['int', 'Interceptions'], ['sck', 'Sacks']],
  receiving: [['rec', 'Receptions'], ['yds', 'Yards', true], ['td', 'Touchdowns']],
  tackles: [['tkl', 'Tackles'], ['solo', 'Solo'], ['ast', 'Assists'], ['sack', 'Sacks'], ['tfl', 'Tackles for loss'], ['int', 'Interceptions'], ['fr', 'Fumbles recovered']],
  returns: [['ret', 'Returns'], ['yds', 'Return yards', true], ['td', 'Touchdowns']],
  kicking: [['fgAtt', 'Field goal attempts'], ['fgMade', 'Field goals made'], ['punts', 'Punts'], ['puntYds', 'Punt yards', true]],
};
const PLAYER_EXPORT_NO_DATA = 'No data';

/**
 * ONE PLAYER, THE COHORT ON SCREEN. Printed only when a player is open, so the
 * report can never be the leaderboard while the UI says otherwise. Every role
 * the player was credited in prints separately — no combined rating — and every
 * row carries its own composite `gameId::playId` references, which is the stable
 * identifier this export contract already uses everywhere else.
 */
export function buildPlayerHtmlReport({ title, team, detail, situational = [], scopeLabel, generatedAt = new Date() }) {
  const statRows = role => (PLAYER_EXPORT_STATS[role.key] || []).map(([bucket, label, isTotal]) => {
    const fact = role.stats[bucket];
    const value = !fact ? 0 : (isTotal ? (fact.n ? fact.total : PLAYER_EXPORT_NO_DATA) : fact.n);
    return `<tr><td>${esc(label)}</td><td>${esc(value)}</td><td>${esc((fact?.refs || []).join(' '))}</td></tr>`;
  }).join('');
  const roles = detail.roles.map(role => `<section class="report-section">
    <h2>${esc(role.label)}</h2>
    <p>${role.grade == null ? 'No grade charted' : `Average grade ${role.grade > 0 ? '+' : ''}${role.grade} over ${role.gradeCount} graded plays`}</p>
    <div class="table-wrap"><table><thead><tr><th>Statistic</th><th>Value</th><th>Film</th></tr></thead>
    <tbody>${statRows(role)}</tbody></table></div></section>`).join('');
  /* THE SAME SUMMARY THE SCREEN SHOWS. Built here from the first two entries of
     a fixed stat list, the export printed `0 field goal attempts, 0 field goals
     made` for a punt-only kicker and `0 tackles, 0 solo` for a takeaway-only
     defender — zeros that hid the production establishing the player's role.
     `StatsEngine.playerRoleSummary` is the one owner both read. */
  const gameRows = detail.games.map(game => `<tr><td>${esc(game.opponent)}</td>${detail.roles.map(role => {
    const inGame = game.roles[role.key];
    return `<td>${esc(inGame?.summary || PLAYER_EXPORT_NO_DATA)}</td>`;
  }).join('')}</tr>`).join('');
  /* The ACTIVE breakdown, with the role's own measures as its columns — the same
     table the coach has on screen, not a different dimension chosen here. */
  const situations = situational.map(block => `<section class="report-section">
    <h2>${esc(block.role)} by ${esc(block.dimension)}</h2>
    ${block.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Value</th><th>Plays</th>${
      (block.measures || []).map(measure => `<th>${esc(measure.label)}</th>`).join('')
    }<th>Grade</th><th>Film</th></tr></thead><tbody>${
      block.rows.map(row => `<tr><td>${esc(row.value)}</td><td>${esc(row.n)}</td>${
        (row.measures || []).map(measure => `<td>${esc(measure.measured ? measure.value : PLAYER_EXPORT_NO_DATA)}</td>`).join('')
      }<td>${esc(row.grade == null ? PLAYER_EXPORT_NO_DATA : `${row.grade > 0 ? '+' : ''}${row.grade}`)}</td><td>${
        esc((row.refs || []).join(' '))}</td></tr>`).join('')
    }</tbody></table></div>` : `<p class="empty">${PLAYER_EXPORT_NO_DATA}</p>`}
  </section>`).join('');
  return documentShell({
    title, subtitle: `${team} · ${scopeLabel}`, meta: `Generated ${generatedAt.toLocaleString()}`,
    body: `<section class="chapter"><div class="chapter-title"><span>Player</span><h1>${esc(detail.label)}</h1></div>
      <p>${esc(scopeLabel)} · ${detail.roles.length} role${detail.roles.length === 1 ? '' : 's'} credited</p>
      ${roles}
      <section class="report-section"><h2>Game by game</h2>
        ${detail.games.length ? `<div class="table-wrap"><table><thead><tr><th>Opponent</th>${
          detail.roles.map(role => `<th>${esc(role.label)}</th>`).join('')}</tr></thead><tbody>${gameRows}</tbody></table></div>`
          : `<p class="empty">${PLAYER_EXPORT_NO_DATA}</p>`}
      </section>
      ${situations}
    </section>`,
  });
}

export function buildGameHtmlReport({ title, stats, engine, generatedAt = new Date() }) {
  return documentShell({ title: legacyTitleText(title), subtitle: chartedLine(stats), meta: `Generated ${generatedAt.toLocaleString()}`,
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
    { label: 'Total yards allowed', value: shown(dashboard.summary.yards), sub: trend(dashboard.summary.yards, dashboard.recent.yards) },
    { label: 'Rush yards allowed', value: shown(dashboard.summary.runYards), sub: trend(dashboard.summary.runYards, dashboard.recent.runYards) },
    { label: 'Pass yards allowed', value: shown(dashboard.summary.passYards), sub: trend(dashboard.summary.passYards, dashboard.recent.passYards) },
    { label: 'Yards / play', value: decimal(dashboard.summary.ypp), sub: seasonScope ? `Last 3: ${decimal(dashboard.recent.ypp)}` : 'Current game' },
    { label: 'Turnovers', value: dashboard.summary.turnovers, sub: trend(dashboard.summary.turnovers, dashboard.recent.turnovers) },
    { label: 'Explosives allowed', value: shown(dashboard.summary.explosives), sub: trend(dashboard.summary.explosives, dashboard.recent.explosives) },
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
  /* The export states the same cohort reconciliation the board does: Snaps is
     the charted sample, every yardage and rate is the classified subset. */
  return documentShell({ title,
    subtitle: `${scopeLabel} - ${dashboard.total} charted defensive snaps, ${dashboard.measured} with play type`,
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
  /* THE EXPORT PRINTS THE BOARD'S OWN SCHEMA. Self-Scout's twelve fixed
   * down-and-distance rows carry a HELD row for every bucket the cohort never
   * faced — `held: true` and a dash in every measured cell — and their `key`
   * is the engine's raw bucket (`1|Short`), which `_ddPretty` owns the wording
   * of. Exported through the plain column list, the report printed `1|Short`
   * beside a fabricated `0`, `0%` and `0% / 0%`: an unfaced situation reported
   * as a measured failure, in a vocabulary no coach uses. */
  const SS_HELD = '-';
  const ssValue = (row, render) => (row.held ? SS_HELD : render(row));
  const ssColumns = (label = row => row.key) => [
    { key: 'key', label: 'Group', value: label },
    { key: 'n', label: 'Plays', value: row => ssValue(row, r => r.n) },
    { key: 'avg', label: 'Yards / Play', value: row => ssValue(row, r => r.avg) },
    { key: 'success', label: 'Success', value: row => ssValue(row, r => `${r.succRate}%`) },
    { key: 'explosives', label: 'Explosive', value: row => ssValue(row, r => r.explosives) },
    { key: 'tds', label: 'TD', value: row => ssValue(row, r => r.tds) },
    // A giveaway IS a turnover; Reports and their exports say Turnovers.
    { key: 'turnovers', label: 'Turnovers', value: row => ssValue(row, r => r.turnovers) },
    { key: 'run', label: 'Run / Pass', value: row => ssValue(row, r => `${r.runPct}% / ${r.passPct}%`) },
  ];
  const outcomeColumns = ssColumns();
  const ddColumns = ssColumns(row => StatsEngine.ddPretty(row.key));
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
    ${table('Down and Distance', ddColumns, report.downDistRows)}
    ${table('Formation', outcomeColumns, report.formationRows)}
    ${table('Personnel', outcomeColumns, report.personnelRows)}</section>` : '';
  const defense = defSummary?.totalPlays ? `<section class="chapter"><div class="chapter-title"><span>Self-Scout</span><h1>Defense</h1></div>${metrics([
    /* Stop Rate holds no headline or primary-comparison position, on the board
     * or in its export: it is the inverse of offensive play success and its
     * down-specific thresholds mislead at a glance. Yards Allowed / Play
     * leads and Stop Rate sits last, the same order the board uses. */
    { label: 'Yards Allowed / Play', value: defSummary.kpis.yardsAllowedPerPlay ?? 'No data' },
    { label: 'Havoc Rate', value: `${defSummary.kpis.havocRate || '0.0'}%` },
    { label: 'Sacks', value: defSummary.kpis.sacks }, { label: 'TFL', value: defSummary.kpis.tfl },
    { label: 'Takeaways', value: defSummary.kpis.takeaways },
    { label: 'Stop Rate', value: defSummary.kpis.stopRate == null ? 'No data' : `${defSummary.kpis.stopRate}%` },
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

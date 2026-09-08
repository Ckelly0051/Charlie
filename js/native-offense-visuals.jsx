import { Module } from './native-report-kit.jsx';
import { StatsEngine } from './stats-engine.js';

const absoluteYardLine = (tags = {}) => {
  const yardLine = Number.parseInt(tags.yardLine, 10);
  if (!yardLine) return null;
  return String(tags.fieldSide || 'own').toLowerCase() === 'opp' ? 100 - yardLine : yardLine;
};

const compactCell = (label, cohort) => {
  const plays = cohort || [];
  const yards = plays.reduce((sum, play) => sum + (Number.parseInt(play.tags?.yardage, 10) || 0), 0);
  const successes = plays.filter(play => StatsEngine.isSuccessfulPlay(play)).length;
  return {
    label,
    count: plays.length,
    success: plays.length ? `${(successes / plays.length * 100).toFixed(1)}%` : '–',
    ypp: plays.length ? (yards / plays.length).toFixed(1) : '–',
    refs: plays.map(play => play.__gid != null ? `${play.__gid}::${play.id}` : String(play.id)),
  };
};

function CompactHeatCell({ cell, screen }) {
  const watch = cell.count && screen
    ? () => cell.refs.some(ref => ref.includes('::'))
      ? screen.watchRefs(cell.refs, `${cell.label} — ${cell.count} snaps`)
      : screen.watchPredicate(play => cell.refs.includes(String(play.id)), `${cell.label} — ${cell.count} snaps`)
    : null;
  const body = <><span>{cell.label}</span><strong>{cell.success}</strong><small>{cell.count ? `${cell.count} snaps · ${cell.ypp} y/p` : '–'}</small></>;
  return watch
    ? <button type="button" class="gi-off-field-cell" onClick={watch}>{body}</button>
    : <div class="gi-off-field-cell is-absent">{body}</div>;
}

/** The approved Offense comp uses a compact two-strip field summary. The
 * tabbed field diagram belongs to exploratory analysis, not this fixed report
 * board; putting it here added hundreds of pixels and changed the composition. */
export function NativeHeatMaps({ plays = [], screen }) {
  const located = plays.filter(play => absoluteYardLine(play.tags) != null);
  const zoneDefs = [
    ['Own 1–20', 0, 20], ['Own 21–40', 20, 40], ['Midfield', 40, 60],
    ['Opp 39–21', 60, 80], ['Red zone', 80, 101],
  ];
  const zones = zoneDefs.map(([label, low, high]) => compactCell(label,
    located.filter(play => {
      const position = absoluteYardLine(play.tags);
      return position >= low && position < high;
    })));
  const byHashAndType = (hash, run) => plays.filter(play =>
    String(play.tags?.hash || '').toLowerCase() === hash.toLowerCase()
      && (run == null || StatsEngine.isRun(play) === run));
  const hash = [
    compactCell('Left hash · run', byHashAndType('Left', true)),
    compactCell('Left hash · pass', byHashAndType('Left', false)),
    compactCell('Middle · run', byHashAndType('Middle', true)),
    compactCell('Middle · pass', byHashAndType('Middle', false)),
    compactCell('Right hash', byHashAndType('Right', null)),
  ];
  return <Module title="Field heat map" meta="success rate by field zone">
    <div class="gi-off-field-grid">{zones.map(cell => <CompactHeatCell key={cell.label} cell={cell} screen={screen} />)}</div>
    <div class="gi-off-field-grid">{hash.map(cell => <CompactHeatCell key={cell.label} cell={cell} screen={screen} />)}</div>
  </Module>;
}

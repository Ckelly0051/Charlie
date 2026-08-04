import { render } from 'preact';
import '../css/native-reports.css';

const REPORT_TABS = [
  ['overview', 'Overview'],
  ['offense', 'Offense'],
  ['defense', 'Defense'],
  ['special', 'Special Teams'],
  ['players', 'Players'],
  ['selfscout', 'Self-Scout'],
  ['season', 'Season'],
  ['matchup', 'Matchup'],
];

function Icon({ name }) {
  return <svg class="gi-reports-icon" aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;
}

function ExportMenu({ screen }) {
  const run = (event, kind) => {
    event.currentTarget.closest('details')?.removeAttribute('open');
    screen.export(kind);
  };
  return <details class="gi-reports-export">
    <summary class="gi-reports-command" id="btnExportStats" data-rp-action="export"><Icon name="download" />Export</summary>
    <div class="gi-reports-menu" role="menu" aria-label="Report exports">
      <button type="button" role="menuitem" onClick={event => run(event, 'pdf')}>Game report (PDF)</button>
      <button type="button" role="menuitem" onClick={event => run(event, 'html')}>Current game (HTML)</button>
      <button type="button" role="menuitem" onClick={event => run(event, 'season-html')}>Full season (HTML)</button>
      <button type="button" role="menuitem" onClick={event => run(event, 'csv')}>Breakdown data (CSV)</button>
      <button type="button" role="menuitem" onClick={event => run(event, 'call-sheet')}>Call sheet</button>
    </div>
  </details>;
}

function NativeReportsRoute({ screen }) {
  return <section class="gi-reports" id="statsDashboard" aria-labelledby="giReportsTitle" data-native-reports>
    <header class="gi-reports-head" data-reports-main-chrome>
      <div class="gi-reports-title-block">
        {/* F5 — the eyebrow was hardcoded "Self scout" and stayed that way while
            the route showed the opponent scout. It follows the perspective. */}
        <span class="gi-reports-eyebrow" data-reports-eyebrow>Reports</span>
        <h1 id="giReportsTitle" data-reports-title>Reports</h1>
        <p data-reports-context>Every number links to its film.</p>
      </div>
      <div class="gi-reports-actions">
        <button type="button" class="gi-reports-command" id="btnScoutOpp" data-rp-action="scout" onClick={() => screen.scoutOpponent()}><Icon name="scan" />Scout opponent</button>
        <ExportMenu screen={screen} />
      </div>
    </header>

    <div class="gi-reports-model" data-reports-main-chrome>
      <span>Perspective</span>
      <div class="gi-reports-segment" role="group" aria-label="Report perspective">
        <button type="button" class="is-active" data-report-perspective="self" aria-pressed="true" onClick={() => screen.show()}>Our game</button>
        <button type="button" data-report-perspective="opponent" aria-pressed="false" onClick={() => screen.scoutOpponent()}>Opponent scout</button>
      </div>
      {/* F3: every charted opponent has a scout report, so every charted
          opponent is selectable here — not just the active game's. */}
      <label class="gi-reports-opponent" data-reports-opponent hidden>
        <span>Team</span>
        <select data-reports-opponent-select onChange={e => screen.scoutOpponent(e.currentTarget.value)}></select>
      </label>
      <span class="gi-reports-film-note">Select any highlighted row to watch the exact snaps.</span>
    </div>

    <nav class="gi-reports-tabs stats-tabs" aria-label="Report sections" data-reports-main-chrome>
      {REPORT_TABS.map(([id, label]) => <button
        key={id}
        type="button"
        class={`gi-reports-tab stats-tab${screen.activeTab === id ? ' active' : ''}`}
        data-report-tab={id}
        data-tab={id}
        aria-current={screen.activeTab === id ? 'page' : undefined}
        onClick={() => screen.selectTab(id)}
      >{label}</button>)}
    </nav>

    <div class="gi-reports-special-head" hidden data-reports-special-chrome>
      <button type="button" class="gi-reports-back" onClick={() => screen.show()}><Icon name="prev-clip" />Back to reports</button>
      <span>Focused report</span>
    </div>

    <main class="gi-reports-content" data-native-report-content aria-live="polite" />
  </section>;
}

export function mountNativeReports({ host, screen }) {
  if (!host) throw new Error('Native Reports requires a route host.');
  if (!screen) throw new Error('Native Reports requires an injected screen controller.');
  render(<NativeReportsRoute screen={screen} />, host);
  return {
    content: host.querySelector('[data-native-report-content]'),
    unmount() { render(null, host); },
  };
}
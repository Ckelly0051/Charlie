import { render } from 'preact';
import '../css/native-reports.css';

/* The approved 2026-09-22 global-strip order. Season is last: it is the
   full-season parent of the seven game-scoped reports before it. */
const REPORT_TABS = [
  ['overview', 'Overview'],
  ['offense', 'Offense'],
  ['defense', 'Defense'],
  ['special', 'Special Teams'],
  ['players', 'Players'],
  ['selfscout', 'Self-Scout'],
  ['matchup', 'Matchup'],
  ['season', 'Season'],
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
    <summary class="gi-reports-command" id="btnExportStats" data-rp-action="export" aria-label="Export reports" title="Export reports"><Icon name="download" />Export</summary>
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
  /* THE GLOBAL STRIP (coach-approved comp, 2026-09-22). One fixed-height
     report head, then ONE strip — perspective, the eight tabs, Export — whose
     y coordinate, height and tab x positions are identical on every tab.
     Nothing conditional sits above it: the title truncates rather than wraps,
     the opponent picker lives in the head's fixed row, and the secondary bar
     and the Overview-only score render BELOW the strip. A multi-section
     report's pages, scope and export live in that one secondary bar. */
  return <section class="gi-reports" id="statsDashboard" aria-labelledby="giReportsTitle" data-native-reports>
    <div class="gi-reports-reporthead" data-reports-main-chrome>
      <header class="gi-reports-head">
        <div class="gi-reports-title-block">
        {/* F5 — the eyebrow was hardcoded "Self scout" and stayed that way while
            the route showed the opponent scout. It follows the perspective. */}
        <span class="gi-reports-eyebrow" data-reports-eyebrow>Reports</span>
        <h1 id="giReportsTitle" data-reports-title>Reports</h1>
        <p data-reports-context>Every number links to its film.</p>
        </div>
      </header>
      <div class="gi-reports-head-actions">
        <label class="gi-reports-opponent" data-reports-opponent hidden>
          <span>Team</span>
          <select data-reports-opponent-select onChange={e => screen.scoutOpponent(e.currentTarget.value)}></select>
        </label>
        <button type="button" class="gi-reports-command" id="btnScoutOpp" data-rp-action="scout" aria-label="Scout opponent" title="Scout opponent" onClick={() => screen.scoutOpponent()}><Icon name="scan" />Scout opponent</button>
      </div>
    </div>

    <div class="gi-reports-strip" data-reports-main-chrome data-reports-strip>
      <div class="gi-reports-model">
        <div class="gi-reports-segment" role="group" aria-label="Report perspective">
          <button type="button" class="is-active" data-report-perspective="self" aria-pressed="true" onClick={() => screen.show()}>Our game</button>
          <button type="button" data-report-perspective="opponent" aria-pressed="false" onClick={() => screen.scoutOpponent()}>Opponent scout</button>
        </div>
      </div>

      <nav class="gi-reports-tabs stats-tabs" aria-label="Report sections">
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

      <div class="gi-reports-actions">
        <ExportMenu screen={screen} />
      </div>
    </div>

    {/* THE SECONDARY BAR HOST (coach-approved comp,
        design-comps/reports-secondary-nav-2026-09-23). Each multi-section
        board portals its one SectionBar here, so every report's pages, scope
        and export sit directly under the fixed strip at one position. Empty,
        it takes no height: Overview has no bar. */}
    <div class="gi-reports-secbar-host" data-reports-secbar></div>
    <div class="gi-reports-scorebug" data-reports-scorebug hidden></div>

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

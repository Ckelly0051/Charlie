/** P0-d: migration capability inventory.
 * Each entry names a coach outcome and the exact canonical journey assertion
 * that proves it. Route migrations may change markup, never silently drop one.
 */
export const P0_CAPABILITIES = [
  // Home / shell ownership
  { id:'home.setup-team', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'First run offers team setup before any season' },
  { id:'home.new-game', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'Home New Game action opens a chartable game in Break Down' },
  { id:'home.open-game', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'opening a game lands in Break Down' },
  { id:'home.unit-progress', surface:'home', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'Home shows charting progress per unit matching the canonical play data' },
  { id:'home.film-source', surface:'home', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'A managed copy and a linked folder never read identically -- the exact ambiguity that made a prior smoke unprovable' },
  { id:'shell.containment', surface:'shell', evidence:'behavior', harness:'e2e-responsive-containment.mjs', assertion:'Every shell route contains itself at every reviewed viewport including the installed window size' },
  { id:'shell.containment-live', surface:'shell', evidence:'behavior', harness:'e2e-responsive-containment.mjs', assertion:'The escape detector fires on a genuinely over-wide element (the check can fail)' },
  { id:'shell.palette', surface:'shell', evidence:'data', harness:'e2e-design-system.mjs', assertion:'every shell colour role derives from a design-system token — one palette, not two' },
  { id:'shell.contrast', surface:'shell', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'Shell text stays at or above WCAG AA contrast on every surface it sits on' },
  { id:'shell.game-switch', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Every working route retains its game switcher; Home game-card navigation is exercised above' },
  { id:'shell.game-switch-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Switching a game from Reports changes the canonical active game and stays on Reports' },
  { id:'shell.game-naming', surface:'shell', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'The context bar, the mobile context and the switcher all name a game with the one canonical rule' },
  { id:'shell.breakdown-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Break Down opens its dedicated production route' },
  { id:'shell.settings', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell Settings opens the single native Settings owner with no drawer or scrim' },
  { id:'shell.more-menu', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell More is the single action-menu owner and the season-file picker survives outside the legacy tree' },
  { id:'shell.study-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Study opens the query workspace inside the persistent shell' },
  { id:'shell.plan-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Plan opens the live season plan workspace' },
  { id:'shell.undo', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'The native Undo button reflects history-manager state via its change subscription and enables on a real edit' },
  { id:'shell.redo', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'own native chrome -- no adopted/relocated legacy element exists anywhere' },
  { id:'shell.shortcuts', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Closing native Shortcuts restores focus to the mobile More launcher' },
  { id:'shell.import-plays', surface:'shell', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'Native Import confirms one mapped football play and reports success' },

  // Break Down: film, charting, and football detail
  { id:'breakdown.video-controls', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Real playback controls are contained inside the video surface' },
  { id:'breakdown.play-selection', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Selecting a play card drives the real PlayTagger and active state' },
  { id:'breakdown.live-card-update', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-video.mjs', assertion:'Ordinary tag edits update one stable play card instead of rebuilding the strip' },
  { id:'breakdown.autoplay-choice', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Video action bar exposes Autoplay next with the backward-compatible ON default' },
  { id:'breakdown.all-fields', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'Every production offense, defense, player, custom, note, and situation control remains present in the native form' },
  { id:'breakdown.tag-save', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'All 20 plays retain multi-select Play Type and Result' },
  { id:'breakdown.special-teams', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'Native Special Teams stores its structured returner and exposes dedicated kick, return, field-goal, and try units without the legacy Scored-by control' },
  { id:'breakdown.penalties', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'Native penalty editor stores multiple independent fouls and actual enforcement' },
  { id:'breakdown.save-next', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'Native Save & Next preserves multi-tackler attribution, grade, notes, and gives affirmative feedback' },
  { id:'breakdown.drawing-tools', surface:'breakdown', evidence:'behavior', harness:'e2e-tagging.mjs', assertion:'digit with NO play selected still arms the tool' },
  { id:'breakdown.drawing-playback', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Playback canvas paints only when entering or leaving an annotated frame' },
  { id:'breakdown.quick-chart', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Quick Chart selector opens one native owner with no legacy panel' },
  { id:'breakdown.quick-chart-special-teams', surface:'breakdown', evidence:'behavior', harness:'e2e-native-quick-chart.mjs', assertion:'Quick Chart rejects ambiguous K with explicit Special Teams guidance and no data write' },
  { id:'breakdown.game-context', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-lifecycle.mjs', assertion:'Canonical relaunch rehydrates the explicitly saved per-game context' },
  { id:'breakdown.context-isolation', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'Opponent film keeps its perspective when the unit changes, and no other metadata moves' },
  { id:'breakdown.derived-perspective', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'On our own game the perspective follows the unit with no second control' },
  { id:'breakdown.unit-one-click', surface:'breakdown', evidence:'behavior', harness:'e2e-native-tagging.mjs', assertion:'Unit is a one-click segmented control, not a dropdown' },
  { id:'breakdown.play-diagram', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'A relaunched saved play diagram remains byte-stable and produces its Call Sheet thumbnail' },
  { id:'breakdown.scoreboard-ocr', surface:'breakdown', evidence:'behavior', harness:'e2e-native-tagging.mjs', assertion:'Scoreboard OCR preserves region, read-now, and auto-read commands' },
  { id:'breakdown.templates', surface:'breakdown', evidence:'data', harness:'e2e-native-tagging.mjs', assertion:'A saved template applies and remains explicitly selected with no detached compatibility control' },
  { id:'breakdown.auto-detect', surface:'breakdown', evidence:'behavior', harness:'e2e-native-tagging.mjs', assertion:'Review and Apply All are genuinely on-screen for a multi-play scan -- the exact capability the hidden host made unreachable' },
  { id:'breakdown.multi-angle-load', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Loading a second angle syncs playback and opens the desktop side-by-side view' },
  { id:'breakdown.multi-angle-sync', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Second-angle sync corrects real drift, tolerates sub-threshold jitter, and follows transport state' },
  { id:'breakdown.multi-angle-view', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'PiP click and V-key swap the active camera through the production command API' },
  { id:'breakdown.multi-angle-remove', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Removing the second angle revokes its media and restores the single-camera workspace' },

  // Film Room spreadsheet
  { id:'film-room.filters', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'down filter narrows to 3rd downs' },
  { id:'film-room.watch-fallback', surface:'film-room', evidence:'behavior', harness:'e2e-film-room.mjs', assertion:'no-video Watch falls back to selecting first play' },
  { id:'film-room.inline-edit', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'multi-enum edit commits to tags + cell' },
  { id:'film-room.keyboard', surface:'film-room', evidence:'behavior', harness:'e2e-film-room.mjs', assertion:'ArrowDown moves focus to next play, same column' },
  { id:'film-room.columns', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'setColumn adds a column (persisted)' },
  { id:'film-room.exact-film', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'Watch receives EXACTLY the COMPOSITE refs of the selected rendered row group, no more, no fewer' },

  // Study
  { id:'study.active-cohort', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Study defaults to the active-game cohort' },
  { id:'study.filter', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'A filter narrows the cohort through the registry' },
  { id:'study.save-plan', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Save to Plan asks for an intentional destination and comparison cohort before mutating data' },
  { id:'study.advanced-reports', surface:'study', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Reaching Advanced Reports no longer exposes the classic outlet' },

  // Reports: preserve football analysis breadth and canonical actions
  { id:'reports.native-owner', surface:'reports', evidence:'behavior', harness:'e2e-native-reports.mjs', assertion:'Reports has one native owner and StatsEngine has no second presentation controller' },
  { id:'reports.eight-views', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'All eight report views render a real pane' },
  { id:'reports.lens-board', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Overview reads canonical totals, success, and yards per play' },
  { id:'reports.lens-routing', surface:'reports', evidence:'behavior', harness:'e2e-native-reports.mjs', assertion:'A highlighted Overview result opens a non-empty composite-ref film cohort' },
  { id:'reports.export', surface:'reports', evidence:'behavior', harness:'e2e-native-reports.mjs', assertion:'Native Reports routes game HTML, full-season HTML, PDF, CSV, and Call Sheet to their canonical owners' },
  { id:'reports.season-html', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Full-season HTML export is downloadable, honest about scope, and read-only against canonical data' },
  { id:'reports.opponent-cohorts', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Opponent Watch controls launch the exact displayed unit cohorts' },
  { id:'reports.opponent-special-teams', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Opponent Special Teams includes scout film and excludes ambiguous head-to-head ST' },
  { id:'reports.season', surface:'reports', evidence:'data', harness:'e2e-native-season.mjs', assertion:'Native Season report aggregates both games and includes an uncommitted live edit without writing it' },
  // These four moved off e2e-season-tab.mjs, which was narrowed to a focused
  // native-Season-report contract (9 assertions) with no remaining coverage
  // of rushing leaderboards, Special Teams, self-scout tells, the Scout
  // Opponent action, or play-call composition. Re-homed to the harnesses
  // that actually cover each capability today.
  { id:'reports.players', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Activating a Players tab leaderboard row resolves the exact composite film refs for only that rusher, never the other player sharing the game' },
  { id:'reports.special-teams', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Special Teams, Self-Scout, and Season retain their football-specific surfaces' },
  { id:'reports.self-scout', surface:'reports', evidence:'data', harness:'e2e-self-scout.mjs', assertion:'Formation × Down tell uses the down|bucket key' },
  { id:'reports.opponent-scout', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Every opponent with charted film is listed as scoutable, so a scout report exists for each' },
  { id:'reports.csv-roundtrip', surface:'reports', evidence:'data', harness:'e2e-csv-roundtrip.mjs', assertion:'export→import preserves multiple structured penalties' },
  { id:'reports.call-sheet', surface:'reports', evidence:'data', harness:'e2e-play-call-charting.mjs', assertion:'Call Sheet leads with the exact call while retaining legacy fallback only for plays without one' },

  // Plan
  { id:'plan.reorder', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan items reorder through accessible buttons and desktop drag without losing items' },
  { id:'plan.export', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan export downloads the same ordered, audience-aware presentation data' },
  { id:'plan.presentation', surface:'plan', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Presentation advances by keyboard and keeps resolved film links' },
  { id:'plan.exact-film', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan item and whole-plan Watch use the same composite film refs' },
  { id:'plan.sections', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan groups consecutive findings into sections that report their de-duplicated linked-play count' },
  { id:'plan.section-film', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Section Watch plays the exact de-duplicated composite refs of that section, in plan order' },
  { id:'plan.section-order', surface:'plan', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Reordering an item regroups the plan, proving sections follow the coach order rather than re-sorting it' },
  { id:'plan.strip', surface:'plan', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Selecting a strip entry moves the stage and scrolls the strip without starting film' },

  // Team Hub / season library
  { id:'team-hub.native-owner', surface:'team-hub', evidence:'behavior', harness:'e2e-native-team-hub.mjs', assertion:'Startup is owned by the approved Home first-launch state while Team Hub remains mounted but hidden' },
  // The five-step progress indicator this capability originally named is retired
  // from production; nothing renders step counts any more. The coach-facing
  // guarantee that survived it is that setup stays RESUMABLE -- a coach who
  // stops half way can reopen the guide and carry on -- so that is what this
  // critical capability now certifies. Re-pointed rather than dropped, because
  // deleting a critical capability to make a guard green is how coverage is lost.
  { id:'team-hub.onboarding-progress', surface:'team-hub', evidence:'behavior', harness:'e2e-native-team-hub.mjs', assertion:'Review season setup reopens one resumable, fully skippable guide' },
  { id:'team-hub.create-season', surface:'team-hub', evidence:'data', harness:'e2e-native-team-hub.mjs', assertion:'Approved Home setup creates the active team and season through canonical owners' },
  { id:'team-hub.team-switch', surface:'team-hub', evidence:'data', harness:'e2e-native-team-hub.mjs', assertion:'Team switch fails closed when the outgoing canonical season save fails' },
  { id:'team-hub.delete-impact', surface:'team-hub', evidence:'data', harness:'e2e-native-team-hub.mjs', assertion:'Season delete names game/play impact and managed-versus-linked film consequences' },
  { id:'team-hub.mobile', surface:'team-hub', evidence:'a11y', harness:'e2e-native-team-hub.mjs', assertion:'Mobile Team Hub preserves complete touch access without page-level scrolling traps' },
  // Team + film storage truth
  { id:'settings.first-run-storage', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'First desktop launch opens the one native film-storage setup owner' },
  { id:'settings.pre-game-entry', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'Team Hub settings action opens the consolidated panel before a game is opened' },
  { id:'settings.managed-disclosure', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Native Film settings persists managed mode and discloses copying' },
  { id:'settings.link-root', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Existing-library choice saves the selected root once' },
  { id:'settings.failed-link-rollback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Failed canonical save rolls the entire game link back and reports failure' },
  { id:'settings.no-managed-fallback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'C2 no silent fallback: a persisted linked game auto-loads from the D: folder and never calls the managed-copy backend' },
  { id:'settings.native-owner', surface:'settings', evidence:'behavior', harness:'e2e-native-settings.mjs', assertion:'Team & Film Settings has one native presentation owner' },
  { id:'settings.source-truth', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Linked game shows its resolved D: path and honest missing-clip count' },
  { id:'settings.mode-isolation', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Changing the import default never rewrites existing per-game storage modes' },
  { id:'settings.team-identity', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Team identity saves only the coach-selected name and jersey color' },
  { id:'settings.mobile-modal', surface:'settings', evidence:'a11y', harness:'e2e-native-settings.mjs', assertion:'Narrow Settings becomes modal and makes the workspace inert' },
  { id:'settings.analysis', surface:'settings', evidence:'behavior', harness:'e2e-native-settings.mjs', assertion:'Native Analysis saves optional preferences without entering prime chrome' },
  { id:'settings.charting-libraries', surface:'settings', evidence:'data', harness:'e2e-tag-library-settings.mjs', assertion:'Switching teams isolates and restores each staff vocabulary' },
  { id:'settings.cutup-filters', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Native Cut-ups passes the exact selected film set to the canonical filter' },
  { id:'settings.drawing', surface:'settings', evidence:'behavior', harness:'e2e-native-settings.mjs', assertion:'Native Drawing configures the live canvas and closes so film remains unobstructed' },
  { id:'settings.restore-points', surface:'settings', evidence:'data', harness:'e2e-native-recovery.mjs', assertion:'Season restore updates every game, reloads the active editor, persists canonical bytes, and saves the prior state' },
  { id:'settings.restore-fail-closed', surface:'settings', evidence:'data', harness:'e2e-native-recovery.mjs', assertion:'Failed season restore rolls back in memory, keeps canonical storage unchanged, and never reloads stale backup data' },
  { id:'settings.game-versions', surface:'settings', evidence:'data', harness:'e2e-native-recovery.mjs', assertion:'Game version restore changes only the open game and versions remain game-scoped' },
  { id:'settings.game-version-fail-closed', surface:'settings', evidence:'data', harness:'e2e-native-recovery.mjs', assertion:'Failed game-version restore keeps the live game and canonical season on the pre-restore state' },
  { id:'settings.roster', surface:'settings', evidence:'behavior', harness:'e2e-native-team-hub.mjs', assertion:'Team Hub Roster action opens the canonical native roster workspace' },

  { id:'study.pivot', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Study renders a cross-tab with row and column dimensions plus totals' },
  { id:'study.pivot-refs', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'A pivot cell plays exactly the plays carrying both its row and column value' },
  { id:'study.min-sample', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Under-sampled cells are labelled low sample and still play their exact film' },

  // Shared film navigation
  { id:'film-nav.exact-queue', surface:'film-navigation', evidence:'data', harness:'e2e-film-navigation.mjs', assertion:'Next/Save & Next queue contains only exact requested examples' },
  { id:'film-nav.cancel', surface:'film-navigation', evidence:'behavior', harness:'e2e-film-navigation.mjs', assertion:'cancellation never advances into the next game' },
  { id:'film-nav.restore', surface:'film-navigation', evidence:'data', harness:'e2e-film-navigation.mjs', assertion:'replacement restores the original session launch game, not the transient game' },

  // Overlay primitives
  { id:'overlay.dialog-default', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'dialog focuses its declared default action' },
  { id:'overlay.modal-inert', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'modal dialog makes legacy and native route content inert' },
  { id:'overlay.escape-focus', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'Escape closes only the dialog and restores its invoker' },
  { id:'overlay.sheet', surface:'overlays', evidence:'behavior', harness:'e2e-native-overlay.mjs', assertion:'desktop non-modal sheet leaves the route available' },
  { id:'overlay.destructive-default', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'destructive confirmation defaults focus to Cancel' },
  { id:'overlay.stack', surface:'overlays', evidence:'behavior', harness:'e2e-native-overlay.mjs', assertion:'closing stacked dialog returns focus inside its parent sheet' },
  { id:'overlay.toast', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'toast and delayed overlay cleanup never steal newer focus' },
  { id:'overlay.unmount', surface:'overlays', evidence:'behavior', harness:'e2e-native-overlay.mjs', assertion:'unmount removes presentation, subscription, key/focus ownership, and route inertness' },
];
// Named completeness floor for capabilities this migration has previously
// hidden or could otherwise erase while leaving a broad item count green.
export const P0_CRITICAL_CAPABILITY_IDS = [
  // Storage honesty on the first screen a coach sees. A managed copy and a
  // linked D: folder reading identically is exactly what made the 1.12.0-8
  // smoke unprovable.
  'home.film-source',
  // Film-link exactness on the new cross-tab. A cell that plays film other than
  // the plays it counted is the worst outcome S6 could produce.
  'study.pivot-refs',
  // Same rule one screen later: a plan section's Watch is a new playback entry
  // point, and a section that plays film other than the plays it counted would
  // teach the wrong tape in front of a room.
  'plan.section-film',
  'shell.undo',
  'shell.redo',
  'shell.shortcuts',
  'shell.import-plays',
  'breakdown.drawing-tools',
  'breakdown.drawing-playback',
  'breakdown.quick-chart',
  'breakdown.quick-chart-special-teams',
  'breakdown.game-context',
  'breakdown.context-isolation',
  'breakdown.derived-perspective',
  'breakdown.play-diagram',
  'breakdown.scoreboard-ocr',
  'breakdown.templates',
  'breakdown.auto-detect',
  'breakdown.multi-angle-load',
  'breakdown.multi-angle-sync',
  'breakdown.multi-angle-view',
  'breakdown.multi-angle-remove',
  'reports.native-owner',
  'reports.lens-board',
  'reports.opponent-cohorts',
  'reports.opponent-special-teams',
  'reports.csv-roundtrip',
  'reports.season-html',
  'reports.call-sheet',
  'team-hub.native-owner',
  'team-hub.team-switch',
  'team-hub.onboarding-progress',
  'settings.native-owner',
  'settings.source-truth',
  'settings.mode-isolation',
  'settings.restore-points',
  'settings.restore-fail-closed',
  'settings.game-version-fail-closed',
  'settings.charting-libraries',
  'settings.cutup-filters',
  'settings.drawing',
  'settings.roster',
];

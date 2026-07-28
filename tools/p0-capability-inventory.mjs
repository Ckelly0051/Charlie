/** P0-d: migration capability inventory.
 * Each entry names a coach outcome and the exact canonical journey assertion
 * that proves it. Route migrations may change markup, never silently drop one.
 */
export const P0_CAPABILITIES = [
  // Home / shell ownership
  { id:'home.setup-team', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'empty Home offers Set up team' },
  { id:'home.new-game', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'Home exposes a direct New Game action' },
  { id:'home.open-game', surface:'home', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'opening a game lands in Break Down' },
  { id:'shell.breakdown-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Break Down opens its dedicated production route' },
  { id:'shell.settings', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell Settings opens the single native Team & Film Settings owner' },
  { id:'shell.more-menu', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell More opens the canonical action menu' },
  { id:'shell.study-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Study opens the query workspace inside the persistent shell' },
  { id:'shell.plan-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Plan opens the live season plan workspace' },
  { id:'shell.undo', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Relocated Undo stays wired to history-manager and enables on a real edit' },
  { id:'shell.redo', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Undo, Redo and Shortcuts are reachable in shell chrome, not entombed in the hidden classic bar' },
  { id:'shell.shortcuts', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Mobile Shortcuts action remains wired to the canonical dialog' },
  { id:'shell.import-plays', surface:'shell', evidence:'data', harness:'e2e-workspace-shell.mjs', assertion:'Shell Import Plays opens the canonical importer and Cancel preserves the season' },

  // Break Down: film, charting, and football detail
  { id:'breakdown.video-controls', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Real playback controls are contained inside the video surface' },
  { id:'breakdown.play-selection', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Selecting a play card drives the real PlayTagger and active state' },
  { id:'breakdown.live-card-update', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-video.mjs', assertion:'Ordinary tag edits update one stable play card instead of rebuilding the strip' },
  { id:'breakdown.autoplay-choice', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Video action bar exposes Autoplay next with the backward-compatible ON default' },
  { id:'breakdown.all-fields', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-form.mjs', assertion:'Every production offense, defense, player, custom, note, and situation control remains present' },
  { id:'breakdown.tag-save', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-form.mjs', assertion:'Recomposition preserves the existing chip listener and tag-save path' },
  { id:'breakdown.special-teams', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-form.mjs', assertion:'Redesigned Special Teams exposes dedicated kick, return, field-goal, and try units while hiding the legacy Scored-by control' },
  { id:'breakdown.penalties', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-form.mjs', assertion:'Penalty editor stores multiple independent fouls and actual enforcement' },
  { id:'breakdown.save-next', surface:'breakdown', evidence:'data', harness:'e2e-breakdown-form.mjs', assertion:'Save & Next preserves multi-tackler attribution, grade, notes, and gives affirmative feedback' },
  { id:'breakdown.drawing-tools', surface:'breakdown', evidence:'behavior', harness:'e2e-tagging.mjs', assertion:'digit with NO play selected still arms the tool' },
  { id:'breakdown.drawing-playback', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Playback canvas paints only when entering or leaving an annotated frame' },
  { id:'breakdown.quick-chart', surface:'breakdown', evidence:'behavior', harness:'e2e-breakdown-video.mjs', assertion:'Quick Chart selector opens the active production panel outside the hidden legacy tree' },
  { id:'breakdown.multi-angle-load', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Loading a second angle syncs playback and opens the desktop side-by-side view' },
  { id:'breakdown.multi-angle-sync', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Second-angle sync corrects real drift, tolerates sub-threshold jitter, and follows transport state' },
  { id:'breakdown.multi-angle-view', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'PiP click and V-key swap the active camera through the production controls' },
  { id:'breakdown.multi-angle-remove', surface:'breakdown', evidence:'behavior', harness:'e2e-multi-angle.mjs', assertion:'Removing the second angle revokes its media and restores the single-camera workspace' },

  // Film Room spreadsheet
  { id:'film-room.filters', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'down filter narrows to 3rd downs' },
  { id:'film-room.watch-fallback', surface:'film-room', evidence:'behavior', harness:'e2e-film-room.mjs', assertion:'no-video Watch falls back to selecting first play' },
  { id:'film-room.inline-edit', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'multi-enum edit commits to tags + cell' },
  { id:'film-room.keyboard', surface:'film-room', evidence:'behavior', harness:'e2e-film-room.mjs', assertion:'ArrowDown moves focus to next play, same column' },
  { id:'film-room.columns', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'checkbox adds a column (persisted)' },
  { id:'film-room.exact-film', surface:'film-room', evidence:'data', harness:'e2e-film-room.mjs', assertion:'Watch receives EXACTLY the COMPOSITE refs of the selected rendered row group, no more, no fewer' },

  // Study
  { id:'study.active-cohort', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Study defaults to the active-game cohort' },
  { id:'study.filter', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'A filter narrows the cohort through the registry' },
  { id:'study.save-plan', surface:'study', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Save to Plan asks for an intentional destination and comparison cohort before mutating data' },
  { id:'study.advanced-reports', surface:'study', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Reaching Advanced Reports no longer exposes the classic outlet' },

  // Reports: preserve football analysis breadth and canonical actions
  { id:'reports.native-owner', surface:'reports', evidence:'behavior', harness:'e2e-native-reports.mjs', assertion:'Reports has one native owner while the legacy dashboard stays in the classic tree' },
  { id:'reports.eight-views', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'All eight report views render a real pane' },
  { id:'reports.export', surface:'reports', evidence:'behavior', harness:'e2e-native-reports.mjs', assertion:'Native Reports routes PDF, HTML, CSV, and Call Sheet to their canonical owners' },
  { id:'reports.opponent-cohorts', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Opponent Watch controls launch the exact displayed unit cohorts' },
  { id:'reports.opponent-special-teams', surface:'reports', evidence:'data', harness:'e2e-native-reports.mjs', assertion:'Opponent Special Teams includes scout film and excludes ambiguous head-to-head ST' },
  { id:'reports.season', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'the Season tab button exists in the dashboard' },
  { id:'reports.players', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'a rushing leaderboard with player rows rendered' },
  { id:'reports.special-teams', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'Special Teams section renders' },
  { id:'reports.self-scout', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'Self-Scout surfaces a strength / Formation×Strength tell' },
  { id:'reports.opponent-scout', surface:'reports', evidence:'behavior', harness:'e2e-season-tab.mjs', assertion:'Scout-Opponent button sits in the dashboard header' },
  { id:'reports.csv-roundtrip', surface:'reports', evidence:'data', harness:'e2e-csv-roundtrip.mjs', assertion:'export→import preserves multiple structured penalties' },
  { id:'reports.call-sheet', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'a modern split play composes qbAlignment + formation the same way' },

  // Plan
  { id:'plan.reorder', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan items reorder through accessible buttons and desktop drag without losing items' },
  { id:'plan.export', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan export downloads the same ordered, audience-aware presentation data' },
  { id:'plan.presentation', surface:'plan', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Presentation advances by keyboard and keeps resolved film links' },
  { id:'plan.exact-film', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan item and whole-plan Watch use the same composite film refs' },

  // Team + film storage truth
  { id:'settings.first-run-storage', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'First desktop launch opens the one native Team & Film Settings owner' },
  { id:'settings.pre-game-entry', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'Team Hub exposes Team & Film Settings before a game is opened' },
  { id:'settings.managed-disclosure', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Managed choice persists and discloses copying' },
  { id:'settings.link-root', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Existing-library choice saves the selected root once' },
  { id:'settings.failed-link-rollback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Failed canonical save rolls the entire game link back and reports failure' },
  { id:'settings.no-managed-fallback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'C2 no silent fallback: a persisted linked game auto-loads from the D: folder and never calls the managed-copy backend' },
  { id:'settings.native-owner', surface:'settings', evidence:'behavior', harness:'e2e-native-settings.mjs', assertion:'Team & Film Settings has one native presentation owner' },
  { id:'settings.source-truth', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Linked game shows its resolved D: path and honest missing-clip count' },
  { id:'settings.mode-isolation', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Changing the import default never rewrites existing per-game storage modes' },
  { id:'settings.team-identity', surface:'settings', evidence:'data', harness:'e2e-native-settings.mjs', assertion:'Team identity saves only the coach-selected name and jersey color' },
  { id:'settings.mobile-modal', surface:'settings', evidence:'a11y', harness:'e2e-native-settings.mjs', assertion:'Narrow Settings becomes modal and makes the workspace inert' },
  { id:'settings.advanced-bridge', surface:'settings', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Native More settings preserves the unmigrated drawer tools and CV-server status' },
  { id:'settings.restore-points', surface:'settings', evidence:'data', harness:'e2e-catalog-persistence.mjs', assertion:'restore points survive a reopen from the on-disk db' },
  { id:'settings.roster', surface:'settings', evidence:'behavior', harness:'e2e-onboarding.mjs', assertion:'roster drawer actually reachable from checklist' },

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
  { id:'overlay.toast', surface:'overlays', evidence:'a11y', harness:'e2e-native-overlay.mjs', assertion:'toast announces politely without stealing focus' },
  { id:'overlay.unmount', surface:'overlays', evidence:'behavior', harness:'e2e-native-overlay.mjs', assertion:'unmount removes presentation, subscription, key/focus ownership, and route inertness' },
];
// Named completeness floor for capabilities this migration has previously
// hidden or could otherwise erase while leaving a broad item count green.
export const P0_CRITICAL_CAPABILITY_IDS = [
  'shell.undo',
  'shell.redo',
  'shell.shortcuts',
  'shell.import-plays',
  'breakdown.drawing-tools',
  'breakdown.drawing-playback',
  'breakdown.quick-chart',
  'breakdown.multi-angle-load',
  'breakdown.multi-angle-sync',
  'breakdown.multi-angle-view',
  'breakdown.multi-angle-remove',
  'reports.native-owner',
  'reports.opponent-cohorts',
  'reports.opponent-special-teams',
  'reports.csv-roundtrip',
  'reports.call-sheet',
  'settings.native-owner',
  'settings.source-truth',
  'settings.mode-isolation',
  'settings.restore-points',
  'settings.roster',
];

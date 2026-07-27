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
  { id:'shell.settings', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell Settings opens the canonical settings drawer' },
  { id:'shell.more-menu', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Shell More opens the canonical action menu' },
  { id:'shell.study-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Study opens the query workspace inside the persistent shell' },
  { id:'shell.plan-route', surface:'shell', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Plan opens the live season plan workspace' },

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
  { id:'reports.export', surface:'reports', evidence:'behavior', harness:'e2e-workspace-shell.mjs', assertion:'Reports main Export delegates to the canonical analytics action' },
  { id:'reports.season', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'the Season tab button exists in the dashboard' },
  { id:'reports.players', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'a rushing leaderboard with player rows rendered' },
  { id:'reports.special-teams', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'Special Teams section renders' },
  { id:'reports.self-scout', surface:'reports', evidence:'data', harness:'e2e-season-tab.mjs', assertion:'Self-Scout surfaces a strength / Formation×Strength tell' },
  { id:'reports.opponent-scout', surface:'reports', evidence:'behavior', harness:'e2e-season-tab.mjs', assertion:'Scout-Opponent button sits in the dashboard header' },

  // Plan
  { id:'plan.reorder', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan items reorder through accessible buttons and desktop drag without losing items' },
  { id:'plan.export', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan export downloads the same ordered, audience-aware presentation data' },
  { id:'plan.presentation', surface:'plan', evidence:'behavior', harness:'e2e-study-screen.mjs', assertion:'Presentation advances by keyboard and keeps resolved film links' },
  { id:'plan.exact-film', surface:'plan', evidence:'data', harness:'e2e-study-screen.mjs', assertion:'Plan item and whole-plan Watch use the same composite film refs' },

  // Team + film storage truth
  { id:'settings.first-run-storage', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'First desktop launch opens intentional storage setup' },
  { id:'settings.pre-game-entry', surface:'settings', evidence:'behavior', harness:'e2e-film-storage-setup.mjs', assertion:'Team Hub exposes Team & Film Settings before a game is opened' },
  { id:'settings.managed-disclosure', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Managed choice persists and discloses copying' },
  { id:'settings.link-root', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Existing-library choice saves the selected root once' },
  { id:'settings.failed-link-rollback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'Failed canonical save rolls the entire game link back and reports failure' },
  { id:'settings.no-managed-fallback', surface:'settings', evidence:'data', harness:'e2e-film-storage-setup.mjs', assertion:'C2 no silent fallback: a persisted linked game auto-loads from the D: folder and never calls the managed-copy backend' },

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
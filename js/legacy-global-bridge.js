import { AnalyticsRegistry } from './analytics-registry.js';
import { Charts } from './charts.js';
import { CatalogPersistence } from './catalog-persistence.js';
import { CrossGameCutup } from './cross-game-cutup.js';
import { FilmNavigationService } from './film-navigation-service.js';
import { CutupPlayer } from './cutup-player.js';
import { isPlayTagged } from './football-rules.js';
import { HistoryManager } from './history-manager.js';
import { PenaltyModel } from './penalty-model.js';
import { PlanExport } from './plan-export.js';
import { PlayGrid } from './play-grid.js';
import { PlaylistManager } from './playlist-manager.js';
import { PlayTagger } from './play-tagger.js';
import { SeasonStore } from './season-store.js';
import { SnapshotEnvelope } from './snapshot-envelope.js';
import { SpecialTeamsModel } from './special-teams.js';
import { SqlCatalog } from './sql-catalog.js';
import { StatsEngine } from './stats-engine.js';
import { StorageManager } from './storage.js';
import { BrowserBackend, StorageBackend, TauriBackend } from './storage-backend.js';
import { StudyPlan } from './study-plan.js';
import { StudyQuery } from './study-query.js';
import { StudyScreen } from './study-screen.js';
import { TagLibrary } from './tag-library.js';
import { TagProjection } from './tag-projection.js';
import { VersionManager } from './version-manager.js';
import { VideoController } from './video-controller.js';
import { WorkspaceShell } from './workspace-shell.js';

// Temporary bridge: some regression harnesses consume these contracts directly
// instead of through a route or journey API. Keep the list explicit and delete
// entries as those tests migrate. Scheduled for its own reviewed cleanup.
Object.assign(globalThis, {
  AnalyticsRegistry,
  BrowserBackend,
  CatalogPersistence,
  Charts,
  CrossGameCutup,
  FilmNavigationService,
  CutupPlayer,
  HistoryManager,
  isPlayTagged,
  PenaltyModel,
  PlanExport,
  PlayGrid,
  PlaylistManager,
  PlayTagger,
  SeasonStore,
  SnapshotEnvelope,
  SpecialTeamsModel,
  SqlCatalog,
  StatsEngine,
  StorageBackend,
  StorageManager,
  StudyPlan,
  StudyQuery,
  StudyScreen,
  TagLibrary,
  TagProjection,
  TauriBackend,
  VersionManager,
  VideoController,
  WorkspaceShell,
});

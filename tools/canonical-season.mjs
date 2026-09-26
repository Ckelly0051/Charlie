/**
 * THE canonical Reports real-data season, one path for every harness.
 *
 * Coach's registered 2025 JV season (`2025-st-joseph-mavericks-jv`, 449 plays,
 * six games) as a CURRENT-FORMAT fixture: a converted copy of the Documents
 * mirror file, made once by tools/make-canonical-fixture.mjs on 2026-09-26 (deleted after use; commit b84e207)
 * (legacy excision step 7). Read-only; never the coach's own file. Its Special
 * Teams values were old format and are blank until the coach retags them.
 */
export const CANONICAL_SEASON_ID = '2025-st-joseph-mavericks-jv';
export const CANONICAL_SEASON = `C:/Users/charl/GridIronIQ-Fixtures/${CANONICAL_SEASON_ID}/season.json`;
/** The pre-conversion mirror file the fixture was made from (old format). */
export const CANONICAL_SOURCE_MIRROR = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${CANONICAL_SEASON_ID}/season.json`;

/**
 * THE canonical Reports real-data season, one path for every harness.
 *
 * Coach's registered 2025 JV season (`2025-st-joseph-mavericks-jv`, 449 plays,
 * six games) as a CURRENT-FORMAT fixture: a converted copy of the Documents
 * mirror file, made once by tools/make-canonical-fixture.mjs on 2026-09-26 (deleted after use; commit b84e207)
 * (legacy excision step 7). Read-only; never the coach's own file. Its Special
 * Teams values were old format and are blank until the coach retags them.
 *
 * Charting cutover (2026-09-28): its Formation was converted once to current
 * Formation fields using TEST stand-ins, not the coach's live-data decisions.
 * The spent conversion tools have been deleted. The pre-cutover copy sits beside it as
 * season.pre-charting-cutover.json.
 */
export const CANONICAL_SEASON_ID = '2025-st-joseph-mavericks-jv';
export const CANONICAL_SEASON = `C:/Users/charl/GridIronIQ-Fixtures/${CANONICAL_SEASON_ID}/season.json`;
/** The pre-conversion mirror file the fixture was made from (old format). */
export const CANONICAL_SOURCE_MIRROR = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${CANONICAL_SEASON_ID}/season.json`;

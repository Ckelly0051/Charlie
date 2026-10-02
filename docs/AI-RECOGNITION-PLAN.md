# AI Recognition: Landscape and Plan (proposal, 2026-10-01)

Status: **parked by the coach on 2026-10-02 ("not sold"). Ideas kept here for a
later look; nothing is approved or built.**

**Goal (coach, 2026-10-02): reduce clicks, not remove the coach.** A human
always stays in the loop. Success is measured in clicks per charted play, not in
model accuracy:
- A field is pre-filled only when the model is right far more often than wrong.
- Below that confidence it highlights its top two or three chips instead.
- An accept-all confirm covers a whole look.

Every result is compared with two baselines on a held-out game: today's deck,
and free smart defaults with no AI (the previous play, the drive, tendencies,
play-call defaults). AI is worth shipping only for the clicks it saves beyond
those defaults. Roadmap entry: `GRIDIRON-IQ-PLAN-V2.md` §5. It extends the existing
"Automated data production" follow-on (V2-F item 4): proposed tags carry
confidence and provenance, stay reviewable in film context, and never silently
overwrite coach-entered data.

## 1. What competitors ship (public claims, 2026-10)

None of these vendors publishes measured accuracy. Treat every capability below
as a vendor claim unless marked otherwise.

| Vendor | Level | What it recognizes | How | Film needed |
|---|---|---|---|---|
| **Hudl Focus** cameras | HS and up | Auto-tracks snap to whistle; auto-splits clips into O/D/K | On-camera AI (shipping, widely used) | Their camera |
| **Hudl Assist / Assist+** | HS | Formation, backfield, strength, play type and direction, D&D, hash, gain; Assist+ adds passer, rusher, receiver | **Human analysts** (football has no AI option); standard or express queue | Hudl recording workflow, full field |
| **Hudl IQ** (2024) | College | Formation, route, coverage, blitz; 30 fps player tracking; EPA, CPOE, catch radius | "AI, computer vision **and expert data collectors**" (hybrid) | Broadcast-standard film |
| **QwikCut QwikStats** | HS | 14 (Basic) or 40+ (Advanced) columns | Human analysts, about 12 h; AI camera and auto-highlights | QwikCut upload |
| **Teamworks** (Telemetry, Zelus; Sportlogiq) | NFL, college | 10 Hz tracking, coaching analytics, player models | Computer vision plus analysts; mid-five to six figures a year | Broadcast and All-22 |
| **BallHawk** | HS | D&D, yard line, hash, offensive and defensive formation (15+ types each), run/pass, play diagram | AI; "full game in under 5 minutes"; layer over Hudl and Catapult | Not stated |
| **NextPlay** (Athletic Dynamics Intelligence) | HS | Formations, play types, situational patterns; coach reviews and adjusts | AI | Not stated |
| **ANSRS** | HS, college (300+ programs) | Huddle calls turned into data; instant cut-ups; in-game "Adjust" | AI over Hudl, Catapult and DVSport | Existing film |
| **PlayIQ** | HS, college | Play separation; 22-player tracking (trails, spacing, speed) | AI; designed for coach inspection | **High sideline only**; end zone not supported |

**What is proven, rather than claimed:**
- Play separation and O/D/K split are commodity features (Hudl Focus ships them).
- In research on All-22-style film: over 90% player detection and position
  labeling, **84.8% formation ID** (MDPI 2023); 98% line-of-scrimmage detection
  and 67% formation ID in an earlier study; 98.5% play type and 92% position on
  controlled data (MDPI 2024).
- General multimodal LLMs are strong on general video (Gemini 2.5 Pro scores
  about 85% on Video-MME) and **weaker on fine-grained sports**. On SportR's
  American football component (ICLR 2026), Gemini 2.5 Pro scored about 59%.
- Top-level products are still hybrid. Hudl's high school football data is
  human-tagged, and Hudl IQ uses "expert data collectors". College staffs audit
  AI output by hand (CBS, 2025-09).

**Read:** situation, segmentation, run/pass and offensive formation from a high
wide angle are achievable now. Coverage, blitz and routes are claimed only by
well-funded college and pro products with broadcast film and human support.
Nobody shows coaches an accuracy number. A credible, measured hybrid is an
opening.

## 2. What GridIron IQ already has

- `js/play-detector.js`: play segmentation from motion, scene cuts and audio.
- `js/clip-analyzer.js`: heuristic tags (QB alignment, run/pass, direction,
  rough yardage) with confidence values.
- `server/`: optional local FastAPI with YOLOv8 person detection, using the same
  `{tags, confidence, reasons}` shape.
- `js/vision-analyzer.js`: sends key frames to Claude and gets tags with
  confidence and reasons. Its vocabulary comes from `TagLibrary`. It is
  **unmeasured**, pinned to an old model id (`claude-opus-4-8`), and sends the
  coach's API key directly from the browser.
- **The asset competitors lack: about 919 coach-charted plays with linked
  film** (2025 JV plus the 2026 seasons), in the coach's own vocabulary. That
  is labeled ground truth for measuring and few-shot prompting.
- Charting rules already fit suggestions: provenance, no silent overwrite,
  Film Room review and exact film references.

**Gaps:**
- No accuracy measurement.
- No suggestion layer: proposed values are not stored apart from coach tags.
- Browser-held API key.
- Stale model id.
- No scoreboard or field registration (situation, yard line, hash).
- No jersey OCR.
- No evidence of how the film angle affects results.

## 3. Our reality: the 2025 film and labels (measured 2026-10-01)

The coach's 2025 JV film is the best view we will get. Every estimate below is
sized to it, not to All-22 or broadcast film.

**The film.** I sampled 18 clips across all six 2025 games.
- One iPhone clip per play, 8-19 s long, 1080p at 30 fps (a few 4K).
- Shot from an elevated sideline. The camera pans and zooms to follow the ball,
  and the start of each clip is the pre-snap look.
- Both lines and the backfield are almost always in frame pre-snap; wide
  receivers are sometimes at or past the edge.
- Players are roughly 40-90 px tall, so jersey numbers are not readable except
  occasionally on 4K.
- Yard numbers, yard lines and hash marks are clearly visible on most fields.
  OLL is the exception: a low grass field with sideline crowd in front.
- The scoreboard appears only in occasional separate clips, so down and distance
  cannot come from the play clips. The app's own situation chaining already
  covers that.
- Play segmentation is already done: the camera operator started and stopped
  each clip.

**The labels** (all three seasons, live catalog, read-only copy). 919 plays:
429 offensive snaps, plus the offense faced on 279 defensive snaps. Look fields
are charted on both, which is why their counts exceed 429:

| Field | Charted | Classes | Usable for training? |
|---|---|---|---|
| Hash | 516 | 3, balanced | Yes, and it is geometric |
| QB alignment | 491 | 3 (Pistol 11) | Yes |
| Play direction | 459 | 3, balanced | Yes, and it is geometric |
| Run/Pass | 469 | 2; 80% Run | Yes, but it must beat the 80% "always Run" baseline |
| Formation | 500 | 14; top 6 hold 77% | Top 6 yes; the tail cannot be learned |
| Backfield | 502 | 10; 4 dominate | Top 4 yes |
| Personnel | 467 | 12 | Common groups yes |
| Line strength | 473 | 3 (+2 rare) | Yes |
| Play type | 464 | 9; 3 dominate | Inside, outside and pass; RPO is visually hard |
| Result / yardage | 545 | Gain/Loss/No Gain/TD | Yes, and yardage is geometric |
| Defensive front | 463 | 6 | Partly |
| Motion | 102 | 4 | Yes/no only |
| Coverage | 455 | **97% Cover 3** | **No signal to learn** |
| Blitz | 19 | 3 | No |
| Gap | 1 | - | No labels; can be computed geometrically, but only checked once charted |
| Receiver alignment | 11 | - | No labels; can be computed from positions |

## 4. What training buys us on this film

The real constraint is labels, not compute. Renting a GPU (a few hours on one
A100 or 4090, roughly $10-50 per run) covers the heavy steps:
- detecting and tracking players across about 1,700 clips;
- fine-tuning a field-marking (yard line and hash) model on about 150 frames we
  label together.

Everything after that trains on this PC's CPU in minutes.

**The approach.**
1. A pretrained person detector plus a tracker.
2. Team separation by jersey color.
3. Field registration from the yard lines and hashes, turning each frame into a
   top-down field map.
4. Small models trained on the coach's ~500 labels over the player positions.
   Mirroring Left/Right doubles the data for direction and strength.
5. Scoring with one game held out at a time, so every number is measured on a
   game the model never saw.

Several fields need no learned model once we have the field map. They are
geometry: hash, play direction, yardage, receiver alignment, QB depth and gap.

**Expected results** (ranges to confirm in Phase 0, not promises):

| Tier | Fields | Expected | Use |
|---|---|---|---|
| **A** | Offense/Defense/Kick (by our jersey color), special-teams unit, hash, QB alignment, play direction, motion yes/no | about 85-95% | Pre-fill; coach glances |
| **B** | Run/Pass (target about 90%), top-6 formation, backfield, personnel group, line strength, result, yardage within about 3 yd | about 65-85% | Suggested with confidence; coach confirms |
| **C** | Play type beyond inside/outside/pass, rare formations, defensive front | about 50-65% | Low-confidence hint only |
| **Not possible with this film and data** | Coverage, blitz, jersey numbers and player credit, down and distance from video | - | Stay manual |

**Practical payoff:** most of the Situation and Formation & Call groups
pre-filled, a quick confirm instead of a build-from-scratch, and Tier A fields
nearly free. Charting still needs the coach for calls, results he judges,
players, defense and anything low-confidence.

**Payoff we will measure, not assume:** seconds of charting per play before and
after, on a held-out game.

**It improves as the coach charts.** Every charted or corrected play is a new
label. The 2026 film adds more games from similar angles, and retraining weekly
sharpens the model on this team and its opponents. Gap and receiver alignment
become checkable once charted.

## 5. Plan

**Phase 0: measure (about one week; read-only).**
- Run detection, tracking and field registration on the 2025 games.
- Label about 150 frames with the coach for the field markings.
- Train Tier A and B on five games and score on the sixth, rotating through all six.
- Also score Claude and GPT on the same held-out plays, frames plus our structure,
  for the vocabulary fields.
- Deliverable: a per-field accuracy table, the error cases on film, minutes saved
  per game, and the compute cost.
- Exit: the coach picks the fields to ship.

**Phase 1: suggestions in the app.**
- A suggestion store kept apart from tags (a schema decision for the coach),
  with engine, confidence and evidence frame.
- Pending values in Chart and Film Room: accept or correct per field, or accept
  all for a play.
- Models run locally on this PC. No film leaves the machine unless the coach
  opts in.

**Phase 2: the learning loop.**
- Weekly retraining from new charting, with accuracy tracked per field over time.

**Later, only if Phase 0 earns it:** gap and receiver alignment from geometry,
play type, and the defensive front.

## 6. Decisions needed from the coach

1. Approve Phase 0 and a small compute budget (about $50).
2. About an hour together to label field markings on roughly 150 frames.
3. Field priority among Tiers A and B.
4. Whether a cloud model (Claude or GPT) may see sampled frames for the
   vocabulary fields, or whether everything stays local.

## 7. Parked ideas (2026-10-02)

- **Clicks baseline first.** Count clicks per play on one 2025 game with today's
  deck. Then measure what free defaults save with no AI: the previous play's look
  within a drive, play-call defaults, and per-down tendencies. AI has to beat
  that.
- **Subscription test.** In a Claude Code session, chart 10-15 pre-snap frames
  from one 2025 game blind (formation, backfield, QB alignment, personnel,
  strength), then score against the coach's tags. No API cost.
- **API cost if it ever ships** (personal account, 2026-10 prices): Sonnet 5.5
  $2/$10 and Opus 5.5 $4/$20 per million tokens, batch half price. About 6
  frames per play comes to roughly $3 a game on Sonnet and $6 on Opus, or about
  half that in overnight batch. A subscription cannot power the app; it can only
  run tests in a session.
- **Division of labor.** Vision models do the geometry (players, field map,
  hash, direction, yardage). An LLM names the look in the coach's vocabulary,
  using his charted plays as examples. Competitors rely on large human-tagged
  datasets and fixed taxonomies; we would substitute a small labeled set plus a
  general model.
- **Privacy.** Frames of youth players would go to the model provider; check
  the program's film policy before any cloud use.

## Sources

- Hudl IQ: https://www.hudl.com/products/football-iq
- Hudl Assist FAQ: https://www.hudl.com/products/assist/faq
- Hudl Assist football: https://www.hudl.com/products/assist/football
- Hudl Focus cameras: https://www.hudl.com/football-camera
- CBS Sports, AI in college football (2025-09-22): https://www.cbssports.com/college-football/news/meet-the-new-recruit-artificial-intelligence-in-college-football/
- QwikCut football: https://www.qwikcut.com/football/
- Teamworks acquires Telemetry: https://teamworks.com/blog/teamworks-acquires-telemetry-sports/
- BallHawk: https://ballhawkfootball.com/
- NextPlay: https://www.next-play.co/
- ANSRS (AFCA): https://www.afca.com/ansrs-changing-football-film-study/
- PlayIQ: https://theplayiq.com/ai-football-film-analysis/
- Formation recognition, MDPI 2023: https://www.mdpi.com/2079-9292/12/3/726
- Play type and position recognition, MDPI 2024: https://www.mdpi.com/2079-9292/13/18/3628
- Offensive formation recognition (earlier): https://www.researchgate.net/publication/261468893_Automatic_Recognition_of_Offensive_Team_Formation_in_American_Football_Plays
- Video-MME: https://arxiv.org/pdf/2405.21075
- SportR (ICLR 2026): https://arxiv.org/html/2511.06499v2

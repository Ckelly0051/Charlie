# AI Recognition: Landscape and Plan (proposal, 2026-10-01)

Status: **planning proposal for coach review. Nothing here is approved or
built.** Roadmap entry: `GRIDIRON-IQ-PLAN-V2.md` §5. It extends the existing
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

## 3. Plan

Phases are gated: each one starts only when the previous one's measured result
earns it.

**Phase 0: Measure before building (the decision gate).**
- Build an offline evaluation tool in `tools/` that reads copies of charted
  plays and their film. It runs each engine over the same plays and scores
  every field against the coach's tags.
- Engines: heuristic, YOLO, and the current models from Claude, GPT and Gemini.
- Output: per-field accuracy, confidence calibration, minutes and cost per game,
  and a split by camera angle.
- No app changes; coach data read only.
- Exit: a table of which fields and which engine are worth suggesting.

**Phase 1: A suggestion layer and the reliable fields.**
- Store suggestions apart from tags, with engine, model, confidence and evidence
  frame. A schema decision needs the coach first.
- Show them in Chart and Film Room as pending values to accept or correct per
  field, or accept all for a play.
- Fields:
  - play boundaries and O/D/K (matching the coach's marks)
  - run/pass, play direction, hash
  - quarter, down and distance and yard line, read from the scoreboard and
    field markings, with yardage from field-line registration
- Move model calls out of the browser (the Tauri side holds the key).

**Phase 2: The pre-snap look in the coach's own vocabulary.**
- Fields: formation, personnel, backfield, QB alignment, offensive line
  strength and receiver alignment.
- Read from the pre-snap frame. Local detection supplies player positions and
  the line of scrimmage, and an LLM labels them against the coach's library.
- The prompt includes few-shot examples from the coach's own charted plays,
  plus agreement voting across models.
- Corrections become new examples (per-team learning).

**Phase 3: Post-snap.**
- Fields: play type, gap, result and yardage, and ball carrier and passer by
  jersey OCR checked against the season roster.

**Phase 4: Defense (research track).**
- Fields: front, coverage shell, blitz.
- Attempt only if Phases 0-2 show the film quality supports it. This is where
  Hudl IQ spends human analysts.

**Architecture recommendation (to confirm in Phase 0):**
- Hybrid. Local computer vision (detection, field registration, OCR) produces
  structure and keeps per-play cost near zero.
- Cloud LLMs (Claude or GPT, whichever measures better per field) reason over
  that structure plus a few frames.
- Sending film to the cloud is an explicit coach opt-in per season, as the
  existing AI-exchange item already requires.

**Where GridIron IQ can beat the field:**
- Publish measured accuracy per field to the coach.
- Suggest in the coach's own vocabulary, not a fixed vendor taxonomy.
- Learn from each team's corrections.
- Every suggestion is one click from its film.
- Offline and local by default; cloud by choice.
- Never overwrites charting.

## 4. Decisions needed from the coach

1. Which camera angles are typical: high sideline, end zone, or both? This
   decides which fields are feasible.
2. Whether film may go to a cloud model, and the budget per game.
3. Field priority. Proposed order: situation, run/pass and direction,
   formation, personnel, then the rest.
4. Approval to store suggestions alongside tags (a schema addition).
5. Approval to start Phase 0, which is read-only measurement.

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

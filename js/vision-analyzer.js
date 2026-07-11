/**
 * VisionAnalyzer — analyze football plays by sending key frames to
 * Claude's vision API. Replaces the heuristic centroid-tracking and
 * local YOLO server approaches with a single LLM call that actually
 * understands football.
 *
 * Usage:
 *   const va = new VisionAnalyzer({ apiKey: 'sk-ant-...' });
 *   const result = await va.analyzePlay(videoElement, startTime, endTime, teamCtx);
 *   // result = { tags: { formation, playType, ... }, confidence: {...}, reasons: {...} }
 *
 * Extracts 5 key frames (pre-snap, snap, early action, mid action, end),
 * encodes them as JPEG data URLs, and sends them to the Claude messages
 * API with a structured football-analysis prompt. Response is parsed into
 * the same { tags, confidence, reasons } shape the rest of the app expects.
 */
export class VisionAnalyzer {
  constructor(opts = {}) {
    this.apiKey = opts.apiKey || '';
    this.model = opts.model || 'claude-opus-4-8';   // opus-4-6 was retired → 404s
    this.maxFrames = opts.maxFrames || 8;
    this.jpegQuality = opts.jpegQuality || 0.92;
    this.maxDimension = opts.maxDimension || 1280;
    this.thinkingBudget = opts.thinkingBudget ?? 10000;
  }

  async analyzePlay(videoEl, start, end, teamCtx = {}) {
    if (!this.apiKey) throw new Error('No API key set');
    if (!videoEl?.duration) throw new Error('No video loaded');

    const wasPlaying = !videoEl.paused;
    if (wasPlaying) videoEl.pause();

    let frames;
    try {
      frames = await this._extractFrames(videoEl, start, end);
    } finally {
      if (wasPlaying) videoEl.play().catch(() => {});
    }
    if (frames.length === 0) throw new Error('Could not extract frames');

    const system = this._buildSystemPrompt(teamCtx);
    const content = this._buildContent(frames);

    const body = {
      model: this.model,
      max_tokens: 2048,
      system,
      messages: [{ role: 'user', content }],
    };
    if (this.thinkingBudget > 0) {
      body.thinking = { type: 'enabled', budget_tokens: this.thinkingBudget };
    } else {
      body.temperature = 0;
    }

    // Bound the request so a hung/slow model can't stall the whole scan forever
    // (the coach has no way to cancel an in-flight fetch otherwise). AbortError
    // propagates to the caller, which falls back to heuristics.
    const controller = new AbortController();
    this._activeController = controller;
    const timeout = setTimeout(() => controller.abort(), this.requestTimeoutMs || 120000);
    let response;
    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2025-04-15',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
      this._activeController = null;
    }

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${err.slice(0, 200)}`);
    }

    const json = await response.json();
    let text = '';
    let thinking = '';
    for (const block of (json.content || [])) {
      if (block.type === 'thinking') thinking = block.thinking || '';
      if (block.type === 'text') text = block.text || '';
    }
    return this._parseResponse(text, thinking);
  }

  async analyzePlays(plays, videoEl, teamCtx = {}) {
    const results = [];
    for (const play of plays) {
      const start = play.timestamp?.start ?? play.start;
      const end = play.timestamp?.end ?? play.end;
      try {
        const result = await this.analyzePlay(videoEl, start, end, teamCtx);
        results.push(result);
      } catch (e) {
        console.warn(`[FFA vision] play analysis failed:`, e);
        results.push({ tags: {}, confidence: {}, reasons: {}, extras: { error: e.message } });
      }
    }
    return results;
  }

  // ----- Frame extraction -----------------------------------------------

  async _extractFrames(videoEl, start, end) {
    const duration = end - start;
    if (duration <= 0) return [];
    const times = [
      start + duration * 0.03,  // pre-snap alignment
      start + duration * 0.08,  // pre-snap motion/shifts
      start + duration * 0.15,  // snap moment
      start + duration * 0.25,  // early post-snap
      start + duration * 0.40,  // play developing
      start + duration * 0.55,  // mid-play
      start + duration * 0.75,  // late action
      start + duration * 0.92,  // result
    ].slice(0, this.maxFrames);

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const frames = [];

    for (const t of times) {
      try {
        await this._seekTo(videoEl, Math.min(t, end - 0.1));
        const { w, h } = this._fitDimensions(videoEl.videoWidth, videoEl.videoHeight);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(videoEl, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', this.jpegQuality);
        const base64 = dataUrl.split(',')[1];
        frames.push({ base64, mediaType: 'image/jpeg' });
      } catch (e) {
        console.warn(`[FFA vision] frame extract at ${t.toFixed(1)}s failed:`, e);
      }
    }
    return frames;
  }

  _seekTo(videoEl, time) {
    return new Promise((resolve, reject) => {
      if (Math.abs(videoEl.currentTime - time) < 0.05) return resolve();
      const timeout = setTimeout(() => reject(new Error('seek timeout')), 3000);
      const onSeeked = () => {
        clearTimeout(timeout);
        videoEl.removeEventListener('seeked', onSeeked);
        resolve();
      };
      videoEl.addEventListener('seeked', onSeeked);
      videoEl.currentTime = time;
    });
  }

  _fitDimensions(w, h) {
    const max = this.maxDimension;
    if (w <= max && h <= max) return { w, h };
    const scale = Math.min(max / w, max / h);
    return { w: Math.round(w * scale), h: Math.round(h * scale) };
  }

  // ----- Prompt construction --------------------------------------------

  _buildSystemPrompt(teamCtx) {
    const parts = [
      'You are an elite football film analyst with decades of experience at the collegiate and NFL level.',
      'You specialize in reading game film from all camera angles: sideline, endzone, broadcast, All-22, and coach\'s film.',
    ];
    if (teamCtx.jerseyColor) parts.push(`Our team wears ${teamCtx.jerseyColor} jerseys.`);
    if (teamCtx.perspective === 'defense') parts.push('We are analyzing our DEFENSE.');
    else if (teamCtx.perspective === 'special') parts.push('This is a special teams play.');
    else parts.push('We are analyzing our OFFENSE.');
    if (teamCtx.direction) parts.push(`Our team is going ${teamCtx.direction === 'right' ? 'left to right' : 'right to left'}.`);

    parts.push(`
ANALYSIS METHOD — follow this sequence carefully using the provided frames:

1. PRE-SNAP READ (earliest frames):
   - Find the offensive line: 5 players in stance at the line of scrimmage, usually the largest players clustered together. The center is the one over the ball.
   - QB position relative to center: hands under center = "Under Center"; standing 4-5 yards back = "Shotgun"; ~3 yards directly behind center = "Pistol".
   - Count running backs (RBs): players in the backfield near or behind the QB, NOT split wide.
   - Count tight ends (TEs): larger players lined up on or just off the line, tight to the offensive tackles.
   - Count wide receivers (WRs): players split wide toward the sidelines.
   - Personnel = (#RBs)(#TEs): 1 RB + 1 TE = "11"; 1 RB + 2 TE = "12"; 2 RB + 1 TE = "21"; etc.
   - Formation: "Empty" = 0 RBs in backfield; "I-Form" = QB under center with FB ahead of TB; "Singleback" = 1 RB, QB under center, no fullback; "Split Back" = 2 RBs side by side behind QB; "Single Wing" = unbalanced line, direct snap to wingback; "Wildcat" = direct snap to non-QB.

2. DEFENSIVE READ (pre-snap and early frames):
   - Count down linemen (DL): players in 3- or 4-point stance at the line. Count standing linebackers (LBs) behind them.
   - 4 DL + 3 LBs = "4-3"; 3 DL + 4 LBs = "3-4"; 4 DL + 2 LBs + 5 DBs = "4-2-5"; 4 DL + 2 LB + 5 DBs = "Nickel"; 6+ DBs = "Dime".
   - Safety alignment: one deep safety = likely Cover 1 or Cover 3; two deep safeties = Cover 2 or Cover 4.
   - Man vs zone: DBs pressed/shadowing individual receivers = "Man"; DBs in off-coverage at landmark spots = "Zone".
   - Blitz: more than 4 players rushing the QB; "A-Gap" = between center and guard; "B-Gap" = between guard and tackle; "Edge" = outside the tackle; "DB Blitz" = a defensive back rushes.

3. PLAY TYPE (post-snap frames — this is CRITICAL, look carefully):
   - RUN tells: offensive linemen fire forward aggressively, double-team blocks, QB hands the ball to a RB or keeps it himself. "Run Inside" = ball carrier goes between the tackles. "Run Outside" = ball carrier bounces outside the tackle/end.
   - PASS tells: offensive linemen kick-step backward into pass protection, QB drops back or stands in pocket, then throws. "Short Pass" = 0-10 yards downfield. "Medium Pass" = 10-20 yards. "Deep Pass" = 20+ yards.
   - "Screen": OL initially pass-sets then releases downfield to block, quick throw to RB or WR at or behind the line of scrimmage.
   - "Play Action": QB fakes a handoff to a RB (watch for the fake/mesh point), then drops back to pass.
   - "RPO": Read-Pass Option — the RB takes a handoff path while the QB reads a defender to decide run or pass; OL run-blocks.

4. RESULT (late/final frames — look carefully at where the play ends):
   - "Gain" = ball carrier advances past the line of scrimmage; "Loss" = tackled behind the line; "No Gain" = stopped at the line.
   - "Incomplete" = a pass hits the ground or is dropped; "Sack" = QB tackled behind the line on a pass play.
   - "Touchdown" = ball carrier reaches the end zone.
   - Estimate yardage by counting yard markers if visible, or by player body lengths (~1 yard each) from the line of scrimmage to where the play ends.

5. FIELD POSITION & SCOREBOARD:
   - Look for yard numbers painted on the field (10, 20, 30, 40, 50) to determine yardLine.
   - "hash": where the ball is spotted — "Left" hash, "Middle" of field, or "Right" hash.
   - Only fill down, distance, quarter if CLEARLY visible on a scoreboard overlay or field graphic. Do NOT guess these.

Return ONLY valid JSON with these fields (use ONLY the listed enum values, or "" if you cannot determine):

{
  "formation": "Shotgun"|"Under Center"|"Pistol"|"I-Form"|"Singleback"|"Split Back"|"Single Wing"|"Empty"|"Wildcat"|"Goal Line"|"",
  "personnel": "00"|"10"|"11"|"12"|"13"|"20"|"21"|"22"|"23"|"Jumbo"|"Goal Line"|"",
  "playType": "Run Inside"|"Run Outside"|"Screen"|"Short Pass"|"Medium Pass"|"Deep Pass"|"Play Action"|"RPO"|"Trick Play"|"",
  "result": "Gain"|"Loss"|"No Gain"|"Incomplete"|"Interception"|"Touchdown"|"Sack"|"Fumble"|"Penalty"|"Punt"|"Field Goal"|"Good"|"No Good"|"Kneel"|"Spike"|"",
  "yardage": integer or "",
  "hash": "Left"|"Middle"|"Right"|"",
  "defFront": "4-3"|"3-4"|"4-2-5"|"Nickel"|"Dime"|"Quarter"|"4-6"|"",
  "coverage": "Cover 0"|"Cover 1"|"Cover 2"|"Cover 3"|"Cover 4"|"Cover 6"|"Man"|"Zone"|"",
  "blitz": ""|"A-Gap"|"B-Gap"|"Edge"|"DB Blitz"|"Zone Blitz",
  "fieldSide": "own"|"opp"|"",
  "yardLine": 1-50 or "",
  "down": "1"|"2"|"3"|"4"|"",
  "distance": integer or "",
  "quarter": "Q1"|"Q2"|"Q3"|"Q4"|"OT"|"",
  "confidence": { same keys, values 0.0-1.0 },
  "reasons": { same keys, 1-sentence explanation of what you SAW that supports each call }
}

IMPORTANT:
- Use "" for anything you cannot confidently determine. Leaving a field blank is better than guessing wrong.
- Base every call on what you can ACTUALLY SEE in the frames. Do not assume or infer from typical tendencies.
- Pay close attention to distinguishing run vs. pass — look at OL technique (fire out = run, kick back = pass).
- No text outside the JSON.`);

    return parts.join(' ');
  }

  _buildContent(frames) {
    const content = [];
    const labels = [
      'Pre-snap alignment (read formation & personnel)',
      'Pre-snap motion/shifts',
      'Snap moment',
      'Early post-snap (OL technique: fire-out=run, kick-back=pass)',
      'Play developing',
      'Mid-play action',
      'Late action',
      'Result / end of play',
    ];
    for (let i = 0; i < frames.length; i++) {
      content.push({
        type: 'text',
        text: `Frame ${i + 1}/${frames.length} — ${labels[i] || 'Frame'}:`,
      });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: frames[i].mediaType,
          data: frames[i].base64,
        },
      });
    }
    content.push({ type: 'text', text: 'Analyze these frames following the methodology. Return only the JSON object.' });
    return content;
  }

  // ----- Response parsing -----------------------------------------------

  /**
   * Allowed values for each enum field — must match the <option> values in
   * index.html exactly. Any value Claude returns that isn't in this set is
   * dropped, because assigning an unknown value to a <select> silently
   * fails (the dropdown shows blank) while still polluting play.tags and,
   * downstream, the stats engine and CSV export.
   */
  static get ALLOWED() {
    return {
      formation: ['Shotgun', 'Under Center', 'Pistol', 'I-Form', 'Singleback', 'Split Back', 'Single Wing', 'Empty', 'Wildcat', 'Goal Line', 'Wing-T', 'Flexbone', 'Double Wing', 'Power-I', 'Bunch', 'Unbalanced'],
      personnel: ['00', '10', '11', '12', '13', '20', '21', '22', '23', 'Jumbo', 'Goal Line'],
      playType: ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Play Action', 'RPO', 'Trick Play'],
      result: ['Gain', 'Loss', 'No Gain', 'Incomplete', 'Interception', 'Touchdown', 'Sack', 'Fumble', 'Penalty', 'Punt', 'Field Goal', 'Good', 'No Good', 'Kneel', 'Spike'],
      hash: ['Left', 'Middle', 'Right'],
      defFront: ['4-3', '3-4', '4-4', '5-2', '3-3-5', '4-2-5', 'Nickel', 'Dime', 'Quarter', '4-6'],
      coverage: ['Cover 0', 'Cover 1', 'Cover 2', 'Cover 3', 'Cover 4', 'Cover 6', 'Man', 'Zone'],
      blitz: ['A-Gap', 'B-Gap', 'Edge', 'DB Blitz', 'Zone Blitz'],
      fieldSide: ['own', 'opp'],
      down: ['1', '2', '3', '4'],
      quarter: ['Q1', 'Q2', 'Q3', 'Q4', 'OT'],
    };
  }

  _parseResponse(text, thinking = '') {
    let jsonStr = text;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1];
    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn('[FFA vision] could not parse response as JSON:', text.slice(0, 500));
      return { tags: {}, confidence: {}, reasons: {}, extras: { rawResponse: text, thinking } };
    }

    const confidence = parsed.confidence || {};
    const reasons = parsed.reasons || {};
    const allowed = VisionAnalyzer.ALLOWED;
    const numericFields = new Set(['yardage', 'yardLine', 'distance']);

    const tags = {};
    const tagFields = [
      'formation', 'personnel', 'playType', 'result', 'yardage',
      'hash', 'defFront', 'coverage', 'blitz',
      'fieldSide', 'yardLine', 'down', 'distance', 'quarter',
    ];
    const dropped = [];
    for (const k of tagFields) {
      let v = parsed[k];
      if (v === undefined || v === null || v === '') continue;
      // Blitz "None" is the model's way of saying "no blitz" → empty field.
      if (k === 'blitz' && v === 'None') continue;

      if (numericFields.has(k)) {
        const n = Math.round(Number(v));
        if (Number.isFinite(n)) tags[k] = String(n);
        continue;
      }

      const enumValues = allowed[k];
      if (enumValues) {
        // Exact match wins; otherwise try a case/format-insensitive match
        // before giving up, so "cover 2" or "i form" still resolve.
        const exact = enumValues.find(opt => opt === String(v));
        const fuzzy = exact || enumValues.find(opt =>
          opt.toLowerCase().replace(/[\s-]/g, '') === String(v).toLowerCase().replace(/[\s-]/g, ''));
        if (fuzzy) tags[k] = fuzzy;
        else dropped.push(`${k}="${v}"`);
        continue;
      }

      tags[k] = String(v);
    }
    if (dropped.length) {
      console.warn('[FFA vision] dropped non-matching values:', dropped.join(', '));
    }

    return { tags, confidence, reasons, extras: { model: this.model, thinking } };
  }
}

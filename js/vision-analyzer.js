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
    this.model = opts.model || 'claude-sonnet-4-6';
    this.maxFrames = opts.maxFrames || 5;
    this.jpegQuality = opts.jpegQuality || 0.75;
    this.maxDimension = opts.maxDimension || 720;
  }

  async analyzePlay(videoEl, start, end, teamCtx = {}) {
    if (!this.apiKey) throw new Error('No API key set');
    if (!videoEl?.duration) throw new Error('No video loaded');

    const frames = await this._extractFrames(videoEl, start, end);
    if (frames.length === 0) throw new Error('Could not extract frames');

    const prompt = this._buildPrompt(teamCtx);
    const content = this._buildContent(frames, prompt);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content }],
      }),
    });

    if (!response.ok) {
      const err = await response.text().catch(() => '');
      throw new Error(`API ${response.status}: ${err.slice(0, 200)}`);
    }

    const json = await response.json();
    const text = json.content?.[0]?.text || '';
    return this._parseResponse(text);
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
    // 5 timestamps: pre-snap, snap, early, mid, end
    const times = [
      start + duration * 0.05,  // pre-snap alignment
      start + duration * 0.15,  // just after snap
      start + duration * 0.35,  // early action
      start + duration * 0.60,  // mid play
      start + duration * 0.90,  // result
    ];

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

  _buildPrompt(teamCtx) {
    const jersey = teamCtx.jerseyColor ? `Our team wears ${teamCtx.jerseyColor} jerseys.` : '';
    const perspective = teamCtx.perspective === 'defense'
      ? 'We are analyzing our DEFENSE on this play.'
      : teamCtx.perspective === 'special'
        ? 'This is a special teams play.'
        : 'We are analyzing our OFFENSE on this play.';
    const direction = teamCtx.direction
      ? `Our team is going ${teamCtx.direction === 'right' ? 'left to right' : 'right to left'}.`
      : 'Determine which direction our team is going from the film.';

    return `You are an expert football film analyst. Analyze these 5 frames from a single play (pre-snap, snap, early action, mid-play, result).

${jersey} ${perspective} ${direction}

Return ONLY a JSON object with these exact fields. Use ONLY the allowed values listed. Leave a field as empty string "" if you genuinely cannot determine it.

{
  "formation": one of: "Shotgun", "Under Center", "Pistol", "I-Form", "Singleback", "Empty", "Wildcat", "Goal Line", ""
  "personnel": one of: "00", "10", "11", "12", "13", "20", "21", "22", "23", "Jumbo", "Goal Line", ""
  "playType": one of: "Run Inside", "Run Outside", "Screen", "Short Pass", "Medium Pass", "Deep Pass", "Play Action", "RPO", "Trick Play", ""
  "result": one of: "Gain", "Loss", "No Gain", "Incomplete", "Interception", "Touchdown", "Sack", "Fumble", "Penalty", "Punt", "Field Goal", "Kneel", "Spike", ""
  "yardage": integer yards gained (negative for loss), or ""
  "hash": one of: "Left", "Middle", "Right", "" (where is the ball spotted relative to hash marks)
  "direction": one of: "Left", "Middle", "Right", "" (which direction did the play go)
  "defFront": one of: "4-3", "3-4", "Nickel", "Dime", "Quarter", "4-6", ""
  "coverage": one of: "Cover 0", "Cover 1", "Cover 2", "Cover 3", "Cover 4", "Cover 6", "Man", "Zone", ""
  "blitz": one of: "None", "A-Gap", "B-Gap", "Edge", "DB Blitz", "Zone Blitz"
  "fieldSide": one of: "own", "opp", ""
  "yardLine": approximate yard line number (1-50) or ""
  "down": one of: "1", "2", "3", "4", "" (only if visible on scoreboard)
  "distance": yards to go (only if visible on scoreboard) or ""
  "quarter": one of: "Q1", "Q2", "Q3", "Q4", "OT", "" (only if visible on scoreboard)
  "confidence": object with the same keys, each a number 0.0 to 1.0
  "reasons": object with the same keys, each a short explanation string
}

Be precise. For yardage, estimate from player movement between frames. For formation and personnel, look at the pre-snap frame carefully. For result, look at the final frame. Only fill in scoreboard fields (down, distance, quarter) if they are clearly visible. Return ONLY the JSON, no other text.`;
  }

  _buildContent(frames, prompt) {
    const content = [];
    const labels = ['Pre-snap', 'Snap', 'Early action', 'Mid-play', 'Result'];
    for (let i = 0; i < frames.length; i++) {
      content.push({
        type: 'text',
        text: `Frame ${i + 1} — ${labels[i] || 'Frame'}:`,
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
    content.push({ type: 'text', text: prompt });
    return content;
  }

  // ----- Response parsing -----------------------------------------------

  _parseResponse(text) {
    // Extract JSON from the response (handle markdown code blocks)
    let jsonStr = text;
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) jsonStr = fenced[1];
    jsonStr = jsonStr.trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.warn('[FFA vision] could not parse response as JSON:', text.slice(0, 500));
      return { tags: {}, confidence: {}, reasons: {}, extras: { rawResponse: text } };
    }

    const confidence = parsed.confidence || {};
    const reasons = parsed.reasons || {};

    const tags = {};
    const tagFields = [
      'formation', 'personnel', 'playType', 'result', 'yardage',
      'hash', 'defFront', 'coverage', 'blitz',
      'fieldSide', 'yardLine', 'down', 'distance', 'quarter',
    ];
    for (const k of tagFields) {
      const v = parsed[k];
      if (v !== undefined && v !== null && v !== '') {
        tags[k] = String(v);
      }
    }

    // Map "direction" to hash if hash wasn't provided directly
    if (!tags.hash && parsed.direction) {
      // Don't overwrite hash with direction — they're different concepts
    }

    return { tags, confidence, reasons, extras: { model: this.model } };
  }
}

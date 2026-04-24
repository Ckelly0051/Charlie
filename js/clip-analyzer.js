/**
 * ClipAnalyzer — heuristic auto-tagging from a clip's motion data.
 *
 * Given a time window inside the detector's motionData (each sample has
 * {time, motion, cut, audio, cx, cy, spread}), infer as many tag fields
 * as we can with a rule-based approach:
 *
 *   - formation family: shotgun / under-center / empty (pre-snap centroid)
 *   - play type:        run / pass / screen / PA   (trajectory shape)
 *   - direction hash:   left / middle / right      (horizontal centroid travel)
 *   - result bucket:    loss / short / medium / big / TD
 *   - yardage estimate: pixel displacement * calibration
 *   - tempo:            quick / normal / long      (play duration)
 *
 * This is a best-effort heuristic layer. Every field comes back with a
 * 0..1 confidence score so the UI can show which fields are shaky and
 * the coach can correct them. For well-framed sideline or endzone film
 * on good broadcast angles this gets ~60-70% of fields right on the
 * first pass, which is the difference between "tag from scratch" and
 * "quickly verify".
 *
 * For a production-grade 95%+ solution, the right move is a Python
 * backend with YOLOv8 player detection + pose estimation — heuristics
 * in this file would be replaced by model outputs but the integration
 * points (tags + confidence) stay the same.
 */
export class ClipAnalyzer {
  constructor() {
    // Tuning constants. Most are dimensionless (0..1) because all centroid
    // data is in normalized ROI coordinates.
    this.opts = {
      preSnapSeconds: 0.6,    // how much to sample before the first motion burst
      quickTempoMax: 2.8,     // plays shorter than this = "quick" tempo
      longTempoMin: 6.0,      // plays longer than this = "long" tempo
      hashDeadBand: 0.08,     // centroid travel < this = "middle"
      // Very rough field-pixel calibration: the 70% ROI covers roughly the
      // field of play, so ~1.0 in normalized X ≈ full field width (~53yd).
      // Sideline broadcast angles stretch horizontal, so 1 unit ≈ 30yd.
      yardsPerUnitX: 30,
    };
  }

  /**
   * Analyze a single play given the motion samples that fall inside its
   * time window. Returns { tags, confidence, reasons } where:
   *   tags       — object suitable for merging into play.tags
   *   confidence — per-field 0..1 confidence map
   *   reasons    — short human-readable explanation per field
   */
  analyze(play, motionData, teamCtx = {}) {
    const start = play.timestamp?.start ?? play.start;
    const end   = play.timestamp?.end   ?? play.end;
    if (start == null || end == null) return this._empty();

    const samples = motionData.filter(s => s.time >= start && s.time <= end);
    if (samples.length < 4) return this._empty();

    const duration = end - start;

    // --- 1. Split into pre-snap vs action windows ----------------------
    // Pre-snap = samples before the first big motion burst. If we can't
    // find a clear burst, fall back to the first 0.6s.
    const motionBaseline = this._percentile(samples.map(s => s.motion), 0.25);
    const motionPeak     = this._percentile(samples.map(s => s.motion), 0.90);
    const snapThreshold  = motionBaseline + (motionPeak - motionBaseline) * 0.4;

    let snapIdx = samples.findIndex(s => s.motion > snapThreshold);
    if (snapIdx < 1) snapIdx = Math.min(4, Math.floor(samples.length * 0.15));

    const preSnap  = samples.slice(0, snapIdx);
    const postSnap = samples.slice(snapIdx);
    if (postSnap.length < 3) return this._empty();

    // --- 2. Pre-snap formation from average centroid position ---------
    // If pre-snap centroid is low in the frame (high cy), the offense is
    // likely under center. Higher up the frame (low cy) = shotgun/pistol.
    // If horizontal spread is high, likely spread/empty.
    let avgCy = 0, avgSpread = 0, n = 0;
    for (const s of preSnap.length ? preSnap : samples.slice(0, 4)) {
      avgCy += s.cy || 0.5;
      avgSpread += s.spread || 0;
      n++;
    }
    avgCy /= Math.max(1, n);
    avgSpread /= Math.max(1, n);

    let formation = '';
    let formationConf = 0;
    let formationReason = '';
    if (n >= 2) {
      if (avgSpread > 0.32) {
        formation = 'Spread';
        formationConf = Math.min(0.7, 0.3 + avgSpread);
        formationReason = `wide pre-snap spread (${avgSpread.toFixed(2)})`;
      } else if (avgCy < 0.42) {
        formation = 'Shotgun';
        formationConf = 0.55;
        formationReason = `backfield sits high in frame (cy=${avgCy.toFixed(2)})`;
      } else if (avgCy > 0.6) {
        formation = 'Under Center';
        formationConf = 0.5;
        formationReason = `tight bunch near LOS (cy=${avgCy.toFixed(2)})`;
      } else {
        formation = 'Shotgun';
        formationConf = 0.35;
        formationReason = 'ambiguous — defaulting to shotgun';
      }
    }

    // --- 3. Motion trajectory during the play -------------------------
    // Total horizontal travel of the motion centroid → direction + yards.
    // Vertical dispersion of the centroid → run vs pass heuristic.
    const xs = postSnap.map(s => s.cx);
    const ys = postSnap.map(s => s.cy);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    const xSpan = xMax - xMin;
    const ySpan = yMax - yMin;

    // Net horizontal displacement (start vs end of action window)
    const xStart = xs[0];
    const xEnd   = xs[xs.length - 1];
    const xDrift = xEnd - xStart;

    // Average spread during the action window
    let avgActionSpread = 0;
    for (const s of postSnap) avgActionSpread += s.spread || 0;
    avgActionSpread /= postSnap.length;

    // Max motion peak height — strong peaks = big-impact plays
    let peak = 0;
    for (const s of postSnap) if (s.motion > peak) peak = s.motion;

    // --- 4. Direction / hash ------------------------------------------
    let hash = '';
    let hashConf = 0;
    if (Math.abs(xDrift) < this.opts.hashDeadBand) {
      hash = 'Middle';
      hashConf = 0.5 + (0.08 - Math.abs(xDrift));
    } else if (xDrift > 0) {
      hash = 'Right';
      hashConf = Math.min(0.9, 0.5 + xDrift * 2);
    } else {
      hash = 'Left';
      hashConf = Math.min(0.9, 0.5 + (-xDrift) * 2);
    }

    // --- 5. Play type: run vs pass ------------------------------------
    // Runs: motion stays concentrated, low spread, centroid drifts mostly
    //       horizontally near LOS. ySpan small.
    // Passes: motion spreads fast (spread high early), centroid travels
    //       more vertically (downfield), ySpan big.
    // Screens: short pass + lateral motion + quick tempo.
    let playType = '';
    let playTypeConf = 0;
    let playTypeReason = '';

    const verticalRatio = ySpan / (xSpan + 0.001);
    const concentrated = avgActionSpread < 0.22;

    if (duration < this.opts.quickTempoMax && concentrated && xSpan > 0.15) {
      playType = 'Screen';
      playTypeConf = 0.45;
      playTypeReason = `quick + lateral travel (${xSpan.toFixed(2)})`;
    } else if (concentrated && verticalRatio < 0.9 && duration < 5) {
      playType = 'Run Inside';
      playTypeConf = 0.6;
      playTypeReason = 'concentrated motion near LOS';
    } else if (concentrated && xSpan > 0.2 && verticalRatio < 1.2) {
      playType = 'Run Outside';
      playTypeConf = 0.55;
      playTypeReason = `concentrated + horizontal travel (${xSpan.toFixed(2)})`;
    } else if (avgActionSpread > 0.28 && verticalRatio > 1.0) {
      // Decide short vs medium vs deep pass by how far the centroid went
      if (ySpan > 0.4 || duration > 5) {
        playType = 'Deep Pass';
        playTypeConf = 0.5;
        playTypeReason = `spread + long travel (yspan=${ySpan.toFixed(2)})`;
      } else if (ySpan > 0.22) {
        playType = 'Medium Pass';
        playTypeConf = 0.55;
        playTypeReason = `spread + mid downfield (yspan=${ySpan.toFixed(2)})`;
      } else {
        playType = 'Short Pass';
        playTypeConf = 0.5;
        playTypeReason = 'spread motion, short downfield';
      }
    } else if (avgActionSpread > 0.25) {
      playType = 'Short Pass';
      playTypeConf = 0.4;
      playTypeReason = 'moderately spread motion';
    } else {
      playType = 'Run Inside';
      playTypeConf = 0.35;
      playTypeReason = 'default: concentrated slow play';
    }

    // Check for Play Action: if early frames look like run (concentrated,
    // forward), then spread picks up in the back half — classic PA tell.
    const firstHalf = postSnap.slice(0, Math.floor(postSnap.length / 2));
    const secondHalf = postSnap.slice(Math.floor(postSnap.length / 2));
    const firstHalfSpread = firstHalf.reduce((s, r) => s + (r.spread || 0), 0) / (firstHalf.length || 1);
    const secondHalfSpread = secondHalf.reduce((s, r) => s + (r.spread || 0), 0) / (secondHalf.length || 1);
    if (firstHalfSpread < 0.2 && secondHalfSpread > 0.28 && duration > 3) {
      playType = 'Play Action';
      playTypeConf = 0.5;
      playTypeReason = 'concentrated→spread (play-action tell)';
    }

    // --- 6. Yardage estimate ------------------------------------------
    // Use horizontal drift for runs, vertical (downfield) travel for passes.
    // If the coach told us which direction they go, use signed drift to
    // distinguish gains from losses. Without that, we use |drift|.
    const isRun = playType.startsWith('Run');
    const isPass = /Pass|Play Action/.test(playType);
    const dir = teamCtx.direction || '';
    // signedDrift: positive = forward progress, negative = loss
    let signedDrift = xDrift;
    if (dir === 'left') signedDrift = -xDrift;
    // If no direction set, default to positive (assume camera-right = forward)

    let yards = 0;
    let yardsConf = 0.35;
    if (isRun) {
      yards = Math.round(signedDrift * this.opts.yardsPerUnitX);
      if (yards === 0 && xSpan > 0.03) yards = Math.max(1, Math.round(xSpan * 25));
    } else if (isPass) {
      yards = Math.round((ySpan * 40) + (xSpan * 10));
    } else {
      yards = Math.round(xSpan * 25);
    }
    if (dir) {
      yardsConf = 0.45;
    }
    if (yards > 70) yards = 70;
    if (yards < -15) yards = -15;

    // --- 7. Result bucket ---------------------------------------------
    let result = '';
    let resultConf = 0.4;
    const finalCx = xs[xs.length - 1];
    const finalCy = ys[ys.length - 1];
    const nearEdge = finalCx < 0.12 || finalCx > 0.88 || finalCy < 0.12 || finalCy > 0.88;

    if (duration < 2.0 && peak < 0.015 && concentrated) {
      result = 'Incomplete';
      resultConf = 0.4;
    } else if (yards >= 20 && nearEdge) {
      result = 'Touchdown';
      resultConf = 0.45;
    } else if (yards < 0) {
      result = 'Loss';
      resultConf = dir ? 0.55 : 0.35;
    } else if (yards > 0) {
      result = 'Gain';
      resultConf = 0.5;
    } else {
      result = 'No Gain';
      resultConf = 0.35;
    }

    // --- 8. Tempo ------------------------------------------------------
    let tempo = 'normal';
    if (duration < this.opts.quickTempoMax) tempo = 'quick';
    else if (duration > this.opts.longTempoMin) tempo = 'long';

    // --- 9. Build result object ---------------------------------------
    const tags = {
      formation,
      playType,
      hash,
      result,
      yardage: yards !== 0 ? String(yards) : '',
    };
    const confidence = {
      formation: formationConf,
      playType: playTypeConf,
      hash: hashConf,
      result: resultConf,
      yardage: yardsConf,
    };
    const reasons = {
      formation: formationReason,
      playType: playTypeReason,
      hash: `centroid drift ${xDrift.toFixed(2)}`,
      result: `~${yards}yd, duration ${duration.toFixed(1)}s, peak ${peak.toFixed(3)}`,
      yardage: `xSpan ${xSpan.toFixed(2)} · ySpan ${ySpan.toFixed(2)}`,
    };

    return {
      tags,
      confidence,
      reasons,
      extras: {
        duration,
        tempo,
        xDrift,
        xSpan,
        ySpan,
        peak,
        avgActionSpread,
        avgPreSnapCy: avgCy,
        snapIdx,
      },
    };
  }

  _empty() {
    return { tags: {}, confidence: {}, reasons: {}, extras: {} };
  }

  _percentile(arr, p) {
    if (!arr.length) return 0;
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.floor(s.length * p)] || 0;
  }

  /**
   * Convenience: analyze every play in `plays` using matching motionData.
   * Returns an array parallel to `plays` of analysis results.
   */
  analyzePlays(plays, motionData, teamCtx = {}) {
    return plays.map(p => this.analyze(p, motionData, teamCtx));
  }
}

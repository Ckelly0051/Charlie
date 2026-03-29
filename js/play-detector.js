/**
 * PlayDetector - Automatically detects play start/end using frame-differencing motion analysis.
 *
 * How it works:
 * 1. Scans the video by seeking frame-by-frame at a configurable sample rate
 * 2. Captures each frame to an offscreen canvas and computes pixel differences
 * 3. Builds a motion intensity curve over time
 * 4. Detects plays by finding motion spikes (snap) followed by motion drops (whistle)
 *
 * The motion signal is smoothed, then a threshold is applied:
 *   - Rising edge above threshold = play start (snap / burst of motion)
 *   - Falling edge below threshold = play end (players resetting)
 */
export class PlayDetector {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.listeners = {};

    // Detection parameters (user-tunable)
    this.sampleInterval = 0.2;   // seconds between sampled frames
    this.motionThreshold = 0.35; // 0-1, fraction of max motion to trigger play
    this.minPlayDuration = 2.0;  // seconds — ignore plays shorter than this
    this.maxPlayDuration = 30.0; // seconds — force-end plays longer than this
    this.cooldownAfterEnd = 3.0; // seconds to wait after play end before detecting next
    this.smoothingWindow = 3;    // number of samples to average for smoothing

    this.isScanning = false;
    this.scanProgress = 0;
    this.motionData = [];        // { time, motion } pairs
    this.detectedPlays = [];

    this._offscreen = document.createElement('canvas');
    this._offCtx = this._offscreen.getContext('2d', { willReadFrequently: true });
    this._prevFrameData = null;
  }

  /**
   * Scan the entire video (or a range) to build a motion profile.
   * Returns a promise that resolves with detected plays.
   */
  async scan(startTime = 0, endTime = null) {
    const video = this.vc.videoElement;
    if (!video.duration) throw new Error('No video loaded');

    const end = endTime || video.duration;
    const wasPlaying = !video.paused;
    if (wasPlaying) video.pause();

    this.isScanning = true;
    this.motionData = [];
    this._prevFrameData = null;

    // Set offscreen canvas to a small size for performance (motion detection
    // doesn't need full resolution)
    const sampleW = 160;
    const sampleH = Math.round(sampleW * (video.videoHeight / video.videoWidth)) || 90;
    this._offscreen.width = sampleW;
    this._offscreen.height = sampleH;

    const totalSamples = Math.ceil((end - startTime) / this.sampleInterval);

    this._emit('scan-start', { totalSamples });

    for (let t = startTime; t < end; t += this.sampleInterval) {
      if (!this.isScanning) break; // allow cancellation

      // Seek to time and wait for the frame to be ready
      await this._seekAndWait(video, t);

      // Capture the frame
      this._offCtx.drawImage(video, 0, 0, sampleW, sampleH);
      const imageData = this._offCtx.getImageData(0, 0, sampleW, sampleH);
      const motion = this._computeMotion(imageData.data);

      this.motionData.push({ time: t, motion });

      this.scanProgress = (t - startTime) / (end - startTime);
      this._emit('scan-progress', { progress: this.scanProgress, time: t, motion });
    }

    this.isScanning = false;
    this.scanProgress = 1;

    // Analyze the motion curve to find plays
    this.detectedPlays = this._detectPlays();

    this._emit('scan-complete', { plays: this.detectedPlays, motionData: this.motionData });

    return this.detectedPlays;
  }

  cancelScan() {
    this.isScanning = false;
  }

  /**
   * Apply detected plays to the PlayTagger (creates actual play entries).
   * Works for both single-video mode and multi-clip mode.
   */
  applyDetectedPlays() {
    let added = 0;
    for (const dp of this.detectedPlays) {
      // Check for overlap with existing plays (only non-clip plays)
      const overlaps = this.tagger.plays.some(p =>
        !p.clipId && dp.start < p.timestamp.end && dp.end > p.timestamp.start
      );
      if (overlaps) continue;

      this.tagger.pendingStart = dp.start;
      // Temporarily set video time to end so markEnd records it
      const origTime = this.vc.currentTime;
      this.vc.videoElement.currentTime = dp.end;
      this.tagger.markEnd();
      this.vc.videoElement.currentTime = origTime;
      added++;
    }

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this.tagger.updateScrubBarPlays();

    return added;
  }

  /**
   * Scan all clips in a playlist to detect the active play window within each.
   * Updates each clip's associated play entry with refined start/end times.
   *
   * For play-by-play clips, the typical pattern is:
   *   [idle/huddle] -> [snap: motion spike] -> [play action] -> [whistle: motion drops] -> [idle]
   *
   * This trims each clip's play to just the action window.
   */
  async scanClips(playlistManager) {
    if (!playlistManager || !playlistManager.hasClips) {
      throw new Error('No clips loaded');
    }

    this.isScanning = true;
    const totalClips = playlistManager.clips.length;
    const allResults = [];

    this._emit('scan-start', { totalSamples: totalClips });

    for (let ci = 0; ci < totalClips; ci++) {
      if (!this.isScanning) break;

      const clip = playlistManager.clips[ci];

      this._emit('scan-progress', {
        progress: ci / totalClips,
        time: 0,
        motion: 0,
        clipIndex: ci,
        clipName: clip.name
      });

      // Load the clip into a temporary video element
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'auto';
      const url = URL.createObjectURL(clip.file);
      tempVideo.src = url;

      try {
        await new Promise((resolve, reject) => {
          tempVideo.addEventListener('loadedmetadata', resolve);
          tempVideo.addEventListener('error', reject);
        });

        // Scan this clip's frames
        const clipMotion = await this._scanVideo(tempVideo);
        const detected = this._detectPlaysFromMotion(clipMotion);

        // Update the associated play's timestamps
        const play = this.tagger.getPlay(clip.playId);
        if (play && detected.length > 0) {
          // Use the first (and usually only) detected play window
          play.timestamp.start = detected[0].start;
          play.timestamp.end = Math.min(detected[0].end, tempVideo.duration);
        }

        allResults.push({
          clipId: clip.id,
          clipName: clip.name,
          motionData: clipMotion,
          detected: detected,
          duration: tempVideo.duration
        });
      } catch (e) {
        // Skip clips that fail to load
        allResults.push({
          clipId: clip.id,
          clipName: clip.name,
          motionData: [],
          detected: [],
          error: e.message
        });
      } finally {
        URL.revokeObjectURL(url);
        tempVideo.src = '';
      }
    }

    this.isScanning = false;
    this.scanProgress = 1;

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();

    this._emit('clips-scan-complete', { results: allResults });
    return allResults;
  }

  /**
   * Scan a video element's frames and return motion data.
   */
  async _scanVideo(video) {
    const sampleW = 160;
    const sampleH = Math.round(sampleW * (video.videoHeight / video.videoWidth)) || 90;
    this._offscreen.width = sampleW;
    this._offscreen.height = sampleH;
    this._prevFrameData = null;

    const motionData = [];

    for (let t = 0; t < video.duration; t += this.sampleInterval) {
      if (!this.isScanning) break;

      await this._seekAndWait(video, t);
      this._offCtx.drawImage(video, 0, 0, sampleW, sampleH);
      const imageData = this._offCtx.getImageData(0, 0, sampleW, sampleH);
      const motion = this._computeMotion(imageData.data);
      motionData.push({ time: t, motion });
    }

    return motionData;
  }

  /**
   * Detect plays from a given motion data array (used for per-clip analysis).
   */
  _detectPlaysFromMotion(motionData) {
    const origData = this.motionData;
    this.motionData = motionData;
    const result = this._detectPlays();
    this.motionData = origData;
    return result;
  }

  // --- Private methods ---

  _seekAndWait(video, time) {
    return new Promise((resolve) => {
      video.currentTime = time;
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      video.addEventListener('seeked', onSeeked);
    });
  }

  /**
   * Compute the per-pixel difference between current frame and previous frame.
   * Returns a 0-1 value representing overall motion intensity.
   */
  _computeMotion(currentData) {
    if (!this._prevFrameData) {
      this._prevFrameData = new Uint8ClampedArray(currentData);
      return 0;
    }

    let totalDiff = 0;
    const pixelCount = currentData.length / 4;

    for (let i = 0; i < currentData.length; i += 4) {
      // Compare luminance (weighted grayscale) for speed and robustness
      const prevLum = this._prevFrameData[i] * 0.299 +
                      this._prevFrameData[i + 1] * 0.587 +
                      this._prevFrameData[i + 2] * 0.114;
      const curLum = currentData[i] * 0.299 +
                     currentData[i + 1] * 0.587 +
                     currentData[i + 2] * 0.114;
      totalDiff += Math.abs(curLum - prevLum);
    }

    // Copy current frame for next comparison
    this._prevFrameData.set(currentData);

    // Normalize: max possible diff is 255 per pixel
    return totalDiff / (pixelCount * 255);
  }

  /**
   * Smooth the motion data with a moving average.
   */
  _smooth(data, windowSize) {
    const smoothed = [];
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < data.length; i++) {
      let sum = 0;
      let count = 0;
      for (let j = i - half; j <= i + half; j++) {
        if (j >= 0 && j < data.length) {
          sum += data[j].motion;
          count++;
        }
      }
      smoothed.push({ time: data[i].time, motion: sum / count });
    }
    return smoothed;
  }

  /**
   * Detect plays from the motion curve using threshold-based edge detection.
   */
  _detectPlays() {
    if (this.motionData.length < 3) return [];

    const smoothed = this._smooth(this.motionData, this.smoothingWindow);

    // Find the max motion value to compute adaptive threshold
    let maxMotion = 0;
    for (const d of smoothed) {
      if (d.motion > maxMotion) maxMotion = d.motion;
    }

    if (maxMotion === 0) return [];

    const threshold = maxMotion * this.motionThreshold;
    const plays = [];
    let playStart = null;

    for (let i = 0; i < smoothed.length; i++) {
      const m = smoothed[i].motion;
      const t = smoothed[i].time;

      if (playStart === null) {
        // Looking for play start: motion rises above threshold
        if (m > threshold) {
          playStart = t;
        }
      } else {
        // Looking for play end: motion drops below threshold
        const elapsed = t - playStart;

        if (m <= threshold || elapsed >= this.maxPlayDuration) {
          // Play ended
          if (elapsed >= this.minPlayDuration) {
            // Refine: walk back from threshold crossing to find the actual
            // start (first sample where motion begins rising)
            let refinedStart = playStart;
            for (let j = i - 1; j >= 0; j--) {
              if (smoothed[j].time < playStart - 1.0) break;
              if (smoothed[j].motion < threshold * 0.5) {
                refinedStart = smoothed[j].time;
                break;
              }
            }

            plays.push({
              start: Math.max(0, refinedStart - 0.5), // pad 0.5s before snap
              end: t + 0.5,                            // pad 0.5s after whistle
              peakMotion: this._peakInRange(smoothed, refinedStart, t)
            });
          }

          playStart = null;

          // Apply cooldown: skip ahead past dead time between plays
          const cooldownEnd = t + this.cooldownAfterEnd;
          while (i < smoothed.length - 1 && smoothed[i + 1].time < cooldownEnd) {
            i++;
          }
        }
      }
    }

    // Handle case where video ends during a play
    if (playStart !== null) {
      const lastTime = smoothed[smoothed.length - 1].time;
      if (lastTime - playStart >= this.minPlayDuration) {
        plays.push({
          start: Math.max(0, playStart - 0.5),
          end: lastTime,
          peakMotion: this._peakInRange(smoothed, playStart, lastTime)
        });
      }
    }

    return plays;
  }

  _peakInRange(data, start, end) {
    let peak = 0;
    for (const d of data) {
      if (d.time >= start && d.time <= end && d.motion > peak) {
        peak = d.motion;
      }
    }
    return peak;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}

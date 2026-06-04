# GridIron IQ — Local CV Server

A small FastAPI companion server that powers **real computer-vision
auto-tagging** for the GridIron IQ browser app. When this
server is running, the browser frontend automatically routes clip
analysis through here (YOLOv8 person detection + heuristic rules).
When it's not running, the browser falls back to its in-browser
heuristic analyzer. Nothing breaks either way.

## What it does

- `GET  /health` — probe endpoint the browser uses to detect this server
- `POST /detect` — scan a whole video and return play boundaries
- `POST /analyze` — analyze a single play window and return tagged fields
- `POST /analyze_batch` — analyze multiple windows in one video upload

Responses use the exact same `{ tags, confidence, reasons, extras }`
shape as `js/clip-analyzer.js`, so this is a drop-in replacement.

## Requirements

- **Python 3.10 or newer**
- ~1 GB disk for dependencies (PyTorch, ultralytics, OpenCV)
- Optional: CUDA-capable GPU — ultralytics will use it automatically if
  available, otherwise runs on CPU

## Quick start

### macOS / Linux

```bash
cd server
./start.sh
```

### Windows

Double-click **`start.bat`**, or from a terminal:

```cmd
cd server
start.bat
```

The first launch will:

1. Create a `.venv` virtualenv
2. `pip install` all deps (one-time, takes a few minutes)
3. On first request, download the YOLOv8n weights (~6 MB)
4. Start the server on **http://127.0.0.1:8765**

Leave the window open while you use the browser app. Close it when
you're done — everything still works, just with the heuristic fallback.

## Verifying it works

With the server running, open any browser and visit:

    http://127.0.0.1:8765/health

You should see a JSON response like:

```json
{
  "status": "ok",
  "name": "GridIron IQ — Local CV Server",
  "version": "1.0.0",
  "capabilities": ["play_detection", "formation_detection", ...],
  "backend": "yolov8"
}
```

In the browser app, the top-bar status badge will show **🟢 AI Server**
when this is reachable. Click it to see capabilities.

## Custom port

```bash
FFA_PORT=9000 ./start.sh
```

The browser frontend probes `127.0.0.1:8765` by default. To point it at
a different port, open the browser console and run:

```js
localStorage.setItem('ffa_backend_url', 'http://127.0.0.1:9000');
location.reload();
```

## How the CV pipeline works

Per play clip:

1. **Pre-snap** (first ~0.8s): sample frames at 6 fps, run YOLOv8
   person detection on each, aggregate bounding-box centers.
2. Infer **line of scrimmage** as the densest horizontal band of player
   y-coordinates.
3. Classify **formation** from players-on-line count, backfield depth,
   and formation width (Shotgun / I-Form / Singleback / Under Center /
   Spread / Empty).
4. **Action phase**: sample at 8 fps, run YOLOv8 on each, compute a
   weighted center of mass per frame (trajectory).
5. Infer **play type** (Run Inside/Outside, Short/Medium/Deep Pass,
   Screen) from trajectory shape: horizontal spread, vertical
   dominance, duration.
6. **Direction** (L/M/R) from horizontal centroid drift.
7. **Yardage estimate** from trajectory displacement (calibrated
   approximately — sideline broadcasts ≈ 30yd/unit).
8. **Result** (Gain / Touchdown / No Gain / Incomplete) from yards
   + motion-endpoint location.

This is still heuristic on top of YOLO — but YOLO gives us real player
positions instead of luminance deltas, which dramatically improves
accuracy over the pure-browser version (especially for formation
detection).

## Next-level accuracy (future work)

- Swap generic YOLOv8 for a model fine-tuned on football (can be
  trained on ~500 tagged plays)
- Add MediaPipe pose estimation to distinguish QB / skill / OL
- Track the ball explicitly (hard — small fast object)
- Jersey number OCR for per-player stats
- Coverage classification (needs secondary-specific training data)

## Security note

This server binds to `127.0.0.1` (localhost only) and is not meant to
be exposed to the internet. CORS is `*` for convenience — if you want
to lock that down, edit `app.py`.

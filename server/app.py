"""
GridIron IQ — local CV backend.

FastAPI server that exposes play detection and play analysis powered by
YOLOv8 person detection. Designed to run alongside the browser app on
the same machine; the frontend probes /health and will automatically use
this server when available, otherwise falls back to the in-browser
heuristic analyzer.

The API contract matches js/clip-analyzer.js so the frontend treats this
as a drop-in replacement:

    POST /analyze  (multipart video + start/end form fields)
        -> { tags, confidence, reasons, extras }

    POST /detect   (multipart video)
        -> { plays: [{start, end, confidence, peak}], ... }

Run:
    cd server
    python -m venv .venv
    source .venv/bin/activate     # or .venv\\Scripts\\activate on Windows
    pip install -r requirements.txt
    python app.py                 # or: uvicorn app:app --port 8765
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from analyzer import ClipAnalyzer, PlayDetector

APP_NAME = "GridIron IQ — Local CV Server"
APP_VERSION = "1.0.0"
DEFAULT_PORT = 8765

app = FastAPI(title=APP_NAME, version=APP_VERSION)

# Allow the browser app to call us from any local origin. For a production
# setup you'd restrict this, but for a local companion server "*" is fine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy-initialized singletons so model weights download on first request
# instead of blocking server startup.
_analyzer: Optional[ClipAnalyzer] = None
_detector: Optional[PlayDetector] = None


def get_analyzer() -> ClipAnalyzer:
    global _analyzer
    if _analyzer is None:
        _analyzer = ClipAnalyzer()
    return _analyzer


def get_detector() -> PlayDetector:
    global _detector
    if _detector is None:
        _detector = PlayDetector()
    return _detector


@app.get("/health")
async def health():
    """Lightweight endpoint the browser hits to probe server availability."""
    return {
        "status": "ok",
        "name": APP_NAME,
        "version": APP_VERSION,
        "capabilities": [
            "play_detection",
            "formation_detection",
            "play_type_classification",
            "direction_inference",
            "yardage_estimate",
        ],
        "backend": "yolov8",
    }


@app.post("/analyze")
async def analyze(
    video: UploadFile = File(...),
    start: float = Form(0.0),
    end: float = Form(0.0),
):
    """Analyze a single play window. Returns the same shape as
    js/clip-analyzer.js so the frontend can swap backends transparently.
    """
    import time
    tmp_path = _save_upload(video)
    size_mb = tmp_path.stat().st_size / 1024 / 1024
    print(
        f"[FFA] /analyze received {video.filename} ({size_mb:.1f} MB) "
        f"window {start:.1f}s → {end:.1f}s",
        flush=True,
    )
    t0 = time.time()
    try:
        analyzer = get_analyzer()
        result = analyzer.analyze(str(tmp_path), start=start, end=end)
        ms = int((time.time() - t0) * 1000)
        tag_preview = ", ".join(
            f"{k}={v}" for k, v in (result.get("tags") or {}).items() if v
        ) or "(no tags)"
        print(f"[FFA] /analyze done in {ms}ms → {tag_preview}", flush=True)
        return result
    except Exception as exc:  # noqa: BLE001
        print(f"[FFA] /analyze ERROR: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        _safe_unlink(tmp_path)


@app.post("/detect")
async def detect(video: UploadFile = File(...)):
    """Scan a full video and return detected play boundaries."""
    import time
    tmp_path = _save_upload(video)
    size_mb = tmp_path.stat().st_size / 1024 / 1024
    print(
        f"[FFA] /detect received {video.filename} ({size_mb:.1f} MB)",
        flush=True,
    )
    t0 = time.time()
    try:
        detector = get_detector()
        plays = detector.detect(str(tmp_path))
        ms = int((time.time() - t0) * 1000)
        print(f"[FFA] /detect done in {ms}ms → {len(plays)} plays", flush=True)
        return {"plays": plays}
    except Exception as exc:  # noqa: BLE001
        print(f"[FFA] /detect ERROR: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        _safe_unlink(tmp_path)


@app.post("/analyze_batch")
async def analyze_batch(
    video: UploadFile = File(...),
    windows: str = Form("[]"),
    jersey_color: str = Form(""),
    direction: str = Form(""),
    perspective: str = Form("offense"),
):
    """Analyze multiple play windows in a single video upload. `windows`
    is a JSON-encoded array of {start, end} objects. Returns an array of
    results in the same order. Useful for the folder-of-plays workflow so
    we only pay the upload cost once per file.
    """
    import json
    import time

    try:
        window_list = json.loads(windows)
    except json.JSONDecodeError:
        return JSONResponse(status_code=400, content={"error": "invalid windows JSON"})

    tmp_path = _save_upload(video)
    size_mb = tmp_path.stat().st_size / 1024 / 1024
    team_ctx = {
        "jersey_color": jersey_color,
        "direction": direction,
        "perspective": perspective,
    }
    ctx_summary = ", ".join(f"{k}={v}" for k, v in team_ctx.items() if v)
    print(
        f"[FFA] /analyze_batch received {video.filename} "
        f"({size_mb:.1f} MB) · {len(window_list)} windows"
        f"{' · ' + ctx_summary if ctx_summary else ''}",
        flush=True,
    )
    t0 = time.time()
    try:
        analyzer = get_analyzer()
        results = []
        for i, w in enumerate(window_list):
            start = float(w.get("start", 0))
            end = float(w.get("end", 0))
            wt0 = time.time()
            print(
                f"[FFA]   window {i + 1}/{len(window_list)}: "
                f"{start:.1f}s → {end:.1f}s ({end - start:.1f}s) analyzing…",
                flush=True,
            )
            result = analyzer.analyze(str(tmp_path), start=start, end=end, team_ctx=team_ctx)
            wms = int((time.time() - wt0) * 1000)
            tag_preview = ", ".join(
                f"{k}={v}" for k, v in (result.get("tags") or {}).items() if v
            ) or "(no tags)"
            print(
                f"[FFA]   window {i + 1} done in {wms}ms → {tag_preview}",
                flush=True,
            )
            results.append(result)
        total_ms = int((time.time() - t0) * 1000)
        print(
            f"[FFA] /analyze_batch complete — {len(results)} results in {total_ms}ms",
            flush=True,
        )
        return {"results": results}
    except Exception as exc:  # noqa: BLE001
        print(f"[FFA] /analyze_batch ERROR: {exc}", flush=True)
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        _safe_unlink(tmp_path)


def _save_upload(upload: UploadFile) -> Path:
    """Write an uploaded file to a temp location and return the path."""
    suffix = Path(upload.filename or "clip.mp4").suffix or ".mp4"
    fd, tmp = tempfile.mkstemp(suffix=suffix, prefix="ffa_")
    os.close(fd)
    tmp_path = Path(tmp)
    with tmp_path.open("wb") as f:
        while chunk := upload.file.read(1024 * 1024):
            f.write(chunk)
    return tmp_path


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink(missing_ok=True)
    except Exception:
        pass


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("FFA_PORT", DEFAULT_PORT))
    host = os.environ.get("FFA_HOST", "127.0.0.1")
    print(f"\n  {APP_NAME} v{APP_VERSION}")
    print(f"  listening on http://{host}:{port}")
    print(f"  health:  http://{host}:{port}/health\n")
    uvicorn.run("app:app", host=host, port=port, log_level="info")

"""
GridIron IQ — YOLOv8-powered clip analysis.

This module replaces the in-browser heuristic analyzer with a real
computer-vision pipeline. YOLOv8n is small enough to run on CPU at
reasonable speed; if the user has CUDA installed, ultralytics will use
it automatically.

Output shape is intentionally identical to js/clip-analyzer.js so the
browser frontend treats this server as a drop-in replacement:

    {
        "tags":       { formation, playType, hash, result, yardage, personnel },
        "confidence": { ... },
        "reasons":    { ... },
        "extras":     { duration, player_count, ... }
    }
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np

try:
    from ultralytics import YOLO
    HAS_YOLO = True
except Exception:  # pragma: no cover - ultralytics not installed
    HAS_YOLO = False

# Tunables
PRE_SNAP_SECONDS = 0.8
ACTION_SAMPLE_FPS = 8
PRE_SNAP_SAMPLE_FPS = 6
PERSON_CLASS_ID = 0  # COCO class 0 = person

# Jersey color reference values in HSV.  Each entry is a list of
# (H_lo, H_hi, S_min, V_min) ranges. H is 0..180 in OpenCV.
JERSEY_HSV = {
    "white":  [(0, 180, 0, 180)],
    "black":  [(0, 180, 0, 0)],         # special: V < 60
    "red":    [(0, 10, 80, 80), (170, 180, 80, 80)],
    "blue":   [(100, 130, 80, 50)],
    "navy":   [(100, 130, 50, 20)],
    "green":  [(40, 80, 60, 50)],
    "yellow": [(20, 35, 80, 100)],
    "orange": [(10, 25, 120, 100)],
    "purple": [(130, 160, 50, 40)],
    "maroon": [(0, 10, 60, 30), (170, 180, 60, 30)],
    "gray":   [(0, 180, 0, 60)],        # special: S < 50, 60 < V < 180
    "teal":   [(80, 100, 60, 50)],
}


@dataclass
class Detection:
    """One player-bounding-box detection from a single frame."""

    x1: float
    y1: float
    x2: float
    y2: float
    conf: float
    team: str = ""   # "ours" | "opp" | "" (unclassified)

    @property
    def cx(self) -> float:
        return (self.x1 + self.x2) / 2

    @property
    def cy(self) -> float:
        return (self.y1 + self.y2) / 2

    @property
    def area(self) -> float:
        return max(0.0, self.x2 - self.x1) * max(0.0, self.y2 - self.y1)


def _classify_jersey(frame_bgr: np.ndarray, det: Detection, target_color: str) -> str:
    """Sample the jersey region of a detection box and return 'ours' or 'opp'."""
    if not target_color or target_color not in JERSEY_HSV:
        return ""
    h, w = frame_bgr.shape[:2]
    # Sample the upper-middle 40% of the bounding box (torso area)
    bx1 = int(max(0, det.x1 + (det.x2 - det.x1) * 0.2))
    bx2 = int(min(w, det.x2 - (det.x2 - det.x1) * 0.2))
    by1 = int(max(0, det.y1 + (det.y2 - det.y1) * 0.15))
    by2 = int(min(h, det.y1 + (det.y2 - det.y1) * 0.55))
    if bx2 <= bx1 or by2 <= by1:
        return ""
    patch = frame_bgr[by1:by2, bx1:bx2]
    if patch.size == 0:
        return ""
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    avg_h = float(np.median(hsv[:, :, 0]))
    avg_s = float(np.median(hsv[:, :, 1]))
    avg_v = float(np.median(hsv[:, :, 2]))

    # Special cases
    if target_color == "white":
        return "ours" if avg_s < 50 and avg_v > 180 else "opp"
    if target_color == "black":
        return "ours" if avg_v < 60 else "opp"
    if target_color == "gray":
        return "ours" if avg_s < 50 and 60 < avg_v < 180 else "opp"

    ranges = JERSEY_HSV.get(target_color, [])
    for h_lo, h_hi, s_min, v_min in ranges:
        if h_lo <= avg_h <= h_hi and avg_s >= s_min and avg_v >= v_min:
            return "ours"
    return "opp"


@dataclass
class FrameDetections:
    time: float
    width: int
    height: int
    detections: List[Detection] = field(default_factory=list)


class _YoloWrapper:
    """Lazy-loaded YOLOv8 wrapper. Falls back to a no-op detector if
    ultralytics isn't installed, so importing this module never fails."""

    def __init__(self, model_name: str = "yolov8n.pt", person_conf: float = 0.3):
        self.model_name = model_name
        self.person_conf = person_conf
        self._model = None

    def _ensure(self):
        if self._model is None and HAS_YOLO:
            # Ultralytics auto-downloads the model on first use.
            import time
            print(
                f"[FFA] loading YOLO model '{self.model_name}' "
                f"(first call downloads weights ~6 MB from ultralytics CDN)…",
                flush=True,
            )
            t0 = time.time()
            self._model = YOLO(self.model_name)
            print(
                f"[FFA] YOLO model ready in {int((time.time() - t0) * 1000)}ms",
                flush=True,
            )
        return self._model

    def detect_people(self, frame_bgr: np.ndarray) -> List[Detection]:
        model = self._ensure()
        if model is None:
            return []
        results = model.predict(
            source=frame_bgr,
            conf=self.person_conf,
            classes=[PERSON_CLASS_ID],
            verbose=False,
        )
        out: List[Detection] = []
        for r in results:
            if r.boxes is None:
                continue
            xyxy = r.boxes.xyxy.cpu().numpy()
            confs = r.boxes.conf.cpu().numpy()
            for (x1, y1, x2, y2), c in zip(xyxy, confs):
                out.append(Detection(float(x1), float(y1), float(x2), float(y2), float(c)))
        return out


class ClipAnalyzer:
    """Heuristic-over-YOLO pipeline for inferring play tags from film."""

    def __init__(self):
        self._yolo = _YoloWrapper()

    # ------------------------------------------------------------------
    # Public API — matches the JS ClipAnalyzer.analyze() output shape
    # ------------------------------------------------------------------

    def analyze(self, video_path: str, start: float = 0.0, end: float = 0.0,
                team_ctx: Optional[dict] = None) -> dict:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return self._empty("could not open video")

        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            duration_total = total_frames / fps if fps > 0 else 0.0

            # Default window = whole clip
            if end <= start or end <= 0:
                start = 0.0
                end = duration_total

            duration = max(0.1, end - start)

            # --- 1. Sample pre-snap & action frames ----------------------
            pre_snap_end = min(end, start + PRE_SNAP_SECONDS)
            pre_snap_frames = self._sample_frames(
                cap, start, pre_snap_end, PRE_SNAP_SAMPLE_FPS
            )
            action_frames = self._sample_frames(
                cap, pre_snap_end, end, ACTION_SAMPLE_FPS
            )

            if not pre_snap_frames and not action_frames:
                return self._empty("no frames sampled")

            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)

            tc = team_ctx or {}
            jersey_color = tc.get("jersey_color", "")
            play_direction = tc.get("direction", "")
            perspective = tc.get("perspective", "offense")

            # --- 2. Run detection on every sampled frame ----------------
            pre_snap_dets = [
                self._detect_frame(f, width, height, jersey_color)
                for f in pre_snap_frames
            ]
            action_dets = [
                self._detect_frame(f, width, height, jersey_color)
                for f in action_frames
            ]

            # --- 3. Infer formation from pre-snap (our team only) ------
            # If we know the jersey color, filter to just our players so
            # the formation reflects OUR alignment, not a blob of both teams.
            our_pre_snap = self._filter_team(pre_snap_dets, "ours") if jersey_color else pre_snap_dets
            formation_result = self._infer_formation(our_pre_snap, width, height)

            # --- 4. Track OUR players through the action phase ---------
            our_action = self._filter_team(action_dets, "ours") if jersey_color else action_dets
            trajectory = self._build_trajectory(our_action, width, height)

            # --- 5. Play type + direction + yardage from trajectory -----
            play_type_result = self._infer_play_type(
                trajectory, formation_result, duration
            )
            hash_result = self._infer_direction(trajectory)
            yards_result = self._infer_yardage(
                trajectory, play_type_result["value"], play_direction
            )
            result_bucket = self._infer_result(yards_result["value"], trajectory, duration)

            # --- 6. Personnel hint from pre-snap player count -----------
            personnel_result = self._infer_personnel(pre_snap_dets)

            tags = {
                "formation": formation_result["value"],
                "playType": play_type_result["value"],
                "hash": hash_result["value"],
                "result": result_bucket["value"],
                "yardage": str(yards_result["value"]) if yards_result["value"] else "",
                "personnel": personnel_result["value"],
            }
            confidence = {
                "formation": formation_result["conf"],
                "playType": play_type_result["conf"],
                "hash": hash_result["conf"],
                "result": result_bucket["conf"],
                "yardage": yards_result["conf"],
                "personnel": personnel_result["conf"],
            }
            reasons = {
                "formation": formation_result["reason"],
                "playType": play_type_result["reason"],
                "hash": hash_result["reason"],
                "result": result_bucket["reason"],
                "yardage": yards_result["reason"],
                "personnel": personnel_result["reason"],
            }
            extras = {
                "duration": duration,
                "pre_snap_frames": len(pre_snap_frames),
                "action_frames": len(action_frames),
                "pre_snap_player_count": formation_result.get("player_count", 0),
                "trajectory_points": len(trajectory),
                "backend": "yolov8" if HAS_YOLO else "no-yolo-fallback",
            }
            return {
                "tags": tags,
                "confidence": confidence,
                "reasons": reasons,
                "extras": extras,
            }
        finally:
            cap.release()

    # ------------------------------------------------------------------
    # Frame sampling + detection
    # ------------------------------------------------------------------

    def _sample_frames(
        self, cap: cv2.VideoCapture, start: float, end: float, target_fps: float
    ) -> List[Tuple[float, np.ndarray]]:
        """Return (time, frame) pairs sampled at target_fps inside [start, end]."""
        frames: List[Tuple[float, np.ndarray]] = []
        if end <= start:
            return frames
        step = 1.0 / max(1.0, target_fps)
        t = start
        while t < end:
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
            ok, frame = cap.read()
            if not ok or frame is None:
                break
            frames.append((t, frame))
            t += step
        return frames

    def _detect_frame(
        self, frame_tuple: Tuple[float, np.ndarray], width: int, height: int,
        jersey_color: str = "",
    ) -> FrameDetections:
        t, frame = frame_tuple
        dets = self._yolo.detect_people(frame)
        if jersey_color:
            for d in dets:
                d.team = _classify_jersey(frame, d, jersey_color)
        return FrameDetections(time=t, width=width, height=height, detections=dets)

    # ------------------------------------------------------------------
    # Formation inference (pre-snap)
    # ------------------------------------------------------------------

    def _infer_formation(
        self, pre_snap: List[FrameDetections], width: int, height: int
    ) -> dict:
        """Very-rough pre-snap formation classification.

        Strategy: aggregate all detections across the pre-snap frames,
        bucket them into rough horizontal (LOS) and vertical (depth)
        bands, count clusters, and apply simple rules:

        * ≥ 9 players near a single horizontal line + 1 deep  → Shotgun
        * ≥ 9 near LOS + 2 deep                                → I-Form
        * ≥ 9 near LOS + 1 slightly deep + no deep QB          → Under Center
        * very wide spread + few backs                         → Spread / Empty
        """
        if not pre_snap or all(len(f.detections) == 0 for f in pre_snap):
            return self._res("", 0.0, "no players detected pre-snap")

        # Aggregate: normalize all detection centers to 0..1 coordinates
        centers: List[Tuple[float, float]] = []
        for f in pre_snap:
            for d in f.detections:
                centers.append((d.cx / max(1, f.width), d.cy / max(1, f.height)))

        if len(centers) < 6:
            return self._res(
                "", 0.15, f"only {len(centers)} players detected across pre-snap frames"
            )

        avg_player_count = len(centers) / max(1, len(pre_snap))

        ys = np.array([c[1] for c in centers])
        xs = np.array([c[0] for c in centers])

        # LOS = band with the densest cluster of y values
        hist, bin_edges = np.histogram(ys, bins=20, range=(0.0, 1.0))
        los_bin = int(np.argmax(hist))
        los_y = (bin_edges[los_bin] + bin_edges[los_bin + 1]) / 2

        # Players within ±6% of LOS y are "on the line"
        on_line = np.abs(ys - los_y) < 0.06
        on_line_count = int(on_line.sum()) / max(1, len(pre_snap))

        # Backfield = players behind the LOS (in broadcast frames the
        # offense's backfield is typically lower-y because the ball goes
        # away from the bottom of the frame on most camera angles).
        # We take players not on the line, then look at whoever is
        # farthest from the LOS.
        off_line_mask = ~on_line
        off_line_ys = ys[off_line_mask]
        off_line_xs = xs[off_line_mask]

        # Width of the formation at LOS level
        on_line_xs = xs[on_line]
        width_at_los = float(on_line_xs.max() - on_line_xs.min()) if on_line.any() else 0.0

        # Backfield depth relative to LOS
        if len(off_line_ys) > 0:
            backfield_depth = float(np.abs(off_line_ys - los_y).max())
            backfield_count = int((np.abs(off_line_ys - los_y) > 0.08).sum()) / max(1, len(pre_snap))
        else:
            backfield_depth = 0.0
            backfield_count = 0.0

        # Apply rules
        formation = ""
        conf = 0.45
        reason = ""

        if width_at_los > 0.6 and backfield_count < 0.7:
            formation = "Empty"
            conf = 0.6
            reason = f"wide LOS ({width_at_los:.2f}), minimal backfield"
        elif width_at_los > 0.5:
            formation = "Spread"
            conf = 0.55
            reason = f"spread LOS ({width_at_los:.2f})"
        elif backfield_depth > 0.18 and backfield_count < 1.5:
            formation = "Shotgun"
            conf = 0.65
            reason = f"QB deep ({backfield_depth:.2f}), one in backfield"
        elif backfield_depth > 0.12 and backfield_count >= 1.5:
            formation = "I-Form"
            conf = 0.55
            reason = f"multiple backs deep ({backfield_count:.1f} avg)"
        elif backfield_depth > 0.08:
            formation = "Singleback"
            conf = 0.5
            reason = f"moderate backfield depth ({backfield_depth:.2f})"
        elif backfield_depth > 0.04:
            formation = "Under Center"
            conf = 0.5
            reason = f"shallow backfield ({backfield_depth:.2f})"
        else:
            formation = "Shotgun"
            conf = 0.3
            reason = "ambiguous pre-snap geometry"

        result = self._res(formation, conf, reason)
        result["player_count"] = avg_player_count
        return result

    def _infer_personnel(self, pre_snap: List[FrameDetections]) -> dict:
        """Rough personnel inference from average player count. Real
        personnel classification needs OL vs skill-player distinction
        which requires a model trained on football positions; as a
        first pass we just note whether the offense looks heavy or
        spread."""
        if not pre_snap:
            return self._res("", 0.0, "no pre-snap frames")
        counts = [len(f.detections) for f in pre_snap]
        if not counts:
            return self._res("", 0.0, "no detections")
        avg = float(np.mean(counts))
        if avg >= 20:
            return self._res("11", 0.35, f"avg {avg:.0f} players detected (default 11 personnel)")
        if avg >= 15:
            return self._res("11", 0.3, f"avg {avg:.0f} players (partial detection)")
        return self._res("", 0.1, f"too few players detected ({avg:.0f})")

    @staticmethod
    def _filter_team(
        frame_dets: List[FrameDetections], team: str
    ) -> List[FrameDetections]:
        """Return a copy of frame_dets keeping only detections matching
        `team` ('ours' or 'opp'). If filtering leaves a frame empty,
        keep all detections for that frame (better than nothing)."""
        out: List[FrameDetections] = []
        for fd in frame_dets:
            filtered = [d for d in fd.detections if d.team == team]
            out.append(FrameDetections(
                time=fd.time, width=fd.width, height=fd.height,
                detections=filtered if filtered else fd.detections,
            ))
        return out

    # ------------------------------------------------------------------
    # Post-snap trajectory + play type inference
    # ------------------------------------------------------------------

    def _build_trajectory(
        self, action: List[FrameDetections], width: int, height: int
    ) -> List[Tuple[float, float, float, int]]:
        """Return a list of (time, cx_norm, cy_norm, player_count) tuples
        representing the weighted center of mass of all player detections
        in each action frame. This gives us the same 'motion centroid'
        concept the JS analyzer uses but with real player positions
        instead of luminance deltas, so it's far more accurate."""
        points: List[Tuple[float, float, float, int]] = []
        for f in action:
            if not f.detections:
                continue
            xs = np.array([d.cx / max(1, f.width) for d in f.detections])
            ys = np.array([d.cy / max(1, f.height) for d in f.detections])
            areas = np.array([d.area for d in f.detections])
            if areas.sum() <= 0:
                weights = np.ones_like(xs)
            else:
                weights = areas / areas.sum()
            cx = float(np.sum(xs * weights))
            cy = float(np.sum(ys * weights))
            points.append((f.time, cx, cy, len(f.detections)))
        return points

    def _infer_play_type(
        self, trajectory: List, formation: dict, duration: float
    ) -> dict:
        if len(trajectory) < 2:
            return self._res("", 0.0, "insufficient action frames")

        xs = np.array([p[1] for p in trajectory])
        ys = np.array([p[2] for p in trajectory])

        x_span = float(xs.max() - xs.min())
        y_span = float(ys.max() - ys.min())
        x_drift = float(xs[-1] - xs[0])
        y_drift = float(ys[-1] - ys[0])
        vertical_ratio = y_span / (x_span + 1e-3)

        # Classify
        if duration < 2.8 and x_span > 0.12 and y_span < 0.25:
            return self._res("Screen", 0.55, f"quick ({duration:.1f}s) + lateral x_span={x_span:.2f}")
        if y_span > 0.35 or (y_span > 0.25 and duration > 4):
            if y_span > 0.45:
                return self._res(
                    "Deep Pass",
                    0.65,
                    f"deep downfield travel y_span={y_span:.2f}",
                )
            return self._res("Medium Pass", 0.6, f"mid downfield y_span={y_span:.2f}")
        if vertical_ratio > 1.1 and y_span > 0.15:
            return self._res("Short Pass", 0.55, f"vertical-dominant motion (ratio {vertical_ratio:.2f})")
        if x_span > 0.22 and y_span < 0.18:
            return self._res("Run Outside", 0.6, f"horizontal travel x_span={x_span:.2f}, shallow y_span")
        if x_span < 0.2 and y_span < 0.18:
            return self._res("Run Inside", 0.65, f"concentrated near LOS x_span={x_span:.2f}")
        return self._res("Run Inside", 0.35, "default: low-spread motion")

    def _infer_direction(self, trajectory: List) -> dict:
        if len(trajectory) < 2:
            return self._res("", 0.0, "insufficient action frames")
        xs = np.array([p[1] for p in trajectory])
        drift = float(xs[-1] - xs[0])
        if abs(drift) < 0.06:
            return self._res("Middle", 0.55 + (0.06 - abs(drift)), f"drift {drift:+.2f}")
        if drift > 0:
            return self._res("Right", min(0.9, 0.55 + drift * 2), f"drift {drift:+.2f}")
        return self._res("Left", min(0.9, 0.55 + (-drift) * 2), f"drift {drift:+.2f}")

    def _infer_yardage(
        self, trajectory: List, play_type: str, direction: str = ""
    ) -> dict:
        if len(trajectory) < 2:
            return self._res(0, 0.0, "insufficient frames")
        xs = np.array([p[1] for p in trajectory])
        ys = np.array([p[2] for p in trajectory])
        x_span = float(xs.max() - xs.min())
        y_span = float(ys.max() - ys.min())
        raw_drift = float(xs[-1] - xs[0])
        is_run = play_type.startswith("Run")
        is_pass = ("Pass" in play_type) or (play_type == "Play Action")

        # Signed drift: positive = forward, negative = loss.
        # If direction is 'left', forward means decreasing x.
        if direction == "left":
            signed_drift = -raw_drift
        else:
            signed_drift = raw_drift

        conf = 0.45 if direction else 0.35

        if is_run:
            yards = round(signed_drift * 30)
            if yards == 0 and x_span > 0.03:
                yards = max(1, round(x_span * 25))
        elif is_pass:
            yards = round(y_span * 45 + x_span * 8)
        elif play_type == "Screen":
            yards = round(x_span * 22)
        else:
            yards = round(x_span * 20)
        yards = max(-15, min(80, int(yards)))
        return self._res(
            yards,
            conf,
            f"drift={signed_drift:+.2f} ({direction or 'auto'}), "
            f"x_span={x_span:.2f}, y_span={y_span:.2f}",
        )

    def _infer_result(self, yards: int, trajectory: List, duration: float) -> dict:
        if len(trajectory) < 2:
            return self._res("No Gain", 0.2, "no trajectory")
        xs = np.array([p[1] for p in trajectory])
        ys = np.array([p[2] for p in trajectory])
        final_x = float(xs[-1])
        final_y = float(ys[-1])
        near_edge = final_x < 0.12 or final_x > 0.88 or final_y < 0.12 or final_y > 0.88

        if duration < 1.8 and yards == 0:
            return self._res("Incomplete", 0.45, "short clip, no progress")
        if yards >= 20 and near_edge:
            return self._res("Touchdown", 0.55, f"~{yards}yd + motion reached frame edge")
        if yards < 0:
            return self._res("Loss", 0.55, f"~{yards}yd backward motion")
        if yards > 0:
            return self._res("Gain", 0.55, f"~{yards}yd forward motion")
        return self._res("No Gain", 0.4, f"~{yards}yd")

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _res(self, value, conf: float, reason: str) -> dict:
        return {"value": value, "conf": float(max(0.0, min(1.0, conf))), "reason": reason}

    def _empty(self, reason: str) -> dict:
        return {
            "tags": {},
            "confidence": {},
            "reasons": {},
            "extras": {"error": reason},
        }


class PlayDetector:
    """Simple play-boundary detector based on total player motion per
    frame. Good enough to find action windows in a continuous game film.

    For a folder-of-plays workflow each file is already a single play
    and this step is skipped entirely — the client just calls /analyze
    on each file directly.
    """

    def __init__(self):
        self._yolo = _YoloWrapper()

    def detect(self, video_path: str, sample_fps: float = 4.0) -> List[dict]:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return []
        try:
            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
            duration = total / fps if fps > 0 else 0.0
            if duration <= 0:
                return []

            motion_samples: List[Tuple[float, float]] = []
            prev_centroids: Optional[List[Tuple[float, float]]] = None

            step = 1.0 / max(1.0, sample_fps)
            t = 0.0
            while t < duration:
                cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
                ok, frame = cap.read()
                if not ok:
                    break
                h, w = frame.shape[:2]
                dets = self._yolo.detect_people(frame)
                centroids = [(d.cx / w, d.cy / h) for d in dets]

                motion = 0.0
                if prev_centroids and centroids:
                    # Simple nearest-neighbor distance sum; rough but cheap
                    for cx, cy in centroids:
                        best = min(
                            (math.hypot(cx - pcx, cy - pcy) for pcx, pcy in prev_centroids),
                            default=0.0,
                        )
                        motion += best
                    motion /= max(1, len(centroids))
                motion_samples.append((t, motion))
                prev_centroids = centroids
                t += step

            return self._bursts_to_plays(motion_samples)
        finally:
            cap.release()

    def _bursts_to_plays(self, samples: List[Tuple[float, float]]) -> List[dict]:
        if len(samples) < 4:
            return []
        times = np.array([s[0] for s in samples])
        motion = np.array([s[1] for s in samples])
        baseline = float(np.percentile(motion, 25))
        peak = float(np.percentile(motion, 90))
        threshold = baseline + (peak - baseline) * 0.4
        if threshold <= 0:
            threshold = 0.01

        plays: List[dict] = []
        in_play = False
        start_t = 0.0
        max_v = 0.0
        for t, m in zip(times, motion):
            if not in_play:
                if m > threshold:
                    in_play = True
                    start_t = float(t)
                    max_v = float(m)
            else:
                max_v = max(max_v, float(m))
                if m < threshold * 0.6:
                    end_t = float(t)
                    if end_t - start_t >= 1.5:
                        plays.append(
                            {
                                "start": max(0.0, start_t - 0.3),
                                "end": end_t + 0.4,
                                "peak": max_v,
                                "confidence": min(1.0, (max_v - threshold) / (threshold + 1e-3)),
                            }
                        )
                    in_play = False
                    max_v = 0.0
        return plays

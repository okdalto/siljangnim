import { useRef, useEffect, useCallback, useState } from "react";

const POINT_RADIUS = 5;
const HIT_RADIUS = 10;
const HANDLE_LEN = 60; // tangent handle pixel length
const HANDLE_HIT = 8;
const PADDING = { top: 30, right: 30, bottom: 40, left: 55 };
const CURVE_SUBDIVISIONS = 32; // segments per span for drawing Hermite curve

export default function KeyframeEditor({
  uniformName,
  label,
  min,
  max,
  duration,
  keyframes,
  engineRef,
  onKeyframesChange,
  onClose,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  // View state (zoom/pan) — kept in ref to avoid re-renders
  const viewRef = useRef({
    xMin: 0,
    xMax: duration || 10,
    yMin: min,
    yMax: max,
  });

  // Interaction state — all refs, no state, no re-renders during drag
  const dragRef = useRef(null); // { type: 'keyframe'|'inTangent'|'outTangent', index }
  const panRef = useRef(null);
  const selectedRef = useRef(-1); // selected keyframe index

  // Store latest props in refs so the stable rAF loop can read them
  const keyframesRef = useRef(keyframes);
  keyframesRef.current = keyframes;
  const onKeyframesChangeRef = useRef(onKeyframesChange);
  onKeyframesChangeRef.current = onKeyframesChange;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // forceRender only for zoom/pan (non-drag) interactions
  const [, forceRender] = useState(0);

  // Reset view when uniform changes
  useEffect(() => {
    viewRef.current = {
      xMin: 0,
      xMax: duration || 10,
      yMin: min,
      yMax: max,
    };
    selectedRef.current = -1;
  }, [uniformName]);

  // ── Coordinate transforms ─────────────────────────

  const getCanvasSize = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return { w: 0, h: 0, plotW: 0, plotH: 0 };
    return {
      w: c.width,
      h: c.height,
      plotW: c.width - PADDING.left - PADDING.right,
      plotH: c.height - PADDING.top - PADDING.bottom,
    };
  }, []);

  const toCanvasXY = useCallback(
    (time, value) => {
      const { plotW, plotH } = getCanvasSize();
      const v = viewRef.current;
      return {
        x: PADDING.left + ((time - v.xMin) / (v.xMax - v.xMin)) * plotW,
        y: PADDING.top + ((v.yMax - value) / (v.yMax - v.yMin)) * plotH,
      };
    },
    [getCanvasSize]
  );

  const fromCanvasXY = useCallback(
    (cx, cy) => {
      const { plotW, plotH } = getCanvasSize();
      const v = viewRef.current;
      return {
        time: v.xMin + ((cx - PADDING.left) / plotW) * (v.xMax - v.xMin),
        value: v.yMax - ((cy - PADDING.top) / plotH) * (v.yMax - v.yMin),
      };
    },
    [getCanvasSize]
  );

  // ── Tangent handle positions ──────────────────────

  const getTangentHandlePos = useCallback(
    (kf, direction) => {
      // direction: 'in' or 'out'
      const slope = direction === "out" ? kf.outTangent : kf.inTangent;
      const { plotW, plotH } = getCanvasSize();
      const v = viewRef.current;

      // Convert slope (value/sec) to pixel slope
      const xScale = plotW / (v.xMax - v.xMin); // px per sec
      const yScale = plotH / (v.yMax - v.yMin); // px per value unit
      const pxSlope = -slope * (yScale / xScale); // negative because canvas Y is inverted

      const angle = Math.atan(pxSlope);
      const sign = direction === "out" ? 1 : -1;
      const kfPos = toCanvasXY(kf.time, kf.value);
      return {
        x: kfPos.x + sign * Math.cos(angle) * HANDLE_LEN,
        y: kfPos.y + sign * Math.sin(angle) * HANDLE_LEN,
      };
    },
    [getCanvasSize, toCanvasXY]
  );

  const slopeFromHandle = useCallback(
    (kf, handleCx, handleCy, direction) => {
      const kfPos = toCanvasXY(kf.time, kf.value);
      const dx = handleCx - kfPos.x;
      const dy = handleCy - kfPos.y;

      // Ensure handle is on correct side (out → right, in → left)
      const sign = direction === "out" ? 1 : -1;
      if (dx * sign <= 0 && Math.abs(dx) > 1) {
        // handle is on the wrong side — mirror it
        return slopeFromHandleRaw(kfPos, kfPos.x + sign, kfPos.y - dy);
      }
      return slopeFromHandleRaw(kfPos, handleCx, handleCy);
    },
    [toCanvasXY]
  );

  const slopeFromHandleRaw = useCallback(
    (_kfPos, hx, hy) => {
      const { plotW, plotH } = getCanvasSize();
      const v = viewRef.current;
      const kfPos = _kfPos;
      const dxPx = hx - kfPos.x;
      const dyPx = hy - kfPos.y;
      if (Math.abs(dxPx) < 0.5) return 0;
      const xScale = plotW / (v.xMax - v.xMin);
      const yScale = plotH / (v.yMax - v.yMin);
      return -(dyPx / dxPx) * (xScale / yScale);
    },
    [getCanvasSize]
  );

  // ── Drawing (pure function, reads refs) ────────────

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c = canvas.getContext("2d");
    const { w, h, plotW, plotH } = getCanvasSize();
    const v = viewRef.current;
    const kfs = keyframesRef.current;
    const selIdx = selectedRef.current;

    c.clearRect(0, 0, w, h);

    // Background
    c.fillStyle = "#18181b";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#1e1e24";
    c.fillRect(PADDING.left, PADDING.top, plotW, plotH);

    // ── Grid ───────────────────────
    c.strokeStyle = "#333";
    c.lineWidth = 0.5;
    c.font = "10px monospace";
    c.fillStyle = "#71717a";

    // X grid (time)
    const xRange = v.xMax - v.xMin;
    const xStep = niceStep(xRange, 8);
    const xStart = Math.ceil(v.xMin / xStep) * xStep;
    c.textAlign = "center";
    c.textBaseline = "top";
    for (let t = xStart; t <= v.xMax + xStep * 0.01; t += xStep) {
      const { x } = toCanvasXY(t, 0);
      if (x < PADDING.left - 1 || x > PADDING.left + plotW + 1) continue;
      c.beginPath();
      c.moveTo(Math.round(x) + 0.5, PADDING.top);
      c.lineTo(Math.round(x) + 0.5, PADDING.top + plotH);
      c.stroke();
      c.fillText(formatNum(t, xStep) + "s", Math.round(x), h - 10);
    }

    // Y grid (value)
    const yRange = v.yMax - v.yMin;
    const yStep = niceStep(yRange, 6);
    const yStart = Math.ceil(v.yMin / yStep) * yStep;
    c.textAlign = "right";
    c.textBaseline = "middle";
    for (let val = yStart; val <= v.yMax + yStep * 0.01; val += yStep) {
      const { y } = toCanvasXY(0, val);
      if (y < PADDING.top - 1 || y > PADDING.top + plotH + 1) continue;
      c.beginPath();
      c.moveTo(PADDING.left, Math.round(y) + 0.5);
      c.lineTo(PADDING.left + plotW, Math.round(y) + 0.5);
      c.stroke();
      c.fillText(formatNum(val, yStep), PADDING.left - 6, Math.round(y));
    }

    // ── Hermite curve ──────────────
    if (kfs.length > 0) {
      c.save();
      c.beginPath();
      c.rect(PADDING.left, PADDING.top, plotW, plotH);
      c.clip();

      c.strokeStyle = "#818cf8";
      c.lineWidth = 2;
      c.beginPath();

      // Flat line before first kf
      const first = kfs[0];
      const leftEdge = toCanvasXY(v.xMin, first.value);
      const firstP = toCanvasXY(first.time, first.value);
      c.moveTo(leftEdge.x, leftEdge.y);
      c.lineTo(firstP.x, firstP.y);

      // Draw Hermite curve between each pair
      for (let i = 0; i < kfs.length - 1; i++) {
        const a = kfs[i];
        const b = kfs[i + 1];
        const dt = b.time - a.time;
        for (let s = 1; s <= CURVE_SUBDIVISIONS; s++) {
          const t = s / CURVE_SUBDIVISIONS;
          const t2 = t * t;
          const t3 = t2 * t;
          const h00 = 2 * t3 - 3 * t2 + 1;
          const h10 = t3 - 2 * t2 + t;
          const h01 = -2 * t3 + 3 * t2;
          const h11 = t3 - t2;
          const val = h00 * a.value + h10 * (a.outTangent * dt) + h01 * b.value + h11 * (b.inTangent * dt);
          const time = a.time + t * dt;
          const p = toCanvasXY(time, val);
          c.lineTo(p.x, p.y);
        }
      }

      // Flat line after last kf
      const last = kfs[kfs.length - 1];
      const lastP = toCanvasXY(last.time, last.value);
      const rightEdge = toCanvasXY(v.xMax, last.value);
      c.lineTo(lastP.x, lastP.y);
      c.lineTo(rightEdge.x, rightEdge.y);
      c.stroke();

      c.restore();
    }

    // ── Tangent handles (selected keyframe) ──────
    if (selIdx >= 0 && selIdx < kfs.length) {
      const kf = kfs[selIdx];
      const kfP = toCanvasXY(kf.time, kf.value);

      // In tangent (only if not first keyframe)
      if (selIdx > 0) {
        const inH = getTangentHandlePos(kf, "in");
        c.strokeStyle = "#f59e0b";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(kfP.x, kfP.y);
        c.lineTo(inH.x, inH.y);
        c.stroke();
        c.fillStyle = "#f59e0b";
        c.beginPath();
        c.arc(inH.x, inH.y, 4, 0, Math.PI * 2);
        c.fill();
      }

      // Out tangent (only if not last keyframe)
      if (selIdx < kfs.length - 1) {
        const outH = getTangentHandlePos(kf, "out");
        c.strokeStyle = "#f59e0b";
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(kfP.x, kfP.y);
        c.lineTo(outH.x, outH.y);
        c.stroke();
        c.fillStyle = "#f59e0b";
        c.beginPath();
        c.arc(outH.x, outH.y, 4, 0, Math.PI * 2);
        c.fill();
      }
    }

    // ── Keyframe points ──────────────
    for (let i = 0; i < kfs.length; i++) {
      const kf = kfs[i];
      const p = toCanvasXY(kf.time, kf.value);
      const isSelected = i === selIdx;
      const isDragging = dragRef.current?.type === "keyframe" && dragRef.current?.index === i;

      c.save();
      c.translate(p.x, p.y);
      c.rotate(Math.PI / 4);
      c.fillStyle = isSelected || isDragging ? "#a5b4fc" : "#818cf8";
      c.fillRect(-POINT_RADIUS, -POINT_RADIUS, POINT_RADIUS * 2, POINT_RADIUS * 2);
      c.strokeStyle = isSelected ? "#fbbf24" : "#fff";
      c.lineWidth = isSelected ? 2 : 1.5;
      c.strokeRect(-POINT_RADIUS, -POINT_RADIUS, POINT_RADIUS * 2, POINT_RADIUS * 2);
      c.restore();
    }

    // ── Playback position ────────────
    const engine = engineRef?.current;
    if (engine) {
      const t = engine.getCurrentTime();
      const { x } = toCanvasXY(t, 0);
      if (x >= PADDING.left && x <= PADDING.left + plotW) {
        c.strokeStyle = "#ef4444";
        c.lineWidth = 1;
        c.setLineDash([4, 3]);
        c.beginPath();
        c.moveTo(Math.round(x) + 0.5, PADDING.top);
        c.lineTo(Math.round(x) + 0.5, PADDING.top + plotH);
        c.stroke();
        c.setLineDash([]);
      }
    }

    // ── Axis labels ──────────────────
    c.fillStyle = "#a1a1aa";
    c.font = "11px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "bottom";
    c.fillText("Time (s)", PADDING.left + plotW / 2, h);
    c.save();
    c.translate(12, PADDING.top + plotH / 2);
    c.rotate(-Math.PI / 2);
    c.textBaseline = "top";
    c.fillText(label || uniformName, 0, 0);
    c.restore();
  }, [getCanvasSize, toCanvasXY, getTangentHandlePos, engineRef, label, uniformName]);

  // ── Stable rAF loop (never restarts on prop changes) ──

  const drawRef = useRef(drawFrame);
  drawRef.current = drawFrame;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const rect = canvas.parentElement.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize);

    let rafId;
    const tick = () => {
      rafId = requestAnimationFrame(tick);
      drawRef.current();
    };
    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []); // stable — never restarts

  // ── Hit testing ────────────────────────────────────

  const getCanvasCoords = useCallback((e) => {
    const c = canvasRef.current;
    const rect = c.getBoundingClientRect();
    return {
      cx: (e.clientX - rect.left) * (c.width / rect.width),
      cy: (e.clientY - rect.top) * (c.height / rect.height),
    };
  }, []);

  const hitTestKeyframe = useCallback(
    (cx, cy) => {
      const kfs = keyframesRef.current;
      for (let i = 0; i < kfs.length; i++) {
        const p = toCanvasXY(kfs[i].time, kfs[i].value);
        const dx = cx - p.x;
        const dy = cy - p.y;
        if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) return i;
      }
      return -1;
    },
    [toCanvasXY]
  );

  const hitTestHandle = useCallback(
    (cx, cy) => {
      const kfs = keyframesRef.current;
      const sel = selectedRef.current;
      if (sel < 0 || sel >= kfs.length) return null;
      const kf = kfs[sel];

      if (sel > 0) {
        const h = getTangentHandlePos(kf, "in");
        const dx = cx - h.x;
        const dy = cy - h.y;
        if (dx * dx + dy * dy < HANDLE_HIT * HANDLE_HIT) return "inTangent";
      }
      if (sel < kfs.length - 1) {
        const h = getTangentHandlePos(kf, "out");
        const dx = cx - h.x;
        const dy = cy - h.y;
        if (dx * dx + dy * dy < HANDLE_HIT * HANDLE_HIT) return "outTangent";
      }
      return null;
    },
    [getTangentHandlePos]
  );

  // ── Pointer events ─────────────────────────────────

  const onPointerDown = useCallback(
    (e) => {
      if (e.button === 2) return;
      const { cx, cy } = getCanvasCoords(e);

      // Alt+drag → pan
      if (e.altKey) {
        panRef.current = {
          startClientX: cx,
          startClientY: cy,
          startView: { ...viewRef.current },
        };
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }

      // Check tangent handles first (they are smaller targets on top of keyframe)
      const handleHit = hitTestHandle(cx, cy);
      if (handleHit) {
        dragRef.current = { type: handleHit, index: selectedRef.current };
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }

      // Check keyframe points
      const kfHit = hitTestKeyframe(cx, cy);
      if (kfHit >= 0) {
        selectedRef.current = kfHit;
        dragRef.current = { type: "keyframe", index: kfHit };
        canvasRef.current.setPointerCapture(e.pointerId);
        return;
      }

      // Click on empty → deselect
      selectedRef.current = -1;
    },
    [getCanvasCoords, hitTestKeyframe, hitTestHandle]
  );

  const onPointerMove = useCallback(
    (e) => {
      const { cx, cy } = getCanvasCoords(e);

      // Panning
      if (panRef.current) {
        const { plotW, plotH } = getCanvasSize();
        const sv = panRef.current.startView;
        const dxPx = cx - panRef.current.startClientX;
        const dyPx = cy - panRef.current.startClientY;
        const dxVal = -(dxPx / plotW) * (sv.xMax - sv.xMin);
        const dyVal = (dyPx / plotH) * (sv.yMax - sv.yMin);
        viewRef.current = {
          xMin: sv.xMin + dxVal,
          xMax: sv.xMax + dxVal,
          yMin: sv.yMin + dyVal,
          yMax: sv.yMax + dyVal,
        };
        return;
      }

      if (!dragRef.current) return;
      const kfs = keyframesRef.current;
      const { type, index } = dragRef.current;

      if (type === "keyframe") {
        // Move keyframe
        const { time, value } = fromCanvasXY(cx, cy);
        const clampedTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
        const clampedValue = Math.max(min, Math.min(max, value));
        const newKf = kfs.map((kf, i) =>
          i === index ? { ...kf, time: clampedTime, value: clampedValue } : { ...kf }
        );
        newKf.sort((a, b) => a.time - b.time);
        const newIndex = newKf.findIndex(
          (kf) => kf.time === clampedTime && kf.value === clampedValue
        );
        if (newIndex >= 0) {
          dragRef.current.index = newIndex;
          selectedRef.current = newIndex;
        }
        onKeyframesChangeRef.current(newKf);
      } else if (type === "inTangent" || type === "outTangent") {
        // Adjust tangent
        const kf = kfs[index];
        const dir = type === "inTangent" ? "in" : "out";
        const slope = slopeFromHandle(kf, cx, cy, dir);
        const field = type === "inTangent" ? "inTangent" : "outTangent";
        const newKf = kfs.map((k, i) =>
          i === index ? { ...k, [field]: slope } : { ...k }
        );
        onKeyframesChangeRef.current(newKf);
      }
    },
    [getCanvasCoords, getCanvasSize, fromCanvasXY, slopeFromHandle, duration, min, max]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current = null;
    panRef.current = null;
  }, []);

  // ── Double-click → add keyframe ────────────────────

  const onDoubleClick = useCallback(
    (e) => {
      const { cx, cy } = getCanvasCoords(e);
      if (hitTestKeyframe(cx, cy) >= 0) return;

      const { time, value } = fromCanvasXY(cx, cy);
      const clampedTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
      const clampedValue = Math.max(min, Math.min(max, value));
      const newKf = [
        ...keyframesRef.current.map((k) => ({ ...k })),
        { time: clampedTime, value: clampedValue, inTangent: 0, outTangent: 0 },
      ];
      newKf.sort((a, b) => a.time - b.time);
      const newIdx = newKf.findIndex(
        (kf) => kf.time === clampedTime && kf.value === clampedValue
      );
      selectedRef.current = newIdx >= 0 ? newIdx : -1;
      onKeyframesChangeRef.current(newKf);
    },
    [getCanvasCoords, hitTestKeyframe, fromCanvasXY, duration, min, max]
  );

  // ── Right-click → remove keyframe ──────────────────

  const onContextMenu = useCallback(
    (e) => {
      e.preventDefault();
      const { cx, cy } = getCanvasCoords(e);
      const hit = hitTestKeyframe(cx, cy);
      if (hit >= 0) {
        const newKf = keyframesRef.current.filter((_, i) => i !== hit).map((k) => ({ ...k }));
        if (selectedRef.current === hit) selectedRef.current = -1;
        else if (selectedRef.current > hit) selectedRef.current--;
        onKeyframesChangeRef.current(newKf);
      }
    },
    [getCanvasCoords, hitTestKeyframe]
  );

  // ── Keyboard ───────────────────────────────────────

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current >= 0) {
        const idx = selectedRef.current;
        const newKf = keyframesRef.current.filter((_, i) => i !== idx).map((k) => ({ ...k }));
        selectedRef.current = -1;
        dragRef.current = null;
        onKeyframesChangeRef.current(newKf);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // ── Wheel → zoom ───────────────────────────────────

  const onWheel = useCallback(
    (e) => {
      e.preventDefault();
      const { cx, cy } = getCanvasCoords(e);
      const { time: anchorT, value: anchorV } = fromCanvasXY(cx, cy);
      const factor = e.deltaY > 0 ? 1.1 : 0.9;
      const v = viewRef.current;

      if (e.shiftKey) {
        viewRef.current = {
          ...v,
          yMin: anchorV + (v.yMin - anchorV) * factor,
          yMax: anchorV + (v.yMax - anchorV) * factor,
        };
      } else {
        viewRef.current = {
          ...v,
          xMin: anchorT + (v.xMin - anchorT) * factor,
          xMax: anchorT + (v.xMax - anchorT) * factor,
        };
      }
      forceRender((c) => c + 1);
    },
    [getCanvasCoords, fromCanvasXY]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  // ── Render ─────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "700px", height: "420px" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 bg-zinc-800 border-b border-zinc-700">
          <span className="text-sm font-semibold text-zinc-300">
            Keyframes — {label || uniformName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                selectedRef.current = -1;
                onKeyframesChange([]);
              }}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              title="Clear all keyframes"
            >
              Clear
            </button>
            <button
              onClick={onClose}
              className="text-zinc-500 hover:text-zinc-200 transition-colors"
              title="Close"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onDoubleClick={onDoubleClick}
            onContextMenu={onContextMenu}
            style={{ cursor: "crosshair" }}
          />
        </div>

        {/* Footer */}
        <div className="px-4 py-1.5 bg-zinc-800 border-t border-zinc-700 text-[10px] text-zinc-500">
          Double-click: add &nbsp;|&nbsp; Drag: move &nbsp;|&nbsp; Right-click: delete &nbsp;|&nbsp; Scroll: X-zoom &nbsp;|&nbsp; Shift+Scroll: Y-zoom &nbsp;|&nbsp; Alt+Drag: pan
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────

function niceStep(range, targetTicks) {
  const rough = range / targetTicks;
  const pow = Math.pow(10, Math.floor(Math.log10(rough)));
  const norm = rough / pow;
  let step;
  if (norm < 1.5) step = 1;
  else if (norm < 3.5) step = 2;
  else if (norm < 7.5) step = 5;
  else step = 10;
  return step * pow;
}

function formatNum(val, step) {
  const decimals = step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0;
  return val.toFixed(decimals);
}

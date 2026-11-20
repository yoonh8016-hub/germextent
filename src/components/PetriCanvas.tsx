import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Crosshair,
  Eye,
  EyeOff,
  Hand,
  Maximize2,
  Ruler,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type {
  CalibrationState,
  DraftCircle,
  ImageAdjustments,
  MeasurementMethod,
  Point,
  SampleMeasurement,
  ToolMode,
} from '../types/assay';
import {
  calculateZoneMetrics,
  distancePx,
  fitCircleFromThreePoints,
  midpoint,
} from '../utils/geometry';

export interface PetriCanvasHandle {
  exportAnnotatedDataUrl: () => string | null;
  fitToView: () => void;
}

interface PetriCanvasProps {
  imageSrc: string;
  adjustments: ImageAdjustments;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  measurementMethod: MeasurementMethod;
  calibration: CalibrationState;
  discDiameterMm: number;
  measurements: SampleMeasurement[];
  selectedMeasurementId: string | null;
  onSelectMeasurement: (id: string | null) => void;
  draftCircle: DraftCircle | null;
  onDraftCircleChange: (draft: DraftCircle | null) => void;
  onCalibrationComplete: (p1: Point, p2: Point) => void;
}

export const PetriCanvas = forwardRef<PetriCanvasHandle, PetriCanvasProps>(
  function PetriCanvas(
    {
      imageSrc,
      adjustments,
      toolMode,
      onToolModeChange,
      measurementMethod,
      calibration,
      discDiameterMm,
      measurements,
      selectedMeasurementId,
      onSelectMeasurement,
      draftCircle,
      onDraftCircleChange,
      onCalibrationComplete,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const imageRef = useRef<HTMLImageElement | null>(null);

    const [imgReady, setImgReady] = useState(false);
    const [imgSize, setImgSize] = useState<{ w: number; h: number }>({ w: 1200, h: 900 });
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
    const [showSavedOverlays, setShowSavedOverlays] = useState(true);
    const [showLoupe, setShowLoupe] = useState(true);
    const [spacePressed, setSpacePressed] = useState(false);

    // Interactive drawing states
    const [cursorImgPt, setCursorImgPt] = useState<Point | null>(null);
    const [hoverScreenPt, setHoverScreenPt] = useState<Point | null>(null);
    const [stepPoints, setStepPoints] = useState<Point[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const [calDraft, setCalDraft] = useState<{ p1: Point; p2: Point } | null>(null);
    const [noticeText, setNoticeText] = useState<string | null>(null);

    const panDragRef = useRef<{ active: boolean; lastScreen: Point }>({
      active: false,
      lastScreen: { x: 0, y: 0 },
    });
    const dragStartImgRef = useRef<Point | null>(null);
    const dragStartScreenRef = useRef<Point | null>(null);

    const buildFilterString = useCallback((adj: ImageAdjustments) => {
      const clarityContrast = adj.clarityBoost ? Math.min(280, Math.round(adj.contrast * 1.18)) : adj.contrast;
      const saturate = adj.clarityBoost && !adj.grayscale ? ' saturate(112%)' : '';
      return `brightness(${adj.brightness}%) contrast(${clarityContrast}%) grayscale(${
        adj.grayscale ? 100 : 0
      }%) invert(${adj.invert ? 100 : 0}%)${saturate}`;
    }, []);

    const fitToView = useCallback(() => {
      const container = containerRef.current;
      const img = imageRef.current;
      if (!container || !img || !img.naturalWidth) return;

      const rect = container.getBoundingClientRect();
      const pad = 32;
      const availW = Math.max(100, rect.width - pad * 2);
      const availH = Math.max(100, rect.height - pad * 2);
      const nextZoom = Math.min(availW / img.naturalWidth, availH / img.naturalHeight, 2.5);
      const nextPanX = (rect.width - img.naturalWidth * nextZoom) / 2;
      const nextPanY = (rect.height - img.naturalHeight * nextZoom) / 2;
      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    }, []);

    // Load image whenever imageSrc changes
    useEffect(() => {
      let cancelled = false;
      setImgReady(false);
      setStepPoints([]);
      setCalDraft(null);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        if (cancelled) return;
        imageRef.current = img;
        setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
        setImgReady(true);
        requestAnimationFrame(() => fitToView());
      };
      img.src = imageSrc;
      return () => {
        cancelled = true;
      };
    }, [imageSrc, fitToView]);

    // Reset pending step points when switching mode/method
    useEffect(() => {
      setStepPoints([]);
      setCalDraft(null);
      setIsDragging(false);
    }, [toolMode, measurementMethod]);

    // Spacebar pan shortcut
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.code === 'Space' &&
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          setSpacePressed(true);
        } else if (e.key === 'Escape') {
          setStepPoints([]);
          setCalDraft(null);
          setIsDragging(false);
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          setSpacePressed(false);
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
      };
    }, []);

    // Expose export & fitToView
    useImperativeHandle(
      ref,
      () => ({
        fitToView,
        exportAnnotatedDataUrl: () => {
          const img = imageRef.current;
          if (!img || !img.naturalWidth) return null;
          const off = document.createElement('canvas');
          off.width = img.naturalWidth;
          off.height = img.naturalHeight;
          const ctx = off.getContext('2d');
          if (!ctx) return null;

          ctx.filter = buildFilterString(adjustments);
          ctx.drawImage(img, 0, 0);
          ctx.filter = 'none';

          const discRadiusPx = (discDiameterMm / 2) * calibration.pixelsPerMm;
          for (const m of measurements) {
            if (!m.visible) continue;
            const isPos = m.controlType === 'positive';
            const isNeg = m.controlType === 'negative';
            const strokeColor = isPos ? '#f59e0b' : isNeg ? '#94a3b8' : '#0ea5e9';

            ctx.beginPath();
            ctx.arc(m.center.x, m.center.y, m.radiusPx, 0, Math.PI * 2);
            ctx.fillStyle = isPos
              ? 'rgba(245, 158, 11, 0.12)'
              : isNeg
                ? 'rgba(148, 163, 184, 0.08)'
                : 'rgba(14, 165, 233, 0.12)';
            ctx.fill();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            // Inner paper disc dashed ring
            const dRad = (m.discDiameterMm / 2) * calibration.pixelsPerMm || discRadiusPx;
            ctx.beginPath();
            ctx.arc(m.center.x, m.center.y, dRad, 0, Math.PI * 2);
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
            ctx.setLineDash([]);

            // Index badge
            const label = `#${m.index} ${m.netAreaMm2.toFixed(1)}mm²`;
            ctx.font = '600 13px "JetBrains Mono", monospace';
            const tw = ctx.measureText(label).width + 12;
            const lx = m.center.x - tw / 2;
            const ly = m.center.y - m.radiusPx - 24;
            ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
            ctx.fillRect(lx, ly, tw, 20);
            ctx.fillStyle = '#f8fafc';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, m.center.x, ly + 10);
          }

          return off.toDataURL('image/png');
        },
      }),
      [adjustments, buildFilterString, calibration.pixelsPerMm, discDiameterMm, fitToView, measurements]
    );

    // Coordinate conversion helpers
    const screenToImage = useCallback(
      (sx: number, sy: number): Point => ({
        x: (sx - pan.x) / zoom,
        y: (sy - pan.y) / zoom,
      }),
      [pan.x, pan.y, zoom]
    );

    const drawScene = useCallback(() => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      const img = imageRef.current;
      if (!canvas || !container) return;

      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const targetW = Math.max(1, Math.round(rect.width * dpr));
      const targetH = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, rect.width, rect.height);

      // Subtle optical stage backdrop grid
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
      ctx.lineWidth = 1;
      for (let gx = 0; gx < rect.width; gx += 32) {
        ctx.beginPath();
        ctx.moveTo(gx, 0);
        ctx.lineTo(gx, rect.height);
        ctx.stroke();
      }
      for (let gy = 0; gy < rect.height; gy += 32) {
        ctx.beginPath();
        ctx.moveTo(0, gy);
        ctx.lineTo(rect.width, gy);
        ctx.stroke();
      }

      if (!imgReady || !img) {
        ctx.restore();
        return;
      }

      // World transform
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);

      // Draw filtered Petri dish image
      ctx.save();
      ctx.filter = buildFilterString(adjustments);
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      const pxPerMm = calibration.pixelsPerMm;

      // Saved calibration line
      if (calibration.isCalibrated) {
        const cp1 = calDraft?.p1 ?? calibration.p1;
        const cp2 = calDraft?.p2 ?? calibration.p2;
        if (toolMode === 'calibrate' || calDraft) {
          ctx.beginPath();
          ctx.moveTo(cp1.x, cp1.y);
          ctx.lineTo(cp2.x, cp2.y);
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = 2.5 / zoom;
          ctx.stroke();

          for (const pt of [cp1, cp2]) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 5 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
            ctx.strokeStyle = '#090d16';
            ctx.lineWidth = 1.5 / zoom;
            ctx.stroke();
          }

          const mid = midpoint(cp1, cp2);
          const dist = distancePx(cp1, cp2);
          const label = `${calibration.knownMm.toFixed(1)} mm (${dist.toFixed(1)} px)`;
          ctx.font = `600 ${11 / zoom}px "JetBrains Mono", monospace`;
          const tw = ctx.measureText(label).width + 12 / zoom;
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(mid.x - tw / 2, mid.y - 24 / zoom, tw, 18 / zoom);
          ctx.fillStyle = '#fbbf24';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(label, mid.x, mid.y - 15 / zoom);
        }
      }

      // Saved measurement overlays
      if (showSavedOverlays) {
        for (const m of measurements) {
          if (!m.visible) continue;
          const isSelected = m.id === selectedMeasurementId;
          const isPos = m.controlType === 'positive';
          const isNeg = m.controlType === 'negative';
          const stroke = isSelected
            ? '#22d3ee'
            : isPos
              ? '#f59e0b'
              : isNeg
                ? '#94a3b8'
                : '#38bdf8';

          ctx.beginPath();
          ctx.arc(m.center.x, m.center.y, m.radiusPx, 0, Math.PI * 2);
          ctx.fillStyle = isSelected
            ? 'rgba(34, 211, 238, 0.16)'
            : isPos
              ? 'rgba(245, 158, 11, 0.08)'
              : 'rgba(56, 189, 248, 0.08)';
          ctx.fill();
          ctx.strokeStyle = stroke;
          ctx.lineWidth = (isSelected ? 3 : 2) / zoom;
          ctx.stroke();

          // Inner disc exclusion ring
          const dRad = (m.discDiameterMm / 2) * pxPerMm;
          ctx.beginPath();
          ctx.arc(m.center.x, m.center.y, dRad, 0, Math.PI * 2);
          ctx.setLineDash([4 / zoom, 4 / zoom]);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
          ctx.lineWidth = 1.2 / zoom;
          ctx.stroke();
          ctx.setLineDash([]);

          // Center crosshair dot
          ctx.beginPath();
          ctx.arc(m.center.x, m.center.y, 2.5 / zoom, 0, Math.PI * 2);
          ctx.fillStyle = stroke;
          ctx.fill();

          // Compact index & net area pill tag on canvas
          const tag = `#${m.index} · ${m.netAreaMm2.toFixed(1)} mm²`;
          ctx.font = `600 ${11 / zoom}px "JetBrains Mono", monospace`;
          const tw = ctx.measureText(tag).width + 12 / zoom;
          const boxH = 18 / zoom;
          const bx = m.center.x - tw / 2;
          const by = m.center.y - m.radiusPx - boxH - 4 / zoom;

          ctx.fillStyle = isSelected ? '#0284c7' : 'rgba(15, 23, 42, 0.84)';
          ctx.fillRect(bx, by, tw, boxH);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1 / zoom;
          ctx.strokeRect(bx, by, tw, boxH);

          ctx.fillStyle = '#f8fafc';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(tag, m.center.x, by + boxH / 2);
        }
      }

      // Live rubber-band preview when user is placing points
      let livePreview: { center: Point; radiusPx: number } | null = null;
      if (toolMode === 'measure') {
        if (measurementMethod === 'center-edge' && stepPoints.length === 1 && cursorImgPt) {
          livePreview = {
            center: stepPoints[0],
            radiusPx: distancePx(stepPoints[0], cursorImgPt),
          };
        } else if (measurementMethod === 'two-point' && stepPoints.length === 1 && cursorImgPt) {
          livePreview = {
            center: midpoint(stepPoints[0], cursorImgPt),
            radiusPx: distancePx(stepPoints[0], cursorImgPt) / 2,
          };
        } else if (measurementMethod === 'three-point') {
          for (const pt of stepPoints) {
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, 4.5 / zoom, 0, Math.PI * 2);
            ctx.fillStyle = '#22d3ee';
            ctx.fill();
          }
          if (stepPoints.length === 2 && cursorImgPt) {
            const fitted = fitCircleFromThreePoints(stepPoints[0], stepPoints[1], cursorImgPt);
            if (fitted) {
              livePreview = fitted;
            }
          }
        }
      }

      const activeRing =
        livePreview ??
        (draftCircle
          ? { center: draftCircle.center, radiusPx: draftCircle.radiusPx }
          : null);

      if (activeRing && activeRing.radiusPx > 1) {
        const metrics = calculateZoneMetrics(activeRing.radiusPx, pxPerMm, discDiameterMm);
        const discRadPx = (discDiameterMm / 2) * pxPerMm;

        // Outer inhibition zone
        ctx.beginPath();
        ctx.arc(activeRing.center.x, activeRing.center.y, activeRing.radiusPx, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(6, 182, 212, 0.16)';
        ctx.fill();
        ctx.strokeStyle = '#22d3ee';
        ctx.lineWidth = 2.5 / zoom;
        ctx.stroke();

        // Inner paper disc boundary
        ctx.beginPath();
        ctx.arc(activeRing.center.x, activeRing.center.y, discRadPx, 0, Math.PI * 2);
        ctx.setLineDash([5 / zoom, 4 / zoom]);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.6 / zoom;
        ctx.stroke();
        ctx.setLineDash([]);

        // Radius vector line
        const edgePt =
          livePreview && cursorImgPt
            ? cursorImgPt
            : { x: activeRing.center.x + activeRing.radiusPx, y: activeRing.center.y };
        ctx.beginPath();
        ctx.moveTo(activeRing.center.x, activeRing.center.y);
        ctx.lineTo(edgePt.x, edgePt.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.4 / zoom;
        ctx.stroke();

        // Center crosshair
        const ch = 7 / zoom;
        ctx.beginPath();
        ctx.moveTo(activeRing.center.x - ch, activeRing.center.y);
        ctx.lineTo(activeRing.center.x + ch, activeRing.center.y);
        ctx.moveTo(activeRing.center.x, activeRing.center.y - ch);
        ctx.lineTo(activeRing.center.x, activeRing.center.y + ch);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.8 / zoom;
        ctx.stroke();

        // Live floating dimension label
        const hudLabel = `D: ${metrics.zoneDiameterMm.toFixed(2)} mm · Net: ${metrics.netAreaMm2.toFixed(1)} mm²`;
        ctx.font = `600 ${11.5 / zoom}px "JetBrains Mono", monospace`;
        const lw = ctx.measureText(hudLabel).width + 14 / zoom;
        const lh = 20 / zoom;
        const lx = activeRing.center.x - lw / 2;
        const ly = activeRing.center.y + activeRing.radiusPx + 8 / zoom;
        ctx.fillStyle = 'rgba(2, 132, 199, 0.95)';
        ctx.fillRect(lx, ly, lw, lh);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(hudLabel, activeRing.center.x, ly + lh / 2);
      }

      ctx.restore();

      // Optical 2.5x Precision Loupe in bottom-left corner during hover
      if (
        showLoupe &&
        hoverScreenPt &&
        cursorImgPt &&
        toolMode !== 'pan' &&
        !spacePressed &&
        cursorImgPt.x >= 0 &&
        cursorImgPt.y >= 0 &&
        cursorImgPt.x <= img.naturalWidth &&
        cursorImgPt.y <= img.naturalHeight
      ) {
        const loupeSize = 112;
        const margin = 14;
        const lx = margin;
        const ly = rect.height - loupeSize - margin;
        const mag = 2.6;
        const sampleHalf = loupeSize / (2 * mag * zoom);

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(lx, ly, loupeSize, loupeSize, 10);
        ctx.clip();

        ctx.fillStyle = '#090d16';
        ctx.fillRect(lx, ly, loupeSize, loupeSize);

        ctx.save();
        ctx.filter = buildFilterString(adjustments);
        ctx.drawImage(
          img,
          cursorImgPt.x - sampleHalf,
          cursorImgPt.y - sampleHalf,
          sampleHalf * 2,
          sampleHalf * 2,
          lx,
          ly,
          loupeSize,
          loupeSize
        );
        ctx.restore();

        // Hairline crosshair inside loupe
        const cx = lx + loupeSize / 2;
        const cy = ly + loupeSize / 2;
        ctx.strokeStyle = 'rgba(34, 211, 238, 0.85)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 14, cy);
        ctx.lineTo(cx + 14, cy);
        ctx.moveTo(cx, cy - 14);
        ctx.lineTo(cx, cy + 14);
        ctx.stroke();

        ctx.restore();

        // Loupe border & tag
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.roundRect(lx, ly, loupeSize, loupeSize, 10);
        ctx.stroke();

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(lx + 6, ly + 6, 48, 16);
        ctx.fillStyle = '#e2e8f0';
        ctx.font = '600 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText('2.6× LOUPE', lx + 10, ly + 14);
      }

      ctx.restore();
    }, [
      adjustments,
      buildFilterString,
      calDraft,
      calibration.isCalibrated,
      calibration.knownMm,
      calibration.p1,
      calibration.p2,
      calibration.pixelsPerMm,
      cursorImgPt,
      discDiameterMm,
      draftCircle,
      hoverScreenPt,
      imgReady,
      measurementMethod,
      measurements,
      pan.x,
      pan.y,
      selectedMeasurementId,
      showLoupe,
      showSavedOverlays,
      spacePressed,
      stepPoints,
      toolMode,
      zoom,
    ]);

    useEffect(() => {
      drawScene();
    }, [drawScene]);

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;
      const obs = new ResizeObserver(() => {
        drawScene();
      });
      obs.observe(container);
      return () => obs.disconnect();
    }, [drawScene]);

    const showTempNotice = (msg: string) => {
      setNoticeText(msg);
      setTimeout(() => setNoticeText(null), 2600);
    };

    const getLocalScreenPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
      const rect = e.currentTarget.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      const sp = getLocalScreenPoint(e);
      const ip = screenToImage(sp.x, sp.y);

      if (toolMode === 'pan' || spacePressed || e.button === 1) {
        panDragRef.current = { active: true, lastScreen: sp };
        return;
      }

      if (toolMode === 'calibrate') {
        if (stepPoints.length === 0) {
          setStepPoints([ip]);
          setCalDraft({ p1: ip, p2: ip });
          setIsDragging(true);
          dragStartImgRef.current = ip;
          dragStartScreenRef.current = sp;
        } else {
          const p1 = stepPoints[0];
          if (distancePx(p1, ip) > 4) {
            onCalibrationComplete(p1, ip);
            showTempNotice('스케일 보정이 업데이트되었습니다.');
          }
          setStepPoints([]);
          setCalDraft(null);
          setIsDragging(false);
        }
        return;
      }

      // Measurement mode
      if (measurementMethod === 'center-edge') {
        if (stepPoints.length === 0) {
          // Check if user clicked on an existing measurement center/circle when not dragging
          setStepPoints([ip]);
          setIsDragging(true);
          dragStartImgRef.current = ip;
          dragStartScreenRef.current = sp;
        } else {
          const center = stepPoints[0];
          const radiusPx = distancePx(center, ip);
          if (radiusPx > 3) {
            onDraftCircleChange({
              center,
              radiusPx,
              method: 'center-edge',
              anchorPoints: [center, ip],
            });
          }
          setStepPoints([]);
          setIsDragging(false);
        }
      } else if (measurementMethod === 'two-point') {
        if (stepPoints.length === 0) {
          setStepPoints([ip]);
          setIsDragging(true);
          dragStartImgRef.current = ip;
          dragStartScreenRef.current = sp;
        } else {
          const p1 = stepPoints[0];
          const dist = distancePx(p1, ip);
          if (dist > 6) {
            onDraftCircleChange({
              center: midpoint(p1, ip),
              radiusPx: dist / 2,
              method: 'two-point',
              anchorPoints: [p1, ip],
            });
          }
          setStepPoints([]);
          setIsDragging(false);
        }
      } else if (measurementMethod === 'three-point') {
        const next = [...stepPoints, ip];
        if (next.length < 3) {
          setStepPoints(next);
        } else {
          const fitted = fitCircleFromThreePoints(next[0], next[1], next[2]);
          if (fitted) {
            onDraftCircleChange({
              center: fitted.center,
              radiusPx: fitted.radiusPx,
              method: 'three-point',
              anchorPoints: next,
            });
          } else {
            showTempNotice('세 점이 일직선에 가깝습니다. 서로 떨어진 경계점 3개를 선택하세요.');
          }
          setStepPoints([]);
        }
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      const sp = getLocalScreenPoint(e);
      const ip = screenToImage(sp.x, sp.y);
      setHoverScreenPt(sp);
      setCursorImgPt(ip);

      if (panDragRef.current.active) {
        const dx = sp.x - panDragRef.current.lastScreen.x;
        const dy = sp.y - panDragRef.current.lastScreen.y;
        panDragRef.current.lastScreen = sp;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        return;
      }

      if (toolMode === 'calibrate' && isDragging && dragStartImgRef.current) {
        setCalDraft({ p1: dragStartImgRef.current, p2: ip });
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }

      if (panDragRef.current.active) {
        panDragRef.current.active = false;
        return;
      }

      if (!isDragging || !dragStartScreenRef.current || !dragStartImgRef.current) {
        return;
      }

      const sp = getLocalScreenPoint(e);
      const ip = screenToImage(sp.x, sp.y);
      const screenMove = distancePx(dragStartScreenRef.current, sp);

      // If user dragged > 6px on screen, commit drag immediately; otherwise keep stepPoints[0] for 2-click workflow
      if (screenMove > 6) {
        if (toolMode === 'calibrate') {
          if (distancePx(dragStartImgRef.current, ip) > 4) {
            onCalibrationComplete(dragStartImgRef.current, ip);
            showTempNotice('스케일 보정이 완료되었습니다.');
          }
          setStepPoints([]);
          setCalDraft(null);
        } else if (toolMode === 'measure' && measurementMethod === 'center-edge') {
          const rPx = distancePx(dragStartImgRef.current, ip);
          if (rPx > 3) {
            onDraftCircleChange({
              center: dragStartImgRef.current,
              radiusPx: rPx,
              method: 'center-edge',
              anchorPoints: [dragStartImgRef.current, ip],
            });
          }
          setStepPoints([]);
        } else if (toolMode === 'measure' && measurementMethod === 'two-point') {
          const dist = distancePx(dragStartImgRef.current, ip);
          if (dist > 6) {
            onDraftCircleChange({
              center: midpoint(dragStartImgRef.current, ip),
              radiusPx: dist / 2,
              method: 'two-point',
              anchorPoints: [dragStartImgRef.current, ip],
            });
          }
          setStepPoints([]);
        }
      } else if (toolMode === 'measure' && measurementMethod === 'center-edge' && stepPoints.length === 1) {
        // Also check if user single-clicked inside a saved circle to select it? Only if not finishing a 2-click!
        // Keep 2-click ready, and let users select rows from the table or right panel cleanly.
        const hit = measurements.find(
          (m) => m.visible && distancePx(m.center, ip) <= (m.discDiameterMm / 2) * calibration.pixelsPerMm
        );
        if (hit && selectedMeasurementId !== hit.id) {
          onSelectMeasurement(hit.id);
        }
      }

      setIsDragging(false);
    };

    const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const rect = e.currentTarget.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const nextZoom = Math.min(6, Math.max(0.25, zoom * factor));
      const nextPanX = sx - ((sx - pan.x) / zoom) * nextZoom;
      const nextPanY = sy - ((sy - pan.y) / zoom) * nextZoom;
      setZoom(nextZoom);
      setPan({ x: nextPanX, y: nextPanY });
    };

    const adjustZoom = (factor: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const nextZoom = Math.min(6, Math.max(0.25, zoom * factor));
      setPan({
        x: cx - ((cx - pan.x) / zoom) * nextZoom,
        y: cy - ((cy - pan.y) / zoom) * nextZoom,
      });
      setZoom(nextZoom);
    };

    const activeGuideText = (() => {
      if (toolMode === 'pan' || spacePressed) {
        return '드래그하여 이미지를 이동하세요. (마우스 휠: 확대/축소)';
      }
      if (toolMode === 'calibrate') {
        return stepPoints.length === 0
          ? `기준 대상(${calibration.knownMm.toFixed(1)} mm)의 양 끝점을 드래그하거나 차례로 2회 클릭하세요.`
          : '반대쪽 끝점을 클릭하여 스케일 보정을 완료하세요. (ESC: 취소)';
      }
      if (measurementMethod === 'center-edge') {
        return stepPoints.length === 0
          ? '디스크 중심을 클릭 후 억제환 경계까지 드래그(또는 2회 클릭)하세요. (Space+드래그: 이동)'
          : '억제환 외곽 경계를 클릭하여 반지름을 확정하세요. (ESC: 취소)';
      }
      if (measurementMethod === 'two-point') {
        return stepPoints.length === 0
          ? '억제환 양쪽 경계의 첫 번째 지점을 클릭 또는 드래그하세요.'
          : '맞은편 경계 지점을 클릭하세요. (ESC: 취소)';
      }
      return `억제환 외곽 경계 위 서로 다른 3개 지점을 클릭하세요 (${stepPoints.length}/3 선택됨).`;
    })();

    const cursorClass =
      toolMode === 'pan' || spacePressed ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair';

    return (
      <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-950 overflow-hidden">
        {/* Optical Stage Top Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 bg-slate-900 border-b border-slate-800 text-slate-200">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onToolModeChange('measure')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                toolMode === 'measure'
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              억제환 측정
            </button>
            <button
              type="button"
              onClick={() => onToolModeChange('calibrate')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                toolMode === 'calibrate'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Ruler className="w-3.5 h-3.5" />
              스케일 보정
            </button>
            <button
              type="button"
              onClick={() => onToolModeChange('pan')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                toolMode === 'pan'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              }`}
            >
              <Hand className="w-3.5 h-3.5" />
              화면 이동
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setShowLoupe((v) => !v)}
              title="정밀 돋보기 켜기/끄기"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                showLoupe
                  ? 'bg-slate-800 text-sky-300 border border-slate-700'
                  : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              <ScanSearch className="w-3.5 h-3.5" />
              돋보기
            </button>
            <button
              type="button"
              onClick={() => setShowSavedOverlays((v) => !v)}
              title="저장된 측정 원 표시/숨기기"
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors whitespace-nowrap"
            >
              {showSavedOverlays ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              주석 {showSavedOverlays ? '표시' : '숨김'}
            </button>

            <div className="h-4 w-px bg-slate-700 mx-1" />

            <button
              type="button"
              onClick={() => adjustZoom(0.84)}
              aria-label="축소"
              className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="font-mono tabular-nums text-xs text-slate-200 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              onClick={() => adjustZoom(1.18)}
              aria-label="확대"
              className="p-1.5 rounded-md text-slate-300 hover:bg-slate-800 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={fitToView}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              맞춤
            </button>
          </div>
        </div>

        {/* Interactive Canvas Viewport */}
        <div ref={containerRef} className="relative w-full h-[540px] lg:h-[600px] select-none overflow-hidden">
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              setHoverScreenPt(null);
              setCursorImgPt(null);
            }}
            onWheel={handleWheel}
            className={`w-full h-full block touch-none ${cursorClass}`}
          />

          {/* Top-Left Instruction Strip */}
          <div className="pointer-events-none absolute top-3 left-3 max-w-[78%] rounded-md bg-slate-900/85 border border-slate-700/80 px-3 py-1.5 text-xs text-slate-200 backdrop-blur-sm">
            {noticeText ?? activeGuideText}
          </div>

          {/* Bottom-Right Coordinate & Scale Readout */}
          <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-slate-900/85 border border-slate-700/80 px-3 py-1.5 font-mono tabular-nums text-[11px] text-slate-300 flex items-center gap-3 backdrop-blur-sm">
            <span>
              {cursorImgPt
                ? `X: ${Math.round(cursorImgPt.x)} · Y: ${Math.round(cursorImgPt.y)} px`
                : `${imgSize.w} × ${imgSize.h} px`}
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-sky-300">
              {calibration.pixelsPerMm.toFixed(2)} px/mm ({(1 / calibration.pixelsPerMm).toFixed(4)} mm/px)
            </span>
          </div>
        </div>
      </div>
    );
  }
);

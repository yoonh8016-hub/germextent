import type { CalibrationState, Point, SampleMeasurement } from '../types/assay';

export function distancePx(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.hypot(dx, dy);
}

export function midpoint(a: Point, b: Point): Point {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
  };
}

/**
 * Computes exact circumcircle from 3 non-collinear points.
 * Returns null if the points are nearly collinear.
 */
export function fitCircleFromThreePoints(
  p1: Point,
  p2: Point,
  p3: Point
): { center: Point; radiusPx: number } | null {
  const ax = p1.x;
  const ay = p1.y;
  const bx = p2.x;
  const by = p2.y;
  const cx = p3.x;
  const cy = p3.y;

  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-4) {
    return null;
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;
  const cSq = cx * cx + cy * cy;

  const ux = (aSq * (by - cy) + bSq * (cy - ay) + cSq * (ay - by)) / d;
  const uy = (aSq * (cx - bx) + bSq * (ax - cx) + cSq * (bx - ax)) / d;

  const center = { x: ux, y: uy };
  const radiusPx = distancePx(center, p1);
  if (!Number.isFinite(radiusPx) || radiusPx <= 0 || radiusPx > 10000) {
    return null;
  }
  return { center, radiusPx };
}

export interface ZoneMetrics {
  zoneRadiusMm: number;
  zoneDiameterMm: number;
  totalAreaMm2: number;
  discAreaMm2: number;
  netAreaMm2: number;
}

/**
 * Computes diameter, total circle area, paper disc area, and net inhibition area:
 * A_net = π * r_zone^2 - π * (d_disc / 2)^2
 */
export function calculateZoneMetrics(
  radiusPx: number,
  pixelsPerMm: number,
  discDiameterMm: number
): ZoneMetrics {
  const safeScale = pixelsPerMm > 0 ? pixelsPerMm : 10;
  const safeDisc = Math.max(0.5, discDiameterMm || 6.0);

  const zoneRadiusMm = radiusPx / safeScale;
  const zoneDiameterMm = zoneRadiusMm * 2;
  const totalAreaMm2 = Math.PI * zoneRadiusMm * zoneRadiusMm;

  const discRadiusMm = safeDisc / 2;
  const discAreaMm2 = Math.PI * discRadiusMm * discRadiusMm;
  const netAreaMm2 = Math.max(0, totalAreaMm2 - discAreaMm2);

  return {
    zoneRadiusMm,
    zoneDiameterMm,
    totalAreaMm2,
    discAreaMm2,
    netAreaMm2,
  };
}

export function recalculateMeasurement(
  m: SampleMeasurement,
  pixelsPerMm: number,
  discDiameterMmOverride?: number
): SampleMeasurement {
  const discMm = discDiameterMmOverride ?? m.discDiameterMm;
  const metrics = calculateZoneMetrics(m.radiusPx, pixelsPerMm, discMm);
  return {
    ...m,
    discDiameterMm: discMm,
    ...metrics,
  };
}

export interface DemoPlateBundle {
  imageDataUrl: string;
  width: number;
  height: number;
  calibration: CalibrationState;
  measurements: SampleMeasurement[];
}

/**
 * Generates a realistic 1200x900 laboratory Petri dish image with Mueller-Hinton agar,
 * bacterial lawn texture, 6.0mm paper discs, and calibrated inhibition zones
 * for immediate demonstration and verification.
 */
export function generateDemoPlateBundle(): DemoPlateBundle {
  const width = 1200;
  const height = 900;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Scale: 90mm dish spans ~760px => 8.4444 px/mm
  const pixelsPerMm = 8.4444;
  const dishCenter: Point = { x: 600, y: 450 };
  const dishRadiusPx = 45 * pixelsPerMm; // 380px -> 90mm dish
  const discDiameterMm = 6.0;
  const discRadiusPx = (discDiameterMm / 2) * pixelsPerMm; // ~25.33px

  const demoSpecs: Array<{
    sampleName: string;
    concentration: string;
    controlType: 'none' | 'positive' | 'negative';
    center: Point;
    zoneDiameterMm: number;
    notes: string;
  }> = [
    {
      sampleName: '반코마이신 (Vancomycin)',
      concentration: '30 µg/disc',
      controlType: 'positive',
      center: { x: 600, y: 235 },
      zoneDiameterMm: 22.6,
      notes: '양성대조군 · 선명한 완전 억제환',
    },
    {
      sampleName: '배초향 4%',
      concentration: '40 mg/mL (4%)',
      controlType: 'none',
      center: { x: 805, y: 345 },
      zoneDiameterMm: 18.8,
      notes: '고농도 배초향 에탄올 추출물',
    },
    {
      sampleName: '배초향 2%',
      concentration: '20 mg/mL (2%)',
      controlType: 'none',
      center: { x: 770, y: 585 },
      zoneDiameterMm: 15.2,
      notes: '중농도 배초향 추출물',
    },
    {
      sampleName: '배초향 1%',
      concentration: '10 mg/mL (1%)',
      controlType: 'none',
      center: { x: 430, y: 585 },
      zoneDiameterMm: 11.4,
      notes: '저농도 배초향 추출물',
    },
    {
      sampleName: '구절초 추출물',
      concentration: '40 mg/mL (4%)',
      controlType: 'none',
      center: { x: 395, y: 345 },
      zoneDiameterMm: 16.6,
      notes: '구절초 지상부 에탄올 추출물',
    },
    {
      sampleName: 'DMSO (음성대조군)',
      concentration: '100% Solvent',
      controlType: 'negative',
      center: { x: 600, y: 458 },
      zoneDiameterMm: 6.0,
      notes: '용매 대조군 · 억제환 미형성',
    },
  ];

  if (ctx) {
    // Dark laboratory inspection mat background
    ctx.fillStyle = '#151b26';
    ctx.fillRect(0, 0, width, height);

    // Subtle bench grid
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= width; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Outer plastic Petri dish shadow & rim
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.65)';
    ctx.shadowBlur = 38;
    ctx.shadowOffsetY = 12;
    ctx.beginPath();
    ctx.arc(dishCenter.x, dishCenter.y, dishRadiusPx + 14, 0, Math.PI * 2);
    ctx.fillStyle = '#263040';
    ctx.fill();
    ctx.restore();

    // Polystyrene rim highlights
    const rimGrad = ctx.createLinearGradient(
      dishCenter.x - dishRadiusPx,
      dishCenter.y - dishRadiusPx,
      dishCenter.x + dishRadiusPx,
      dishCenter.y + dishRadiusPx
    );
    rimGrad.addColorStop(0, '#cbd5e1');
    rimGrad.addColorStop(0.5, '#64748b');
    rimGrad.addColorStop(1, '#94a3b8');
    ctx.beginPath();
    ctx.arc(dishCenter.x, dishCenter.y, dishRadiusPx + 12, 0, Math.PI * 2);
    ctx.strokeStyle = rimGrad;
    ctx.lineWidth = 8;
    ctx.stroke();

    // Clip inside agar plate
    ctx.save();
    ctx.beginPath();
    ctx.arc(dishCenter.x, dishCenter.y, dishRadiusPx, 0, Math.PI * 2);
    ctx.clip();

    // Bacterial lawn (warm turbid Mueller-Hinton agar color)
    const lawnGrad = ctx.createRadialGradient(
      dishCenter.x - 60,
      dishCenter.y - 60,
      30,
      dishCenter.x,
      dishCenter.y,
      dishRadiusPx
    );
    lawnGrad.addColorStop(0, '#d8c99b');
    lawnGrad.addColorStop(0.7, '#c7b581');
    lawnGrad.addColorStop(1, '#ae9b66');
    ctx.fillStyle = lawnGrad;
    ctx.fillRect(
      dishCenter.x - dishRadiusPx,
      dishCenter.y - dishRadiusPx,
      dishRadiusPx * 2,
      dishRadiusPx * 2
    );

    // Deterministic micro-colony lawn texture (pseudo-random seeded)
    let seed = 4219;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < 4200; i++) {
      const angle = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * dishRadiusPx;
      const px = dishCenter.x + Math.cos(angle) * r;
      const py = dishCenter.y + Math.sin(angle) * r;
      const size = 0.8 + rand() * 1.9;
      ctx.fillStyle =
        rand() > 0.5 ? 'rgba(248, 242, 218, 0.28)' : 'rgba(130, 110, 62, 0.22)';
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw clear inhibition zones (darker translucent agar showing through lawn)
    for (const spec of demoSpecs) {
      const zoneRadiusPx = (spec.zoneDiameterMm / 2) * pixelsPerMm;
      if (zoneRadiusPx > discRadiusPx + 1.5) {
        const haloGrad = ctx.createRadialGradient(
          spec.center.x,
          spec.center.y,
          discRadiusPx * 0.9,
          spec.center.x,
          spec.center.y,
          zoneRadiusPx * 1.03
        );
        haloGrad.addColorStop(0, 'rgba(62, 54, 34, 0.86)');
        haloGrad.addColorStop(0.86, 'rgba(68, 60, 38, 0.82)');
        haloGrad.addColorStop(0.96, 'rgba(132, 118, 76, 0.45)');
        haloGrad.addColorStop(1, 'rgba(199, 181, 129, 0)');

        ctx.beginPath();
        ctx.arc(spec.center.x, spec.center.y, zoneRadiusPx * 1.03, 0, Math.PI * 2);
        ctx.fillStyle = haloGrad;
        ctx.fill();

        // Subtle clear-zone boundary meniscus
        ctx.beginPath();
        ctx.arc(spec.center.x, spec.center.y, zoneRadiusPx, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(245, 236, 200, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }

    // Draw 6.0mm sterile white paper discs with realistic thickness shadow
    for (let idx = 0; idx < demoSpecs.length; idx++) {
      const spec = demoSpecs[idx];
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 5;
      ctx.shadowOffsetX = 1.5;
      ctx.shadowOffsetY = 2;

      const discGrad = ctx.createRadialGradient(
        spec.center.x - 4,
        spec.center.y - 4,
        2,
        spec.center.x,
        spec.center.y,
        discRadiusPx
      );
      discGrad.addColorStop(0, '#ffffff');
      discGrad.addColorStop(0.82, '#f1f5f9');
      discGrad.addColorStop(1, '#cbd5e1');

      ctx.beginPath();
      ctx.arc(spec.center.x, spec.center.y, discRadiusPx, 0, Math.PI * 2);
      ctx.fillStyle = discGrad;
      ctx.fill();
      ctx.restore();

      // Faint ink sample code on paper disc
      ctx.fillStyle = 'rgba(71, 85, 105, 0.65)';
      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`S${idx + 1}`, spec.center.x, spec.center.y);
    }

    // Inner dish edge reflection
    ctx.beginPath();
    ctx.arc(dishCenter.x, dishCenter.y, dishRadiusPx - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.restore();
  }

  // Calibration calibrated across the first 6.0mm paper disc
  const calDiscCenter = demoSpecs[0].center;
  const calibration: CalibrationState = {
    mode: 'disc',
    p1: { x: calDiscCenter.x - discRadiusPx, y: calDiscCenter.y },
    p2: { x: calDiscCenter.x + discRadiusPx, y: calDiscCenter.y },
    knownMm: discDiameterMm,
    pixelsPerMm,
    isCalibrated: true,
  };

  const measurements: SampleMeasurement[] = demoSpecs.map((spec, idx) => {
    const radiusPx = (spec.zoneDiameterMm / 2) * pixelsPerMm;
    const metrics = calculateZoneMetrics(radiusPx, pixelsPerMm, discDiameterMm);
    return {
      id: `demo-${idx + 1}`,
      index: idx + 1,
      sampleName: spec.sampleName,
      concentration: spec.concentration,
      discDiameterMm,
      center: spec.center,
      radiusPx,
      ...metrics,
      controlType: spec.controlType,
      visible: true,
      notes: spec.notes,
    };
  });

  return {
    imageDataUrl: canvas.toDataURL('image/png'),
    width,
    height,
    calibration,
    measurements,
  };
}

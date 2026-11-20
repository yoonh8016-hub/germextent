import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Minus,
  Plus,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import { ComparisonChart, type ComparisonChartHandle } from './components/ComparisonChart';
import { MeasurementTable } from './components/MeasurementTable';
import { PetriCanvas, type PetriCanvasHandle } from './components/PetriCanvas';
import { ReportModal } from './components/ReportModal';
import type {
  CalibrationMode,
  CalibrationState,
  ControlType,
  DraftCircle,
  ExperimentMeta,
  ImageAdjustments,
  MeasurementMethod,
  Point,
  SampleMeasurement,
  ToolMode,
} from './types/assay';
import {
  calculateZoneMetrics,
  distancePx,
  generateDemoPlateBundle,
  recalculateMeasurement,
} from './utils/geometry';
import {
  buildTextReport,
  computeSummaryStats,
  downloadCsv,
  downloadHtmlReport,
  downloadStandaloneAppHtml,
} from './utils/reportExport';

const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  brightness: 100,
  contrast: 100,
  grayscale: false,
  invert: false,
  clarityBoost: false,
};

const QUICK_SAMPLE_PRESETS: Array<{
  label: string;
  sampleName: string;
  concentration: string;
  controlType: ControlType;
}> = [
  { label: '배초향 1%', sampleName: '배초향 1%', concentration: '10 mg/mL (1%)', controlType: 'none' },
  { label: '배초향 2%', sampleName: '배초향 2%', concentration: '20 mg/mL (2%)', controlType: 'none' },
  { label: '배초향 4%', sampleName: '배초향 4%', concentration: '40 mg/mL (4%)', controlType: 'none' },
  { label: '구절초', sampleName: '구절초 추출물', concentration: '40 mg/mL (4%)', controlType: 'none' },
  { label: '반코마이신', sampleName: '반코마이신 (Vancomycin)', concentration: '30 µg/disc', controlType: 'positive' },
  { label: 'DMSO', sampleName: 'DMSO (음성대조군)', concentration: '100% Solvent', controlType: 'negative' },
];

export default function App() {
  const canvasHandleRef = useRef<PetriCanvasHandle | null>(null);
  const chartHandleRef = useRef<ComparisonChartHandle | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initialDemo = useMemo(() => generateDemoPlateBundle(), []);

  const [imageSrc, setImageSrc] = useState<string>(initialDemo.imageDataUrl);
  const [isDemoImage, setIsDemoImage] = useState<boolean>(true);
  const [adjustments, setAdjustments] = useState<ImageAdjustments>(DEFAULT_ADJUSTMENTS);
  const [toolMode, setToolMode] = useState<ToolMode>('measure');
  const [measurementMethod, setMeasurementMethod] = useState<MeasurementMethod>('center-edge');

  const [calibration, setCalibration] = useState<CalibrationState>(initialDemo.calibration);
  const [discDiameterMm, setDiscDiameterMm] = useState<number>(6.0);

  const [measurements, setMeasurements] = useState<SampleMeasurement[]>(initialDemo.measurements);
  const [selectedMeasurementId, setSelectedMeasurementId] = useState<string | null>(
    initialDemo.measurements[0]?.id ?? null
  );
  const [draftCircle, setDraftCircle] = useState<DraftCircle | null>(null);

  // Sample entry form state
  const [sampleName, setSampleName] = useState<string>('');
  const [concentration, setConcentration] = useState<string>('');
  const [controlType, setControlType] = useState<ControlType>('none');
  const [notes, setNotes] = useState<string>('');

  // Report modal & feedback
  const [isReportOpen, setIsReportOpen] = useState<boolean>(false);
  const [quickCopied, setQuickCopied] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  const [experimentMeta, setExperimentMeta] = useState<ExperimentMeta>(() => ({
    title: '천연물 추출물 항균 활성 디스크 확산법 측정 리포트',
    organism: 'Staphylococcus aureus ATCC 6538',
    medium: 'Mueller-Hinton Agar (37°C, 24h)',
    researcher: '',
    date: new Date().toISOString().slice(0, 10),
  }));

  const showBanner = useCallback((msg: string) => {
    setStatusBanner(msg);
  }, []);

  useEffect(() => {
    if (!statusBanner) return;
    const timer = setTimeout(() => setStatusBanner(null), 3500);
    return () => clearTimeout(timer);
  }, [statusBanner]);

  const loadUploadedFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        showBanner('이미지 파일(PNG, JPG, WEBP)만 업로드할 수 있습니다.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setImageSrc(reader.result);
          setDraftCircle(null);
          if (isDemoImage) {
            setMeasurements([]);
            setSelectedMeasurementId(null);
            setIsDemoImage(false);
          }
          setCalibration((prev) => ({ ...prev, isCalibrated: false }));
          setToolMode('calibrate');
          showBanner(
            '새 사진이 로드되었습니다. 먼저 페이퍼 디스크(6.0 mm) 또는 페트리 디쉬(90 mm)의 스케일을 보정하세요.'
          );
        }
      };
      reader.readAsDataURL(file);
    },
    [isDemoImage, showBanner]
  );

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadUploadedFile(file);
    }
    e.target.value = '';
  };

  const handleLoadDemoPlate = () => {
    const bundle = generateDemoPlateBundle();
    setImageSrc(bundle.imageDataUrl);
    setIsDemoImage(true);
    setAdjustments(DEFAULT_ADJUSTMENTS);
    setCalibration(bundle.calibration);
    setMeasurements(bundle.measurements);
    setSelectedMeasurementId(bundle.measurements[0]?.id ?? null);
    setDraftCircle(null);
    setToolMode('measure');
    showBanner('예시 페트리 디쉬(배초향 1~4%, 구절초, 반코마이신)가 복원되었습니다.');
  };

  const handleCalibrationModeChange = (mode: CalibrationMode) => {
    const defaultMm = mode === 'disc' ? 6.0 : mode === 'dish' ? 90.0 : calibration.knownMm;
    setCalibration((prev) => ({
      ...prev,
      mode,
      knownMm: defaultMm,
    }));
  };

  const handleKnownMmChange = (nextMm: number) => {
    if (!Number.isFinite(nextMm) || nextMm <= 0) return;
    setCalibration((prev) => {
      const dist = distancePx(prev.p1, prev.p2);
      const nextPixelsPerMm = prev.isCalibrated && dist > 4 ? dist / nextMm : prev.pixelsPerMm;
      setMeasurements((curr) => curr.map((m) => recalculateMeasurement(m, nextPixelsPerMm)));
      return {
        ...prev,
        knownMm: nextMm,
        pixelsPerMm: nextPixelsPerMm,
      };
    });
  };

  const handleCalibrationComplete = (p1: Point, p2: Point) => {
    const pxDist = distancePx(p1, p2);
    if (pxDist <= 2) return;
    const known = Math.max(0.5, calibration.knownMm);
    const nextPxPerMm = pxDist / known;
    setCalibration((prev) => ({
      ...prev,
      p1,
      p2,
      pixelsPerMm: nextPxPerMm,
      isCalibrated: true,
    }));
    // Recalculate existing measurements using updated scale factor
    setMeasurements((prev) => prev.map((m) => recalculateMeasurement(m, nextPxPerMm)));
    setToolMode('measure');
    showBanner(`스케일 보정 완료: ${nextPxPerMm.toFixed(2)} px/mm`);
  };

  const draftMetrics = useMemo(() => {
    if (!draftCircle) return null;
    return calculateZoneMetrics(draftCircle.radiusPx, calibration.pixelsPerMm, discDiameterMm);
  }, [calibration.pixelsPerMm, discDiameterMm, draftCircle]);

  const handleAddMeasurement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftCircle || !draftMetrics) {
      showBanner('먼저 오른쪽 캔버스에서 억제환을 측정해 주세요.');
      return;
    }

    const nextIndex =
      measurements.length > 0 ? Math.max(...measurements.map((m) => m.index)) + 1 : 1;
    const finalName = sampleName.trim() || `시료 #${nextIndex}`;
    const newId = `sample-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const newRow: SampleMeasurement = {
      id: newId,
      index: nextIndex,
      sampleName: finalName,
      concentration: concentration.trim(),
      discDiameterMm,
      center: draftCircle.center,
      radiusPx: draftCircle.radiusPx,
      ...draftMetrics,
      controlType,
      visible: true,
      notes: notes.trim(),
    };

    setMeasurements((prev) => {
      const cleaned =
        controlType === 'positive'
          ? prev.map((m) => (m.controlType === 'positive' ? { ...m, controlType: 'none' as ControlType } : m))
          : prev;
      return [...cleaned, newRow];
    });
    setSelectedMeasurementId(newId);
    setDraftCircle(null);
    setSampleName('');
    setConcentration('');
    setNotes('');
    setControlType('none');
    showBanner(`"${finalName}" 측정 결과(${draftMetrics.netAreaMm2.toFixed(2)} mm²)가 추가되었습니다.`);
  };

  const handleUpdateRow = useCallback((id: string, patch: Partial<SampleMeasurement>) => {
    setMeasurements((prev) =>
      prev.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }, []);

  const handleDeleteRow = useCallback(
    (id: string) => {
      setMeasurements((prev) => prev.filter((m) => m.id !== id));
      if (selectedMeasurementId === id) {
        setSelectedMeasurementId(null);
      }
    },
    [selectedMeasurementId]
  );

  const stats = useMemo(() => computeSummaryStats(measurements), [measurements]);

  const bestTestSample = useMemo(() => {
    const nonControl = measurements.filter((m) => m.controlType === 'none');
    if (nonControl.length === 0) return null;
    return nonControl.reduce((a, b) => (b.netAreaMm2 > a.netAreaMm2 ? b : a));
  }, [measurements]);

  const handleQuickCopyReport = async () => {
    const txt = buildTextReport(measurements, calibration, experimentMeta);
    try {
      await navigator.clipboard.writeText(txt);
      setQuickCopied(true);
      setTimeout(() => setQuickCopied(false), 2000);
    } catch {
      setIsReportOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Top Bar Contract: Brand wordmark — 4 concise single-line nav links — 1 primary CTA */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-8">
        <a
          href="#workbench"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          DiscZone Metrology
        </a>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <a
            href="#workbench"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            계측 워크벤치
          </a>
          <a
            href="#comparison-table"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            데이터 비교
          </a>
          <a
            href="#comparison-chart"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            차트 분석
          </a>
          <button
            type="button"
            onClick={() => setIsReportOpen(true)}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            리포트 내보내기
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Upload className="w-3.5 h-3.5" />
            사진 업로드
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status notification banner (only shown when triggered by an action) */}
        {statusBanner && (
          <div
            role="status"
            className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-2.5 text-xs font-medium text-sky-900 flex items-center justify-between gap-4"
          >
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-sky-700 hover:text-sky-900 font-semibold whitespace-nowrap"
            >
              닫기
            </button>
          </div>
        )}

        {/* Asymmetric Split Console: Left Control Column + Right Interactive Optical Canvas */}
        <section id="workbench" className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Control & Parameter Column */}
          <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
            {/* 01. Image Preprocessing */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-sky-600" />
                  01. 이미지 보정 및 전처리
                </h2>
                <button
                  type="button"
                  onClick={() => setAdjustments(DEFAULT_ADJUSTMENTS)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 whitespace-nowrap"
                >
                  <RotateCcw className="w-3 h-3" />
                  초기화
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="brightness-slider" className="text-slate-600 font-medium">
                      밝기 (Brightness)
                    </label>
                    <span className="font-mono tabular-nums text-slate-800 font-semibold">
                      {adjustments.brightness}%
                    </span>
                  </div>
                  <input
                    id="brightness-slider"
                    type="range"
                    min={50}
                    max={200}
                    step={1}
                    value={adjustments.brightness}
                    onChange={(e) =>
                      setAdjustments((prev) => ({ ...prev, brightness: Number(e.target.value) }))
                    }
                    className="lab-slider w-full"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="contrast-slider" className="text-slate-600 font-medium">
                      대비 (Contrast)
                    </label>
                    <span className="font-mono tabular-nums text-slate-800 font-semibold">
                      {adjustments.contrast}%
                    </span>
                  </div>
                  <input
                    id="contrast-slider"
                    type="range"
                    min={50}
                    max={250}
                    step={1}
                    value={adjustments.contrast}
                    onChange={(e) =>
                      setAdjustments((prev) => ({ ...prev, contrast: Number(e.target.value) }))
                    }
                    className="lab-slider w-full"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={adjustments.grayscale}
                      onChange={(e) =>
                        setAdjustments((prev) => ({ ...prev, grayscale: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    흑백 변환
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={adjustments.invert}
                      onChange={(e) =>
                        setAdjustments((prev) => ({ ...prev, invert: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    명암 반전
                  </label>
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-slate-700 select-none">
                    <input
                      type="checkbox"
                      checked={adjustments.clarityBoost}
                      onChange={(e) =>
                        setAdjustments((prev) => ({ ...prev, clarityBoost: e.target.checked }))
                      }
                      className="rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    경계 강조
                  </label>
                </div>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* 02. Scale Calibration */}
            <div>
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Ruler className="w-4 h-4 text-amber-600" />
                  02. 스케일 보정 (Scale Factor)
                </h2>
                <span className="text-[11px] font-mono text-slate-500">
                  {calibration.isCalibrated ? '보정됨' : '미보정'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium mb-3">
                <button
                  type="button"
                  onClick={() => handleCalibrationModeChange('disc')}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    calibration.mode === 'disc'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  페이퍼 디스크
                </button>
                <button
                  type="button"
                  onClick={() => handleCalibrationModeChange('dish')}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    calibration.mode === 'dish'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  페트리 디쉬
                </button>
                <button
                  type="button"
                  onClick={() => handleCalibrationModeChange('custom')}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    calibration.mode === 'custom'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  사용자 지정
                </button>
              </div>

              <div className="flex items-end gap-2 mb-2.5">
                <label className="flex-1 text-xs">
                  <span className="text-slate-600">기준 실측 길이 (mm)</span>
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={calibration.knownMm}
                    onChange={(e) => handleKnownMmChange(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setToolMode('calibrate')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap h-[34px] ${
                    toolMode === 'calibrate'
                      ? 'bg-amber-600 text-white'
                      : 'border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100'
                  }`}
                >
                  {toolMode === 'calibrate' ? '기준선 그리는 중' : '캔버스에서 보정'}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                {[6.0, 8.0, 10.0, 87.0, 90.0].map((presetMm) => (
                  <button
                    key={presetMm}
                    type="button"
                    onClick={() => {
                      handleCalibrationModeChange(presetMm >= 50 ? 'dish' : 'disc');
                      handleKnownMmChange(presetMm);
                    }}
                    className={`px-2 py-1 rounded text-[11px] font-mono tabular-nums border transition-colors ${
                      Math.abs(calibration.knownMm - presetMm) < 0.05
                        ? 'border-sky-300 bg-sky-50 text-sky-800 font-semibold'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {presetMm} mm
                  </button>
                ))}
              </div>

              <div className="text-xs font-mono tabular-nums text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between">
                <span>1 mm = {calibration.pixelsPerMm.toFixed(2)} px</span>
                <span className="text-slate-400">·</span>
                <span>{(1 / calibration.pixelsPerMm).toFixed(4)} mm/px</span>
              </div>
            </div>

            <hr className="border-slate-200" />

            {/* 03. Precision Measurement & Sample Entry */}
            <form onSubmit={handleAddMeasurement} className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">03. 억제환 정밀 측정 및 등록</h2>
                {draftCircle && (
                  <button
                    type="button"
                    onClick={() => setDraftCircle(null)}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    측정 취소
                  </button>
                )}
              </div>

              {/* Measurement Method Switcher */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg text-xs font-medium">
                <button
                  type="button"
                  onClick={() => {
                    setToolMode('measure');
                    setMeasurementMethod('center-edge');
                  }}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    measurementMethod === 'center-edge'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  중심→경계
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setToolMode('measure');
                    setMeasurementMethod('two-point');
                  }}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    measurementMethod === 'two-point'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  2점 지름
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setToolMode('measure');
                    setMeasurementMethod('three-point');
                  }}
                  className={`py-1.5 rounded-md transition-colors whitespace-nowrap ${
                    measurementMethod === 'three-point'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  3점 원 맞춤
                </button>
              </div>

              {/* Paper Disc Diameter for Net Area Subtraction */}
              <div className="flex items-center justify-between gap-3 text-xs">
                <label htmlFor="disc-diameter-input" className="text-slate-600 whitespace-nowrap">
                  제외할 디스크 직경 (mm)
                </label>
                <div className="flex items-center gap-1.5">
                  {[6.0, 8.0].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDiscDiameterMm(d)}
                      className={`px-2 py-1 rounded font-mono text-[11px] border ${
                        Math.abs(discDiameterMm - d) < 0.05
                          ? 'border-sky-300 bg-sky-50 text-sky-800 font-semibold'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                  <input
                    id="disc-diameter-input"
                    type="number"
                    min={0.5}
                    max={30}
                    step={0.5}
                    value={discDiameterMm}
                    onChange={(e) => setDiscDiameterMm(Math.max(0.5, Number(e.target.value) || 6.0))}
                    className="w-16 rounded-md border border-slate-300 px-2 py-1 text-right font-mono tabular-nums text-xs"
                  />
                </div>
              </div>

              {/* Live Measurement Readout Box */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-[11px] text-slate-500">억제환 직경 (D)</div>
                    <div className="font-mono tabular-nums text-base font-semibold text-slate-900 mt-0.5">
                      {draftMetrics ? `${draftMetrics.zoneDiameterMm.toFixed(2)} mm` : '0.00 mm'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-500">순수 억제 면적 (A_net)</div>
                    <div className="font-mono tabular-nums text-base font-bold text-sky-700 mt-0.5">
                      {draftMetrics ? `${draftMetrics.netAreaMm2.toFixed(2)} mm²` : '0.00 mm²'}
                    </div>
                  </div>
                </div>

                {draftCircle && draftMetrics && (
                  <div className="pt-2 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-mono tabular-nums">
                      총 {draftMetrics.totalAreaMm2.toFixed(1)} − 디스크 {draftMetrics.discAreaMm2.toFixed(1)} mm²
                    </span>
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="반지름 1px 축소"
                        onClick={() =>
                          setDraftCircle((prev) =>
                            prev ? { ...prev, radiusPx: Math.max(2, prev.radiusPx - 1) } : null
                          )
                        }
                        className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        title="반지름 1px 확대"
                        onClick={() =>
                          setDraftCircle((prev) =>
                            prev ? { ...prev, radiusPx: prev.radiusPx + 1 } : null
                          )
                        }
                        className="p-1 rounded border border-slate-300 bg-white hover:bg-slate-100"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Quick Sample Name Fillers */}
              <div>
                <div className="text-[11px] text-slate-500 mb-1.5">빠른 시료명 입력</div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_SAMPLE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => {
                        setSampleName(preset.sampleName);
                        setConcentration(preset.concentration);
                        setControlType(preset.controlType);
                      }}
                      className="px-2 py-1 rounded border border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/60 text-[11px] font-medium text-slate-700 transition-colors"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  value={sampleName}
                  onChange={(e) => setSampleName(e.target.value)}
                  placeholder="샘플명 (예: 배초향 4%, 구절초 추출물)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={concentration}
                    onChange={(e) => setConcentration(e.target.value)}
                    placeholder="농도 (예: 40 mg/mL)"
                    className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                  />
                  <select
                    value={controlType}
                    onChange={(e) => setControlType(e.target.value as ControlType)}
                    className="rounded-lg border border-slate-300 px-2.5 py-2 text-xs text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                  >
                    <option value="none">시험 시료</option>
                    <option value="positive">양성대조군 (Control+)</option>
                    <option value="negative">음성대조군 (Control-)</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="비고 (선택 사항)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                />
              </div>

              <button
                type="submit"
                disabled={!draftCircle}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-semibold transition-colors"
              >
                {draftCircle ? '측정값 테이블에 추가' : '캔버스에서 억제환을 먼저 측정하세요'}
              </button>
            </form>
          </aside>

          {/* Right Stage: Interactive Petri Dish Canvas with Drag-and-Drop Upload */}
          <div
            className="lg:col-span-8 relative"
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingFile(true);
            }}
            onDragLeave={() => setIsDraggingFile(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingFile(false);
              const file = e.dataTransfer.files?.[0];
              if (file) loadUploadedFile(file);
            }}
          >
            <PetriCanvas
              ref={canvasHandleRef}
              imageSrc={imageSrc}
              adjustments={adjustments}
              toolMode={toolMode}
              onToolModeChange={setToolMode}
              measurementMethod={measurementMethod}
              calibration={calibration}
              discDiameterMm={discDiameterMm}
              measurements={measurements}
              selectedMeasurementId={selectedMeasurementId}
              onSelectMeasurement={setSelectedMeasurementId}
              draftCircle={draftCircle}
              onDraftCircleChange={setDraftCircle}
              onCalibrationComplete={handleCalibrationComplete}
            />

            {isDraggingFile && (
              <div className="pointer-events-none absolute inset-0 z-20 rounded-xl border-2 border-dashed border-sky-400 bg-slate-950/80 flex items-center justify-center">
                <div className="text-center text-white space-y-1">
                  <Upload className="w-7 h-7 mx-auto text-sky-400" />
                  <p className="text-sm font-semibold">페트리 디쉬 사진을 놓아 업로드하세요</p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Full-Width 4-Column Summary KPI Strip (unboxed typographic metrics separated by hairlines) */}
        <section
          aria-label="측정 요약 지표"
          className="bg-white border border-slate-200 rounded-xl px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-0 lg:divide-x lg:divide-slate-200"
        >
          <div className="lg:pr-6">
            <div className="text-[11px] font-medium text-slate-500">누적 측정 시료</div>
            <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-slate-900">
              {stats.count}
              <span className="text-xs font-normal text-slate-500 ml-1.5">건</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {stats.positiveControl ? `대조군: ${stats.positiveControl.sampleName}` : '양성대조군 미지정'}
            </div>
          </div>

          <div className="lg:px-6">
            <div className="text-[11px] font-medium text-slate-500">최대 순수 억제 면적</div>
            <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-sky-700">
              {stats.maxSample ? stats.maxSample.netAreaMm2.toFixed(2) : '0.00'}
              <span className="text-xs font-normal text-slate-500 ml-1.5">mm²</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {stats.maxSample
                ? `${stats.maxSample.sampleName} (Ø ${stats.maxSample.zoneDiameterMm.toFixed(2)} mm)`
                : '측정 데이터 없음'}
            </div>
          </div>

          <div className="lg:px-6">
            <div className="text-[11px] font-medium text-slate-500">전체 평균 ± 표준편차</div>
            <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-slate-900">
              {stats.meanNetArea.toFixed(1)}
              <span className="text-sm font-normal text-slate-500 mx-1">±</span>
              {stats.sdNetArea.toFixed(1)}
              <span className="text-xs font-normal text-slate-500 ml-1.5">mm²</span>
            </div>
            <div className="text-xs text-slate-500 mt-0.5">순수 억제 면적 기준 분포</div>
          </div>

          <div className="lg:pl-6">
            <div className="text-[11px] font-medium text-slate-500">최고 활성 시험 시료 (대조군 대비)</div>
            <div className="mt-1 font-mono tabular-nums text-2xl font-semibold text-emerald-700">
              {bestTestSample && stats.positiveControl && stats.positiveControl.netAreaMm2 > 0
                ? `${((bestTestSample.netAreaMm2 / stats.positiveControl.netAreaMm2) * 100).toFixed(1)}%`
                : bestTestSample
                  ? `${bestTestSample.netAreaMm2.toFixed(1)} mm²`
                  : '—'}
            </div>
            <div className="text-xs text-slate-500 mt-0.5 truncate">
              {bestTestSample ? bestTestSample.sampleName : '시험 시료 데이터 대기 중'}
            </div>
          </div>
        </section>

        {/* Data Comparison Table & Chart.js Bar Chart */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div id="comparison-table" className="lg:col-span-7">
            <MeasurementTable
              measurements={measurements}
              selectedId={selectedMeasurementId}
              onSelect={setSelectedMeasurementId}
              onUpdateRow={handleUpdateRow}
              onDeleteRow={handleDeleteRow}
              onClearAll={() => {
                setMeasurements([]);
                setSelectedMeasurementId(null);
              }}
              onLoadDemoPlate={handleLoadDemoPlate}
            />
          </div>

          <div id="comparison-chart" className="lg:col-span-5">
            <ComparisonChart ref={chartHandleRef} measurements={measurements} />
          </div>
        </section>

        {/* Report Summary & Export Action Bar */}
        <section className="bg-white border border-slate-200 rounded-xl px-6 py-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">실험 리포트 및 단일 HTML 내보내기</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              측정 결과표, 주석 이미지, Chart.js 그래프를 요약 리포트로 복사하거나 오프라인 단일 HTML 파일로 저장할 수 있습니다.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleQuickCopyReport}
              disabled={measurements.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
            >
              {quickCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
              {quickCopied ? '리포트 복사됨' : '요약 리포트 복사'}
            </button>

            <button
              type="button"
              onClick={() => downloadCsv(measurements, experimentMeta)}
              disabled={measurements.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              CSV 다운로드
            </button>

            <button
              type="button"
              onClick={() =>
                downloadHtmlReport(
                  measurements,
                  calibration,
                  experimentMeta,
                  canvasHandleRef.current?.exportAnnotatedDataUrl() ?? null,
                  chartHandleRef.current?.getChartDataUrl() ?? null
                )
              }
              disabled={measurements.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5 text-sky-600" />
              HTML 리포트 저장
            </button>

            <button
              type="button"
              onClick={downloadStandaloneAppHtml}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 transition-colors whitespace-nowrap"
            >
              <FileCode2 className="w-3.5 h-3.5 text-slate-600" />
              단일 HTML 앱 저장
            </button>

            <button
              type="button"
              onClick={() => setIsReportOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              리포트 상세 편집
            </button>
          </div>
        </section>
      </main>

      <ReportModal
        isOpen={isReportOpen}
        onClose={() => setIsReportOpen(false)}
        measurements={measurements}
        calibration={calibration}
        meta={experimentMeta}
        onMetaChange={setExperimentMeta}
        getAnnotatedPlateDataUrl={() => canvasHandleRef.current?.exportAnnotatedDataUrl() ?? null}
        getChartDataUrl={() => chartHandleRef.current?.getChartDataUrl() ?? null}
      />
    </div>
  );
}

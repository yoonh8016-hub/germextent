import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileCode2, FileSpreadsheet, FileText, X } from 'lucide-react';
import type { CalibrationState, ExperimentMeta, SampleMeasurement } from '../types/assay';
import {
  buildTextReport,
  downloadCsv,
  downloadHtmlReport,
  downloadStandaloneAppHtml,
} from '../utils/reportExport';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  measurements: SampleMeasurement[];
  calibration: CalibrationState;
  meta: ExperimentMeta;
  onMetaChange: (meta: ExperimentMeta) => void;
  getAnnotatedPlateDataUrl: () => string | null;
  getChartDataUrl: () => string | null;
}

export function ReportModal({
  isOpen,
  onClose,
  measurements,
  calibration,
  meta,
  onMetaChange,
  getAnnotatedPlateDataUrl,
  getChartDataUrl,
}: ReportModalProps) {
  const [copied, setCopied] = useState(false);

  const reportText = useMemo(
    () => buildTextReport(measurements, calibration, meta),
    [calibration, measurements, meta]
  );

  if (!isOpen) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reportText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback textarea copy
      const el = document.createElement('textarea');
      el.value = reportText;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-modal-title"
    >
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 id="report-modal-title" className="text-base font-semibold text-slate-900">
              실험 결과 리포트 생성 및 내보내기
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              측정 요약 복사, CSV 데이터 저장, 인쇄용 HTML 리포트 및 오프라인 단일 HTML 파일 다운로드
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="모달 닫기"
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-5">
          {/* Experiment Metadata Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">실험 리포트 제목</span>
              <input
                type="text"
                value={meta.title}
                onChange={(e) => onMetaChange({ ...meta, title: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">시험 균주 (Test Organism)</span>
              <input
                type="text"
                value={meta.organism}
                onChange={(e) => onMetaChange({ ...meta, organism: e.target.value })}
                placeholder="예: Staphylococcus aureus ATCC 6538"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
              />
            </label>
            <label className="block text-xs">
              <span className="text-slate-600 font-medium">배지 조건 (Medium)</span>
              <input
                type="text"
                value={meta.medium}
                onChange={(e) => onMetaChange({ ...meta, medium: e.target.value })}
                placeholder="예: Mueller-Hinton Agar (37°C, 24h)"
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">측정자</span>
                <input
                  type="text"
                  value={meta.researcher}
                  onChange={(e) => onMetaChange({ ...meta, researcher: e.target.value })}
                  placeholder="연구원 성명"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                />
              </label>
              <label className="block text-xs">
                <span className="text-slate-600 font-medium">측정일</span>
                <input
                  type="date"
                  value={meta.date}
                  onChange={(e) => onMetaChange({ ...meta, date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-600"
                />
              </label>
            </div>
          </div>

          {/* Preview Text Area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-medium text-slate-700">요약 리포트 미리보기 (Markdown / Text)</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-sky-700 hover:text-sky-800"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? '복사 완료' : '텍스트 복사'}
              </button>
            </div>
            <pre className="w-full h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3.5 text-xs font-mono text-slate-800 leading-relaxed whitespace-pre-wrap">
              {reportText}
            </pre>
          </div>
        </div>

        {/* Export Actions Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={downloadStandaloneAppHtml}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
          >
            <FileCode2 className="w-3.5 h-3.5 text-slate-600" />
            단일 실행 HTML 앱 저장
          </button>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors whitespace-nowrap"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '복사됨' : '리포트 복사'}
            </button>
            <button
              type="button"
              onClick={() => downloadCsv(measurements, meta)}
              disabled={measurements.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              CSV 저장
            </button>
            <button
              type="button"
              onClick={() =>
                downloadHtmlReport(
                  measurements,
                  calibration,
                  meta,
                  getAnnotatedPlateDataUrl(),
                  getChartDataUrl()
                )
              }
              disabled={measurements.length === 0}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-40 transition-colors whitespace-nowrap"
            >
              <FileText className="w-3.5 h-3.5" />
              <Download className="w-3.5 h-3.5" />
              HTML 리포트 저장
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

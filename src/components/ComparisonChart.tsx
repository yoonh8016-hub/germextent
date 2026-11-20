import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  Legend,
  LinearScale,
  Tooltip,
  type ChartConfiguration,
} from 'chart.js';
import { Download } from 'lucide-react';
import type { SampleMeasurement } from '../types/assay';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface ComparisonChartHandle {
  getChartDataUrl: () => string | null;
}

interface ComparisonChartProps {
  measurements: SampleMeasurement[];
}

type ChartMetric = 'netArea' | 'diameter';

export const ComparisonChart = forwardRef<ComparisonChartHandle, ComparisonChartProps>(
  function ComparisonChart({ measurements }, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const chartInstanceRef = useRef<Chart<'bar'> | null>(null);
    const [metric, setMetric] = useState<ChartMetric>('netArea');

    const getChartDataUrl = (): string | null => {
      const sourceCanvas = canvasRef.current;
      if (!sourceCanvas) return null;
      // Composite onto white background so PNG export has crisp dark-on-light contrast
      const out = document.createElement('canvas');
      out.width = sourceCanvas.width;
      out.height = sourceCanvas.height;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.drawImage(sourceCanvas, 0, 0);
      return out.toDataURL('image/png');
    };

    useImperativeHandle(ref, () => ({
      getChartDataUrl,
    }));

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }

      if (measurements.length === 0) return;

      const labels = measurements.map((m) => m.sampleName);
      const values = measurements.map((m) =>
        metric === 'netArea'
          ? Number(m.netAreaMm2.toFixed(2))
          : Number(m.zoneDiameterMm.toFixed(2))
      );

      const backgroundColors = measurements.map((m) =>
        m.controlType === 'positive'
          ? '#d97706'
          : m.controlType === 'negative'
            ? '#94a3b8'
            : '#0284c7'
      );

      const hoverColors = measurements.map((m) =>
        m.controlType === 'positive'
          ? '#b45309'
          : m.controlType === 'negative'
            ? '#64748b'
            : '#0369a1'
      );

      const config: ChartConfiguration<'bar'> = {
        type: 'bar',
        data: {
          labels,
          datasets: [
            {
              label:
                metric === 'netArea' ? '순수 억제 면적 (mm²)' : '억제환 직경 (mm)',
              data: values,
              backgroundColor: backgroundColors,
              hoverBackgroundColor: hoverColors,
              borderRadius: 6,
              maxBarThickness: 46,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: {
            duration: 240,
          },
          plugins: {
            legend: {
              display: false,
            },
            tooltip: {
              backgroundColor: '#0f172a',
              titleFont: {
                family: '"IBM Plex Sans KR", sans-serif',
                size: 12,
                weight: 'bold',
              },
              bodyFont: {
                family: '"JetBrains Mono", monospace',
                size: 12,
              },
              padding: 10,
              cornerRadius: 6,
              callbacks: {
                label: (ctx) => {
                  const idx = ctx.dataIndex;
                  const item = measurements[idx];
                  const val = Number(ctx.parsed.y ?? 0).toFixed(2);
                  if (metric === 'netArea') {
                    return ` 순수 억제 면적: ${val} mm² (직경 ${item.zoneDiameterMm.toFixed(2)} mm)`;
                  }
                  return ` 억제환 직경: ${val} mm (순수 면적 ${item.netAreaMm2.toFixed(2)} mm²)`;
                },
              },
            },
          },
          scales: {
            x: {
              grid: {
                display: false,
              },
              ticks: {
                color: '#334155',
                font: {
                  family: '"IBM Plex Sans KR", sans-serif',
                  size: 11,
                  weight: 500,
                },
                maxRotation: 25,
                minRotation: 0,
              },
            },
            y: {
              beginAtZero: true,
              grid: {
                color: '#e2e8f0',
              },
              ticks: {
                color: '#475569',
                font: {
                  family: '"JetBrains Mono", monospace',
                  size: 11,
                },
              },
              title: {
                display: true,
                text: metric === 'netArea' ? '순수 억제 면적 (mm²)' : '직경 (mm)',
                color: '#64748b',
                font: {
                  family: '"IBM Plex Sans KR", sans-serif',
                  size: 11,
                  weight: 600,
                },
              },
            },
          },
        },
      };

      chartInstanceRef.current = new Chart(canvas, config);

      return () => {
        if (chartInstanceRef.current) {
          chartInstanceRef.current.destroy();
          chartInstanceRef.current = null;
        }
      };
    }, [measurements, metric]);

    const handleDownloadPng = () => {
      const dataUrl = getChartDataUrl();
      if (!dataUrl) return;
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `inhibition-zone-chart-${metric}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    return (
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-full">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">샘플별 항균 활성 비교 차트</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Chart.js 막대 그래프 · 주황(양성대조군) / 청색(시험 시료) / 회색(음성대조군)
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setMetric('netArea')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  metric === 'netArea'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                순수 면적 (mm²)
              </button>
              <button
                type="button"
                onClick={() => setMetric('diameter')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  metric === 'diameter'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                직경 (mm)
              </button>
            </div>

            <button
              type="button"
              onClick={handleDownloadPng}
              disabled={measurements.length === 0}
              title="차트 이미지(PNG) 저장"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              PNG
            </button>
          </div>
        </div>

        {measurements.length === 0 ? (
          <div className="flex-1 min-h-[280px] flex items-center justify-center border border-dashed border-slate-200 rounded-lg text-xs text-slate-400">
            측정된 샘플 데이터를 추가하면 막대 그래프가 자동으로 생성됩니다.
          </div>
        ) : (
          <div className="relative flex-1 min-h-[300px]">
            <canvas ref={canvasRef} />
          </div>
        )}
      </div>
    );
  }
);

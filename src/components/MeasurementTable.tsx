import React, { useMemo, useState } from 'react';
import { ArrowUpDown, Eye, EyeOff, RotateCcw, Star, Trash2 } from 'lucide-react';
import type { ControlType, SampleMeasurement } from '../types/assay';
import { getControlReference } from '../utils/reportExport';

interface MeasurementTableProps {
  measurements: SampleMeasurement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onUpdateRow: (id: string, patch: Partial<SampleMeasurement>) => void;
  onDeleteRow: (id: string) => void;
  onClearAll: () => void;
  onLoadDemoPlate: () => void;
}

type SortKey = 'index' | 'sampleName' | 'zoneDiameterMm' | 'netAreaMm2';

export function MeasurementTable({
  measurements,
  selectedId,
  onSelect,
  onUpdateRow,
  onDeleteRow,
  onClearAll,
  onLoadDemoPlate,
}: MeasurementTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('index');
  const [sortAsc, setSortAsc] = useState(true);

  const positiveControl = useMemo(() => getControlReference(measurements), [measurements]);

  const sortedRows = useMemo(() => {
    const copy = [...measurements];
    copy.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'sampleName') {
        cmp = a.sampleName.localeCompare(b.sampleName, 'ko');
      } else {
        cmp = a[sortKey] - b[sortKey];
      }
      return sortAsc ? cmp : -cmp;
    });
    return copy;
  }, [measurements, sortAsc, sortKey]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortKey(key);
      setSortAsc(key === 'index' || key === 'sampleName');
    }
  };

  const handleTogglePositiveControl = (row: SampleMeasurement) => {
    if (row.controlType === 'positive') {
      onUpdateRow(row.id, { controlType: 'none' });
      return;
    }
    // Clear existing positive control if any, then set this row
    measurements.forEach((m) => {
      if (m.controlType === 'positive' && m.id !== row.id) {
        onUpdateRow(m.id, { controlType: 'none' });
      }
    });
    onUpdateRow(row.id, { controlType: 'positive' });
  };

  const cycleControlLabel = (type: ControlType) => {
    if (type === 'positive') return '양성대조군';
    if (type === 'negative') return '음성대조군';
    return '시험 시료';
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col h-full">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">누적 측정 데이터 비교표</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            순수 억제 면적 A_net = πr² − π(d_disc/2)² · 별표(★) 클릭 시 양성대조군 기준 100% 산출
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLoadDemoPlate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            예시 시료 복원
          </button>
          <button
            type="button"
            onClick={onClearAll}
            disabled={measurements.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            전체 삭제
          </button>
        </div>
      </div>

      {measurements.length === 0 ? (
        <div className="flex-1 min-h-[280px] flex flex-col items-center justify-center border border-dashed border-slate-200 rounded-lg p-6 text-center">
          <p className="text-sm font-medium text-slate-700">저장된 억제환 측정 데이터가 없습니다</p>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            상단 캔버스에서 디스크 중심과 억제환 경계를 측정한 뒤 좌측 패널의 &quot;측정값 테이블에 추가&quot; 버튼을 누르세요.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-[11px] font-semibold text-slate-500">
                <th className="py-2.5 px-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('index')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    #
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-2 whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('sampleName')}
                    className="inline-flex items-center gap-1 hover:text-slate-900"
                  >
                    샘플명 / 구분
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-2 whitespace-nowrap">농도·조건</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">디스크(mm)</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('zoneDiameterMm')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    직경 D(mm)
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">총 면적(mm²)</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => handleSort('netAreaMm2')}
                    className="inline-flex items-center gap-1 hover:text-slate-900 ml-auto"
                  >
                    순수 면적(mm²)
                    <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">대조군 대비</th>
                <th className="py-2.5 px-2 text-right whitespace-nowrap">작업</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {sortedRows.map((row) => {
                const isSelected = row.id === selectedId;
                const relPct =
                  positiveControl && positiveControl.netAreaMm2 > 0
                    ? `${((row.netAreaMm2 / positiveControl.netAreaMm2) * 100).toFixed(1)}%`
                    : '—';

                return (
                  <tr
                    key={row.id}
                    onClick={() => onSelect(row.id)}
                    className={`transition-colors cursor-pointer ${
                      isSelected ? 'bg-sky-50/70' : 'hover:bg-slate-50/90'
                    }`}
                  >
                    <td className="py-2.5 px-2 font-mono tabular-nums text-slate-500">
                      #{row.index}
                    </td>
                    <td className="py-2.5 px-2 min-w-[160px]" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={row.sampleName}
                        onChange={(e) => onUpdateRow(row.id, { sampleName: e.target.value })}
                        className="w-full bg-transparent font-medium text-slate-900 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1 -mx-1 py-0.5"
                      />
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {cycleControlLabel(row.controlType)}
                        {row.notes ? ` · ${row.notes}` : ''}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 min-w-[100px]" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={row.concentration}
                        placeholder="—"
                        onChange={(e) => onUpdateRow(row.id, { concentration: e.target.value })}
                        className="w-full bg-transparent text-slate-600 focus:bg-white focus:outline-none focus:ring-1 focus:ring-sky-500 rounded px-1 -mx-1 py-0.5"
                      />
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-600">
                      {row.discDiameterMm.toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-800 font-medium">
                      {row.zoneDiameterMm.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-500">
                      {row.totalAreaMm2.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-sky-700">
                      {row.netAreaMm2.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-700">
                      {relPct}
                    </td>
                    <td
                      className="py-2.5 px-2 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleTogglePositiveControl(row)}
                          title="양성대조군으로 지정/해제"
                          className={`p-1.5 rounded hover:bg-slate-100 transition-colors ${
                            row.controlType === 'positive'
                              ? 'text-amber-600'
                              : 'text-slate-400 hover:text-amber-600'
                          }`}
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            fill={row.controlType === 'positive' ? 'currentColor' : 'none'}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onUpdateRow(row.id, { visible: !row.visible })}
                          title={row.visible ? '캔버스에서 숨기기' : '캔버스에 표시'}
                          className="p-1.5 rounded text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                        >
                          {row.visible ? (
                            <Eye className="w-3.5 h-3.5" />
                          ) : (
                            <EyeOff className="w-3.5 h-3.5 text-slate-300" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteRow(row.id)}
                          title="행 삭제"
                          className="p-1.5 rounded text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

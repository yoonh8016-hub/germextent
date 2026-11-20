import type { CalibrationState, ExperimentMeta, SampleMeasurement } from '../types/assay';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function getControlReference(measurements: SampleMeasurement[]): SampleMeasurement | undefined {
  return measurements.find((m) => m.controlType === 'positive' && m.netAreaMm2 > 0);
}

export function computeSummaryStats(measurements: SampleMeasurement[]) {
  if (measurements.length === 0) {
    return {
      count: 0,
      maxSample: null as SampleMeasurement | null,
      meanNetArea: 0,
      sdNetArea: 0,
      positiveControl: null as SampleMeasurement | null,
    };
  }

  const positiveControl = getControlReference(measurements) ?? null;
  const maxSample = measurements.reduce((prev, curr) =>
    curr.netAreaMm2 > prev.netAreaMm2 ? curr : prev
  );

  const activeAreas = measurements.map((m) => m.netAreaMm2);
  const meanNetArea = activeAreas.reduce((sum, v) => sum + v, 0) / activeAreas.length;
  const variance =
    activeAreas.reduce((sum, v) => sum + (v - meanNetArea) ** 2, 0) / activeAreas.length;
  const sdNetArea = Math.sqrt(variance);

  return {
    count: measurements.length,
    maxSample,
    meanNetArea,
    sdNetArea,
    positiveControl,
  };
}

export function buildTextReport(
  measurements: SampleMeasurement[],
  calibration: CalibrationState,
  meta: ExperimentMeta
): string {
  const stats = computeSummaryStats(measurements);
  const lines: string[] = [];

  lines.push(`# ${meta.title || '항균 활성 디스크 확산법 억제환 면적 측정 리포트'}`);
  lines.push(`- 측정 일시: ${meta.date}`);
  if (meta.organism) lines.push(`- 시험 균주: ${meta.organism}`);
  if (meta.medium) lines.push(`- 배지 조건: ${meta.medium}`);
  if (meta.researcher) lines.push(`- 측정자: ${meta.researcher}`);
  lines.push(
    `- 스케일 보정: ${calibration.pixelsPerMm.toFixed(3)} px/mm (기준 ${calibration.knownMm.toFixed(1)} mm · ${(1 / calibration.pixelsPerMm).toFixed(4)} mm/px)`
  );
  lines.push(`- 면적 산출식: A_net = π × (D/2)² - π × (d_disc/2)²`);
  lines.push('');

  lines.push('## 요약 통계');
  lines.push(`- 총 측정 시료: ${stats.count}개`);
  if (stats.maxSample) {
    lines.push(
      `- 최대 순수 억제 면적: ${stats.maxSample.sampleName} (${stats.maxSample.netAreaMm2.toFixed(2)} mm², 직경 ${stats.maxSample.zoneDiameterMm.toFixed(2)} mm)`
    );
  }
  lines.push(`- 전체 평균 ± 표준편차: ${stats.meanNetArea.toFixed(2)} ± ${stats.sdNetArea.toFixed(2)} mm²`);
  if (stats.positiveControl) {
    lines.push(
      `- 기준 양성대조군: ${stats.positiveControl.sampleName} (${stats.positiveControl.netAreaMm2.toFixed(2)} mm² = 100.0%)`
    );
  }
  lines.push('');

  lines.push('## 시료별 정밀 측정 결과');
  lines.push(
    '| # | 샘플명 | 농도/조건 | 디스크(mm) | 억제환 직경(mm) | 총 면적(mm²) | 순수 억제 면적(mm²) | 대조군 대비(%) |'
  );
  lines.push('|---:|---|---|---:|---:|---:|---:|---:|');

  measurements.forEach((m, i) => {
    const rel =
      stats.positiveControl && stats.positiveControl.netAreaMm2 > 0
        ? `${((m.netAreaMm2 / stats.positiveControl.netAreaMm2) * 100).toFixed(1)}%`
        : '-';
    const roleTag =
      m.controlType === 'positive'
        ? ' [양성대조군]'
        : m.controlType === 'negative'
          ? ' [음성대조군]'
          : '';
    lines.push(
      `| ${i + 1} | ${m.sampleName}${roleTag} | ${m.concentration || '-'} | ${m.discDiameterMm.toFixed(1)} | ${m.zoneDiameterMm.toFixed(2)} | ${m.totalAreaMm2.toFixed(2)} | ${m.netAreaMm2.toFixed(2)} | ${rel} |`
    );
  });

  return lines.join('\n');
}

export function downloadCsv(measurements: SampleMeasurement[], meta: ExperimentMeta): void {
  const positiveControl = getControlReference(measurements);
  const headers = [
    'No',
    'Sample Name',
    'Control Type',
    'Concentration',
    'Disc Diameter (mm)',
    'Zone Diameter (mm)',
    'Zone Radius (mm)',
    'Total Area (mm2)',
    'Disc Area (mm2)',
    'Net Inhibition Area (mm2)',
    'Relative vs Positive Control (%)',
    'Notes',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (/[",\n]/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = measurements.map((m, idx) => {
    const rel =
      positiveControl && positiveControl.netAreaMm2 > 0
        ? ((m.netAreaMm2 / positiveControl.netAreaMm2) * 100).toFixed(1)
        : '';
    return [
      idx + 1,
      m.sampleName,
      m.controlType,
      m.concentration,
      m.discDiameterMm.toFixed(2),
      m.zoneDiameterMm.toFixed(2),
      m.zoneRadiusMm.toFixed(2),
      m.totalAreaMm2.toFixed(2),
      m.discAreaMm2.toFixed(2),
      m.netAreaMm2.toFixed(2),
      rel,
      m.notes,
    ]
      .map(escapeCsv)
      .join(',');
  });

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
  const slug = (meta.date || 'assay').replace(/[^0-9a-zA-Z_-]/g, '-');
  triggerDownload(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }),
    `inhibition-zone-data-${slug}.csv`
  );
}

export function downloadHtmlReport(
  measurements: SampleMeasurement[],
  calibration: CalibrationState,
  meta: ExperimentMeta,
  annotatedPlateDataUrl: string | null,
  chartDataUrl: string | null
): void {
  const stats = computeSummaryStats(measurements);
  const tableRowsHtml = measurements
    .map((m, idx) => {
      const rel =
        stats.positiveControl && stats.positiveControl.netAreaMm2 > 0
          ? `${((m.netAreaMm2 / stats.positiveControl.netAreaMm2) * 100).toFixed(1)}%`
          : '—';
      const role =
        m.controlType === 'positive'
          ? '양성대조군'
          : m.controlType === 'negative'
            ? '음성대조군'
            : '시험 시료';

      return `
        <tr>
          <td class="mono center">${idx + 1}</td>
          <td><strong>${escapeHtml(m.sampleName)}</strong><div class="sub">${escapeHtml(role)}${m.notes ? ` · ${escapeHtml(m.notes)}` : ''}</div></td>
          <td>${escapeHtml(m.concentration || '—')}</td>
          <td class="mono num">${m.discDiameterMm.toFixed(1)}</td>
          <td class="mono num">${m.zoneDiameterMm.toFixed(2)}</td>
          <td class="mono num">${m.totalAreaMm2.toFixed(2)}</td>
          <td class="mono num accent">${m.netAreaMm2.toFixed(2)}</td>
          <td class="mono num">${rel}</td>
        </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(meta.title || '항균 활성 억제환 측정 리포트')}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; color: #0f172a; background: #f8fafc; margin: 0; padding: 32px 20px; line-height: 1.55; }
  .sheet { max-width: 1060px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 36px; }
  h1 { font-size: 22px; margin: 0 0 8px; letter-spacing: -0.02em; }
  .meta { font-size: 13px; color: #475569; display: flex; flex-wrap: wrap; gap: 14px; border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
  .kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 28px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; background: #f8fafc; }
  .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em; }
  .kpi-val { font-size: 20px; font-weight: 700; margin-top: 4px; font-variant-numeric: tabular-nums; }
  .visuals { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 28px; }
  .panel { border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; background: #fff; }
  .panel h2 { font-size: 13px; font-weight: 600; margin: 0 0 10px; color: #334155; }
  .panel img { width: 100%; height: auto; border-radius: 6px; display: block; border: 1px solid #e2e8f0; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-size: 11px; color: #475569; border-bottom: 2px solid #cbd5e1; padding: 10px 8px; background: #f8fafc; }
  th.num, td.num { text-align: right; }
  td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
  .accent { color: #0369a1; font-weight: 700; }
  .sub { font-size: 11px; color: #64748b; margin-top: 2px; }
  .center { text-align: center; }
  .formula { margin-top: 16px; font-size: 12px; color: #64748b; }
  @media print { body { background: #fff; padding: 0; } .sheet { border: none; padding: 16px; } }
  @media (max-width: 780px) { .kpis, .visuals { grid-template-columns: 1fr; } }
</style>
</head>
<body>
  <div class="sheet">
    <h1>${escapeHtml(meta.title || '항균 활성 디스크 확산법 측정 리포트')}</h1>
    <div class="meta">
      <span>측정일: ${escapeHtml(meta.date)}</span>
      ${meta.organism ? `<span>시험 균주: ${escapeHtml(meta.organism)}</span>` : ''}
      ${meta.medium ? `<span>배지: ${escapeHtml(meta.medium)}</span>` : ''}
      ${meta.researcher ? `<span>담당자: ${escapeHtml(meta.researcher)}</span>` : ''}
      <span class="mono">Scale: ${calibration.pixelsPerMm.toFixed(3)} px/mm</span>
    </div>

    <div class="kpis">
      <div class="kpi"><div class="kpi-label">총 측정 시료</div><div class="kpi-val mono">${stats.count} 건</div></div>
      <div class="kpi"><div class="kpi-label">최대 순수 억제 면적</div><div class="kpi-val mono">${stats.maxSample ? `${stats.maxSample.netAreaMm2.toFixed(2)} mm²` : '—'}</div><div class="sub">${stats.maxSample ? escapeHtml(stats.maxSample.sampleName) : ''}</div></div>
      <div class="kpi"><div class="kpi-label">평균 ± 표준편차</div><div class="kpi-val mono">${stats.meanNetArea.toFixed(2)} ± ${stats.sdNetArea.toFixed(2)}</div><div class="sub">mm² (전체 시료)</div></div>
      <div class="kpi"><div class="kpi-label">기준 양성대조군</div><div class="kpi-val mono">${stats.positiveControl ? `${stats.positiveControl.netAreaMm2.toFixed(2)} mm²` : '미지정'}</div><div class="sub">${stats.positiveControl ? escapeHtml(stats.positiveControl.sampleName) : '—'}</div></div>
    </div>

    ${
      annotatedPlateDataUrl || chartDataUrl
        ? `<div class="visuals">
      ${annotatedPlateDataUrl ? `<div class="panel"><h2>계측 주석 페트리 디쉬 이미지</h2><img src="${annotatedPlateDataUrl}" alt="계측 완료 페트리 디쉬" /></div>` : ''}
      ${chartDataUrl ? `<div class="panel"><h2>샘플별 순수 억제 면적 비교 차트</h2><img src="${chartDataUrl}" alt="억제 면적 막대 그래프" /></div>` : ''}
    </div>`
        : ''
    }

    <table>
      <thead>
        <tr>
          <th class="center">#</th>
          <th>샘플명</th>
          <th>농도/조건</th>
          <th class="num">디스크(mm)</th>
          <th class="num">억제환 직경(mm)</th>
          <th class="num">총 면적(mm²)</th>
          <th class="num">순수 억제 면적(mm²)</th>
          <th class="num">대조군 대비(%)</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
    </table>

    <div class="formula">계산식: 순수 억제 면적 A_net = π × (억제환 반지름 r)² - π × (디스크 직경 d_disc / 2)²</div>
  </div>
</body>
</html>`;

  const slug = (meta.date || 'assay').replace(/[^0-9a-zA-Z_-]/g, '-');
  triggerDownload(
    new Blob([html], { type: 'text/html;charset=utf-8;' }),
    `inhibition-zone-report-${slug}.html`
  );
}

/**
 * Generates a complete, self-contained, single-file runnable HTML application
 * (Tailwind CSS CDN + Chart.js CDN + Canvas Measurement Engine) so users can
 * run the tool offline anywhere as a single HTML file.
 */
export function downloadStandaloneAppHtml(): void {
  const standaloneHtml = `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>DiscZone Metrology — 단일 HTML 항균 억제환 정밀 측정기</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.4/dist/chart.umd.min.js"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-variant-numeric: tabular-nums; }
    canvas#plateCanvas { touch-action: none; }
  </style>
</head>
<body class="bg-slate-50 text-slate-900 min-h-screen">
  <header class="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-4">
    <div class="font-bold text-lg tracking-tight text-slate-900 whitespace-nowrap">DiscZone Metrology</div>
    <div class="flex items-center gap-3">
      <label class="px-3.5 py-2 text-xs font-semibold rounded-lg bg-sky-600 text-white hover:bg-sky-700 cursor-pointer whitespace-nowrap">
        사진 업로드
        <input id="fileInput" type="file" accept="image/*" class="hidden" />
      </label>
      <button id="copyReportBtn" class="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 whitespace-nowrap">
        리포트 복사
      </button>
    </div>
  </header>

  <main class="max-w-[1440px] mx-auto p-4 lg:p-6 space-y-6">
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <aside class="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
        <div>
          <h2 class="text-sm font-semibold text-slate-900 mb-3">01. 이미지 보정 (Pre-processing)</h2>
          <div class="space-y-3 text-xs">
            <div>
              <div class="flex justify-between mb-1"><span>밝기 (Brightness)</span><span id="brightVal" class="mono">100%</span></div>
              <input id="brightSlider" type="range" min="50" max="200" value="100" class="w-full accent-sky-600" />
            </div>
            <div>
              <div class="flex justify-between mb-1"><span>대비 (Contrast)</span><span id="contrastVal" class="mono">100%</span></div>
              <input id="contrastSlider" type="range" min="50" max="250" value="100" class="w-full accent-sky-600" />
            </div>
            <div class="flex items-center gap-4 pt-1">
              <label class="flex items-center gap-1.5 cursor-pointer"><input id="grayToggle" type="checkbox" class="accent-sky-600" /> 흑백</label>
              <label class="flex items-center gap-1.5 cursor-pointer"><input id="invertToggle" type="checkbox" class="accent-sky-600" /> 색상 반전</label>
              <button id="resetFilterBtn" class="ml-auto text-sky-700 hover:underline font-medium">초기화</button>
            </div>
          </div>
        </div>

        <hr class="border-slate-200" />

        <div>
          <h2 class="text-sm font-semibold text-slate-900 mb-2">02. 도구 및 스케일 보정</h2>
          <div class="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium mb-3">
            <button data-mode="measure" class="mode-btn py-1.5 rounded-md bg-white shadow-sm text-slate-900">억제환 측정</button>
            <button data-mode="calibrate" class="mode-btn py-1.5 rounded-md text-slate-600">스케일 보정</button>
            <button data-mode="pan" class="mode-btn py-1.5 rounded-md text-slate-600">화면 이동</button>
          </div>
          <div class="grid grid-cols-2 gap-2 text-xs">
            <label class="block">
              <span class="text-slate-500">기준 실측 규격 (mm)</span>
              <input id="knownMmInput" type="number" step="0.5" value="6.0" class="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 mono" />
            </label>
            <label class="block">
              <span class="text-slate-500">페이퍼 디스크 (mm)</span>
              <input id="discMmInput" type="number" step="0.5" value="6.0" class="mt-1 w-full border border-slate-300 rounded-md px-2.5 py-1.5 mono" />
            </label>
          </div>
          <div id="scaleReadout" class="mt-2 text-xs mono text-slate-600">현재 배율: 8.44 px/mm</div>
        </div>

        <hr class="border-slate-200" />

        <div class="space-y-3">
          <h2 class="text-sm font-semibold text-slate-900">03. 측정값 기록</h2>
          <div class="text-xs bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-1">
            <div class="flex justify-between"><span class="text-slate-500">억제환 직경 (D)</span><span id="liveDia" class="mono font-semibold">0.00 mm</span></div>
            <div class="flex justify-between"><span class="text-slate-500">순수 억제 면적 (A_net)</span><span id="liveArea" class="mono font-bold text-sky-700">0.00 mm²</span></div>
          </div>
          <input id="sampleNameInput" type="text" placeholder="샘플명 (예: 배초향 4%, 반코마이신)" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs" />
          <div class="grid grid-cols-2 gap-2">
            <input id="concInput" type="text" placeholder="농도 (예: 4%)" class="border border-slate-300 rounded-lg px-3 py-2 text-xs" />
            <select id="controlSelect" class="border border-slate-300 rounded-lg px-2 py-2 text-xs bg-white">
              <option value="none">시험 시료</option>
              <option value="positive">양성대조군</option>
              <option value="negative">음성대조군</option>
            </select>
          </div>
          <button id="addRowBtn" class="w-full py-2.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800">측정 결과 테이블에 추가</button>
        </div>
      </aside>

      <section class="lg:col-span-8 bg-slate-950 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
        <div class="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <span id="hintText">디스크 중심을 클릭한 뒤 억제환 경계까지 드래그하세요. (휠: 확대/축소)</span>
          <div class="flex items-center gap-2">
            <button id="zoomOutBtn" class="px-2 py-1 bg-slate-800 rounded hover:bg-slate-700">-</button>
            <span id="zoomLabel" class="mono w-12 text-center">100%</span>
            <button id="zoomInBtn" class="px-2 py-1 bg-slate-800 rounded hover:bg-slate-700">+</button>
            <button id="zoomResetBtn" class="px-2 py-1 bg-slate-800 rounded hover:bg-slate-700">맞춤</button>
          </div>
        </div>
        <div class="relative h-[520px] w-full overflow-hidden">
          <canvas id="plateCanvas" class="w-full h-full block cursor-crosshair"></canvas>
        </div>
      </section>
    </div>

    <section class="grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
        <div class="flex items-center justify-between mb-3">
          <h2 class="text-sm font-semibold">누적 측정 데이터 비교표</h2>
          <button id="clearAllBtn" class="text-xs text-rose-600 hover:underline">전체 초기화</button>
        </div>
        <table class="w-full text-xs">
          <thead>
            <tr class="border-b border-slate-200 text-slate-500">
              <th class="py-2 text-left">#</th>
              <th class="py-2 text-left">샘플명</th>
              <th class="py-2 text-left">농도</th>
              <th class="py-2 text-right">직경(mm)</th>
              <th class="py-2 text-right">순수 면적(mm²)</th>
              <th class="py-2 text-right">대조군 대비</th>
              <th class="py-2 text-right">삭제</th>
            </tr>
          </thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div class="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
        <h2 class="text-sm font-semibold mb-3">샘플별 순수 억제 면적 (mm²)</h2>
        <div class="h-64"><canvas id="barChart"></canvas></div>
      </div>
    </section>
  </main>

  <script>
    const state = {
      img: null,
      zoom: 1,
      panX: 0,
      panY: 0,
      mode: 'measure',
      pxPerMm: 8.44,
      brightness: 100,
      contrast: 100,
      grayscale: false,
      invert: false,
      dragging: false,
      startPt: null,
      endPt: null,
      draft: null,
      rows: [
        { name: '반코마이신 (양성대조군)', conc: '30 µg', disc: 6.0, dia: 22.6, net: 372.88, ctrl: 'positive' },
        { name: '배초향 4%', conc: '4%', disc: 6.0, dia: 18.8, net: 249.32, ctrl: 'none' },
        { name: '배초향 2%', conc: '2%', disc: 6.0, dia: 15.2, net: 153.18, ctrl: 'none' },
        { name: '배초향 1%', conc: '1%', disc: 6.0, dia: 11.4, net: 73.80, ctrl: 'none' },
        { name: '구절초 추출물', conc: '4%', disc: 6.0, dia: 16.6, net: 188.15, ctrl: 'none' }
      ]
    };

    const canvas = document.getElementById('plateCanvas');
    const ctx = canvas.getContext('2d');
    let chartInstance = null;

    function createDemoImage() {
      const c = document.createElement('canvas');
      c.width = 1000; c.height = 750;
      const g = c.getContext('2d');
      g.fillStyle = '#18202c'; g.fillRect(0, 0, 1000, 750);
      g.beginPath(); g.arc(500, 375, 320, 0, Math.PI * 2); g.fillStyle = '#cbb883'; g.fill();
      const zones = [[500,200,95],[665,300,79],[630,490,64],[370,490,48],[335,300,70]];
      zones.forEach(([x,y,r]) => {
        g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fillStyle='rgba(70,60,38,0.78)'; g.fill();
        g.beginPath(); g.arc(x,y,25,0,Math.PI*2); g.fillStyle='#f8fafc'; g.fill();
      });
      const im = new Image();
      im.onload = () => { state.img = im; fitImage(); renderAll(); };
      im.src = c.toDataURL();
    }

    function fitImage() {
      if (!state.img) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width; canvas.height = rect.height;
      const s = Math.min((canvas.width - 40) / state.img.width, (canvas.height - 40) / state.img.height);
      state.zoom = s;
      state.panX = (canvas.width - state.img.width * s) / 2;
      state.panY = (canvas.height - state.img.height * s) / 2;
      document.getElementById('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
    }

    function toImg(cx, cy) {
      return { x: (cx - state.panX) / state.zoom, y: (cy - state.panY) / state.zoom };
    }

    function drawCanvas() {
      const rect = canvas.parentElement.getBoundingClientRect();
      if (canvas.width !== Math.round(rect.width) || canvas.height !== Math.round(rect.height)) {
        canvas.width = rect.width; canvas.height = rect.height;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!state.img) return;
      ctx.save();
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      ctx.filter = \`brightness(\${state.brightness}%) contrast(\${state.contrast}%) grayscale(\${state.grayscale?100:0}%) invert(\${state.invert?100:0}%)\`;
      ctx.drawImage(state.img, 0, 0);
      ctx.filter = 'none';
      if (state.draft) {
        ctx.beginPath();
        ctx.arc(state.draft.cx, state.draft.cy, state.draft.rPx, 0, Math.PI * 2);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5 / state.zoom;
        ctx.stroke();
        const discR = ((parseFloat(document.getElementById('discMmInput').value) || 6) / 2) * state.pxPerMm;
        ctx.beginPath();
        ctx.arc(state.draft.cx, state.draft.cy, discR, 0, Math.PI * 2);
        ctx.setLineDash([5 / state.zoom, 4 / state.zoom]);
        ctx.strokeStyle = '#fbbf24';
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (state.mode === 'calibrate' && state.startPt && state.endPt) {
        ctx.beginPath();
        ctx.moveTo(state.startPt.x, state.startPt.y);
        ctx.lineTo(state.endPt.x, state.endPt.y);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 2.5 / state.zoom;
        ctx.stroke();
      }
      ctx.restore();
    }

    function renderTableAndChart() {
      const pos = state.rows.find(r => r.ctrl === 'positive' && r.net > 0);
      const tbody = document.getElementById('tableBody');
      tbody.innerHTML = state.rows.map((r, i) => {
        const rel = pos ? ((r.net / pos.net) * 100).toFixed(1) + '%' : '-';
        return \`<tr class="border-b border-slate-100">
          <td class="py-2 mono">\${i+1}</td>
          <td class="py-2 font-medium">\${r.name}</td>
          <td class="py-2 text-slate-500">\${r.conc}</td>
          <td class="py-2 text-right mono">\${r.dia.toFixed(2)}</td>
          <td class="py-2 text-right mono font-semibold text-sky-700">\${r.net.toFixed(2)}</td>
          <td class="py-2 text-right mono">\${rel}</td>
          <td class="py-2 text-right"><button onclick="removeRow(\${i})" class="text-rose-600 hover:underline">삭제</button></td>
        </tr>\`;
      }).join('');

      const chartCtx = document.getElementById('barChart').getContext('2d');
      if (chartInstance) chartInstance.destroy();
      chartInstance = new Chart(chartCtx, {
        type: 'bar',
        data: {
          labels: state.rows.map(r => r.name),
          datasets: [{
            label: '순수 억제 면적 (mm²)',
            data: state.rows.map(r => Number(r.net.toFixed(2))),
            backgroundColor: state.rows.map(r => r.ctrl === 'positive' ? '#d97706' : r.ctrl === 'negative' ? '#94a3b8' : '#0284c7'),
            borderRadius: 5
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
      });
    }

    window.removeRow = (i) => { state.rows.splice(i, 1); renderTableAndChart(); };
    function renderAll() { drawCanvas(); renderTableAndChart(); }

    canvas.addEventListener('pointerdown', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      state.dragging = true;
      state.lastScreen = { x: sx, y: sy };
      const pt = toImg(sx, sy);
      state.startPt = pt; state.endPt = pt;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!state.dragging) return;
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      if (state.mode === 'pan') {
        state.panX += sx - state.lastScreen.x;
        state.panY += sy - state.lastScreen.y;
        state.lastScreen = { x: sx, y: sy };
        drawCanvas();
        return;
      }
      state.endPt = toImg(sx, sy);
      const rPx = Math.hypot(state.endPt.x - state.startPt.x, state.endPt.y - state.startPt.y);
      if (state.mode === 'measure') {
        state.draft = { cx: state.startPt.x, cy: state.startPt.y, rPx };
        const disc = parseFloat(document.getElementById('discMmInput').value) || 6.0;
        const rMm = rPx / state.pxPerMm;
        const net = Math.max(0, Math.PI * rMm * rMm - Math.PI * (disc / 2) ** 2);
        document.getElementById('liveDia').textContent = (rMm * 2).toFixed(2) + ' mm';
        document.getElementById('liveArea').textContent = net.toFixed(2) + ' mm²';
      }
      drawCanvas();
    });
    window.addEventListener('pointerup', () => {
      if (!state.dragging) return;
      state.dragging = false;
      if (state.mode === 'calibrate' && state.startPt && state.endPt) {
        const px = Math.hypot(state.endPt.x - state.startPt.x, state.endPt.y - state.startPt.y);
        const mm = parseFloat(document.getElementById('knownMmInput').value) || 6.0;
        if (px > 4) {
          state.pxPerMm = px / mm;
          document.getElementById('scaleReadout').textContent = '현재 배율: ' + state.pxPerMm.toFixed(2) + ' px/mm';
        }
      }
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left, sy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 0.89;
      const next = Math.min(6, Math.max(0.25, state.zoom * factor));
      state.panX = sx - ((sx - state.panX) / state.zoom) * next;
      state.panY = sy - ((sy - state.panY) / state.zoom) * next;
      state.zoom = next;
      document.getElementById('zoomLabel').textContent = Math.round(state.zoom * 100) + '%';
      drawCanvas();
    }, { passive: false });

    document.getElementById('fileInput').addEventListener('change', (e) => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => { const im = new Image(); im.onload = () => { state.img = im; fitImage(); drawCanvas(); }; im.src = r.result; };
      r.readAsDataURL(f);
    });
    document.getElementById('brightSlider').addEventListener('input', (e) => { state.brightness = +e.target.value; document.getElementById('brightVal').textContent = state.brightness + '%'; drawCanvas(); });
    document.getElementById('contrastSlider').addEventListener('input', (e) => { state.contrast = +e.target.value; document.getElementById('contrastVal').textContent = state.contrast + '%'; drawCanvas(); });
    document.getElementById('grayToggle').addEventListener('change', (e) => { state.grayscale = e.target.checked; drawCanvas(); });
    document.getElementById('invertToggle').addEventListener('change', (e) => { state.invert = e.target.checked; drawCanvas(); });
    document.getElementById('resetFilterBtn').addEventListener('click', () => {
      state.brightness = 100; state.contrast = 100; state.grayscale = false; state.invert = false;
      document.getElementById('brightSlider').value = 100; document.getElementById('contrastSlider').value = 100;
      document.getElementById('brightVal').textContent = '100%'; document.getElementById('contrastVal').textContent = '100%';
      document.getElementById('grayToggle').checked = false; document.getElementById('invertToggle').checked = false;
      drawCanvas();
    });
    document.querySelectorAll('.mode-btn').forEach(btn => btn.addEventListener('click', () => {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(b => b.className = 'mode-btn py-1.5 rounded-md ' + (b === btn ? 'bg-white shadow-sm text-slate-900' : 'text-slate-600'));
    }));
    document.getElementById('zoomInBtn').addEventListener('click', () => { state.zoom = Math.min(6, state.zoom * 1.2); document.getElementById('zoomLabel').textContent = Math.round(state.zoom * 100) + '%'; drawCanvas(); });
    document.getElementById('zoomOutBtn').addEventListener('click', () => { state.zoom = Math.max(0.25, state.zoom * 0.82); document.getElementById('zoomLabel').textContent = Math.round(state.zoom * 100) + '%'; drawCanvas(); });
    document.getElementById('zoomResetBtn').addEventListener('click', () => { fitImage(); drawCanvas(); });
    document.getElementById('addRowBtn').addEventListener('click', () => {
      if (!state.draft) {
        document.getElementById('hintText').textContent = '먼저 캔버스에서 억제환을 드래그하여 측정하세요.';
        return;
      }
      const disc = parseFloat(document.getElementById('discMmInput').value) || 6.0;
      const rMm = state.draft.rPx / state.pxPerMm;
      const net = Math.max(0, Math.PI * rMm * rMm - Math.PI * (disc / 2) ** 2);
      state.rows.push({
        name: document.getElementById('sampleNameInput').value.trim() || ('시료 #' + (state.rows.length + 1)),
        conc: document.getElementById('concInput').value.trim() || '-',
        disc,
        dia: rMm * 2,
        net,
        ctrl: document.getElementById('controlSelect').value
      });
      renderTableAndChart();
    });
    document.getElementById('clearAllBtn').addEventListener('click', () => { state.rows = []; renderTableAndChart(); });
    document.getElementById('copyReportBtn').addEventListener('click', () => {
      const txt = state.rows.map((r, i) => \`\${i+1}. \${r.name} (\${r.conc}): 직경 \${r.dia.toFixed(2)} mm, 순수 면적 \${r.net.toFixed(2)} mm²\`).join('\\n');
      navigator.clipboard.writeText(txt).then(() => {
        document.getElementById('copyReportBtn').textContent = '복사 완료';
        setTimeout(() => { document.getElementById('copyReportBtn').textContent = '리포트 복사'; }, 1800);
      });
    });

    window.addEventListener('resize', () => { fitImage(); drawCanvas(); });
    createDemoImage();
  </script>
</body>
</html>`;

  triggerDownload(
    new Blob([standaloneHtml], { type: 'text/html;charset=utf-8;' }),
    'DiscZone-Metrology-Standalone.html'
  );
}
